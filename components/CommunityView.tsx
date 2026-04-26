import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  collection, query, orderBy, limit,
  startAfter, getDocs, getDoc, serverTimestamp, Timestamp,
  QueryDocumentSnapshot, DocumentData,
  where, doc as fsDoc, updateDoc,
} from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject, UploadTask } from 'firebase/storage';
import { httpsCallable } from 'firebase/functions';
import { db, storage, functions } from '../firebase';
import { CommunityPost, CommunityTag, Genre } from '../types';

// ─── Constants ────────────────────────────────────────────────────────────────

const TAGS: CommunityTag[] = [
  'Street', 'Portrait', 'Architecture', 'Sports',
  'Event', 'Nature', 'Abstract', 'Other',
];

const TAG_COLORS: Record<CommunityTag, string> = {
  Street:       'bg-brand-blue/10 text-brand-blue',
  Portrait:     'bg-brand-rose/10 text-brand-rose',
  Architecture: 'bg-amber-100 text-amber-700',
  Sports:       'bg-emerald-100 text-emerald-700',
  Event:        'bg-purple-100 text-purple-700',
  Nature:       'bg-teal-100 text-teal-700',
  Abstract:     'bg-zinc-100 text-zinc-600',
  Other:        'bg-brand-black/5 text-brand-gray',
};

const PAGE_SIZE    = 12;
const MAX_IMAGES   = 3;
const MAX_BYTES    = 5 * 1024 * 1024; // 5 MB
const TTL_MS       = 72 * 60 * 60 * 1000; // 72 hours
const URGENT_HOURS = 6;
const POST_LIMIT   = 3;

// ─── Cloud Function callables ─────────────────────────────────────────────────

const validateAndCreate = httpsCallable<
  {
    displayName: string;
    caption: string;
    assignmentTag: string;
    imageUrls: string[];
    cameraBody?: string;
    lens?: string;
    settings?: string;
    expiresAtMs: number;
  },
  { id: string }
>(functions, 'validateAndCreateCommunityPost');

const ratePostCallable = httpsCallable<
  { postId: string; rating: number },
  { ratingSum: number; ratingCount: number }
>(functions, 'ratePost');

// ─── Helpers ──────────────────────────────────────────────────────────────────

type FirestoreTimestamp = Date | { seconds: number; nanoseconds: number };

function toMs(value: FirestoreTimestamp): number {
  if (value instanceof Date) return value.getTime();
  if (value && typeof value === 'object' && 'seconds' in value) return value.seconds * 1000;
  return 0;
}

function timeAgo(value: FirestoreTimestamp): string {
  const ms = Date.now() - toMs(value);
  const s  = Math.floor(ms / 1000);
  const m  = Math.floor(s  / 60);
  const h  = Math.floor(m  / 60);
  const d  = Math.floor(h  / 24);
  if (s  < 60)  return 'just now';
  if (m  < 60)  return `${m}m ago`;
  if (h  < 24)  return `${h}h ago`;
  if (d  < 7)   return `${d}d ago`;
  return `${Math.floor(d / 7)}w ago`;
}

function getTimeLeft(expiresAt: FirestoreTimestamp): { label: string; urgent: boolean; expired: boolean } {
  const ms = toMs(expiresAt) - Date.now();
  if (ms <= 0) return { label: 'Expired', urgent: true, expired: true };
  const totalMin = Math.floor(ms / 60000);
  const hours    = Math.floor(totalMin / 60);
  const days     = Math.floor(hours / 24);
  const remH     = hours % 24;
  const remM     = totalMin % 60;
  let label: string;
  if (days > 0)        label = `${days}d ${remH}h left`;
  else if (hours > 0)  label = `${hours}h ${remM}m left`;
  else                 label = `${remM}m left`;
  return { label, urgent: hours < URGENT_HOURS, expired: false };
}

function isExpired(post: CommunityPost): boolean {
  return toMs(post.expiresAt) <= Date.now();
}

function snapToPost(snap: QueryDocumentSnapshot<DocumentData>): CommunityPost {
  const d = snap.data();
  return {
    id:            snap.id,
    userId:        d.userId        ?? '',
    displayName:   d.displayName   ?? 'Anonymous',
    caption:       d.caption       ?? '',
    assignmentTag: d.assignmentTag ?? 'Other',
    imageUrls:     d.imageUrls     ?? [],
    cameraBody:    d.cameraBody,
    lens:          d.lens,
    settings:      d.settings,
    createdAt:     d.createdAt?.toDate  ? d.createdAt.toDate()  : d.createdAt,
    expiresAt:     d.expiresAt?.toDate  ? d.expiresAt.toDate()  : d.expiresAt,
    status:        d.status        ?? 'active',
    ratingSum:     d.ratingSum     ?? 0,
    ratingCount:   d.ratingCount   ?? 0,
  };
}

// ─── Shared remove helper ─────────────────────────────────────────────────────

async function removePostFromFirebase(post: CommunityPost): Promise<void> {
  for (const url of post.imageUrls) {
    try {
      const match = url.match(/\/o\/([^?]+)/);
      if (match) {
        await deleteObject(ref(storage, decodeURIComponent(match[1])));
      }
    } catch (e) {
      console.warn('Storage delete skipped:', e);
    }
  }
  await updateDoc(fsDoc(db, 'communityPosts', post.id), { status: 'removed' });
}

// ─── Countdown chip ───────────────────────────────────────────────────────────

const Countdown: React.FC<{ expiresAt: FirestoreTimestamp; className?: string }> = ({ expiresAt, className }) => {
  const [, tick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => tick(t => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const { label, urgent } = getTimeLeft(expiresAt);

  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold ${urgent ? 'text-brand-rose' : 'text-brand-gray/50'} ${className ?? ''}`}>
      <i className={`fa-solid fa-hourglass-half text-[8px] ${urgent ? 'text-brand-rose' : 'text-brand-gray/30'}`}></i>
      {label}
    </span>
  );
};

// ─── Star Display (read-only) ─────────────────────────────────────────────────

interface StarDisplayProps {
  ratingSum: number;
  ratingCount: number;
  className?: string;
}

const StarDisplay: React.FC<StarDisplayProps> = ({ ratingSum, ratingCount, className }) => {
  if (!ratingCount) return null;
  const avg = ratingSum / ratingCount;
  return (
    <span className={`inline-flex items-center gap-0.5 ${className ?? ''}`}>
      {[1, 2, 3, 4, 5].map(i => (
        <i
          key={i}
          className={`fa-star text-[9px] ${i <= Math.round(avg) ? 'fa-solid text-amber-400' : 'fa-regular text-brand-gray/25'}`}
        ></i>
      ))}
      <span className="text-[10px] text-brand-gray/60 ml-1">{avg.toFixed(1)}</span>
      <span className="text-[10px] text-brand-gray/35">· {ratingCount}</span>
    </span>
  );
};

// ─── Star Rating (interactive) ────────────────────────────────────────────────

interface StarRatingProps {
  postId: string;
  currentUserId?: string;
  ratingSum: number;
  ratingCount: number;
  onRated: (newSum: number, newCount: number) => void;
}

const StarRating: React.FC<StarRatingProps> = ({ postId, currentUserId, ratingSum, ratingCount, onRated }) => {
  const [userRating, setUserRating]   = useState(0);
  const [hover, setHover]             = useState(0);
  const [submitting, setSubmitting]   = useState(false);
  const [fetchingOwn, setFetchingOwn] = useState(false);
  const [rateError, setRateError]     = useState('');

  // Fetch this user's existing rating once on mount
  useEffect(() => {
    if (!currentUserId) return;
    setFetchingOwn(true);
    getDoc(fsDoc(db, 'communityPosts', postId, 'ratings', currentUserId))
      .then(snap => {
        if (snap.exists()) setUserRating(snap.data().rating ?? 0);
      })
      .catch(e => console.warn('Could not fetch user rating:', e))
      .finally(() => setFetchingOwn(false));
  }, [postId, currentUserId]);

  const handleRate = async (star: number) => {
    if (!currentUserId || submitting) return;
    setSubmitting(true);
    setRateError('');
    try {
      const result = await ratePostCallable({ postId, rating: star });
      setUserRating(star);
      onRated(result.data.ratingSum, result.data.ratingCount);
    } catch (e) {
      console.error('ratePost error:', e);
      setRateError('Could not save rating. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const avg         = ratingCount > 0 ? ratingSum / ratingCount : 0;
  const displayStar = hover || userRating; // highlighted value while hovering or already rated

  return (
    <div className="space-y-2">
      {/* Stars */}
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map(i => (
          <button
            key={i}
            type="button"
            disabled={!currentUserId || submitting || fetchingOwn}
            onMouseEnter={() => currentUserId && setHover(i)}
            onMouseLeave={() => setHover(0)}
            onClick={() => handleRate(i)}
            className={`text-2xl transition-colors focus:outline-none ${
              i <= displayStar
                ? 'text-amber-400'
                : 'text-brand-gray/20'
            } ${currentUserId && !submitting ? 'hover:text-amber-400 cursor-pointer' : 'cursor-default'}`}
            aria-label={`Rate ${i} star${i !== 1 ? 's' : ''}`}
          >
            <i className={`${i <= displayStar ? 'fa-solid' : 'fa-regular'} fa-star`}></i>
          </button>
        ))}
        {(submitting || fetchingOwn) && (
          <i className="fa-solid fa-spinner fa-spin text-brand-gray/40 text-sm ml-1.5"></i>
        )}
      </div>

      {/* Average */}
      {ratingCount > 0 ? (
        <p className="text-xs text-brand-gray/60">
          <span className="font-semibold text-brand-black">{avg.toFixed(1)}</span> average
          · {ratingCount} {ratingCount === 1 ? 'rating' : 'ratings'}
        </p>
      ) : (
        <p className="text-xs text-brand-gray/40">No ratings yet — be the first!</p>
      )}

      {/* User's current rating label */}
      {currentUserId && userRating > 0 && !hover && (
        <p className="text-[10px] text-brand-gray/50">
          Your rating: {userRating} star{userRating !== 1 ? 's' : ''}
        </p>
      )}

      {/* Not signed in nudge */}
      {!currentUserId && (
        <p className="text-[10px] text-brand-gray/40">Sign in to rate this post</p>
      )}

      {rateError && (
        <p className="text-[10px] text-brand-rose">{rateError}</p>
      )}
    </div>
  );
};

// ─── Post Detail Modal ────────────────────────────────────────────────────────

interface PostModalProps {
  post: CommunityPost;
  onClose: () => void;
  resolvedName?: string;
  currentUserId?: string;
  onRated?: (postId: string, newSum: number, newCount: number) => void;
}

const PostModal: React.FC<PostModalProps> = ({ post, onClose, resolvedName, currentUserId, onRated }) => {
  const [imgIdx, setImgIdx]     = useState(0);
  const [expanded, setExpanded] = useState(false);
  // Local rating state so the modal updates immediately without a re-fetch
  const [localSum, setLocalSum]     = useState(post.ratingSum   ?? 0);
  const [localCount, setLocalCount] = useState(post.ratingCount ?? 0);
  const needsTruncate               = post.caption.length > 200;

  const prev = () => setImgIdx(i => Math.max(0, i - 1));
  const next = () => setImgIdx(i => Math.min(post.imageUrls.length - 1, i + 1));

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape')      onClose();
      if (e.key === 'ArrowLeft')   prev();
      if (e.key === 'ArrowRight')  next();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleRated = (newSum: number, newCount: number) => {
    setLocalSum(newSum);
    setLocalCount(newCount);
    onRated?.(post.id, newSum, newCount);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Image area */}
        <div className="relative bg-brand-black rounded-t-xl overflow-hidden">
          {post.imageUrls.length > 0 ? (
            <img
              src={post.imageUrls[imgIdx]}
              alt={`Post image ${imgIdx + 1}`}
              className="w-full max-h-[50vh] object-contain"
            />
          ) : (
            <div className="h-48 flex items-center justify-center">
              <i className="fa-solid fa-image text-white/20 text-4xl"></i>
            </div>
          )}

          {/* Close */}
          <button
            onClick={onClose}
            className="absolute top-3 right-3 bg-black/50 hover:bg-black/70 text-white rounded-full w-8 h-8 flex items-center justify-center transition-all"
          >
            <i className="fa-solid fa-xmark text-sm"></i>
          </button>

          {/* Arrow nav */}
          {post.imageUrls.length > 1 && (
            <>
              <button onClick={prev} disabled={imgIdx === 0}
                className="absolute left-3 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 disabled:opacity-30 text-white rounded-full w-8 h-8 flex items-center justify-center transition-all">
                <i className="fa-solid fa-chevron-left text-xs"></i>
              </button>
              <button onClick={next} disabled={imgIdx === post.imageUrls.length - 1}
                className="absolute right-3 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 disabled:opacity-30 text-white rounded-full w-8 h-8 flex items-center justify-center transition-all">
                <i className="fa-solid fa-chevron-right text-xs"></i>
              </button>
              <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5">
                {post.imageUrls.map((_, i) => (
                  <button key={i} onClick={() => setImgIdx(i)}
                    className={`w-1.5 h-1.5 rounded-full transition-all ${i === imgIdx ? 'bg-white' : 'bg-white/40'}`} />
                ))}
              </div>
            </>
          )}
        </div>

        {/* Details */}
        <div className="p-8 space-y-5">
          {/* Tag + countdown */}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-md ${TAG_COLORS[post.assignmentTag as CommunityTag] ?? 'bg-brand-black/5 text-brand-gray'}`}>
              {post.assignmentTag}
            </span>
            <Countdown expiresAt={post.expiresAt} />
          </div>

          {/* Poster + time */}
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-brand-black">{resolvedName ?? post.displayName}</p>
            <p className="text-[10px] text-brand-gray/50">{timeAgo(post.createdAt)}</p>
          </div>

          {/* Caption */}
          <div>
            <p className="text-sm text-brand-black leading-relaxed">
              {expanded || !needsTruncate ? post.caption : post.caption.slice(0, 200) + '…'}
            </p>
            {needsTruncate && (
              <button onClick={() => setExpanded(v => !v)}
                className="text-xs text-brand-blue font-medium mt-1 hover:underline">
                {expanded ? 'see less' : 'see more'}
              </button>
            )}
          </div>

          {/* Star rating */}
          <div className="border-t border-brand-black/5 pt-5">
            <p className="text-xs font-semibold text-brand-black/40 mb-3">Rate this post</p>
            <StarRating
              postId={post.id}
              currentUserId={currentUserId}
              ratingSum={localSum}
              ratingCount={localCount}
              onRated={handleRated}
            />
          </div>

          {/* Gear */}
          {(post.cameraBody || post.lens || post.settings) && (
            <div className="bg-brand-white border border-brand-black/5 rounded-lg p-4 space-y-2">
              <p className="text-xs font-semibold text-brand-black/40 mb-3">Gear & settings</p>
              {post.cameraBody && (
                <div className="flex items-center gap-2 text-xs text-brand-gray">
                  <i className="fa-solid fa-camera text-brand-blue w-4"></i>{post.cameraBody}
                </div>
              )}
              {post.lens && (
                <div className="flex items-center gap-2 text-xs text-brand-gray">
                  <i className="fa-solid fa-circle-dot text-brand-blue w-4"></i>{post.lens}
                </div>
              )}
              {post.settings && (
                <div className="flex items-center gap-2 text-xs text-brand-gray">
                  <i className="fa-solid fa-sliders text-brand-blue w-4"></i>{post.settings}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Gallery Card ─────────────────────────────────────────────────────────────

interface GalleryCardProps {
  post: CommunityPost;
  onClick: () => void;
  resolvedName?: string;
  currentUserId?: string;
  onRemove?: (post: CommunityPost) => void;
}

const GalleryCard: React.FC<GalleryCardProps> = ({ post, onClick, resolvedName, currentUserId, onRemove }) => {
  const [expanded, setExpanded]       = useState(false);
  const [confirming, setConfirming]   = useState(false);
  const [removing, setRemoving]       = useState(false);
  const [removeError, setRemoveError] = useState('');
  const needsTruncate                 = post.caption.length > 120;
  const isOwner                       = !!currentUserId && post.userId === currentUserId;

  const handleRemove = async () => {
    setRemoving(true);
    setRemoveError('');
    try {
      await removePostFromFirebase(post);
      onRemove?.(post);
    } catch (e) {
      console.error('GalleryCard remove error:', e);
      setRemoveError('Failed to remove. Please try again.');
      setRemoving(false);
      setConfirming(false);
    }
  };

  return (
    <div className="bg-white rounded-lg border border-brand-black/5 shadow-sm overflow-hidden hover:shadow-md transition-all duration-300 flex flex-col relative">
      {/* Confirmation overlay */}
      {confirming && (
        <div className="absolute inset-0 bg-white/95 rounded-lg flex flex-col items-center justify-center gap-3 p-5 z-20">
          <i className="fa-solid fa-triangle-exclamation text-brand-rose text-xl"></i>
          <p className="text-xs font-semibold text-brand-black text-center leading-relaxed">
            Remove this post?<br />This cannot be undone.
          </p>
          {removeError && (
            <p className="text-[10px] text-brand-rose text-center">{removeError}</p>
          )}
          <div className="flex gap-2 w-full">
            <button onClick={handleRemove} disabled={removing}
              className="flex-1 bg-brand-rose text-white text-xs font-semibold py-2 rounded-md disabled:opacity-50 flex items-center justify-center gap-1.5 transition-all active:scale-95">
              {removing ? <><i className="fa-solid fa-spinner fa-spin text-[10px]"></i> Removing…</> : 'Remove'}
            </button>
            <button
              onClick={() => { setConfirming(false); setRemoveError(''); }}
              disabled={removing}
              className="flex-1 border border-brand-black/10 text-brand-gray text-xs font-medium py-2 rounded-md hover:border-brand-black/20 transition-all">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Thumbnail */}
      <button className="relative block w-full aspect-square overflow-hidden bg-brand-black/5" onClick={onClick}>
        {post.imageUrls[0] ? (
          <img src={post.imageUrls[0]} alt={post.caption}
            className="w-full h-full object-cover hover:scale-105 transition-transform duration-500" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <i className="fa-solid fa-image text-brand-gray/20 text-3xl"></i>
          </div>
        )}

        {/* Multi-image count badge */}
        {post.imageUrls.length > 1 && (
          <span className="absolute top-2 right-2 bg-black/60 text-white text-[10px] font-semibold px-1.5 py-0.5 rounded-md flex items-center gap-1 z-10">
            <i className="fa-solid fa-images text-[8px]"></i> {post.imageUrls.length}
          </span>
        )}

        {/* Assignment tag */}
        <span className={`absolute bottom-2 left-2 text-[10px] font-semibold px-2 py-0.5 rounded-md ${TAG_COLORS[post.assignmentTag as CommunityTag] ?? 'bg-brand-black/5 text-brand-gray'}`}>
          {post.assignmentTag}
        </span>

        {/* Owner remove button */}
        {isOwner && (
          <button
            onClick={e => { e.stopPropagation(); setConfirming(true); setRemoveError(''); }}
            className="absolute top-2 left-2 bg-black/60 hover:bg-brand-rose text-white rounded-full w-6 h-6 flex items-center justify-center transition-all z-10"
            title="Remove post"
            aria-label="Remove post"
          >
            <i className="fa-solid fa-xmark text-[10px]"></i>
          </button>
        )}
      </button>

      {/* Info */}
      <div className="p-4 flex-1 flex flex-col">
        <p className="text-xs text-brand-black leading-relaxed flex-1">
          {expanded || !needsTruncate ? post.caption : post.caption.slice(0, 120) + '…'}
          {needsTruncate && (
            <button onClick={e => { e.stopPropagation(); setExpanded(v => !v); }}
              className="ml-1 text-brand-blue font-medium hover:underline">
              {expanded ? 'less' : 'more'}
            </button>
          )}
        </p>

        {/* Star average (read-only) */}
        {(post.ratingCount ?? 0) > 0 && (
          <div className="mt-2">
            <StarDisplay ratingSum={post.ratingSum ?? 0} ratingCount={post.ratingCount ?? 0} />
          </div>
        )}

        <div className="flex items-center justify-between mt-3 pt-3 border-t border-brand-black/5 gap-2">
          <p className="text-[11px] font-semibold text-brand-black/60 truncate">{resolvedName ?? post.displayName}</p>
          <Countdown expiresAt={post.expiresAt} />
        </div>
      </div>
    </div>
  );
};

// ─── Limit Reached Panel ──────────────────────────────────────────────────────

interface LimitReachedPanelProps {
  activePosts: CommunityPost[];
  displayName: string;
  onRemoved: (post: CommunityPost) => void;
  onCancel: () => void;
}

const LimitReachedPanel: React.FC<LimitReachedPanelProps> = ({ activePosts, displayName: _displayName, onRemoved, onCancel }) => {
  const [localPosts, setLocalPosts]     = useState<CommunityPost[]>(activePosts);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [removingId, setRemovingId]     = useState<string | null>(null);
  const [error, setError]               = useState('');

  const handleRemove = async (post: CommunityPost) => {
    setRemovingId(post.id);
    setError('');
    try {
      await removePostFromFirebase(post);
      const updated = localPosts.filter(p => p.id !== post.id);
      setLocalPosts(updated);
      setConfirmingId(null);
      onRemoved(post);
    } catch (e) {
      console.error('LimitReachedPanel remove error:', e);
      setError('Failed to remove post. Please try again.');
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <div className="animate-in fade-in duration-500">
      <header className="mb-10">
        <button onClick={onCancel}
          className="flex items-center gap-2 text-xs font-medium text-brand-gray hover:text-brand-rose transition-colors mb-6">
          <i className="fa-solid fa-arrow-left text-[9px]"></i> Community
        </button>
        <div className="flex items-center gap-4">
          <div className="w-1.5 h-10 bg-brand-rose rounded"></div>
          <div>
            <h2 className="text-4xl font-display text-brand-black tracking-wide">NEW POST</h2>
            <p className="text-brand-gray text-sm font-medium mt-1">
              Share a photo with the community · disappears after 72 hours
            </p>
          </div>
        </div>
      </header>

      {/* Limit notice */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg px-5 py-4 mb-8 flex items-start gap-3 max-w-2xl">
        <i className="fa-solid fa-circle-exclamation text-amber-500 mt-0.5 shrink-0"></i>
        <div>
          <p className="text-sm font-semibold text-amber-800">
            You have {POST_LIMIT} active posts — the maximum allowed.
          </p>
          <p className="text-xs text-amber-700 mt-0.5">
            Remove a post below to upload a new one.
          </p>
        </div>
      </div>

      {/* Global error */}
      {error && (
        <div className="bg-brand-rose/10 border border-brand-rose/20 rounded-md px-4 py-3 flex items-center gap-2 mb-6 max-w-2xl">
          <i className="fa-solid fa-circle-exclamation text-brand-rose text-sm"></i>
          <p className="text-sm text-brand-rose">{error}</p>
        </div>
      )}

      {/* Compact post list */}
      <div className="space-y-3 max-w-2xl">
        {localPosts.map(post => {
          const isConfirming = confirmingId === post.id;
          const isRemoving   = removingId   === post.id;

          return (
            <div key={post.id} className="bg-white border border-brand-black/5 rounded-lg overflow-hidden shadow-sm">
              <div className="flex items-center gap-4 p-3">
                {/* Thumbnail */}
                <div className="w-14 h-14 rounded-md overflow-hidden bg-brand-black/5 shrink-0">
                  {post.imageUrls[0] ? (
                    <img src={post.imageUrls[0]} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <i className="fa-solid fa-image text-brand-gray/20 text-sm"></i>
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ${TAG_COLORS[post.assignmentTag as CommunityTag] ?? 'bg-brand-black/5 text-brand-gray'}`}>
                      {post.assignmentTag}
                    </span>
                    <Countdown expiresAt={post.expiresAt} />
                    {(post.ratingCount ?? 0) > 0 && (
                      <StarDisplay ratingSum={post.ratingSum ?? 0} ratingCount={post.ratingCount ?? 0} />
                    )}
                  </div>
                  <p className="text-xs text-brand-black truncate leading-relaxed">{post.caption}</p>
                </div>

                {/* Remove button */}
                {!isConfirming && (
                  <button
                    onClick={() => { setConfirmingId(post.id); setError(''); }}
                    disabled={!!removingId}
                    className="shrink-0 text-xs font-semibold text-brand-rose border border-brand-rose/20 hover:bg-brand-rose hover:text-white px-3 py-1.5 rounded-md transition-all disabled:opacity-40"
                  >
                    Remove
                  </button>
                )}
              </div>

              {/* Inline confirmation */}
              {isConfirming && (
                <div className="border-t border-brand-black/5 bg-brand-rose/5 px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
                  <p className="text-xs font-semibold text-brand-black">
                    Remove this post? This cannot be undone.
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleRemove(post)}
                      disabled={isRemoving}
                      className="bg-brand-rose text-white text-xs font-semibold px-4 py-1.5 rounded-md disabled:opacity-50 flex items-center gap-1.5 transition-all active:scale-95"
                    >
                      {isRemoving
                        ? <><i className="fa-solid fa-spinner fa-spin text-[10px]"></i> Removing…</>
                        : 'Yes, remove'
                      }
                    </button>
                    <button
                      onClick={() => setConfirmingId(null)}
                      disabled={isRemoving}
                      className="border border-brand-black/10 text-brand-gray text-xs font-medium px-4 py-1.5 rounded-md hover:border-brand-black/20 transition-all"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ─── New Post Form ────────────────────────────────────────────────────────────

interface NewPostFormProps {
  userId: string;
  displayName: string;
  availableTags: string[];
  onSuccess: () => void;
  onCancel: () => void;
}

const NewPostForm: React.FC<NewPostFormProps> = ({ userId, displayName, availableTags, onSuccess, onCancel }) => {
  const [files, setFiles]           = useState<File[]>([]);
  const [previews, setPreviews]     = useState<string[]>([]);
  const [caption, setCaption]       = useState('');
  const [tag, setTag]               = useState<string>(() => availableTags[0] ?? 'Other');
  const [cameraBody, setCameraBody] = useState('');
  const [lens, setLens]             = useState('');
  const [settings, setSettings]     = useState('');
  const [submitting, setSubmitting]             = useState(false);
  const [error, setError]                       = useState('');
  const [uploadProgress, setUploadProgress]     = useState<number[]>([]);
  const fileInputRef   = useRef<HTMLInputElement>(null);
  const uploadTasksRef = useRef<UploadTask[]>([]);
  const cancelledRef   = useRef(false);

  const handleFiles = (selected: FileList | null) => {
    if (!selected) return;
    const arr      = Array.from(selected).filter(f => f.type.startsWith('image/'));
    const oversize = arr.filter(f => f.size > MAX_BYTES);
    if (oversize.length) { setError('Each image must be under 5 MB.'); return; }
    const combined = [...files, ...arr].slice(0, MAX_IMAGES);
    setFiles(combined);
    setPreviews(combined.map(f => URL.createObjectURL(f)));
    setError('');
  };

  const removeImage = (i: number) => {
    setFiles(prev => prev.filter((_, idx) => idx !== i));
    setPreviews(prev => prev.filter((_, idx) => idx !== i));
  };

  // ── Upload helper: retry each file up to 3 times with exponential backoff ──
  const uploadWithRetry = async (
    file: File,
    path: string,
    fileIndex: number,
    maxAttempts = 3,
  ): Promise<string> => {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (cancelledRef.current) throw new Error('cancelled');

      const storageRef = ref(storage, path);
      const task       = uploadBytesResumable(storageRef, file);
      uploadTasksRef.current[fileIndex] = task;

      try {
        await new Promise<void>((resolve, reject) => {
          task.on(
            'state_changed',
            (snapshot) => {
              const pct = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
              setUploadProgress(prev => {
                const next = [...prev];
                next[fileIndex] = pct;
                return next;
              });
            },
            (err) => reject(err),
            () => resolve(),
          );
        });
        return await getDownloadURL(storageRef);
      } catch (e: unknown) {
        const code = (e as { code?: string })?.code;
        if (code === 'storage/cancelled' || cancelledRef.current) throw new Error('cancelled');
        if (attempt === maxAttempts - 1) throw e;
        // Reset this file's progress bar before retry
        setUploadProgress(prev => { const n = [...prev]; n[fileIndex] = 0; return n; });
        await new Promise<void>(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
      }
    }
    throw new Error('Upload failed after all attempts');
  };

  // ── Cancel: abort all in-flight uploads and return to gallery ──────────────
  const handleCancelUpload = useCallback(() => {
    cancelledRef.current = true;
    uploadTasksRef.current.forEach(task => { try { task.cancel(); } catch {} });
    uploadTasksRef.current = [];
    setFiles([]);
    setPreviews([]);
    setSubmitting(false);
    setError('');
    setUploadProgress([]);
    onCancel();
  }, [onCancel]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (files.length === 0) { setError('Please add at least one photo.'); return; }
    if (!caption.trim())    { setError('Please add a caption.');          return; }
    setSubmitting(true);
    setError('');
    cancelledRef.current = false;
    uploadTasksRef.current = [];
    setUploadProgress(new Array(files.length).fill(0));

    const ts   = Date.now();
    const urls: string[] = [];

    // ── Phase 1: upload each image (retry ×3, backoff 1s/2s/4s) ─────────────
    // If any upload fails after all retries, abort here — Firestore doc is
    // never created, so no broken image URLs can end up on the post.
    for (let i = 0; i < files.length; i++) {
      try {
        const url = await uploadWithRetry(
          files[i],
          `community-posts/${userId}/${ts}/${files[i].name}`,
          i,
        );
        urls.push(url);
      } catch (uploadErr: unknown) {
        if (cancelledRef.current) return; // handleCancelUpload already cleaned up
        console.error(`Image ${i + 1} upload failed after all retries:`, uploadErr);
        setError('Image upload failed. Please check your connection and try again.');
        setFiles([]);
        setPreviews([]);
        setUploadProgress([]);
        setSubmitting(false);
        return; // ← hard stop: Firestore doc is NOT created
      }
    }

    // ── Phase 2: create Firestore document (only reached if all uploads OK) ──
    try {
      await validateAndCreate({
        displayName,
        caption:       caption.trim(),
        assignmentTag: tag,
        imageUrls:     urls,
        ...(cameraBody.trim() && { cameraBody: cameraBody.trim() }),
        ...(lens.trim()       && { lens:       lens.trim()       }),
        ...(settings.trim()   && { settings:   settings.trim()   }),
        expiresAtMs: ts + TTL_MS,
      });
      onSuccess();
    } catch (err: unknown) {
      console.error('Post creation failed:', err);
      const msg = (err as { message?: string })?.message;
      setError(
        msg?.toLowerCase().includes('limit')
          ? msg
          : 'Upload failed. Please check your connection and try again.',
      );
      setSubmitting(false);
    }
  };

  return (
    <div className="animate-in fade-in duration-500">
      <header className="mb-10">
        <button onClick={onCancel}
          className="flex items-center gap-2 text-xs font-medium text-brand-gray hover:text-brand-rose transition-colors mb-6">
          <i className="fa-solid fa-arrow-left text-[9px]"></i> Community
        </button>
        <div className="flex items-center gap-4">
          <div className="w-1.5 h-10 bg-brand-rose rounded"></div>
          <div>
            <h2 className="text-4xl font-display text-brand-black tracking-wide">NEW POST</h2>
            <p className="text-brand-gray text-sm font-medium mt-1">
              Share a photo with the community · disappears after 72 hours
            </p>
          </div>
        </div>
      </header>

      <form onSubmit={handleSubmit} className="space-y-8 max-w-2xl">
        {/* Image upload */}
        <div>
          <p className="text-xs font-semibold text-brand-black/50 mb-3">
            Photos <span className="text-brand-gray/40 font-normal">(up to {MAX_IMAGES}, max 5 MB each)</span>
          </p>
          <div className="flex flex-wrap gap-3">
            {previews.map((src, i) => (
              <div key={i} className="relative w-24 h-24 rounded-lg overflow-hidden border border-brand-black/10 group">
                <img src={src} alt="" className="w-full h-full object-cover" />
                <button type="button" onClick={() => removeImage(i)}
                  className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                  <i className="fa-solid fa-xmark text-sm"></i>
                </button>
              </div>
            ))}
            {files.length < MAX_IMAGES && (
              <button type="button" onClick={() => fileInputRef.current?.click()}
                className="w-24 h-24 rounded-lg border-2 border-dashed border-brand-black/15 hover:border-brand-blue/40 transition-colors flex flex-col items-center justify-center gap-1 text-brand-gray/40 hover:text-brand-blue">
                <i className="fa-solid fa-plus text-lg"></i>
                <span className="text-[10px] font-medium">Add photo</span>
              </button>
            )}
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden"
            onChange={e => handleFiles(e.target.files)} />
        </div>

        {/* Caption */}
        <div>
          <label className="text-xs font-semibold text-brand-black/50 block mb-2">
            Caption <span className="text-brand-gray/40 font-normal">(max 200 characters)</span>
          </label>
          <textarea value={caption} onChange={e => setCaption(e.target.value.slice(0, 200))}
            placeholder="Describe your photo, the shoot, the moment…"
            className="w-full border border-brand-black/10 rounded-md px-4 py-3 text-sm focus:ring-1 focus:ring-brand-blue outline-none placeholder:text-brand-black/20 min-h-[80px] resize-none" />
          <p className="text-[10px] text-brand-gray/40 text-right mt-1">{caption.length}/200</p>
        </div>

        {/* Tag */}
        <div>
          <label className="text-xs font-semibold text-brand-black/50 block mb-2">Assignment tag</label>
          <div className="flex flex-wrap gap-2">
            {availableTags.map(t => (
              <button key={t} type="button" onClick={() => setTag(t)}
                className={`text-xs font-medium px-3 py-1.5 rounded-md border transition-all ${
                  tag === t
                    ? 'bg-brand-black text-white border-brand-black'
                    : 'bg-white text-brand-gray border-brand-black/10 hover:border-brand-black/30'
                }`}>{t}</button>
            ))}
          </div>
        </div>

        {/* Optional gear */}
        <div>
          <p className="text-xs font-semibold text-brand-black/50 mb-3">
            Gear & settings <span className="text-brand-gray/40 font-normal">(optional)</span>
          </p>
          <div className="space-y-3">
            <input type="text" value={cameraBody} onChange={e => setCameraBody(e.target.value)}
              placeholder="Camera body (e.g. Sony A7 IV)"
              className="w-full border border-brand-black/10 rounded-md px-4 py-3 text-sm focus:ring-1 focus:ring-brand-blue outline-none placeholder:text-brand-black/20" />
            <input type="text" value={lens} onChange={e => setLens(e.target.value)}
              placeholder="Lens (e.g. 85mm f/1.4)"
              className="w-full border border-brand-black/10 rounded-md px-4 py-3 text-sm focus:ring-1 focus:ring-brand-blue outline-none placeholder:text-brand-black/20" />
            <input type="text" value={settings} onChange={e => setSettings(e.target.value)}
              placeholder="Key settings (e.g. f/2.8 · 1/500s · ISO 400)"
              className="w-full border border-brand-black/10 rounded-md px-4 py-3 text-sm focus:ring-1 focus:ring-brand-blue outline-none placeholder:text-brand-black/20" />
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-brand-rose/10 border border-brand-rose/20 rounded-md px-4 py-3 flex items-center gap-2">
            <i className="fa-solid fa-circle-exclamation text-brand-rose text-sm"></i>
            <p className="text-sm text-brand-rose">{error}</p>
          </div>
        )}

        {/* Per-file upload progress (visible only while uploading) */}
        {submitting && uploadProgress.length > 0 && (
          <div className="space-y-3 bg-brand-white border border-brand-black/5 rounded-lg p-4">
            <p className="text-xs font-semibold text-brand-black/40">Uploading photos…</p>
            {files.map((file, i) => {
              const pct  = uploadProgress[i] ?? 0;
              const done = pct >= 100;
              return (
                <div key={i}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-brand-gray/70 truncate max-w-[240px]">{file.name}</span>
                    <span className="text-xs font-semibold text-brand-black ml-2">
                      {done
                        ? <i className="fa-solid fa-circle-check text-emerald-500"></i>
                        : `${pct}%`
                      }
                    </span>
                  </div>
                  <div className="w-full bg-brand-black/5 rounded-full h-1.5">
                    <div
                      className={`h-1.5 rounded-full transition-all duration-300 ${done ? 'bg-emerald-500' : 'bg-brand-blue'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Submit / Cancel */}
        <div className="flex gap-3 pt-2">
          <button type="submit" disabled={submitting}
            className="flex-1 bg-brand-black text-white text-sm font-semibold py-4 rounded-md hover:bg-zinc-700 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2">
            {submitting
              ? <><i className="fa-solid fa-spinner fa-spin"></i>
                  {uploadProgress.length > 0 && uploadProgress.every(p => p >= 100)
                    ? 'Creating post…'
                    : 'Uploading…'
                  }</>
              : <><i className="fa-solid fa-paper-plane text-brand-rose"></i> Post to Community</>
            }
          </button>
          {/* During upload: Cancel aborts tasks. Otherwise: Cancel returns to gallery. */}
          <button
            type="button"
            onClick={submitting ? handleCancelUpload : onCancel}
            className={`px-6 border text-sm font-medium rounded-md transition-all ${
              submitting
                ? 'border-brand-rose/30 text-brand-rose hover:bg-brand-rose hover:text-white'
                : 'border-brand-black/10 text-brand-gray hover:border-brand-black/20'
            }`}
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
};

// ─── Main CommunityView ───────────────────────────────────────────────────────

interface CommunityViewProps {
  user: { uid: string; displayName?: string | null; email?: string | null } | null;
  profileGenres?: Genre[];
  profileName?: string;
}

const CommunityView: React.FC<CommunityViewProps> = ({ user, profileGenres, profileName }) => {
  const availableTags: string[] = profileGenres && profileGenres.length > 0
    ? [...profileGenres.filter(g => g !== 'Other'), 'Other']
    : TAGS;

  const [view, setView]                 = useState<'gallery' | 'new-post'>('gallery');
  const [posts, setPosts]               = useState<CommunityPost[]>([]);
  const [loading, setLoading]           = useState(true);
  const [loadingMore, setLoadingMore]   = useState(false);
  const [hasMore, setHasMore]           = useState(false);
  const [selectedPost, setSelectedPost] = useState<CommunityPost | null>(null);
  const [successMsg, setSuccessMsg]     = useState('');
  const [userActivePosts, setUserActivePosts]   = useState<CommunityPost[]>([]);
  const [checkingLimit, setCheckingLimit]       = useState(false);
  const lastDocRef = useRef<QueryDocumentSnapshot<DocumentData> | null>(null);

  const displayName = profileName?.trim() || user?.displayName || user?.email?.split('@')[0] || 'Photographer';

  const fetchPosts = useCallback(async (cursor?: QueryDocumentSnapshot<DocumentData>) => {
    try {
      const base = query(
        collection(db, 'communityPosts'),
        orderBy('createdAt', 'desc'),
        limit(PAGE_SIZE + 1),
      );
      const q    = cursor ? query(base, startAfter(cursor)) : base;
      const snap = await getDocs(q);
      const docs = snap.docs;
      const now  = Date.now();
      const valid   = docs.filter(d => {
        const data = d.data();
        return data.status === 'active' && toMs(data.expiresAt?.toDate ? data.expiresAt.toDate() : data.expiresAt) > now;
      });
      const hasNext = valid.length > PAGE_SIZE;
      const page    = valid.slice(0, PAGE_SIZE).map(snapToPost);
      lastDocRef.current = docs[docs.length - 1] ?? null;
      return { page, hasNext };
    } catch (err) {
      console.error('Community fetch error:', err);
      return { page: [], hasNext: false };
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchPosts().then(({ page, hasNext }) => {
      setPosts(page);
      setHasMore(hasNext);
      setLoading(false);
    });
  }, [fetchPosts]);

  useEffect(() => {
    const id = setInterval(() => {
      setPosts(prev => {
        const filtered = prev.filter(p => !isExpired(p));
        setSelectedPost(sp => sp && isExpired(sp) ? null : sp);
        return filtered;
      });
    }, 60_000);
    return () => clearInterval(id);
  }, []);

  const loadMore = async () => {
    if (!lastDocRef.current) return;
    setLoadingMore(true);
    const { page, hasNext } = await fetchPosts(lastDocRef.current);
    setPosts(prev => [...prev, ...page]);
    setHasMore(hasNext);
    setLoadingMore(false);
  };

  const openNewPost = async () => {
    if (!user) return;
    setCheckingLimit(true);
    try {
      const snap = await getDocs(
        query(collection(db, 'communityPosts'), where('userId', '==', user.uid))
      );
      const now    = Date.now();
      const active = snap.docs
        .map(snapToPost)
        .filter(p => p.status === 'active' && toMs(p.expiresAt) > now);
      setUserActivePosts(active);
    } catch (e) {
      console.error('Limit check error:', e);
      setUserActivePosts([]);
    }
    setCheckingLimit(false);
    setView('new-post');
  };

  const handlePostSuccess = () => {
    setView('gallery');
    setSuccessMsg('Your post is live! It will disappear after 72 hours.');
    setLoading(true);
    fetchPosts().then(({ page, hasNext }) => {
      setPosts(page);
      setHasMore(hasNext);
      setLoading(false);
    });
    setTimeout(() => setSuccessMsg(''), 5000);
  };

  const handleGalleryRemove = (post: CommunityPost) => {
    setPosts(prev => prev.filter(p => p.id !== post.id));
    if (selectedPost?.id === post.id) setSelectedPost(null);
  };

  const handleLimitPanelRemove = (post: CommunityPost) => {
    setUserActivePosts(prev => prev.filter(p => p.id !== post.id));
    setPosts(prev => prev.filter(p => p.id !== post.id));
  };

  // Updates ratingSum / ratingCount in both posts array and open modal
  const handleRated = (postId: string, newSum: number, newCount: number) => {
    const patch = (p: CommunityPost) =>
      p.id === postId ? { ...p, ratingSum: newSum, ratingCount: newCount } : p;
    setPosts(prev => prev.map(patch));
    setSelectedPost(prev => prev ? patch(prev) : null);
  };

  // ── New Post view ──────────────────────────────────────────────────────────
  if (view === 'new-post') {
    if (!user) {
      return (
        <div className="py-32 text-center">
          <p className="text-brand-gray font-medium">Sign in to post.</p>
        </div>
      );
    }

    if (userActivePosts.length >= POST_LIMIT) {
      return (
        <LimitReachedPanel
          activePosts={userActivePosts}
          displayName={displayName}
          onRemoved={handleLimitPanelRemove}
          onCancel={() => setView('gallery')}
        />
      );
    }

    return (
      <NewPostForm
        userId={user.uid}
        displayName={displayName}
        availableTags={availableTags}
        onSuccess={handlePostSuccess}
        onCancel={() => setView('gallery')}
      />
    );
  }

  // ── Gallery view ───────────────────────────────────────────────────────────
  return (
    <div className="animate-in fade-in duration-500">
      <header className="mb-10 flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <div className="w-1.5 h-10 bg-brand-blue rounded"></div>
          <div>
            <h2 className="text-4xl font-display text-brand-black tracking-wide">COMMUNITY</h2>
            <p className="text-brand-gray text-sm font-medium mt-1">Photos from the PhotoVise community · posts expire after 72h</p>
          </div>
        </div>
        {user ? (
          <button
            onClick={openNewPost}
            disabled={checkingLimit}
            className="flex items-center gap-2 bg-brand-black text-white text-sm font-semibold px-5 py-3 rounded-md hover:bg-zinc-700 transition-all active:scale-95 shadow-sm disabled:opacity-60">
            {checkingLimit
              ? <><i className="fa-solid fa-spinner fa-spin text-xs"></i> Checking…</>
              : <><i className="fa-solid fa-plus text-brand-rose"></i> New Post</>
            }
          </button>
        ) : (
          <p className="text-xs text-brand-gray/60 font-medium pt-3">
            <i className="fa-solid fa-lock text-brand-gray/30 mr-1.5"></i>Sign in to post
          </p>
        )}
      </header>

      {successMsg && (
        <div className="mb-6 bg-emerald-50 border border-emerald-200 rounded-md px-4 py-3 flex items-center gap-2 animate-in fade-in duration-300">
          <i className="fa-solid fa-circle-check text-emerald-500"></i>
          <p className="text-sm text-emerald-700 font-medium">{successMsg}</p>
        </div>
      )}

      {loading ? (
        <div className="py-32 flex flex-col items-center gap-4">
          <i className="fa-solid fa-spinner fa-spin text-brand-blue text-2xl"></i>
          <p className="text-xs text-brand-gray/50 font-medium">Loading community posts…</p>
        </div>
      ) : posts.length === 0 ? (
        <div className="py-32 text-center border border-dashed border-brand-gray/20 rounded-lg">
          <i className="fa-solid fa-camera text-brand-gray/20 text-3xl mb-4 block"></i>
          <p className="text-sm font-medium text-brand-gray/50">No posts yet</p>
          {user && (
            <button onClick={openNewPost}
              className="mt-4 text-xs text-brand-blue font-medium hover:underline">
              Be the first to post
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {posts.map(post => (
              <GalleryCard
                key={post.id}
                post={post}
                onClick={() => setSelectedPost(post)}
                resolvedName={post.userId === user?.uid ? displayName : undefined}
                currentUserId={user?.uid}
                onRemove={handleGalleryRemove}
              />
            ))}
          </div>

          {hasMore && (
            <div className="mt-10 text-center">
              <button onClick={loadMore} disabled={loadingMore}
                className="inline-flex items-center gap-2 border border-brand-black/10 text-brand-gray text-sm font-medium px-6 py-3 rounded-md hover:border-brand-black/20 hover:text-brand-black transition-all disabled:opacity-50">
                {loadingMore
                  ? <><i className="fa-solid fa-spinner fa-spin"></i> Loading…</>
                  : <><i className="fa-solid fa-arrow-down text-[10px]"></i> Load more</>
                }
              </button>
            </div>
          )}
        </>
      )}

      {selectedPost && (
        <PostModal
          post={selectedPost}
          onClose={() => setSelectedPost(null)}
          resolvedName={selectedPost.userId === user?.uid ? displayName : undefined}
          currentUserId={user?.uid}
          onRated={handleRated}
        />
      )}
    </div>
  );
};

export default CommunityView;
