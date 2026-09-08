import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  collection, doc, addDoc, updateDoc, deleteDoc,
  onSnapshot, query, orderBy, getDoc,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../firebase';
import { auth } from '../firebase';
import type {
  Genre, StudioJob, StudioJobResponse, StudioChannel, ChannelMessage,
} from '../types';

// ── Constants ─────────────────────────────────────────────────────────────────

const ADMIN_EMAIL = 'eprosillo@gmail.com';

const GENRES: Genre[] = [
  'Street','Sports','Photojournalism','Portrait','Wedding','Event',
  'Landscape','Architecture','Documentary','Commercial','Editorial',
  'Fashion','Product','Food','Still Life','Wildlife','Macro','Astro','Travel','Other',
];

const DEFAULT_CHANNELS = [
  { name: 'general',       description: 'General discussion for the whole team', isDefault: true },
  { name: 'announcements', description: 'Important updates — admin only',        isDefault: true },
  { name: 'jobs',          description: 'Job postings and assignment updates',   isDefault: true },
];

const REACTION_EMOJIS = ['👍', '❤️', '🔥', '📸', '✨'];

// ── Style tokens ──────────────────────────────────────────────────────────────
const INK   = '#17191a';
const PAPER = '#f8f7f4';
const GOLD  = '#c9a227';
const TEAL  = '#3E8E97';
const MUTED = 'rgba(23,25,26,0.42)';
const RULE  = 'rgba(23,25,26,0.10)';

const mono = (size = 9): React.CSSProperties => ({
  fontFamily: "'IBM Plex Mono', monospace",
  fontSize: `${size}px`,
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
});

const pill = (color: string): React.CSSProperties => ({
  ...mono(),
  display: 'inline-block',
  padding: '2px 8px',
  border: `1px solid ${color}50`,
  color,
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function relTime(ts: number): string {
  const d = Date.now() - ts;
  if (d < 60_000)     return 'just now';
  if (d < 3_600_000)  return `${Math.floor(d / 60_000)}m ago`;
  if (d < 86_400_000) return `${Math.floor(d / 3_600_000)}h ago`;
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function initials(name: string) {
  const p = name.trim().split(/[\s@]+/);
  return p.length >= 2 ? (p[0][0] + p[1][0]).toUpperCase() : name.slice(0, 2).toUpperCase() || '??';
}

// ── Membership Cloud Function wrappers ─────────────────────────────────────────

const requestMembershipFn    = httpsCallable(functions, 'requestMembership');
const approveMembershipFn    = httpsCallable<{ uid: string }>(functions, 'approveMembership');
const rejectMembershipFn     = httpsCallable<{ uid: string }>(functions, 'rejectMembership');
const grantLeadFn      = httpsCallable<{ uid: string }>(functions, 'grantLead');
const revokeLeadFn     = httpsCallable<{ uid: string }>(functions, 'revokeLead');

// ── Types ─────────────────────────────────────────────────────────────────────

type AccessStatus = 'loading' | 'none' | 'pending' | 'approved';

interface MembershipRequest {
  uid: string;
  email: string;
  displayName: string;
  requestedAt: number;
  status: 'pending' | 'approved' | 'rejected';
  isLead?: boolean;
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  user: { uid: string; displayName?: string | null; email?: string | null } | null;
}

// ── Empty job form ─────────────────────────────────────────────────────────────

const emptyJobForm = () => ({
  title: '', date: '', location: '', genre: '' as Genre | '',
  brief: '', photographersNeeded: 1,
  shootingHours: '' as string, editingHours: '' as string,
  equipmentNotes: '', clientName: '', responseDeadline: '',
});

// ── Main component ────────────────────────────────────────────────────────────

const CoworkingView: React.FC<Props> = ({ user }) => {
  const uid    = user?.uid ?? '';
  const uName  = user?.displayName || user?.email?.split('@')[0] || 'You';
  const isAdmin = user?.email === ADMIN_EMAIL;

  // ── Access / membership state ───────────────────────────────────────────────
  const [accessStatus,      setAccessStatus]      = useState<AccessStatus>('loading');
  const [isLead,            setIsLead]            = useState(false);
  const [requestingAccess,  setRequestingAccess]  = useState(false);
  const [membershipRequests, setMembershipRequests] = useState<MembershipRequest[]>([]);
  const [approvedMembers,   setApprovedMembers]   = useState<MembershipRequest[]>([]);
  const [showRequestsPanel, setShowRequestsPanel] = useState(false);
  const [adminTab,          setAdminTab]          = useState<'requests' | 'members'>('requests');

  // ── Section / layout state ─────────────────────────────────────────────────
  const [section, setSection]   = useState<'jobs' | 'channels'>('jobs');
  const [isMobile, setIsMobile] = useState(window.innerWidth < 820);

  // ── Jobs state ─────────────────────────────────────────────────────────────
  const [jobs,          setJobs]          = useState<StudioJob[]>([]);
  const [allResponses,  setAllResponses]  = useState<StudioJobResponse[]>([]);
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  const [showJobForm,   setShowJobForm]   = useState(false);
  const [editingJobId,  setEditingJobId]  = useState<string | null>(null);
  const [jobForm,       setJobForm]       = useState(emptyJobForm);
  const [savingJob,     setSavingJob]     = useState(false);

  // ── Channels state ─────────────────────────────────────────────────────────
  const [channels,        setChannels]        = useState<StudioChannel[]>([]);
  const [channelsLoaded,  setChannelsLoaded]  = useState(false);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [messages,        setMessages]        = useState<ChannelMessage[]>([]);
  const [msgText,         setMsgText]         = useState('');
  const [sendingMsg,      setSendingMsg]       = useState(false);
  const [showChannelForm, setShowChannelForm] = useState(false);
  const [newChannelName,  setNewChannelName]  = useState('');
  const [mobileShowChat,  setMobileShowChat]  = useState(false);

  const msgEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = () => setIsMobile(window.innerWidth < 820);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);

  // ── Check access on mount ──────────────────────────────────────────────────
  useEffect(() => {
    if (!uid) { setAccessStatus('none'); return; }

    (async () => {
      try {
        // Force-refresh token to pick up any newly-set custom claims.
        const tokenResult  = await auth.currentUser?.getIdTokenResult(/* forceRefresh */ true);
        const approved     = tokenResult?.claims?.coworkingApproved === true;
        const lead     = tokenResult?.claims?.coworkingLead === true;

        if (lead) setIsLead(true);

        if (isAdmin || approved || lead) {
          setAccessStatus('approved');
          return;
        }

        // Not approved — check if they have a pending request.
        const reqDoc = await getDoc(doc(db, 'membership_requests', uid));
        if (reqDoc.exists()) {
          const data = reqDoc.data();
          // Treat rejected as "none" so they can request again (optional UX choice).
          setAccessStatus(data.status === 'pending' ? 'pending' : 'none');
        } else {
          setAccessStatus('none');
        }
      } catch {
        setAccessStatus('none');
      }
    })();
  }, [uid, isAdmin]);

  // ── Admin: live membership requests + members ──────────────────────────────
  useEffect(() => {
    if (!isAdmin) return;
    return onSnapshot(
      query(collection(db, 'membership_requests'), orderBy('requestedAt', 'asc')),
      snap => {
        const all = snap.docs.map(d => d.data() as MembershipRequest);
        setMembershipRequests(all.filter(r => r.status === 'pending'));
        setApprovedMembers(all.filter(r => r.status === 'approved'));
      },
    );
  }, [isAdmin]);

  // ── Firestore: jobs ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!uid || accessStatus !== 'approved') return;
    return onSnapshot(
      query(collection(db, 'studio_jobs'), orderBy('createdAt', 'desc')),
      snap => setJobs(snap.docs.map(d => ({ id: d.id, ...d.data() } as StudioJob))),
    );
  }, [uid, accessStatus]);

  // ── Firestore: all responses ────────────────────────────────────────────────
  useEffect(() => {
    if (!uid || accessStatus !== 'approved') return;
    return onSnapshot(
      query(collection(db, 'studio_job_responses'), orderBy('createdAt', 'asc')),
      snap => setAllResponses(snap.docs.map(d => ({ id: d.id, ...d.data() } as StudioJobResponse))),
    );
  }, [uid, accessStatus]);

  // ── Firestore: channels ────────────────────────────────────────────────────
  useEffect(() => {
    if (!uid || accessStatus !== 'approved') return;
    return onSnapshot(
      query(collection(db, 'studio_channels'), orderBy('createdAt', 'asc')),
      snap => {
        const chs = snap.docs.map(d => ({ id: d.id, ...d.data() } as StudioChannel));
        setChannels(chs);
        setChannelsLoaded(true);
      },
    );
  }, [uid, accessStatus]);

  // Seed default channels on first load
  useEffect(() => {
    if (!channelsLoaded || channels.length > 0 || !uid) return;
    DEFAULT_CHANNELS.forEach(ch =>
      addDoc(collection(db, 'studio_channels'), { ...ch, createdBy: uid, createdAt: Date.now() }),
    );
  }, [channelsLoaded, channels.length, uid]);

  // Auto-select first channel
  useEffect(() => {
    if (!activeChannelId && channels.length > 0) setActiveChannelId(channels[0].id);
  }, [channels, activeChannelId]);

  // ── Firestore: messages for active channel ─────────────────────────────────
  useEffect(() => {
    if (!activeChannelId) return;
    setMessages([]);
    return onSnapshot(
      query(
        collection(db, 'studio_channels', activeChannelId, 'messages'),
        orderBy('createdAt', 'asc'),
      ),
      snap => setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() } as ChannelMessage))),
    );
  }, [activeChannelId]);

  useEffect(() => {
    msgEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  // ── Membership actions ─────────────────────────────────────────────────────
  const handleRequestAccess = useCallback(async () => {
    setRequestingAccess(true);
    try {
      await requestMembershipFn();
      setAccessStatus('pending');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Something went wrong.';
      alert(msg);
    } finally {
      setRequestingAccess(false);
    }
  }, []);

  const handleApprove = useCallback(async (targetUid: string) => {
    try {
      await approveMembershipFn({ uid: targetUid });
      // The onSnapshot listener will remove it from pending list automatically.
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Approval failed.');
    }
  }, []);

  const handleReject = useCallback(async (targetUid: string) => {
    try {
      await rejectMembershipFn({ uid: targetUid });
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Rejection failed.');
    }
  }, []);

  const handleGrantLead = useCallback(async (targetUid: string) => {
    try {
      await grantLeadFn({ uid: targetUid });
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to grant Lead role.');
    }
  }, []);

  const handleRevokeLead = useCallback(async (targetUid: string) => {
    try {
      await revokeLeadFn({ uid: targetUid });
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to revoke Lead role.');
    }
  }, []);

  // ── Job actions ────────────────────────────────────────────────────────────
  const jobPayload = useCallback(() => ({
    title: jobForm.title.trim(),
    date: jobForm.date,
    location: jobForm.location.trim(),
    genre: jobForm.genre,
    brief: jobForm.brief.trim(),
    photographersNeeded: jobForm.photographersNeeded,
    ...(jobForm.shootingHours !== '' ? { shootingHours: Number(jobForm.shootingHours) } : { shootingHours: null }),
    ...(jobForm.editingHours  !== '' ? { editingHours:  Number(jobForm.editingHours)  } : { editingHours:  null }),
    ...(jobForm.equipmentNotes ? { equipmentNotes: jobForm.equipmentNotes.trim() } : { equipmentNotes: null }),
    ...(jobForm.clientName ? { clientName: jobForm.clientName.trim() } : { clientName: null }),
    ...(jobForm.responseDeadline ? { responseDeadline: jobForm.responseDeadline } : { responseDeadline: null }),
  }), [jobForm]);

  const resetJobForm = useCallback(() => {
    setJobForm(emptyJobForm());
    setShowJobForm(false);
    setEditingJobId(null);
  }, []);

  const postJob = useCallback(async () => {
    if (!jobForm.title.trim() || !jobForm.date || !jobForm.location.trim() || !jobForm.genre || !uid) return;
    setSavingJob(true);
    try {
      await addDoc(collection(db, 'studio_jobs'), {
        ...jobPayload(),
        status: 'open',
        assignedUserIds: [],
        createdBy: uid,
        createdAt: Date.now(),
      } as Omit<StudioJob, 'id'>);
      resetJobForm();
    } finally {
      setSavingJob(false);
    }
  }, [jobForm, uid, jobPayload, resetJobForm]);

  const updateJob = useCallback(async () => {
    if (!editingJobId || !jobForm.title.trim() || !jobForm.date || !jobForm.location.trim() || !jobForm.genre) return;
    setSavingJob(true);
    try {
      await updateDoc(doc(db, 'studio_jobs', editingJobId), jobPayload());
      resetJobForm();
    } finally {
      setSavingJob(false);
    }
  }, [editingJobId, jobForm, jobPayload, resetJobForm]);

  const openEditForm = useCallback((job: StudioJob) => {
    setJobForm({
      title: job.title,
      date: job.date,
      location: job.location,
      genre: job.genre,
      brief: job.brief ?? '',
      photographersNeeded: job.photographersNeeded,
      shootingHours: job.shootingHours != null ? String(job.shootingHours) : '',
      editingHours:  job.editingHours  != null ? String(job.editingHours)  : '',
      equipmentNotes: job.equipmentNotes ?? '',
      clientName: job.clientName ?? '',
      responseDeadline: job.responseDeadline ?? '',
    });
    setEditingJobId(job.id);
    setShowJobForm(false);
    setExpandedJobId(null);
  }, []);

  const respondToJob = useCallback(async (
    jobId: string,
    availability: 'available' | 'unavailable',
  ) => {
    if (!uid) return;
    const existing = allResponses.find(r => r.jobId === jobId && r.userId === uid);
    if (existing) await deleteDoc(doc(db, 'studio_job_responses', existing.id));
    await addDoc(collection(db, 'studio_job_responses'), {
      jobId, userId: uid, userDisplayName: uName,
      availability, createdAt: Date.now(),
    } as Omit<StudioJobResponse, 'id'>);
  }, [uid, uName, allResponses]);

  const assignPhotographer = useCallback(async (job: StudioJob, assignUid: string) => {
    const updated = [...new Set([...job.assignedUserIds, assignUid])];
    const filled  = updated.length >= job.photographersNeeded;
    await updateDoc(doc(db, 'studio_jobs', job.id), {
      assignedUserIds: updated,
      status: filled ? 'filled' : 'open',
    });
  }, []);

  const removeAssignment = useCallback(async (job: StudioJob, assignUid: string) => {
    const updated = job.assignedUserIds.filter(id => id !== assignUid);
    await updateDoc(doc(db, 'studio_jobs', job.id), {
      assignedUserIds: updated,
      status: 'open',
    });
  }, []);

  const setJobStatus = useCallback(async (jobId: string, status: StudioJob['status']) => {
    await updateDoc(doc(db, 'studio_jobs', jobId), { status });
  }, []);

  const deleteJob = useCallback(async (jobId: string) => {
    if (!confirm('Delete this job posting?')) return;
    await deleteDoc(doc(db, 'studio_jobs', jobId));
  }, []);

  // ── Channel actions ────────────────────────────────────────────────────────
  const createChannel = useCallback(async () => {
    const name = newChannelName.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    if (!name || !uid) return;
    const ref = await addDoc(collection(db, 'studio_channels'), {
      name, isDefault: false, createdBy: uid, createdAt: Date.now(),
    });
    setActiveChannelId(ref.id);
    setNewChannelName(''); setShowChannelForm(false);
  }, [newChannelName, uid]);

  const sendMessage = useCallback(async () => {
    if (!msgText.trim() || !activeChannelId || !uid) return;
    setSendingMsg(true);
    try {
      await addDoc(collection(db, 'studio_channels', activeChannelId, 'messages'), {
        channelId: activeChannelId,
        userId: uid, userDisplayName: uName,
        text: msgText.trim(),
        createdAt: Date.now(),
        reactions: {},
      } as Omit<ChannelMessage, 'id'>);
      setMsgText('');
    } finally {
      setSendingMsg(false);
    }
  }, [msgText, activeChannelId, uid, uName]);

  const toggleReaction = useCallback(async (msg: ChannelMessage, emoji: string) => {
    if (!activeChannelId) return;
    const current = msg.reactions[emoji] ?? [];
    const updated  = current.includes(uid) ? current.filter(id => id !== uid) : [...current, uid];
    await updateDoc(
      doc(db, 'studio_channels', activeChannelId, 'messages', msg.id),
      { [`reactions.${emoji}`]: updated },
    );
  }, [activeChannelId, uid]);

  // ── Derived ────────────────────────────────────────────────────────────────
  const canManageJobs = isAdmin || isLead;
  const responsesFor  = (jobId: string) => allResponses.filter(r => r.jobId === jobId);
  const myResponse    = (jobId: string) => allResponses.find(r => r.jobId === jobId && r.userId === uid);
  const activeChannel = channels.find(c => c.id === activeChannelId) ?? null;

  // ── Gate screens ──────────────────────────────────────────────────────────

  if (accessStatus === 'loading') {
    return (
      <div style={{ padding: '60px 0', textAlign: 'center' }}>
        <p style={{ ...mono(), color: MUTED }}>Checking membership…</p>
      </div>
    );
  }

  if (accessStatus === 'none') {
    return (
      <div style={{ maxWidth: '480px', margin: '60px auto', textAlign: 'center', padding: '0 20px' }}>
        <div style={{ width: '56px', height: '56px', background: INK, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
          <span style={{ fontSize: '24px' }}>📸</span>
        </div>
        <h2 style={{ fontSize: '22px', fontWeight: 700, color: INK, marginBottom: '12px' }}>Studio Co-op</h2>
        <p style={{ fontSize: '14px', color: MUTED, lineHeight: 1.7, marginBottom: '32px' }}>
          The Studio Co-op is a members-only space for collaborating photographers — job board, channels, and shared projects.
          Request access to join.
        </p>
        <button
          onClick={handleRequestAccess}
          disabled={requestingAccess}
          style={{
            ...mono(10), padding: '14px 32px',
            background: requestingAccess ? 'rgba(23,25,26,0.10)' : INK,
            color: requestingAccess ? MUTED : PAPER,
            border: 'none', cursor: requestingAccess ? 'default' : 'pointer',
          }}
        >
          {requestingAccess ? 'Sending Request…' : 'Request Access'}
        </button>
      </div>
    );
  }

  if (accessStatus === 'pending') {
    return (
      <div style={{ maxWidth: '480px', margin: '60px auto', textAlign: 'center', padding: '0 20px' }}>
        <div style={{ width: '56px', height: '56px', background: `${GOLD}20`, border: `2px solid ${GOLD}40`, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
          <span style={{ fontSize: '22px' }}>⏳</span>
        </div>
        <h2 style={{ fontSize: '20px', fontWeight: 700, color: INK, marginBottom: '12px' }}>Request Under Review</h2>
        <p style={{ fontSize: '14px', color: MUTED, lineHeight: 1.7, marginBottom: '8px' }}>
          Your request to join the Studio Co-op has been sent. You'll have access as soon as it's approved.
        </p>
        <p style={{ ...mono(8), color: MUTED }}>Come back soon to check your status.</p>
      </div>
    );
  }

  // ── Full board (approved) ──────────────────────────────────────────────────
  return (
    <div>
      {/* Section tab bar */}
      <div style={{ display: 'flex', gap: '0px', marginBottom: '28px', borderBottom: `1px solid ${RULE}`, alignItems: 'flex-end' }}>
        {(['jobs', 'channels'] as const).map(s => (
          <button
            key={s}
            onClick={() => setSection(s)}
            style={{
              ...mono(10),
              padding: '10px 20px',
              background: 'none',
              border: 'none',
              borderBottom: section === s ? `2px solid ${INK}` : '2px solid transparent',
              color: section === s ? INK : MUTED,
              cursor: 'pointer',
              fontWeight: section === s ? 700 : 400,
              marginBottom: '-1px',
            }}
          >
            {s === 'jobs' ? 'Job Board' : 'Channels'}
          </button>
        ))}

        {/* Admin: manage panel toggle */}
        {isAdmin && (
          <button
            onClick={() => setShowRequestsPanel(p => !p)}
            style={{
              ...mono(10), marginLeft: 'auto', marginBottom: '4px',
              padding: '6px 14px', background: membershipRequests.length > 0 ? GOLD : 'rgba(23,25,26,0.10)',
              color: membershipRequests.length > 0 ? '#fff' : MUTED,
              border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
            }}
          >
            {membershipRequests.length > 0
              ? `${membershipRequests.length} Request${membershipRequests.length !== 1 ? 's' : ''}`
              : 'Manage Members'}
            <span>{showRequestsPanel ? '▲' : '▼'}</span>
          </button>
        )}
      </div>

      {/* Admin: manage panel */}
      {isAdmin && showRequestsPanel && (
        <div style={{ border: `1px solid rgba(23,25,26,0.12)`, background: PAPER, marginBottom: '28px' }}>
          {/* Panel tabs */}
          <div style={{ display: 'flex', borderBottom: `1px solid rgba(23,25,26,0.10)` }}>
            {(['requests', 'members'] as const).map(t => (
              <button
                key={t}
                onClick={() => setAdminTab(t)}
                style={{
                  ...mono(9), padding: '10px 20px', background: 'none', border: 'none', cursor: 'pointer',
                  borderBottom: adminTab === t ? `2px solid ${INK}` : '2px solid transparent',
                  color: adminTab === t ? INK : MUTED, fontWeight: adminTab === t ? 700 : 400,
                  marginBottom: '-1px',
                }}
              >
                {t === 'requests'
                  ? `Access Requests${membershipRequests.length > 0 ? ` (${membershipRequests.length})` : ''}`
                  : `Members (${approvedMembers.length})`}
              </button>
            ))}
          </div>

          <div style={{ padding: '16px 20px' }}>
            {/* Requests tab */}
            {adminTab === 'requests' && (
              membershipRequests.length === 0 ? (
                <p style={{ fontSize: '13px', color: MUTED }}>No pending requests.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {membershipRequests.map(req => (
                    <div key={req.uid} style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '12px 16px', background: `${GOLD}06`, border: `1px solid ${GOLD}30`, flexWrap: 'wrap' }}>
                      <div style={{ width: '34px', height: '34px', borderRadius: '50%', background: INK, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <span style={{ ...mono(8), color: PAPER, fontWeight: 600 }}>{initials(req.displayName)}</span>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: '14px', fontWeight: 600, color: INK, margin: 0 }}>{req.displayName}</p>
                        <p style={{ ...mono(8), color: MUTED, margin: '2px 0 0' }}>{req.email} · {relTime(req.requestedAt)}</p>
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button onClick={() => handleApprove(req.uid)} style={{ ...mono(9), padding: '7px 16px', background: INK, color: PAPER, border: 'none', cursor: 'pointer' }}>
                          Approve
                        </button>
                        <button onClick={() => handleReject(req.uid)} style={{ ...mono(9), padding: '7px 16px', background: 'none', border: `1px solid rgba(23,25,26,0.18)`, color: MUTED, cursor: 'pointer' }}>
                          Reject
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )
            )}

            {/* Members tab */}
            {adminTab === 'members' && (
              approvedMembers.length === 0 ? (
                <p style={{ fontSize: '13px', color: MUTED }}>No approved members yet.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {approvedMembers.map(m => (
                    <div key={m.uid} style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '12px 16px', background: 'rgba(23,25,26,0.02)', border: `1px solid rgba(23,25,26,0.10)`, flexWrap: 'wrap' }}>
                      <div style={{ width: '34px', height: '34px', borderRadius: '50%', background: INK, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <span style={{ ...mono(8), color: PAPER, fontWeight: 600 }}>{initials(m.displayName)}</span>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <p style={{ fontSize: '14px', fontWeight: 600, color: INK, margin: 0 }}>{m.displayName}</p>
                          {m.isLead && (
                            <span style={{ ...mono(8), padding: '2px 8px', border: `1px solid ${GOLD}50`, color: GOLD }}>Lead</span>
                          )}
                        </div>
                        <p style={{ ...mono(8), color: MUTED, margin: '2px 0 0' }}>{m.email}</p>
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        {m.isLead ? (
                          <button
                            onClick={() => handleRevokeLead(m.uid)}
                            style={{ ...mono(8), padding: '6px 14px', background: 'none', border: `1px solid rgba(23,25,26,0.18)`, color: MUTED, cursor: 'pointer' }}
                          >
                            Revoke Lead
                          </button>
                        ) : (
                          <button
                            onClick={() => handleGrantLead(m.uid)}
                            style={{ ...mono(8), padding: '6px 14px', background: INK, color: PAPER, border: 'none', cursor: 'pointer' }}
                          >
                            Make Lead
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )
            )}
          </div>
        </div>
      )}

      {/* ── JOBS ──────────────────────────────────────────────────────────── */}
      {section === 'jobs' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <h2 style={{ fontSize: '20px', fontWeight: 700, color: INK, margin: 0 }}>Job Board</h2>
              <p style={{ ...mono(), color: MUTED, marginTop: '4px' }}>
                {jobs.filter(j => j.status === 'open').length} open · {jobs.filter(j => j.status === 'filled').length} filled
              </p>
            </div>
            {canManageJobs && !showJobForm && !editingJobId && (
              <button
                onClick={() => setShowJobForm(true)}
                style={{ ...mono(10), padding: '10px 20px', background: INK, color: PAPER, border: 'none', cursor: 'pointer' }}
              >
                + Post a Job
              </button>
            )}
          </div>

          {(showJobForm || editingJobId) && (
            <JobPostForm
              form={jobForm}
              onChange={patch => setJobForm(prev => ({ ...prev, ...patch }))}
              onSubmit={editingJobId ? updateJob : postJob}
              onCancel={resetJobForm}
              saving={savingJob}
              isEditing={!!editingJobId}
            />
          )}

          {jobs.length === 0 && !showJobForm && (
            <p style={{ fontSize: '13px', color: MUTED }}>
              {canManageJobs ? 'No jobs posted yet. Click "Post a Job" to get started.' : 'No open jobs right now — check back soon.'}
            </p>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {jobs.map(job => (
              <JobCard
                key={job.id}
                job={job}
                isAdmin={canManageJobs}
                isExpanded={expandedJobId === job.id}
                onToggle={() => setExpandedJobId(expandedJobId === job.id ? null : job.id)}
                responses={responsesFor(job.id)}
                myResponse={myResponse(job.id)}
                uid={uid}
                onRespond={(av) => respondToJob(job.id, av)}
                onAssign={(aUid) => assignPhotographer(job, aUid)}
                onUnassign={(aUid) => removeAssignment(job, aUid)}
                onSetStatus={(s) => setJobStatus(job.id, s)}
                onDelete={() => deleteJob(job.id)}
                onEdit={() => openEditForm(job)}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── CHANNELS ──────────────────────────────────────────────────────── */}
      {section === 'channels' && (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '200px 1fr', gap: '0', border: `1px solid ${RULE}`, minHeight: '520px' }}>

          {(!isMobile || !mobileShowChat) && (
            <div style={{ borderRight: isMobile ? 'none' : `1px solid ${RULE}`, background: 'rgba(23,25,26,0.02)' }}>
              <div style={{ padding: '14px 14px 10px', borderBottom: `1px solid ${RULE}` }}>
                <span style={{ ...mono(), color: MUTED }}>Channels</span>
              </div>
              <div style={{ padding: '8px 0' }}>
                {channels.map(ch => (
                  <button
                    key={ch.id}
                    onClick={() => { setActiveChannelId(ch.id); if (isMobile) setMobileShowChat(true); }}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left',
                      padding: '8px 14px', border: 'none', cursor: 'pointer',
                      borderLeft: activeChannelId === ch.id ? `2px solid ${INK}` : '2px solid transparent',
                      background: activeChannelId === ch.id ? 'rgba(23,25,26,0.05)' : 'none',
                    }}
                  >
                    <span style={{ fontSize: '13px', color: activeChannelId === ch.id ? INK : MUTED, fontWeight: activeChannelId === ch.id ? 600 : 400 }}>
                      # {ch.name}
                    </span>
                  </button>
                ))}
              </div>
              <div style={{ padding: '8px 14px', borderTop: `1px solid ${RULE}` }}>
                {showChannelForm ? (
                  <div>
                    <input
                      autoFocus
                      value={newChannelName}
                      onChange={e => setNewChannelName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') createChannel(); if (e.key === 'Escape') { setShowChannelForm(false); setNewChannelName(''); } }}
                      placeholder="channel-name"
                      style={{ width: '100%', padding: '6px 8px', fontSize: '12px', color: INK, background: 'rgba(23,25,26,0.04)', border: `1px solid rgba(23,25,26,0.18)`, outline: 'none', marginBottom: '6px', boxSizing: 'border-box' }}
                    />
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button onClick={createChannel} style={{ ...mono(8), padding: '5px 10px', background: INK, color: PAPER, border: 'none', cursor: 'pointer' }}>Create</button>
                      <button onClick={() => { setShowChannelForm(false); setNewChannelName(''); }} style={{ ...mono(8), padding: '5px 10px', background: 'none', border: `1px solid rgba(23,25,26,0.18)`, color: MUTED, cursor: 'pointer' }}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => setShowChannelForm(true)} style={{ ...mono(8), background: 'none', border: 'none', color: MUTED, cursor: 'pointer', padding: 0 }}>
                    + New Channel
                  </button>
                )}
              </div>
            </div>
          )}

          {(!isMobile || mobileShowChat) && (
            <div style={{ display: 'flex', flexDirection: 'column', minHeight: '520px' }}>
              <div style={{ padding: '12px 16px', borderBottom: `1px solid ${RULE}`, display: 'flex', alignItems: 'center', gap: '10px' }}>
                {isMobile && (
                  <button onClick={() => setMobileShowChat(false)} style={{ ...mono(8), color: MUTED, background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginRight: '4px' }}>
                    ←
                  </button>
                )}
                <span style={{ fontSize: '14px', fontWeight: 600, color: INK }}>
                  # {activeChannel?.name ?? '…'}
                </span>
                {activeChannel?.description && (
                  <span style={{ fontSize: '12px', color: MUTED }}>{activeChannel.description}</span>
                )}
              </div>

              <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {messages.length === 0 && (
                  <p style={{ ...mono(), color: MUTED }}>No messages yet — say something.</p>
                )}
                {messages.map(msg => (
                  <MessageItem key={msg.id} msg={msg} uid={uid} onReact={(e) => toggleReaction(msg, e)} />
                ))}
                <div ref={msgEndRef} />
              </div>

              <div style={{ borderTop: `1px solid ${RULE}`, padding: '12px 16px', display: 'flex', gap: '10px' }}>
                <input
                  value={msgText}
                  onChange={e => setMsgText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                  placeholder={`Message #${activeChannel?.name ?? ''}`}
                  style={{ flex: 1, padding: '10px 12px', fontSize: '13px', color: INK, background: 'rgba(23,25,26,0.04)', border: `1px solid rgba(23,25,26,0.14)`, outline: 'none' }}
                />
                <button
                  onClick={sendMessage}
                  disabled={!msgText.trim() || sendingMsg}
                  style={{ ...mono(10), padding: '10px 18px', background: msgText.trim() ? INK : 'rgba(23,25,26,0.08)', color: msgText.trim() ? PAPER : MUTED, border: 'none', cursor: msgText.trim() ? 'pointer' : 'default' }}
                >
                  Send
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ── Job Post Form ──────────────────────────────────────────────────────────────

type JobFormState = ReturnType<typeof emptyJobForm>;

const JobPostForm: React.FC<{
  form: JobFormState;
  onChange: (patch: Partial<JobFormState>) => void;
  onSubmit: () => void;
  onCancel: () => void;
  saving: boolean;
  isEditing?: boolean;
}> = ({ form, onChange, onSubmit, onCancel, saving, isEditing = false }) => {
  const field = (label: string, content: React.ReactNode) => (
    <div>
      <label style={{ ...mono(), color: MUTED, display: 'block', marginBottom: '5px' }}>{label}</label>
      {content}
    </div>
  );
  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '9px 12px', fontSize: '13px', color: INK,
    background: 'rgba(23,25,26,0.04)', border: `1px solid rgba(23,25,26,0.14)`,
    outline: 'none', boxSizing: 'border-box',
  };
  const valid = form.title.trim() && form.date && form.location.trim() && form.genre;

  return (
    <div style={{ border: `1px solid rgba(23,25,26,0.14)`, background: PAPER, padding: '24px', marginBottom: '24px' }}>
      <p style={{ ...mono(10), color: INK, fontWeight: 700, marginBottom: '20px' }}>{isEditing ? 'Edit Job Posting' : 'New Job Posting'}</p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
        {field('Job Title *', <input value={form.title} onChange={e => onChange({ title: e.target.value })} placeholder="e.g. Fashion Editorial — SoHo" style={inputStyle} />)}
        {field('Client Name', <input value={form.clientName} onChange={e => onChange({ clientName: e.target.value })} placeholder="e.g. Vogue" style={inputStyle} />)}
        {field('Date *', <input type="date" value={form.date} onChange={e => onChange({ date: e.target.value })} style={inputStyle} />)}
        {field('Location *', <input value={form.location} onChange={e => onChange({ location: e.target.value })} placeholder="e.g. SoHo, New York" style={inputStyle} />)}
        {field('Genre *', (
          <select value={form.genre} onChange={e => onChange({ genre: e.target.value as Genre })} style={inputStyle}>
            <option value="">Select genre</option>
            {GENRES.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
        ))}
        {field('Photographers Needed', (
          <input type="number" min={1} max={20} value={form.photographersNeeded} onChange={e => onChange({ photographersNeeded: Number(e.target.value) })} style={inputStyle} />
        ))}
        {field('Response Deadline', <input type="date" value={form.responseDeadline} onChange={e => onChange({ responseDeadline: e.target.value })} style={inputStyle} />)}
        {field('Shooting Hours', <input type="number" min={0} step={0.5} value={form.shootingHours} onChange={e => onChange({ shootingHours: e.target.value })} placeholder="e.g. 6" style={inputStyle} />)}
        {field('Editing Hours', <input type="number" min={0} step={0.5} value={form.editingHours} onChange={e => onChange({ editingHours: e.target.value })} placeholder="e.g. 4" style={inputStyle} />)}
      </div>

      {field('Brief / Description', (
        <textarea
          value={form.brief}
          onChange={e => onChange({ brief: e.target.value })}
          placeholder="Describe the job, style direction, deliverables, timeline..."
          rows={4}
          style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6 }}
        />
      ))}
      <div style={{ marginTop: '16px' }}>
        {field('Equipment / Technical Requirements', (
          <input value={form.equipmentNotes} onChange={e => onChange({ equipmentNotes: e.target.value })} placeholder="e.g. Full-frame preferred, 85mm, off-camera flash" style={inputStyle} />
        ))}
      </div>

      <div style={{ display: 'flex', gap: '10px', marginTop: '24px' }}>
        <button
          onClick={onSubmit}
          disabled={!valid || saving}
          style={{ ...mono(10), padding: '11px 24px', background: valid ? INK : 'rgba(23,25,26,0.10)', color: valid ? PAPER : MUTED, border: 'none', cursor: valid ? 'pointer' : 'not-allowed' }}
        >
          {saving ? (isEditing ? 'Saving…' : 'Posting…') : (isEditing ? 'Save Changes' : 'Post Job')}
        </button>
        <button onClick={onCancel} style={{ ...mono(10), padding: '11px 18px', background: 'none', border: `1px solid rgba(23,25,26,0.18)`, color: MUTED, cursor: 'pointer' }}>
          Cancel
        </button>
      </div>
    </div>
  );
};

// ── Job Card ───────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<StudioJob['status'], string> = {
  open: TEAL, filled: GOLD, cancelled: 'rgba(23,25,26,0.35)',
};

const JobCard: React.FC<{
  job: StudioJob;
  isAdmin: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  responses: StudioJobResponse[];
  myResponse: StudioJobResponse | undefined;
  uid: string;
  onRespond: (av: 'available' | 'unavailable') => void;
  onAssign: (uid: string) => void;
  onUnassign: (uid: string) => void;
  onSetStatus: (s: StudioJob['status']) => void;
  onDelete: () => void;
  onEdit: () => void;
}> = ({ job, isAdmin, isExpanded, onToggle, responses, myResponse, uid, onRespond, onAssign, onUnassign, onSetStatus, onDelete, onEdit }) => {
  const available   = responses.filter(r => r.availability === 'available');
  const isAssigned  = job.assignedUserIds.includes(uid);

  return (
    <div style={{ border: `1px solid rgba(23,25,26,0.12)`, background: PAPER }}>
      <button
        onClick={onToggle}
        style={{ display: 'flex', width: '100%', textAlign: 'left', alignItems: 'flex-start', gap: '14px', padding: '16px', background: 'none', border: 'none', cursor: 'pointer' }}
      >
        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: STATUS_COLORS[job.status], flexShrink: 0, marginTop: '4px' }} />

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '6px' }}>
            <span style={{ fontSize: '15px', fontWeight: 600, color: INK }}>{job.title}</span>
            <span style={pill(STATUS_COLORS[job.status])}>{job.status}</span>
            {isAssigned && <span style={pill(GOLD)}>Assigned to you</span>}
          </div>
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
            <span style={{ ...mono(9), color: MUTED }}>📅 {job.date}</span>
            <span style={{ ...mono(9), color: MUTED }}>📍 {job.location}</span>
            <span style={{ ...mono(9), color: MUTED }}>{job.genre}</span>
            {(job.shootingHours != null || job.editingHours != null) && (
              <span style={{ ...mono(9), color: MUTED }}>
                {[
                  job.shootingHours != null && `${job.shootingHours}h shoot`,
                  job.editingHours  != null && `${job.editingHours}h edit`,
                ].filter(Boolean).join(' + ')}
              </span>
            )}
            <span style={{ ...mono(9), color: MUTED }}>{job.photographersNeeded} photographer{job.photographersNeeded !== 1 ? 's' : ''} needed</span>
            {available.length > 0 && <span style={{ ...mono(9), color: TEAL }}>{available.length} available</span>}
          </div>
        </div>

        <span style={{ ...mono(9), color: MUTED, flexShrink: 0 }}>{isExpanded ? '▲' : '▼'}</span>
      </button>

      {isExpanded && (
        <div style={{ borderTop: `1px solid ${RULE}`, padding: '16px' }}>
          {job.clientName && (
            <p style={{ ...mono(9), color: MUTED, marginBottom: '8px' }}>Client: <span style={{ color: INK }}>{job.clientName}</span></p>
          )}
          {job.brief && (
            <p style={{ fontSize: '13px', color: 'rgba(23,25,26,0.75)', lineHeight: 1.65, marginBottom: '12px', borderLeft: `2px solid rgba(23,25,26,0.12)`, paddingLeft: '12px' }}>
              {job.brief}
            </p>
          )}
          {/* Hours breakdown */}
          {(job.shootingHours != null || job.editingHours != null) && (
            <div style={{ background: 'rgba(201,162,39,0.06)', border: `1px solid ${GOLD}30`, padding: '14px 16px', marginBottom: '16px' }}>
              <p style={{ ...mono(8), color: GOLD, fontWeight: 700, marginBottom: '10px' }}>Billable Hours</p>
              <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
                {job.shootingHours != null && (
                  <div>
                    <p style={{ ...mono(8), color: MUTED, marginBottom: '3px' }}>Shooting</p>
                    <p style={{ fontSize: '15px', fontWeight: 700, color: INK, margin: 0 }}>{job.shootingHours}h</p>
                  </div>
                )}
                {job.editingHours != null && (
                  <div>
                    <p style={{ ...mono(8), color: MUTED, marginBottom: '3px' }}>Editing</p>
                    <p style={{ fontSize: '15px', fontWeight: 700, color: INK, margin: 0 }}>{job.editingHours}h</p>
                  </div>
                )}
                <div>
                  <p style={{ ...mono(8), color: MUTED, marginBottom: '3px' }}>Total</p>
                  <p style={{ fontSize: '15px', fontWeight: 700, color: GOLD, margin: 0 }}>
                    {(job.shootingHours ?? 0) + (job.editingHours ?? 0)}h
                  </p>
                </div>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', marginBottom: '16px' }}>
            {job.equipmentNotes && (
              <div>
                <p style={{ ...mono(8), color: MUTED, marginBottom: '3px' }}>Equipment</p>
                <p style={{ fontSize: '12px', color: INK, margin: 0 }}>{job.equipmentNotes}</p>
              </div>
            )}
            {job.responseDeadline && (
              <div>
                <p style={{ ...mono(8), color: MUTED, marginBottom: '3px' }}>Response Deadline</p>
                <p style={{ fontSize: '12px', color: INK, margin: 0 }}>{job.responseDeadline}</p>
              </div>
            )}
          </div>

          {responses.length > 0 && (
            <div style={{ marginBottom: '16px' }}>
              <p style={{ ...mono(8), color: MUTED, marginBottom: '10px' }}>Availability ({responses.length})</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {responses.map(r => (
                  <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', background: 'rgba(23,25,26,0.03)', border: `1px solid ${RULE}` }}>
                    <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: r.availability === 'available' ? TEAL : 'rgba(23,25,26,0.25)', flexShrink: 0 }} />
                    <span style={{ fontSize: '13px', color: INK, flex: 1 }}>{r.userDisplayName}</span>
                    <span style={{ ...mono(8), color: r.availability === 'available' ? TEAL : MUTED }}>
                      {r.availability}
                    </span>
                    {isAdmin && r.availability === 'available' && (
                      job.assignedUserIds.includes(r.userId) ? (
                        <button onClick={() => onUnassign(r.userId)} style={{ ...mono(8), padding: '4px 10px', background: 'rgba(23,25,26,0.08)', border: 'none', color: MUTED, cursor: 'pointer' }}>
                          Unassign
                        </button>
                      ) : (
                        <button onClick={() => onAssign(r.userId)} style={{ ...mono(8), padding: '4px 10px', background: INK, color: PAPER, border: 'none', cursor: 'pointer' }}>
                          Assign
                        </button>
                      )
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {!isAdmin && job.status === 'open' && (
            <div style={{ display: 'flex', gap: '10px', marginBottom: '14px' }}>
              <button
                onClick={() => onRespond('available')}
                style={{
                  ...mono(9), padding: '8px 18px', cursor: 'pointer', border: `1px solid ${TEAL}`,
                  background: myResponse?.availability === 'available' ? TEAL : 'none',
                  color: myResponse?.availability === 'available' ? PAPER : TEAL,
                }}
              >
                {myResponse?.availability === 'available' ? '✓ Available' : "I'm Available"}
              </button>
              <button
                onClick={() => onRespond('unavailable')}
                style={{
                  ...mono(9), padding: '8px 18px', cursor: 'pointer',
                  border: `1px solid rgba(23,25,26,0.18)`,
                  background: myResponse?.availability === 'unavailable' ? 'rgba(23,25,26,0.08)' : 'none',
                  color: myResponse?.availability === 'unavailable' ? INK : MUTED,
                }}
              >
                Not Available
              </button>
            </div>
          )}

          {isAdmin && (
            <div style={{ display: 'flex', gap: '10px', paddingTop: '12px', borderTop: `1px solid ${RULE}`, flexWrap: 'wrap' }}>
              <button onClick={onEdit} style={{ ...mono(8), padding: '6px 14px', background: 'none', border: `1px solid rgba(23,25,26,0.20)`, color: INK, cursor: 'pointer' }}>
                Edit
              </button>
              {job.status !== 'filled' && (
                <button onClick={() => onSetStatus('filled')} style={{ ...mono(8), padding: '6px 14px', background: 'none', border: `1px solid rgba(23,25,26,0.20)`, color: MUTED, cursor: 'pointer' }}>
                  Mark Filled
                </button>
              )}
              {job.status === 'filled' && (
                <button onClick={() => onSetStatus('open')} style={{ ...mono(8), padding: '6px 14px', background: 'none', border: `1px solid rgba(23,25,26,0.20)`, color: MUTED, cursor: 'pointer' }}>
                  Reopen
                </button>
              )}
              {job.status !== 'cancelled' && (
                <button onClick={() => onSetStatus('cancelled')} style={{ ...mono(8), padding: '6px 14px', background: 'none', border: `1px solid rgba(23,25,26,0.20)`, color: MUTED, cursor: 'pointer' }}>
                  Cancel Job
                </button>
              )}
              <button onClick={onDelete} style={{ ...mono(8), padding: '6px 14px', background: 'none', border: 'none', color: 'rgba(23,25,26,0.30)', cursor: 'pointer', marginLeft: 'auto' }}>
                Delete
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ── Message Item ───────────────────────────────────────────────────────────────

const MessageItem: React.FC<{
  msg: ChannelMessage;
  uid: string;
  onReact: (emoji: string) => void;
}> = ({ msg, uid, onReact }) => (
  <div>
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
      <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: INK, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <span style={{ ...mono(8), color: PAPER, fontWeight: 600 }}>{initials(msg.userDisplayName)}</span>
      </div>
      <span style={{ fontSize: '13px', fontWeight: 600, color: INK }}>{msg.userDisplayName}</span>
      <span style={{ ...mono(8), color: MUTED }}>{relTime(msg.createdAt)}</span>
    </div>
    <p style={{ fontSize: '13px', color: 'rgba(23,25,26,0.80)', lineHeight: 1.6, margin: '0 0 6px', paddingLeft: '38px' }}>
      {msg.text}
    </p>
    <div style={{ display: 'flex', gap: '5px', paddingLeft: '38px', flexWrap: 'wrap' }}>
      {REACTION_EMOJIS.map(emoji => {
        const users  = msg.reactions[emoji] ?? [];
        const active = users.includes(uid);
        return (
          <button
            key={emoji}
            onClick={() => onReact(emoji)}
            style={{
              fontSize: '12px',
              background: active ? `rgba(201,162,39,0.12)` : 'rgba(23,25,26,0.04)',
              border: active ? `1px solid ${GOLD}50` : `1px solid rgba(23,25,26,0.10)`,
              borderRadius: '4px', cursor: 'pointer', padding: '2px 6px',
              display: 'flex', alignItems: 'center', gap: '3px',
            }}
          >
            {emoji}
            {users.length > 0 && (
              <span style={{ ...mono(8), color: active ? GOLD : MUTED }}>{users.length}</span>
            )}
          </button>
        );
      })}
    </div>
  </div>
);

export default CoworkingView;
