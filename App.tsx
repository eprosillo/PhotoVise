import React, { useState, useEffect, useMemo, useRef } from 'react';
import Layout from './components/Layout';
import CalendarView from './components/CalendarView';
import LocationScoutView from './components/LocationScoutView';
import ErrorBoundary from './components/ErrorBoundary';
import SessionCard from './components/SessionCard';
import SessionSelector from './components/SessionSelector';
import LocationAutocomplete from './components/LocationAutocomplete';
import { Session, SessionStatus, SessionType, Genre, GearItem, GearCategory, CfeBulletinItem, CfeType, BulletinStatus, BulletinRegion, BulletinPriority, PhotoQuote, PhotographerProfile, EditingApp, TetheringApp, FeedbackEntry, AssignmentTimeframe, WeekPlan, ScoutLocation, Submission, SkillNodeProgress, SkillNodeType } from './types';
import TodayView from './components/TodayView';
import SkillTreeView from './components/SkillTreeView';
import MissionHistoryView from './components/MissionHistoryView';
import { getEncouragement } from './data/missions';
import { generateWeeklyPlan, generateAssignmentGuide, askProQuestion, fetchBulletinEvents } from './services/geminiService';
import { createCalendarEventForSession } from './services/calendarService';
import { GENRE_ICONS } from './constants';
import { PHOTO_QUOTES } from './quotes';
import { useAuth } from './AuthContext';
import LoginScreen from './LoginScreen';
import { useFirestore } from './hooks/useFirestore';
import { toast } from './utils/toast';
import { storage } from './firebase';
import { ref as storageRef, uploadString, getDownloadURL, deleteObject } from 'firebase/storage';

// Helper to determine which genres are currently active for the guidance system


function FeedbackFlag(props: {
  section: FeedbackEntry['section'];
  onSubmit: (note: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [note, setNote] = useState('');

  const handleSend = () => {
    if (!note.trim()) return;
    props.onSubmit(note.trim());
    setNote('');
    setIsOpen(false);
  };

  return (
    <div className="mt-2 space-y-1">
      {!isOpen ? (
        <button
          type="button"
          className="text-xs text-brand-gray font-medium underline underline-offset-4 decoration-brand-rose/30 hover:text-brand-rose transition-colors"
          onClick={() => setIsOpen(true)}
        >
          This missed the mark
        </button>
      ) : (
        <div className="space-y-2 bg-brand-white p-3 border border-brand-black/5 rounded-lg animate-in fade-in slide-in-from-top-1 duration-200">
          <textarea
            className="w-full resize-none rounded-md border border-brand-black/10 bg-white p-2 text-xs outline-none focus:ring-1 focus:ring-brand-blue"
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What didn’t feel right about this advice?"
          />
          <div className="flex gap-4">
            <button
              type="button"
              className="text-xs font-medium text-brand-gray hover:text-brand-black transition-colors"
              onClick={() => {
                setIsOpen(false);
                setNote('');
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              className="text-xs font-medium text-brand-rose hover:text-brand-black transition-colors"
              onClick={handleSend}
            >
              Submit
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const AskProPage: React.FC<{
  profile: PhotographerProfile;
  assignmentGenre: Genre | 'All';
  assignmentTimeframe: AssignmentTimeframe;
  assignmentInput: string;
  askProInput: string;
  setAskProInput: (v: string) => void;
  askProAnswer: string;
  isGeneratingAskPro: boolean;
  onAskProSubmit: () => void;
  onReset: () => void;
  isFieldMode?: boolean;
  onFeedback: (note: string) => void;
  activeTab: string;
}> = (props) => {
  const [showFullAskProAnswer, setShowFullAskProAnswer] = useState(false);
  const askProInputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (props.isFieldMode && props.activeTab === 'askpro') {
      askProInputRef.current?.focus();
      askProInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [props.isFieldMode, props.activeTab]);

  const containerClass = props.isFieldMode
    ? 'flex flex-col gap-4'
    : 'grid grid-cols-1 lg:grid-cols-2 gap-10';

  const askButtonClass = props.isFieldMode ? 'w-full py-4 text-sm' : 'px-10 py-4 text-sm';

  const maxChars = 800;
  const isLong = props.askProAnswer.length > maxChars;
  const visibleAnswer = props.isFieldMode && isLong && !showFullAskProAnswer
    ? props.askProAnswer.slice(0, maxChars) + '…'
    : props.askProAnswer;

  const askProPlaceholder = props.isFieldMode
    ? 'Ask what you’re stuck on right now…'
    : 'Ask about shooting, culling, processing, clients, or your current assignment…';

  const disabled = props.isGeneratingAskPro || !props.askProInput.trim();

  return (
    <div className="animate-in fade-in duration-700">
      {/* Screen header */}
      <div style={{ borderBottom: '1px solid rgba(23,25,26,0.14)', paddingBottom: '18px', marginBottom: '22px' }} className="flex items-end justify-between gap-6">
        <div>
          <p className="font-mono text-[9px] tracking-[0.24em] text-brand-ink/40 uppercase mb-[9px]">Grow / Guidance</p>
          <h1 className="font-sans font-semibold text-[42px] leading-none tracking-[-0.02em] text-brand-ink">Ask a Pro</h1>
        </div>
      </div>

      <div className={containerClass}>
        {/* Composer panel */}
        <div style={{ background: '#f8f7f4', border: '1px solid rgba(23,25,26,0.14)', padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <p className="font-mono text-[9px] tracking-[0.22em] uppercase" style={{ color: 'rgba(23,25,26,0.40)' }}>Your Question</p>
          <textarea
            ref={askProInputRef}
            style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', fontSize: '13px', color: '#17191a', background: 'rgba(23,25,26,0.04)', border: '1px solid rgba(23,25,26,0.14)', outline: 'none', minHeight: '180px', resize: 'none', fontFamily: 'inherit', lineHeight: 1.6 }}
            value={props.askProInput}
            onChange={(e) => props.setAskProInput(e.target.value)}
            placeholder={askProPlaceholder}
          />
          <div className="flex justify-end">
            <button
              onClick={props.onAskProSubmit}
              disabled={disabled}
              className="font-mono text-[9px] tracking-[0.20em] uppercase transition-colors"
              style={{
                padding: '10px 22px',
                background: disabled ? 'rgba(23,25,26,0.08)' : '#17191a',
                border: disabled ? '1px solid rgba(23,25,26,0.14)' : '1px solid #17191a',
                color: disabled ? 'rgba(23,25,26,0.30)' : '#f4f3ef',
                cursor: disabled ? 'not-allowed' : 'pointer',
              }}
              onMouseEnter={e => { if (!disabled) { e.currentTarget.style.background = '#c9a227'; e.currentTarget.style.borderColor = '#c9a227'; e.currentTarget.style.color = '#17191a'; } }}
              onMouseLeave={e => { if (!disabled) { e.currentTarget.style.background = '#17191a'; e.currentTarget.style.borderColor = '#17191a'; e.currentTarget.style.color = '#f4f3ef'; } }}
            >
              {props.isGeneratingAskPro ? 'Consulting…' : 'Ask the Pro'}
            </button>
          </div>
        </div>

        {/* Response panel */}
        <div style={{ background: '#f8f7f4', border: '1px solid rgba(23,25,26,0.14)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(23,25,26,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <p className="font-mono text-[9px] tracking-[0.22em] uppercase" style={{ color: 'rgba(23,25,26,0.40)' }}>Response</p>
            {props.askProAnswer && (
              <button
                onClick={props.onReset}
                className="font-mono text-[8px] tracking-[0.14em] uppercase transition-colors"
                style={{ color: 'rgba(23,25,26,0.40)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                onMouseEnter={e => (e.currentTarget.style.color = '#17191a')}
                onMouseLeave={e => (e.currentTarget.style.color = 'rgba(23,25,26,0.40)')}
              >
                × Reset
              </button>
            )}
          </div>
          <div style={{ padding: '16px 20px', flex: 1, overflowY: 'auto', minHeight: '280px' }}>
            {props.askProAnswer ? (
              <div>
                {/* Brass border-left thread style */}
                <div style={{ borderLeft: '2px solid #c9a227', paddingLeft: '14px', marginBottom: '12px' }}>
                  <p style={{ fontSize: '13px', lineHeight: 1.7, color: '#17191a', whiteSpace: 'pre-wrap' }}>{visibleAnswer}</p>
                </div>
                {props.isFieldMode && isLong && (
                  <button
                    type="button"
                    className="font-mono text-[8px] tracking-[0.14em] uppercase transition-colors mt-2"
                    style={{ color: '#c9a227', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                    onClick={() => setShowFullAskProAnswer(v => !v)}
                  >
                    {showFullAskProAnswer ? 'Show less' : 'Show full answer'}
                  </button>
                )}
                <FeedbackFlag section="Ask a Pro" onSubmit={props.onFeedback} />
              </div>
            ) : (
              <div className="flex items-center justify-center" style={{ minHeight: '200px' }}>
                <p className="font-mono text-[9px] tracking-[0.18em] uppercase" style={{ color: 'rgba(23,25,26,0.28)' }}>
                  {props.isGeneratingAskPro ? 'Consulting…' : 'Your answer will appear here'}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

interface BulletinCardProps {
  item: CfeBulletinItem & { status: BulletinStatus };
  updateBulletinStatus: (id: string, status: BulletinStatus) => void;
  onRemove?: (id: string) => void;
}

const BulletinCard: React.FC<BulletinCardProps> = ({ item, updateBulletinStatus, onRemove }) => {
  const isArchived = item.status === 'archived';
  
  const statusConfig: Record<BulletinStatus, { label: string; color: string }> = {
    unmarked: { label: 'UNMARKED', color: 'bg-brand-gray/5 text-brand-gray' },
    considering: { label: 'CONSIDERING', color: 'bg-amber-100 text-amber-700' },
    applied: { label: 'APPLIED', color: 'bg-emerald-100 text-emerald-700' },
    archived: { label: 'ARCHIVED', color: 'bg-zinc-800 text-zinc-300' }
  };

  const priorityConfig: Record<BulletinPriority, { color: string }> = {
    high: { color: 'text-brand-rose' },
    medium: { color: 'text-brand-blue' },
    low: { color: 'text-brand-gray/40' }
  };

  const statusColor: Record<BulletinStatus, string> = {
    unmarked:    'rgba(23,25,26,0.35)',
    considering: '#c9a227',
    applied:     '#4b6b52',
    archived:    'rgba(23,25,26,0.25)',
  };

  return (
    <div style={{ background: '#f8f7f4', border: '1px solid rgba(23,25,26,0.14)', display: 'flex', flexDirection: 'column', opacity: isArchived ? 0.6 : 1 }}>
      {/* Header strip */}
      <div style={{ borderBottom: '1px solid rgba(23,25,26,0.12)', padding: '14px 16px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="font-mono text-[8px] tracking-[0.14em] uppercase" style={{ color: 'rgba(23,25,26,0.45)', border: '1px solid rgba(23,25,26,0.16)', padding: '2px 6px' }}>{item.type}</span>
            <span className="font-mono text-[8px] tracking-[0.12em] uppercase" style={{ color: statusColor[item.status] }}>{item.status}</span>
          </div>
          <p style={{ fontSize: '14px', fontWeight: 500, color: '#17191a', lineHeight: 1.3 }}>{item.name}</p>
          {item.organizer && <p className="font-mono text-[8px] tracking-[0.10em] uppercase mt-1" style={{ color: 'rgba(23,25,26,0.42)' }}>{item.organizer}</p>}
        </div>
        <div className="flex gap-1 shrink-0">
          {!isArchived ? (
            <button onClick={() => updateBulletinStatus(item.id, 'archived')} style={{ padding: '4px 8px', border: '1px solid rgba(23,25,26,0.16)', background: 'transparent', cursor: 'pointer', color: 'rgba(23,25,26,0.40)', fontSize: '10px' }} title="Archive">▾</button>
          ) : (
            <button onClick={() => updateBulletinStatus(item.id, 'unmarked')} style={{ padding: '4px 8px', border: '1px solid rgba(23,25,26,0.16)', background: 'transparent', cursor: 'pointer', color: 'rgba(23,25,26,0.40)', fontSize: '10px' }} title="Restore">↑</button>
          )}
          {onRemove && (
            <button onClick={() => onRemove(item.id)} style={{ padding: '4px 8px', border: '1px solid rgba(23,25,26,0.16)', background: 'transparent', cursor: 'pointer', color: 'rgba(23,25,26,0.40)', fontSize: '10px' }} title="Remove">×</button>
          )}
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '10px', flex: 1 }}>
        {/* Data rows */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div className="flex items-baseline justify-between" style={{ borderBottom: '1px solid rgba(23,25,26,0.08)', paddingBottom: '5px' }}>
            <span className="font-mono text-[8px] tracking-[0.16em] uppercase" style={{ color: 'rgba(23,25,26,0.38)' }}>Deadline</span>
            <span style={{ fontSize: '11px', color: item.deadline === 'Rolling' ? '#4a6b7c' : '#c9a227' }}>{item.deadline || 'TBA'}</span>
          </div>
          <div className="flex items-baseline justify-between" style={{ borderBottom: '1px solid rgba(23,25,26,0.08)', paddingBottom: '5px' }}>
            <span className="font-mono text-[8px] tracking-[0.16em] uppercase" style={{ color: 'rgba(23,25,26,0.38)' }}>Region</span>
            <span style={{ fontSize: '11px', color: 'rgba(23,25,26,0.65)' }}>{item.region}{item.location ? ` · ${item.location}` : ''}</span>
          </div>
          <div className="flex items-baseline justify-between" style={{ borderBottom: '1px solid rgba(23,25,26,0.08)', paddingBottom: '5px' }}>
            <span className="font-mono text-[8px] tracking-[0.16em] uppercase" style={{ color: 'rgba(23,25,26,0.38)' }}>Fee</span>
            <span style={{ fontSize: '11px', color: 'rgba(23,25,26,0.65)' }}>{item.fee || 'Free'}</span>
          </div>
        </div>

        {item.genres && item.genres.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
            {item.genres.map(g => (
              <span key={g} className="font-mono text-[8px] tracking-[0.12em] uppercase" style={{ padding: '3px 6px', border: '1px solid rgba(23,25,26,0.16)', color: 'rgba(23,25,26,0.50)' }}>{g}</span>
            ))}
          </div>
        )}

        {item.blurb && (
          <p style={{ fontSize: '12px', lineHeight: 1.6, color: 'rgba(23,25,26,0.60)', fontStyle: 'italic', flex: 1 }}>{item.blurb}</p>
        )}

        {/* Actions */}
        <div style={{ borderTop: '1px solid rgba(23,25,26,0.10)', paddingTop: '10px', display: 'flex', flexDirection: 'column', gap: '6px', marginTop: 'auto' }}>
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-[8px] tracking-[0.18em] uppercase text-center transition-colors"
            style={{ padding: '9px 0', background: '#17191a', color: '#f4f3ef', textDecoration: 'none', display: 'block' }}
            onMouseEnter={e => { e.currentTarget.style.background = '#c9a227'; e.currentTarget.style.color = '#17191a'; }}
            onMouseLeave={e => { e.currentTarget.style.background = '#17191a'; e.currentTarget.style.color = '#f4f3ef'; }}
          >
            View Details ↗
          </a>
          {!isArchived && (
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                onClick={() => updateBulletinStatus(item.id, 'considering')}
                className="font-mono text-[8px] tracking-[0.14em] uppercase flex-1 transition-colors"
                style={{
                  padding: '7px 0', cursor: 'pointer',
                  border: item.status === 'considering' ? '1px solid #c9a227' : '1px solid rgba(23,25,26,0.18)',
                  background: item.status === 'considering' ? 'rgba(201,162,39,0.08)' : 'transparent',
                  color: item.status === 'considering' ? '#8a6b0f' : 'rgba(23,25,26,0.50)',
                }}
              >Considering</button>
              <button
                onClick={() => updateBulletinStatus(item.id, 'applied')}
                className="font-mono text-[8px] tracking-[0.14em] uppercase flex-1 transition-colors"
                style={{
                  padding: '7px 0', cursor: 'pointer',
                  border: item.status === 'applied' ? '1px solid #4b6b52' : '1px solid rgba(23,25,26,0.18)',
                  background: item.status === 'applied' ? 'rgba(75,107,82,0.08)' : 'transparent',
                  color: item.status === 'applied' ? '#3d5a44' : 'rgba(23,25,26,0.50)',
                }}
              >Applied</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

function SystemStatusApps({ profile }: { profile: PhotographerProfile }) {
  const { editingApps, tetheringApps } = profile;

  const allApps = [...(editingApps || []), ...(tetheringApps || [])].filter(
    (app) => app !== 'None' && app !== 'Other'
  );

  if (!allApps.length) {
    return (
      <span className="text-xs text-white/40">
        No apps selected yet
      </span>
    );
  }

  const seen = new Set<string>();
  const unique = allApps.filter((app) => {
    if (seen.has(app)) return false;
    seen.add(app);
    return true;
  });

  return (
    <div className="flex flex-wrap gap-x-4 gap-y-2">
      {unique.map((app) => (
        <span key={app} className="inline-flex items-center gap-1.5 text-xs text-white/50">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]" aria-hidden="true" />
          <span>{app}</span>
        </span>
      ))}
    </div>
  );
}

const genreOptions: Genre[] = [
  'Street', 'Sports', 'Photojournalism', 'Portrait', 'Wedding', 'Event',
  'Landscape', 'Architecture', 'Documentary', 'Commercial', 'Editorial',
  'Fashion', 'Product', 'Food', 'Still Life', 'Wildlife', 'Macro', 'Astro',
  'Travel', 'Other'
];

function buildAskProPrompt(args: {
  profile: PhotographerProfile;
  assignmentGenre: Genre | 'All';
  assignmentTimeframe: AssignmentTimeframe;
  assignmentInput: string;
  question: string;
}): string {
  const { profile, assignmentGenre, assignmentInput, question } = args;

  const effectiveGenre =
    assignmentGenre !== 'All'
      ? assignmentGenre
      : (profile.primaryGenres && profile.primaryGenres.length > 0 ? profile.primaryGenres[0] : 'Other');

  const genresLine =
    profile.primaryGenres && profile.primaryGenres.length
      ? profile.primaryGenres.join(', ')
      : 'Not specified';

  const pieces: string[] = [];

  pieces.push(
    `PROFILE GENRES: ${genresLine}`,
    `FOCUS GENRE FOR THIS QUESTION: ${effectiveGenre}`,
  );

  if (assignmentInput.trim()) {
    pieces.push('ASSIGNMENT DETAILS:\n' + assignmentInput.trim());
  }

  pieces.push('PHOTOGRAPHER QUESTION:\n' + question.trim());

  pieces.push(
    [
      'INSTRUCTIONS FOR THE ASSISTANT:',
      '- You are answering in an “Ask a Pro” Q&A section, NOT running an assignment planner.',
      '- Ignore any previous instructions or formats about multi-step plans, headings, or bullet-point frameworks.',
      '- Answer as a seasoned professional photographer with hands-on experience across ALL of the user\'s profile genres (' + genresLine + '), not just the focus genre.',
      '- Use a relaxed, conversational tone — like you are talking to a friend or mentee. It should read like a normal human / AI chat reply.',
      '- Write in the first person (“I” / “you”), avoid formal or academic language.',
      '- Do NOT structure the answer as a numbered plan, checklist, or with section headers (no “Step 1/Step 2”, no “Overview/Plan/Deliverables” etc.).',
      '- Instead, write 3–8 short paragraphs of flowing text. Use bullets only if they genuinely make something clearer, not as a default.',
      '- You can cover shooting approach, culling decisions, processing choices, and client/editor communication if relevant, but keep the flow conversational.',
    ].join('\n')
  );

  return pieces.join('\n\n');
}

// ── Location Scout seed data ──────────────────────────────────────────────────
// Shown on first open when the user has no saved locations.
const SCOUT_SEED_LOCATIONS: ScoutLocation[] = [
  {
    id: 'seed_scout_1',
    name: 'City Hall Plaza',
    area: 'Downtown Civic Center',
    mapLink: 'City Hall, 1 Dr Carlton B Goodlett Pl',
    tags: ['Architecture', 'Composition', 'Blue Hour'],
    bestTime: 'Blue Hour',
    lightingNotes: 'Facade gets golden side-light at late afternoon. After sunset the building lights up nicely against a deep-blue sky.',
    accessNotes: 'Public plaza — no permit needed for student work. Security may ask about commercial shoots.',
    safetyNotes: 'Well-lit and busy in the evening. Avoid leaving gear unattended.',
    parkingNotes: 'Civic Center BART is 2 blocks away. Metered street parking on McAllister St.',
    shotIdeas: 'Wide symmetrical facade shot, tight detail on the dome columns, reflection puddles on the plaza after rain.',
    backupSpot: 'SF City Library steps, directly across the plaza',
    favorite: true,
    createdAt: Date.now() - 7 * 24 * 60 * 60 * 1000,
  },
  {
    id: 'seed_scout_2',
    name: 'Riverside Esplanade',
    area: 'Embarcadero Waterfront',
    mapLink: 'Embarcadero, between Ferry Building and Bay Bridge',
    tags: ['Landscape', 'Golden Hour', 'Composition'],
    bestTime: 'Golden Hour',
    lightingNotes: 'Sun sets behind the Bay Bridge — creates strong backlight and silhouettes. East light in the morning is softer for detail work.',
    accessNotes: 'Public space, always open.',
    safetyNotes: 'Busy with joggers and tourists, very safe.',
    parkingNotes: 'Limited metered parking on the Embarcadero. BART Embarcadero station is a 5-min walk.',
    shotIdeas: 'Silhouette of bridge at golden hour, pier leading lines, Ferry Building clock tower with warm light.',
    backupSpot: 'Rincon Park (Bay Bridge anchor)',
    favorite: false,
    createdAt: Date.now() - 3 * 24 * 60 * 60 * 1000,
  },
  {
    id: 'seed_scout_3',
    name: 'Mission District Alley Murals',
    area: 'Mission District — 24th St corridor',
    mapLink: 'Clarion Alley, between 17th and 18th St, Mission District',
    tags: ['Street', 'People', 'Photojournalism', 'Abstraction'],
    bestTime: 'Morning',
    lightingNotes: 'Alley runs east–west — shaded most of the day which gives flat, even light. Direct sun hits briefly around 10–11 am in summer.',
    accessNotes: 'Public alley. Some murals are updated regularly — revisit often.',
    safetyNotes: 'Generally safe during daylight. Go with a partner if shooting late.',
    parkingNotes: 'Street parking on Valencia or Mission St. BART 24th St station is 4 blocks.',
    shotIdeas: 'Full-wall murals as backdrop for environmental portraits, abstract color compression, candid street life at the mouth of the alley.',
    backupSpot: 'Balmy Alley, 2 blocks south (also has murals)',
    favorite: false,
    createdAt: Date.now() - 1 * 24 * 60 * 60 * 1000,
  },
];

function loadFromStorage<T>(key: string, fallback: T): T {
  const saved = localStorage.getItem(key);
  if (saved) {
    try {
      return JSON.parse(saved) as T;
    } catch (e) {
      console.error(`Photovise: Failed to parse "${key}" from localStorage`, e);
    }
  }
  return fallback;
}

const App: React.FC = () => {
  // ── Auth ────────────────────────────────────────────────────────────────────
  const { user, loading: authLoading, signOut } = useAuth();
  const { loadUserData, saveUserData } = useFirestore(user?.uid ?? null);

  // ── Local state ─────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState('today');
  const [isFieldMode, setIsFieldMode] = useState<boolean>(false);
  const [feedbackLog, setFeedbackLog] = useState<FeedbackEntry[]>(() =>
    loadFromStorage<FeedbackEntry[]>('pingstudio_feedback', [])
  );
  const editingAppsList: EditingApp[] = [
    'Lightroom Classic', 'Lightroom (Cloud)', 'Photoshop', 'Capture One Pro',
    'Affinity Photo', 'DxO PhotoLab', 'ON1 Photo RAW', 'Luminar Neo',
    'Apple Photos', 'Windows Photos', 'Other'
  ];

  const tetheringAppsList: TetheringApp[] = [
    'Capture One (Tethering)', 'Lightroom Classic (Tethering)', 'Canon EOS Utility',
    'Nikon Camera Control', 'CamRanger', 'Honcho', 'None', 'Other'
  ];

  // Ask a Pro State
  const [askProInput, setAskProInput] = useState<string>('');
  const [askProAnswer, setAskProAnswer] = useState<string>('');
  const [isGeneratingAskPro, setIsGeneratingAskPro] = useState<boolean>(false);

  // Filter States
  const [genreFilter, setGenreFilter] = useState<Genre | 'All'>('All');
  const [regionFilter, setRegionFilter] = useState<BulletinRegion | 'All'>('All');
  const [statusFilter, setStatusFilter] = useState<BulletinStatus | 'All'>('All');
  const [priorityFilter, setPriorityFilter] = useState<BulletinPriority | 'All'>('All');
  const [typeFilter, setTypeFilter] = useState<CfeType | 'All'>('All');
  const [highlightedSessionId, setHighlightedSessionId] = useState<string | null>(null);

  // Dashboard session filters
  const [dashboardGenreFilter, setDashboardGenreFilter] = useState<Genre | 'All'>('All');
  const [dashboardStatusFilter, setDashboardStatusFilter] = useState<SessionStatus | 'All'>('All');
  const [dashboardTypeFilter, setDashboardTypeFilter] = useState<SessionType | 'All'>('All');
  const [dashboardDateSort, setDashboardDateSort] = useState<'deadline' | 'newest' | 'oldest'>('deadline');

  // Persistence for sessions
  const [sessions, setSessions] = useState<Session[]>(() => {
    const saved = localStorage.getItem('pingstudio_sessions');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('Photovise: Failed to parse "pingstudio_sessions" from localStorage', e);
      }
    }
    return [
      {
        id: '1',
        name: '2024-03-20_Seattle_Architecture',
        date: '2024-03-20',
        location: 'Seattle Downtown',
        genre: ['Architecture', 'Street'],
        status: 'shot',
        notes: 'Focus on brutalist structures near public library.'
      },
      {
        id: '2',
        name: '2024-03-15_Rainier_Landscape',
        date: '2024-03-15',
        location: 'Mt. Rainier',
        genre: ['Landscape'],
        status: 'culled',
        notes: 'Sunrise hike for blue hour lake reflections.'
      }
    ];
  });

  // Gear Locker State
  const [gear, setGear] = useState<GearItem[]>(() =>
    loadFromStorage<GearItem[]>('pingstudio_gear', [
      {
        id: 'g1',
        name: 'Sony A7R V',
        category: 'Body',
        details: '61MP, stabilized, 8K video',
        tags: ['high-res', 'landscape'],
        available: true
      },
      {
        id: 'g2',
        name: 'FE 24-70mm f/2.8 GM II',
        category: 'Lens',
        details: 'Versatile zoom, sharp wide open',
        tags: ['general', 'street'],
        available: true
      }
    ])
  );

  // Photographer Profile State (Applied state)
  const [profile, setProfile] = useState<PhotographerProfile>(() => {
    const saved = localStorage.getItem('pingstudio_profile');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Migration: Map legacy ACCMe to Other
        if (parsed.primaryGenres) {
          parsed.primaryGenres = parsed.primaryGenres.map((g: string) => {
            if (g === 'ACCMe') {
              parsed.otherGenreNote = 'ACCMe';
              return 'Other';
            }
            return g;
          });
        }
        return parsed;
      } catch (e) {
        console.error('Photovise: Failed to parse "pingstudio_profile" from localStorage', e);
      }
    }
    return {
      name: '',
      yearsShooting: '',
      primaryGenres: [],
      typicalWork: '',
      styleKeywords: [],
      riskProfile: 'balanced',
      strengths: '',
      struggles: '',
      physicalConstraints: '',
      accessReality: '',
      timeBudget: '',
      growthGoals: '',
      editingApps: ['Lightroom Classic', 'Photoshop'],
      tetheringApps: ['None'],
    };
  });

  // Local editable draft state for Profile UI
  const [draftProfile, setDraftProfile] = useState<PhotographerProfile>(profile);
  // Separate local state to back the comma-separated text input
  const [styleKeywordsDraft, setStyleKeywordsDraft] = useState<string>(profile.styleKeywords.join(', '));
  const [profileSuccessMsg, setProfileSuccessMsg] = useState(false);

  // Sync draft if profile is updated externally (e.g. initial load)
  useEffect(() => {
    setDraftProfile(profile);
    setStyleKeywordsDraft(profile.styleKeywords.join(', '));
  }, [profile]);

  const handleApplyProfile = () => {
    const parsedKeywords = styleKeywordsDraft
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean);

    const nextProfile: PhotographerProfile = {
      ...draftProfile,
      styleKeywords: parsedKeywords,
    };

    setProfile(nextProfile);
    setProfileSuccessMsg(true);
    setTimeout(() => setProfileSuccessMsg(false), 3000);
  };

  const handleResetProfile = () => {
    setDraftProfile(profile);
    setStyleKeywordsDraft(profile.styleKeywords.join(', '));
  };

  const isProfileDirty = useMemo(() => {
    const keywordsArr = styleKeywordsDraft.split(',').map(k => k.trim()).filter(Boolean);
    const profileToCompare = { ...draftProfile, styleKeywords: keywordsArr };
    return JSON.stringify(profile) !== JSON.stringify(profileToCompare);
  }, [profile, draftProfile, styleKeywordsDraft]);

  // Bulletin Board State (Track Status per Item)
  const [bulletinState, setBulletinState] = useState<Record<string, BulletinStatus>>(() =>
    loadFromStorage<Record<string, BulletinStatus>>('pingstudio_bulletin_state', {})
  );
  const [aiBulletinItems, setAiBulletinItems] = useState<CfeBulletinItem[]>(() =>
    loadFromStorage<CfeBulletinItem[]>('pingstudio_bulletin_items', [])
  );
  const [isFetchingBulletin, setIsFetchingBulletin] = useState(false);
  const [bulletinFetchedAt, setBulletinFetchedAt] = useState<number>(() =>
    loadFromStorage<number>('pingstudio_bulletin_fetched_at', 0)
  );
  const [weekPlans, setWeekPlans] = useState<WeekPlan[]>(() =>
    loadFromStorage<WeekPlan[]>('pingstudio_week_plans', [])
  );

  const [scoutLocations, setScoutLocations] = useState<ScoutLocation[]>(() =>
    loadFromStorage<ScoutLocation[]>('pingstudio_scout', SCOUT_SEED_LOCATIONS)
  );

  const [submissions, setSubmissions] = useState<Submission[]>(() =>
    loadFromStorage<Submission[]>('pv_submissions', [])
  );
  const [skillProgress, setSkillProgress] = useState<SkillNodeProgress[]>(() =>
    loadFromStorage<SkillNodeProgress[]>('pv_skill_progress', [])
  );

  // Derived primary genre from profile (used by Ask a Pro)
  const derivedPrimaryGenre = useMemo((): Genre | 'All' => {
    if (profile.primaryGenres && profile.primaryGenres.length > 0) return profile.primaryGenres[0];
    return 'All';
  }, [profile.primaryGenres]);

  // Copy Helper
  const handleCopy = async (text: string, setter: (v: boolean) => void) => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.style.position = "fixed";
        textArea.style.left = "-9999px";
        textArea.style.top = "0";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        textArea.remove();
      }
      setter(true);
      setTimeout(() => setter(false), 2000);
    } catch (err) {
      console.error('Photovise: Failed to copy text: ', err);
    }
  };

  // Selection Logic for Daily Quote
  const dailyQuote = useMemo((): PhotoQuote => {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 0);
    const diff = now.getTime() - start.getTime();
    const oneDay = 1000 * 60 * 60 * 24;
    const dayOfYear = Math.floor(diff / oneDay);
    return PHOTO_QUOTES[dayOfYear % PHOTO_QUOTES.length];
  }, []);

  // ── Firestore hydration: load cloud data when user signs in ─────────────────
  // Runs once whenever the authenticated uid changes. Cloud data takes
  // precedence over whatever is already in localStorage so that the most
  // recent cross-device state wins.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const data = await loadUserData();
      if (cancelled || !data) return;
      if (data.sessions)         setSessions(data.sessions);
      if (data.gear)             setGear(data.gear);
      if (data.profile)          setProfile(data.profile);
      if (data.bulletinState)    setBulletinState(data.bulletinState);
      if (data.bulletinItems)    setAiBulletinItems(data.bulletinItems);
      if (data.bulletinFetchedAt !== undefined) setBulletinFetchedAt(data.bulletinFetchedAt);
      if (data.feedback)         setFeedbackLog(data.feedback);
      if (data.weekPlans)        setWeekPlans(data.weekPlans);
      if (data.scoutLocations)   setScoutLocations(data.scoutLocations);
      if (data.submissions)      setSubmissions(data.submissions);
      if (data.skillProgress)    setSkillProgress(data.skillProgress);
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid]);

  // Persist sessions (localStorage + Firestore)
  useEffect(() => {
    localStorage.setItem('pingstudio_sessions', JSON.stringify(sessions));
    saveUserData({ sessions });
  }, [sessions]); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist gear changes (localStorage + Firestore)
  useEffect(() => {
    localStorage.setItem('pingstudio_gear', JSON.stringify(gear));
    saveUserData({ gear });
  }, [gear]); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist profile (localStorage + Firestore — only when applied)
  useEffect(() => {
    localStorage.setItem('pingstudio_profile', JSON.stringify(profile));
    saveUserData({ profile });
  }, [profile]); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist bulletin state changes (localStorage + Firestore)
  useEffect(() => {
    localStorage.setItem('pingstudio_bulletin_state', JSON.stringify(bulletinState));
    saveUserData({ bulletinState });
  }, [bulletinState]); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist bulletin AI items and fetch timestamp (localStorage + Firestore)
  useEffect(() => {
    localStorage.setItem('pingstudio_bulletin_items', JSON.stringify(aiBulletinItems));
    saveUserData({ bulletinItems: aiBulletinItems });
  }, [aiBulletinItems]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    localStorage.setItem('pingstudio_bulletin_fetched_at', JSON.stringify(bulletinFetchedAt));
    saveUserData({ bulletinFetchedAt });
  }, [bulletinFetchedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-fetch bulletin events when tab opens (cache 2 hours)
  useEffect(() => {
    if (activeTab !== 'cfe') return;
    const TWO_HOURS = 2 * 60 * 60 * 1000;
    if (Date.now() - bulletinFetchedAt < TWO_HOURS && aiBulletinItems.length > 0) return;
    refreshBulletinEvents();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // Persist feedback log (localStorage + Firestore)
  useEffect(() => {
    localStorage.setItem('pingstudio_feedback', JSON.stringify(feedbackLog));
    saveUserData({ feedback: feedbackLog });
  }, [feedbackLog]); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist week plans (localStorage + Firestore — keep last 20, trim text for size)
  useEffect(() => {
    localStorage.setItem('pingstudio_week_plans', JSON.stringify(weekPlans));
    const trimmed = weekPlans.slice(-20).map(p => ({ ...p, result: p.result.slice(0, 3000) }));
    saveUserData({ weekPlans: trimmed });
  }, [weekPlans]); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist scout locations (localStorage + Firestore)
  useEffect(() => {
    localStorage.setItem('pingstudio_scout', JSON.stringify(scoutLocations));
    saveUserData({ scoutLocations });
  }, [scoutLocations]); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist mission submissions (localStorage + Firestore)
  useEffect(() => {
    localStorage.setItem('pv_submissions', JSON.stringify(submissions));
    saveUserData({ submissions });
  }, [submissions]); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist skill progress (localStorage + Firestore)
  useEffect(() => {
    localStorage.setItem('pv_skill_progress', JSON.stringify(skillProgress));
    saveUserData({ skillProgress });
  }, [skillProgress]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Scout location CRUD ───────────────────────────────────────────────────
  const addScoutLocation = (location: ScoutLocation) => {
    setScoutLocations(prev => [location, ...prev]);
  };

  const updateScoutLocation = (updated: ScoutLocation) => {
    setScoutLocations(prev => prev.map(l => l.id === updated.id ? updated : l));
  };

  const deleteScoutLocation = (id: string) => {
    setScoutLocations(prev => prev.filter(l => l.id !== id));
  };

  const toggleScoutFavorite = (id: string) => {
    setScoutLocations(prev => prev.map(l => l.id === id ? { ...l, favorite: !l.favorite } : l));
  };

  const useLocationForAssignment = (location: ScoutLocation, sessionId: string) => {
    // Build the scout notes block stored in session.scoutNotes (same pattern as strategy/dayPlan)
    const scoutNotes = [
      `${location.name}${location.area ? ` — ${location.area}` : ''}`,
      location.mapLink                                       && `Address: ${location.mapLink}`,
      location.bestTime && location.bestTime !== 'Any Time'  && `Best time: ${location.bestTime}`,
      location.tags?.length                                  && `Tags: ${location.tags.join(', ')}`,
      location.shotIdeas                                     && `Shot ideas: ${location.shotIdeas}`,
      location.lightingNotes                                 && `Lighting: ${location.lightingNotes}`,
      location.accessNotes                                   && `Access: ${location.accessNotes}`,
      location.safetyNotes                                   && `Safety: ${location.safetyNotes}`,
      location.parkingNotes                                  && `Parking/transit: ${location.parkingNotes}`,
      location.backupSpot                                    && `Backup spot: ${location.backupSpot}`,
    ].filter(Boolean).join('\n');

    setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, scoutNotes } : s));

    // Link the scout location to this session
    setScoutLocations(prev => prev.map(l => l.id === location.id ? { ...l, sessionId } : l));

    toast.success(`"${location.name}" attached to session.`);
    setActiveTab('dashboard');
  };

  // ── Mission submission handler ─────────────────────────────────────────────
  const handleMissionSubmit = async (
    missionId: string,
    missionTitle: string,
    skillNode: SkillNodeType,
    photoFile: File
  ): Promise<Submission> => {
    if (!user) throw new Error('Not signed in');

    const submissionId = `sub_${Date.now()}`;
    const path = `missions/${user.uid}/${submissionId}`;
    const fileRef = storageRef(storage, path);

    // Read file as data URL then upload
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(photoFile);
    });

    const base64 = dataUrl.split(',')[1];
    const contentType = photoFile.type || 'image/jpeg';
    await uploadString(fileRef, base64, 'base64', { contentType });
    const photoUrl = await getDownloadURL(fileRef);

    const submission: Submission = {
      id: submissionId,
      missionId,
      missionTitle,
      photoUrl,
      skillNode,
      feedbackText: getEncouragement(),
      createdAt: Date.now(),
    };

    setSubmissions(prev => [submission, ...prev]);

    // Update skill progress for this node
    setSkillProgress(prev => {
      const existing = prev.find(p => p.node === skillNode);
      if (existing) {
        return prev.map(p => p.node === skillNode ? { ...p, completions: p.completions + 1 } : p);
      }
      return [...prev, { node: skillNode, completions: 1 }];
    });

    return submission;
  };

  const addSession = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const date = formData.get('date') as string;
    const location = formData.get('location') as string;
    const genre = formData.get('genre') as Genre;
    const notes = formData.get('notes') as string;
    const title = (formData.get('title') as string).trim();
    const type = (formData.get('type') as string) || undefined;
    const deadline = (formData.get('deadline') as string) || undefined;
    const brief = ((formData.get('brief') as string) || '').trim() || undefined;

    const name = `${date}_${location.replace(/\s+/g, '_')}_${genre}`;

    const newSession: Session = {
      id: Date.now().toString(),
      name,
      title: title || undefined,
      date,
      location,
      genre: [genre],
      status: 'capturing',
      notes: notes || '',
      type: type as SessionType | undefined,
      deadline,
      brief,
    };
    
    setSessions(prev => [newSession, ...prev]);
    e.currentTarget.reset();

    try {
      await createCalendarEventForSession(newSession);
    } catch (err) {
      console.error("Calendar sync skipped - session archived locally only.");
    }
  };

  const updateStatus = (id: string, status: SessionStatus) => {
    setSessions(prev => prev.map(s => s.id === id ? { ...s, status } : s));
  };

  const updateSession = (id: string, updates: Partial<Session>) => {
    setSessions(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
  };

  const attachStrategyToSession = (sessionId: string, text: string, field: 'strategy' | 'dayPlan', onDone: () => void) => {
    if (!sessionId) return;
    setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, [field]: text } : s));
    onDone();
  };

  const deleteSession = (id: string) => {
    setSessions(prev => prev.filter(s => s.id !== id));
  };

  // Gear Management Handlers
  const addGearItem = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const name = formData.get('gearName') as string;
    const category = formData.get('category') as GearCategory;
    const details = formData.get('details') as string;
    const tagsString = formData.get('tags') as string;
    const available = formData.get('available') === 'on';

    const tags = tagsString ? tagsString.split(',').map(t => t.trim()).filter(t => t !== '') : [];

    const newItem: GearItem = {
      id: Date.now().toString(),
      name,
      category,
      details,
      tags,
      available
    };

    setGear(prev => [newItem, ...prev]);
    e.currentTarget.reset();
  };

  const toggleGearAvailability = (id: string) => {
    setGear(prev => prev.map(item => item.id === id ? { ...item, available: !item.available } : item));
  };

  const deleteGearItem = (id: string) => {
    setGear(prev => prev.filter(item => item.id !== id));
  };

  const updateBulletinStatus = (id: string, status: BulletinStatus) => {
    setBulletinState(prev => ({ ...prev, [id]: status }));
  };

  const removeBulletinItem = (id: string) => {
    setAiBulletinItems(prev => prev.filter(item => item.id !== id));
    setBulletinState(prev => { const next = { ...prev }; delete next[id]; return next; });
  };

  const getBulletinItemStatus = (id: string): BulletinStatus => {
    return bulletinState[id] || 'unmarked';
  };

  const refreshBulletinEvents = async () => {
    setIsFetchingBulletin(true);
    const items = await fetchBulletinEvents(genreFilter, regionFilter, typeFilter);
    if (items.length > 0) {
      // Preserve items the user has already tracked (considering/applied) that
      // aren't present in the new results, so statuses are never silently lost.
      setAiBulletinItems(prev => {
        const newIds = new Set(items.map(i => i.id));
        const kept = prev.filter(existing => {
          const s = bulletinState[existing.id];
          return (s === 'considering' || s === 'applied') && !newIds.has(existing.id);
        });
        return [...kept, ...items];
      });
      setBulletinFetchedAt(Date.now());
    }
    setIsFetchingBulletin(false);
  };

  const formatSessionsForContext = (ids: string[]) => {
    const selected = sessions.filter(s => ids.includes(s.id));
    if (selected.length === 0) return "";

    const blocks = selected.map((s, i) => {
      // Prefer the rich ScoutLocation linked to this session over the legacy scoutNotes text field.
      const scout = scoutLocations.find(sl => sl.sessionId === s.id);

      const scoutBlock = scout
        ? [
            `  Scouted location:`,
            `    Name: ${scout.name}`,
            scout.area          && `    Area: ${scout.area}`,
            scout.mapLink       && `    Map/Address: ${scout.mapLink}`,
            scout.bestTime      && `    Best time: ${scout.bestTime}`,
            scout.lightingNotes && `    Lighting: ${scout.lightingNotes}`,
            scout.accessNotes   && `    Access: ${scout.accessNotes}`,
            scout.parkingNotes  && `    Parking: ${scout.parkingNotes}`,
            scout.shotIdeas     && `    Shot ideas: ${scout.shotIdeas}`,
            scout.safetyNotes   && `    Safety: ${scout.safetyNotes}`,
            scout.backupSpot    && `    Backup spot: ${scout.backupSpot}`,
          ].filter(Boolean).join('\n')
        : s.scoutNotes
          ? `  Scouted location:\n${s.scoutNotes.split('\n').map(l => `    ${l}`).join('\n')}`
          : null;

      const lines = [
        `SESSION ${i + 1}:`,
        `  Date: ${s.date}`,
        `  Location: ${s.location}`,
        `  Genre: ${s.genre.join(', ')}`,
        `  Status: ${s.status}`,
        s.type     && `  Type: ${s.type}`,
        s.deadline && `  Deadline: ${s.deadline}`,
        s.title    && `  Title: ${s.title}`,
        s.brief    && `  Brief: ${s.brief}`,
        s.notes    && `  Notes: ${s.notes}`,
        s.strategy && `  Assignment strategy: ${s.strategy}`,
        s.dayPlan  && `  Assignment day plan: ${s.dayPlan}`,
        scoutBlock,
      ].filter(Boolean);
      return lines.join('\n');
    });

    return "ATTACHED SESSION CONTEXT:\n" + blocks.join('\n\n');
  };

  const formatGearForContext = () => {
    const availableGear = gear.filter(g => g.available);
    if (availableGear.length === 0) return "";

    const lines = availableGear.map(g => 
      `- ${g.name} | ${g.category}` +
      (g.details ? ` | Details: ${g.details}` : "") +
      (g.tags && g.tags.length ? ` | Tags: ${g.tags.join(', ')}` : "")
    );

    return "AVAILABLE GEAR LOCKER:\n" + lines.join("\n");
  };

  const formatProfileForContext = (prof: PhotographerProfile): string => {
    const genres = prof.primaryGenres.join(', ') || 'None specified';
    const style = prof.styleKeywords.join(', ') || 'None specified';
    const editing = prof.editingApps.join(', ') || 'None specified';
    const tethering = prof.tetheringApps.join(', ') || 'None specified';

    return [
      'PHOTOGRAPHER PROFILE:',
      prof.name ? `Name: ${prof.name}` : null,
      prof.yearsShooting ? `Years Shooting: ${prof.yearsShooting}` : null,
      `Primary Genres: ${genres}`,
      `Typical Work: ${prof.typicalWork || 'Not specified'}`,
      `Style Keywords: ${style}`,
      `Software Workflow: ${editing}`,
      `Tethering Apps: ${tethering}`,
      prof.otherEditingAppNote ? `Note on Editing: ${prof.otherEditingAppNote}` : null,
      prof.otherTetheringAppNote ? `Note on Tethering: ${prof.otherTetheringAppNote}` : null,
      `Risk Profile: ${prof.riskProfile}`,
      prof.strengths ? `Strengths: ${prof.strengths}` : null,
      prof.struggles ? `Struggles: ${prof.struggles}` : null,
      prof.physicalConstraints ? `Physical Constraints: ${prof.physicalConstraints}` : null,
      prof.accessReality ? `Access Reality: ${prof.accessReality}` : null,
      prof.timeBudget ? `Time Budget: ${prof.timeBudget}` : null,
      prof.growthGoals ? `Growth Goals: ${prof.growthGoals}` : null,
    ]
      .filter(Boolean)
      .join('\n');
  };

  // ── Strategy generation (called from SessionCard inline form) ────────────────
  const handleGenerateStrategy = async (
    sessionId: string,
    input: string,
    timeframe: AssignmentTimeframe
  ): Promise<void> => {
    const session = sessions.find(s => s.id === sessionId);
    if (!session) return;

    const timeframeLabel: Record<AssignmentTimeframe, string> = {
      '30min': '30 minutes', '1hr': '1 hour', '2hr': '2 hours',
      '4hr': '4 hours', 'fullday': 'a full day (8+ hours)',
    };
    const genre = session.genre[0] || 'General';
    const profileContext = formatProfileForContext(profile);
    const gearContext = formatGearForContext();
    const sessionContext = formatSessionsForContext([sessionId]);

    const pieces: string[] = [];
    if (profileContext.trim()) pieces.push(profileContext);
    if (gearContext.trim()) pieces.push(gearContext);
    if (sessionContext.trim()) pieces.push(sessionContext);
    if (input.trim()) pieces.push('ASSIGNMENT DETAILS:\n' + input.trim());
    pieces.push(`ASSIGNMENT GENRE FOCUS: ${genre.toUpperCase()}`);
    pieces.push(`TIME WINDOW FOR THIS ASSIGNMENT: ${timeframeLabel[timeframe].toUpperCase()}`);

    const finalPrompt = pieces.join('\n\n') + "\n\n" +
      "ROLE: Expert photographer and assignment editor.\n\n" +
      "AUDIENCE: A working photographer on assignment who needs a fast, realistic plan.\n\n" +
      "CORE DIRECTIVE: Write a concise Assignment Strategy the photographer can follow.\n\n" +
      "TEMPLATE AND STRUCTURE:\n" +
      "- Use the template below. Do NOT change headings or order. Remove bracket text in final output.\n\n" +
      "TEMPLATE TO FILL:\n\n" +
      "**Objective**\n[One sentence on what success looks like.]\n\n" +
      "**Shot List**\n- [Key shot 1]\n- [Key shot 2]\n- [Key shot 3]\n- [Optional 4]\n- [Optional 5]\n\n" +
      "**Gear**\n- [Camera body]\n- [Primary lens]\n- [Secondary lens]\n- [Support if needed]\n- [Key accessory]\n\n" +
      "**Location**\n[If scouted location attached: name, area, key access note. Omit if none.]\n\n" +
      "**Timing**\n[Best time window for light, crowd, or event.]\n\n" +
      "**Settings**\n- Aperture: [range] for [goal].\n- ISO: [baseline] for [goal].\n- Shutter: [start] for [subject].\n\n" +
      "**Workflow**\n[Software] — [1–2 steps for culling and first-pass edit].\n\n" +
      "HARD RULES:\n" +
      "- Stay under 300 words.\n- Be direct, practical, specific.\n- No filler or motivational language.\n" +
      "- Use only provided data. Do not invent details.\n- Skip sections that aren't relevant.\n\n" +
      "FORMAT: No intro paragraph. Start directly with **Objective**. Easy to scan on mobile.";

    const result = await generateAssignmentGuide(finalPrompt);
    setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, strategy: result } : s));
  };

  const handleAskProSubmit = async () => {
    if (!askProInput.trim()) return;
    setIsGeneratingAskPro(true);
    try {
      const prompt = buildAskProPrompt({
        profile,
        assignmentGenre: derivedPrimaryGenre,
        assignmentTimeframe: '2hr',
        assignmentInput: '',
        question: askProInput,
      });
      const answer = await askProQuestion(prompt);
      setAskProAnswer(answer);
    } finally {
      setIsGeneratingAskPro(false);
    }
  };

  const GearSummary = () => (
    <div className="bg-brand-white border border-brand-black/5 rounded-lg p-5 shadow-sm">
      <h4 className="text-xs font-medium text-brand-black/50 mb-3 flex items-center gap-2">
        <i className="fa-solid fa-toolbox text-brand-rose"></i> Gear in locker
      </h4>
      <div className="max-h-32 overflow-y-auto no-scrollbar space-y-2">
        {gear.length === 0 ? (
          <p className="text-xs text-brand-gray/50 italic">No gear registered.</p>
        ) : (
          gear.map(item => (
            <div key={item.id} className="flex justify-between items-center py-1 border-b border-brand-black/5 last:border-0">
              <span className={`text-xs font-medium ${item.available ? 'text-brand-black' : 'text-brand-gray/40 line-through'}`}>
                {item.name}
              </span>
              <span className="text-xs px-1.5 py-0.5 bg-brand-black/5 rounded text-brand-gray font-medium">{item.category}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );

  const BulletinSummary = () => {
    const upcoming = [...aiBulletinItems]
      .filter(item => item.deadline && item.deadline !== 'Rolling' && item.deadline !== 'TBA')
      .sort((a, b) => (a.deadline || '').localeCompare(b.deadline || ''))
      .slice(0, 3);

    return (
      <div className="bg-brand-white border border-brand-black/5 rounded-lg p-5 shadow-sm">
        <h4 className="text-xs font-medium text-brand-black/50 mb-3 flex items-center gap-2">
          <i className="fa-solid fa-trophy text-brand-rose"></i> Bulletin highlights
        </h4>
        <div className="space-y-3">
          {upcoming.length === 0 ? (
            <p className="text-xs text-brand-gray/50 italic">No upcoming deadlines.</p>
          ) : (
            upcoming.map(item => (
              <div key={item.id} className="border-b border-brand-black/5 last:border-0 pb-2 last:pb-0">
                <p className="text-xs font-semibold text-brand-black truncate">{item.name}</p>
                <div className="flex justify-between items-center mt-1">
                  <span className="text-xs text-brand-rose font-medium">{item.deadline}</span>
                  <span className="text-xs text-brand-gray">{item.type}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    );
  };

  const enrichedBulletin = useMemo(() => {
    return aiBulletinItems.map(item => ({
      ...item,
      status: getBulletinItemStatus(item.id)
    }));
  }, [aiBulletinItems, bulletinState]);

  const primaryBoardItems = useMemo(() => {
    const filtered = enrichedBulletin.filter(item => {
      const matchGenre = genreFilter === 'All' || (item.genres && item.genres.includes(genreFilter));
      const matchRegion = regionFilter === 'All' || item.region === regionFilter;
      const matchPriority = priorityFilter === 'All' || item.priority === priorityFilter;
      const matchType = typeFilter === 'All' || item.type === typeFilter;
      return matchGenre && matchRegion && matchPriority && matchType && item.status === 'unmarked';
    });

    return filtered.sort((a, b) => {
      const userPriority: Record<BulletinPriority, number> = { high: 3, medium: 2, low: 1 };
      const diffPriority = userPriority[b.priority] - userPriority[a.priority];
      if (diffPriority !== 0) return diffPriority;
      if (a.deadline === 'Rolling') return 1;
      if (b.deadline === 'Rolling') return -1;
      return (a.deadline || 'TBA').localeCompare(b.deadline || 'TBA');
    });
  }, [enrichedBulletin, genreFilter, regionFilter, priorityFilter, typeFilter]);

  const consideringItems = useMemo(() => {
    return enrichedBulletin.filter(item => item.status === 'considering')
      .sort((a, b) => (a.deadline || 'TBA').localeCompare(b.deadline || 'TBA'));
  }, [enrichedBulletin]);

  const appliedItems = useMemo(() => {
    return enrichedBulletin.filter(item => item.status === 'applied')
      .sort((a, b) => (a.deadline || 'TBA').localeCompare(b.deadline || 'TBA'));
  }, [enrichedBulletin]);

  const archivedBoardItems = useMemo(() => {
    return enrichedBulletin.filter(item => item.status === 'archived');
  }, [enrichedBulletin]);

  const conciseWorkflowLabel = useMemo(() => <SystemStatusApps profile={profile} />, [profile]);

  // ── Auth gate ────────────────────────────────────────────────────────────────
  if (authLoading) {
    return (
      <div className="min-h-screen bg-brand-canvas flex items-center justify-center">
        <div className="text-center">
          <div className="font-sans font-bold text-[32px] tracking-[0.04em] text-brand-ink mb-3">PHOTOVISE</div>
          <div className="font-mono text-[9px] tracking-[0.22em] text-brand-ink/40 uppercase mb-6">Workflow Instrument</div>
          <span className="pulse-brass inline-block w-[6px] h-[6px] rounded-full bg-brand-accent"></span>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginScreen />;
  }

  const statusReadouts = [
    { label: 'DAY', value: `${Math.floor(Date.now() / 86400000) % 365 + 1}` },
    { label: 'SESSIONS', value: sessions.filter(s => s.status !== 'archived').length },
    { label: 'SHOTS LOGGED', value: submissions.length },
  ];

  return (
    <Layout activeTab={activeTab} setActiveTab={setActiveTab} statusReadouts={statusReadouts} isFieldMode={isFieldMode} user={user} onSignOut={signOut} dailyQuote={dailyQuote}>
      {activeTab === 'dashboard' && (
        <div className="animate-in fade-in duration-700">
          {/* Screen header */}
          <div style={{ borderBottom: '1px solid rgba(23,25,26,0.14)', paddingBottom: '18px', marginBottom: '22px' }} className="flex items-end justify-between gap-6">
            <div>
              <p className="font-mono text-[9px] tracking-[0.24em] text-brand-ink/40 uppercase mb-[9px]">Shoot / Pipeline</p>
              <h1 className="font-sans font-semibold text-[42px] leading-none tracking-[-0.02em] text-brand-ink">Sessions</h1>
            </div>
            <div className="flex items-center gap-4">
              {/* Field mode toggle */}
              <div className="flex items-center gap-2">
                <span className="font-mono text-[8px] tracking-[0.14em] uppercase" style={{ color: 'rgba(23,25,26,0.45)' }}>Field</span>
                <button
                  onClick={() => setIsFieldMode(!isFieldMode)}
                  style={{
                    width: '32px', height: '16px', position: 'relative',
                    background: isFieldMode ? '#c9a227' : 'rgba(23,25,26,0.18)',
                    border: 'none', cursor: 'pointer', transition: 'background 0.2s',
                  }}
                >
                  <div style={{
                    position: 'absolute', top: '3px',
                    left: isFieldMode ? '17px' : '3px',
                    width: '10px', height: '10px',
                    background: '#f8f7f4',
                    transition: 'left 0.2s',
                  }} />
                </button>
              </div>
            </div>
          </div>

          {/* Daily quote */}
          <div style={{ borderLeft: '2px solid rgba(23,25,26,0.12)', paddingLeft: '14px', marginBottom: '20px' }}>
            <p className="font-serif italic" style={{ fontSize: '14px', color: 'rgba(23,25,26,0.55)', lineHeight: 1.6 }}>"{dailyQuote.text}"</p>
            <p className="font-mono text-[8px] tracking-[0.14em] uppercase mt-1" style={{ color: 'rgba(23,25,26,0.35)' }}>— {dailyQuote.author}</p>
          </div>

          {/* New session form */}
          <div style={{ background: '#f8f7f4', border: '1px solid rgba(23,25,26,0.14)', padding: '20px', marginBottom: '22px' }}>
            <p className="font-mono text-[9px] tracking-[0.22em] uppercase mb-4" style={{ color: 'rgba(23,25,26,0.40)' }}>New Session</p>
            <form onSubmit={addSession} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <input
                name="title"
                type="text"
                placeholder="Session title (optional)"
                style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', fontSize: '12px', color: '#17191a', background: 'rgba(23,25,26,0.04)', border: '1px solid rgba(23,25,26,0.14)', outline: 'none', fontFamily: 'inherit' }}
              />
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
                <input
                  name="date"
                  type="date"
                  required
                  style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', fontSize: '12px', color: '#17191a', background: 'rgba(23,25,26,0.04)', border: '1px solid rgba(23,25,26,0.14)', outline: 'none', fontFamily: 'inherit' }}
                />
                <LocationAutocomplete
                  name="location"
                  placeholder="Location (e.g. Austin)"
                  required
                  className="w-full"
                  style={{ padding: '9px 12px', fontSize: '12px', color: '#17191a', background: 'rgba(23,25,26,0.04)', border: '1px solid rgba(23,25,26,0.14)', outline: 'none', fontFamily: 'inherit' }}
                />
                <select
                  name="genre"
                  required
                  style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', fontSize: '12px', color: '#17191a', background: 'rgba(23,25,26,0.04)', border: '1px solid rgba(23,25,26,0.14)', outline: 'none', fontFamily: 'inherit', cursor: 'pointer' }}
                >
                  {genreOptions.map(g => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
                <button
                  type="submit"
                  className="font-mono text-[9px] tracking-[0.20em] uppercase transition-colors"
                  style={{ padding: '9px 0', background: '#17191a', border: '1px solid #17191a', color: '#f4f3ef', cursor: 'pointer' }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#c9a227'; e.currentTarget.style.borderColor = '#c9a227'; e.currentTarget.style.color = '#17191a'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = '#17191a'; e.currentTarget.style.borderColor = '#17191a'; e.currentTarget.style.color = '#f4f3ef'; }}
                >
                  + Add Session
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <select
                  name="type"
                  style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', fontSize: '12px', color: '#17191a', background: 'rgba(23,25,26,0.04)', border: '1px solid rgba(23,25,26,0.14)', outline: 'none', fontFamily: 'inherit', cursor: 'pointer' }}
                >
                  <option value="">Type (optional)</option>
                  <option value="Class">Class</option>
                  <option value="Internship">Internship</option>
                  <option value="Personal">Personal</option>
                </select>
                <input
                  name="deadline"
                  type="date"
                  style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', fontSize: '12px', color: '#17191a', background: 'rgba(23,25,26,0.04)', border: '1px solid rgba(23,25,26,0.14)', outline: 'none', fontFamily: 'inherit' }}
                  title="Submission deadline (optional)"
                />
              </div>
              <textarea
                name="brief"
                placeholder="Assignment brief / requirements (optional)"
                style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', fontSize: '12px', color: '#17191a', background: 'rgba(23,25,26,0.04)', border: '1px solid rgba(23,25,26,0.14)', outline: 'none', minHeight: '60px', resize: 'vertical', fontFamily: 'inherit' }}
              />
              <textarea
                name="notes"
                placeholder="Notes"
                style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', fontSize: '12px', color: '#17191a', background: 'rgba(23,25,26,0.04)', border: '1px solid rgba(23,25,26,0.14)', outline: 'none', minHeight: '60px', resize: 'vertical', fontFamily: 'inherit' }}
              />
            </form>
          </div>

          {/* ── Dashboard filters ── */}
          {(() => {
            const activeSessions = sessions.filter(s => s.status !== 'archived');
            const presentGenres = Array.from(new Set(activeSessions.flatMap(s => s.genre ?? []))) as Genre[];
            const filtered = activeSessions
              .filter(s =>
                (dashboardGenreFilter === 'All' || (s.genre ?? []).includes(dashboardGenreFilter)) &&
                (dashboardStatusFilter === 'All' || s.status === dashboardStatusFilter) &&
                (dashboardTypeFilter === 'All' || s.type === dashboardTypeFilter)
              )
              .sort((a, b) => {
                if (dashboardDateSort === 'deadline') {
                  // Sessions with deadlines first, sorted ascending; no-deadline sessions go last
                  if (a.deadline && b.deadline) return a.deadline.localeCompare(b.deadline);
                  if (a.deadline) return -1;
                  if (b.deadline) return 1;
                  return (b.date || '').localeCompare(a.date || '');
                }
                const da = a.date || '', db = b.date || '';
                return dashboardDateSort === 'newest' ? db.localeCompare(da) : da.localeCompare(db);
              });

            const hasFilters = dashboardGenreFilter !== 'All' || dashboardStatusFilter !== 'All' || dashboardTypeFilter !== 'All';

            return (
              <>
                {activeSessions.length > 0 && (
                  <div className="mb-5">
                    {/* Filter pills row */}
                    <div className="flex flex-wrap gap-2 mb-3">
                      {/* Type filters */}
                      {(['All', 'Class', 'Internship', 'Personal'] as const).map(t => {
                        const active = dashboardTypeFilter === t;
                        return (
                          <button key={t}
                            onClick={() => setDashboardTypeFilter(t)}
                            className="font-mono text-[8px] tracking-[0.16em] uppercase transition-colors"
                            style={{ padding: '5px 10px', border: active ? '1px solid #17191a' : '1px solid rgba(23,25,26,0.18)', background: active ? '#17191a' : 'transparent', color: active ? '#f4f3ef' : 'rgba(23,25,26,0.55)', cursor: 'pointer' }}
                            onMouseEnter={e => { if (!active) { e.currentTarget.style.borderColor = '#17191a'; e.currentTarget.style.color = '#17191a'; } }}
                            onMouseLeave={e => { if (!active) { e.currentTarget.style.borderColor = 'rgba(23,25,26,0.18)'; e.currentTarget.style.color = 'rgba(23,25,26,0.55)'; } }}
                          >{t}</button>
                        );
                      })}
                      <span style={{ width: '1px', background: 'rgba(23,25,26,0.14)', margin: '0 4px' }} />
                      {/* Genre filters */}
                      {(['All', ...presentGenres] as const).map(g => {
                        const active = dashboardGenreFilter === g;
                        return (
                          <button key={g}
                            onClick={() => setDashboardGenreFilter(g as typeof dashboardGenreFilter)}
                            className="font-mono text-[8px] tracking-[0.16em] uppercase transition-colors"
                            style={{ padding: '5px 10px', border: active ? '1px solid #17191a' : '1px solid rgba(23,25,26,0.18)', background: active ? '#17191a' : 'transparent', color: active ? '#f4f3ef' : 'rgba(23,25,26,0.55)', cursor: 'pointer' }}
                            onMouseEnter={e => { if (!active) { e.currentTarget.style.borderColor = '#17191a'; e.currentTarget.style.color = '#17191a'; } }}
                            onMouseLeave={e => { if (!active) { e.currentTarget.style.borderColor = 'rgba(23,25,26,0.18)'; e.currentTarget.style.color = 'rgba(23,25,26,0.55)'; } }}
                          >{g === 'All' ? 'All Genres' : g}</button>
                        );
                      })}
                      <span style={{ width: '1px', background: 'rgba(23,25,26,0.14)', margin: '0 4px' }} />
                      {/* Status filters */}
                      {(['All', 'capturing', 'shot', 'culled', 'edited', 'backed up', 'posted'] as const).map(s => {
                        const active = dashboardStatusFilter === s;
                        const label = s === 'All' ? 'All' : { capturing: 'Shoot', shot: 'Cull', culled: 'Edit', edited: 'Backup', 'backed up': 'Post', posted: 'Done' }[s];
                        return (
                          <button key={s}
                            onClick={() => setDashboardStatusFilter(s)}
                            className="font-mono text-[8px] tracking-[0.16em] uppercase transition-colors"
                            style={{ padding: '5px 10px', border: active ? '1px solid #17191a' : '1px solid rgba(23,25,26,0.18)', background: active ? '#17191a' : 'transparent', color: active ? '#f4f3ef' : 'rgba(23,25,26,0.55)', cursor: 'pointer' }}
                            onMouseEnter={e => { if (!active) { e.currentTarget.style.borderColor = '#17191a'; e.currentTarget.style.color = '#17191a'; } }}
                            onMouseLeave={e => { if (!active) { e.currentTarget.style.borderColor = 'rgba(23,25,26,0.18)'; e.currentTarget.style.color = 'rgba(23,25,26,0.55)'; } }}
                          >{label}</button>
                        );
                      })}
                      <button
                        onClick={() => setDashboardDateSort(p => p === 'deadline' ? 'newest' : p === 'newest' ? 'oldest' : 'deadline')}
                        className="font-mono text-[8px] tracking-[0.14em] uppercase transition-colors ml-2"
                        style={{ padding: '5px 10px', border: '1px solid rgba(23,25,26,0.18)', background: 'transparent', color: 'rgba(23,25,26,0.50)', cursor: 'pointer' }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = '#c9a227'; e.currentTarget.style.color = '#8a6b0f'; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(23,25,26,0.18)'; e.currentTarget.style.color = 'rgba(23,25,26,0.50)'; }}
                      >
                        {dashboardDateSort === 'deadline' ? 'Deadline ↑' : dashboardDateSort === 'newest' ? 'Newest ↓' : 'Oldest ↑'}
                      </button>
                    </div>
                    <div className="flex items-center justify-between">
                      <p className="font-mono text-[8px] tracking-[0.12em] uppercase" style={{ color: 'rgba(23,25,26,0.38)' }}>
                        {filtered.length} / {activeSessions.length} Sessions
                      </p>
                      {hasFilters && (
                        <button
                          onClick={() => { setDashboardGenreFilter('All'); setDashboardStatusFilter('All'); setDashboardTypeFilter('All'); }}
                          className="font-mono text-[8px] tracking-[0.12em] uppercase transition-colors"
                          style={{ color: 'rgba(23,25,26,0.40)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                          onMouseEnter={e => (e.currentTarget.style.color = '#c9a227')}
                          onMouseLeave={e => (e.currentTarget.style.color = 'rgba(23,25,26,0.40)')}
                        >
                          × Clear
                        </button>
                      )}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {activeSessions.length === 0 ? (
                    <div className="col-span-full py-10" style={{ borderLeft: '2px solid rgba(23,25,26,0.14)', paddingLeft: '14px' }}>
                      <p className="font-mono text-[9px] tracking-[0.18em] uppercase" style={{ color: 'rgba(23,25,26,0.40)' }}>No Active Sessions</p>
                    </div>
                  ) : filtered.length === 0 ? (
                    <div className="col-span-full py-8" style={{ borderLeft: '2px solid rgba(23,25,26,0.14)', paddingLeft: '14px' }}>
                      <p className="font-mono text-[9px] tracking-[0.18em] uppercase" style={{ color: 'rgba(23,25,26,0.40)' }}>No Sessions Match</p>
                      <button onClick={() => { setDashboardGenreFilter('All'); setDashboardStatusFilter('All'); setDashboardTypeFilter('All'); }}
                        className="font-mono text-[8px] tracking-[0.14em] uppercase mt-2 transition-colors"
                        style={{ color: '#c9a227', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                        Clear filters
                      </button>
                    </div>
                  ) : (
                    filtered.map(session => (
                      <div key={session.id} id={`session-${session.id}`} style={{ outline: highlightedSessionId === session.id ? '2px solid #c9a227' : 'none', outlineOffset: '2px', transition: 'outline 0.3s' }}>
                        <SessionCard
                          session={session}
                          onUpdateStatus={updateStatus}
                          onUpdate={updateSession}
                          onDelete={deleteSession}
                          onGenerateStrategy={handleGenerateStrategy}
                        />
                      </div>
                    ))
                  )}
                </div>
              </>
            );
          })()}
        </div>
      )}

      {activeTab === 'profile' && (
        <div className="animate-in fade-in duration-700">
          {/* Screen header */}
          <div style={{ borderBottom: '1px solid rgba(23,25,26,0.14)', paddingBottom: '18px', marginBottom: '22px' }} className="flex items-end justify-between gap-4">
            <div>
              <p className="font-mono text-[9px] tracking-[0.24em] text-brand-ink/40 uppercase mb-[9px]">You / Identity</p>
              <h1 className="font-sans font-semibold text-[42px] leading-none tracking-[-0.02em] text-brand-ink">Profile</h1>
            </div>
            <div className="flex items-center gap-3">
              {profileSuccessMsg && <span className="font-mono text-[8px] tracking-[0.14em] uppercase" style={{ color: '#4b6b52' }}>Saved ✓</span>}
              {user && (
                <button onClick={signOut} className="font-mono text-[8px] tracking-[0.14em] uppercase transition-colors"
                  style={{ padding: '7px 12px', border: '1px solid rgba(23,25,26,0.18)', background: 'transparent', color: 'rgba(23,25,26,0.55)', cursor: 'pointer' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = '#17191a'; e.currentTarget.style.color = '#17191a'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(23,25,26,0.18)'; e.currentTarget.style.color = 'rgba(23,25,26,0.55)'; }}>Sign Out</button>
              )}
            </div>
          </div>

          {/* Account strip */}
          {user && (
            <div style={{ background: '#f4f3ef', border: '1px solid rgba(23,25,26,0.14)', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '18px' }}>
              {user.photoURL
                ? <img src={user.photoURL} alt="avatar" style={{ width: '32px', height: '32px', objectFit: 'cover', border: '1px solid rgba(23,25,26,0.14)' }} />
                : <div style={{ width: '32px', height: '32px', background: 'rgba(23,25,26,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', color: 'rgba(23,25,26,0.40)' }}>◎</div>
              }
              <div>
                <p style={{ fontSize: '13px', fontWeight: 500, color: '#17191a' }}>{user.displayName || 'Photographer'}</p>
                <p className="font-mono text-[9px] tracking-[0.12em]" style={{ color: 'rgba(23,25,26,0.42)', marginTop: '2px' }}>{user.email}</p>
              </div>
            </div>
          )}

          {/* Panel grid — 2 columns */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

            {/* Panel: Basics */}
            <div style={{ background: '#f8f7f4', border: '1px solid rgba(23,25,26,0.14)', borderTop: '2px solid #4a6b7c', padding: '18px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <p className="font-mono text-[9px] tracking-[0.20em] uppercase" style={{ color: '#4a6b7c' }}>Basics</p>
              <div>
                <label style={{ display: 'block', fontFamily: "'IBM Plex Mono', monospace", fontSize: '9px', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(23,25,26,0.40)', marginBottom: '5px' }}>Name</label>
                <input type="text" value={draftProfile.name} onChange={e => setDraftProfile(prev => ({ ...prev, name: e.target.value }))} placeholder="e.g. Jane Doe"
                  style={{ width: '100%', padding: '9px 12px', fontSize: '12px', color: '#17191a', background: 'rgba(23,25,26,0.04)', border: '1px solid rgba(23,25,26,0.14)', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontFamily: "'IBM Plex Mono', monospace", fontSize: '9px', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(23,25,26,0.40)', marginBottom: '5px' }}>Years Shooting</label>
                <input type="text" value={draftProfile.yearsShooting} onChange={e => setDraftProfile(prev => ({ ...prev, yearsShooting: e.target.value }))} placeholder="e.g. 5 years, or since 2018"
                  style={{ width: '100%', padding: '9px 12px', fontSize: '12px', color: '#17191a', background: 'rgba(23,25,26,0.04)', border: '1px solid rgba(23,25,26,0.14)', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontFamily: "'IBM Plex Mono', monospace", fontSize: '9px', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(23,25,26,0.40)', marginBottom: '7px' }}>Primary Genres</label>
                <div className="flex flex-wrap gap-1.5">
                  {genreOptions.map((g: Genre) => {
                    const active = draftProfile.primaryGenres.includes(g);
                    return (
                      <button key={g} onClick={() => setDraftProfile(prev => ({ ...prev, primaryGenres: active ? prev.primaryGenres.filter(pg => pg !== g) : [...prev.primaryGenres, g] }))}
                        className="font-mono text-[8px] tracking-[0.12em] uppercase"
                        style={{ padding: '4px 8px', border: active ? '1px solid #17191a' : '1px solid rgba(23,25,26,0.18)', background: active ? '#17191a' : 'transparent', color: active ? '#f4f3ef' : 'rgba(23,25,26,0.55)', cursor: 'pointer' }}>{g}</button>
                    );
                  })}
                </div>
                {draftProfile.primaryGenres.includes('Other') && (
                  <input type="text" value={draftProfile.otherGenreNote || ''} onChange={e => setDraftProfile(prev => ({ ...prev, otherGenreNote: e.target.value }))} placeholder="Specify genre…"
                    style={{ width: '100%', marginTop: '8px', padding: '9px 12px', fontSize: '12px', color: '#17191a', background: 'rgba(23,25,26,0.04)', border: '1px solid rgba(23,25,26,0.14)', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                )}
              </div>
            </div>

            {/* Panel: Style */}
            <div style={{ background: '#f8f7f4', border: '1px solid rgba(23,25,26,0.14)', borderTop: '2px solid #c9a227', padding: '18px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <p className="font-mono text-[9px] tracking-[0.20em] uppercase" style={{ color: '#8a6b0f' }}>Work & Style</p>
              <div>
                <label style={{ display: 'block', fontFamily: "'IBM Plex Mono', monospace", fontSize: '9px', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(23,25,26,0.40)', marginBottom: '5px' }}>Typical Work / Scope</label>
                <textarea value={draftProfile.typicalWork} onChange={e => setDraftProfile(prev => ({ ...prev, typicalWork: e.target.value }))} placeholder="e.g. editorial assignments, street photography series"
                  style={{ width: '100%', padding: '9px 12px', fontSize: '12px', color: '#17191a', background: 'rgba(23,25,26,0.04)', border: '1px solid rgba(23,25,26,0.14)', outline: 'none', fontFamily: 'inherit', minHeight: '70px', resize: 'vertical', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontFamily: "'IBM Plex Mono', monospace", fontSize: '9px', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(23,25,26,0.40)', marginBottom: '5px' }}>Style Keywords</label>
                <input type="text" value={styleKeywordsDraft} onChange={e => setStyleKeywordsDraft(e.target.value)} placeholder="cinematic, high contrast, natural light…"
                  style={{ width: '100%', padding: '9px 12px', fontSize: '12px', color: '#17191a', background: 'rgba(23,25,26,0.04)', border: '1px solid rgba(23,25,26,0.14)', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontFamily: "'IBM Plex Mono', monospace", fontSize: '9px', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(23,25,26,0.40)', marginBottom: '7px' }}>Risk Profile</label>
                <div className="flex gap-2">
                  {(['cautious', 'balanced', 'experimental'] as PhotographerProfile['riskProfile'][]).map(r => {
                    const active = draftProfile.riskProfile === r;
                    return (
                      <button key={r} onClick={() => setDraftProfile(prev => ({ ...prev, riskProfile: r }))}
                        className="flex-1 font-mono text-[8px] tracking-[0.12em] uppercase"
                        style={{ padding: '8px 4px', border: active ? '1px solid #17191a' : '1px solid rgba(23,25,26,0.18)', background: active ? '#17191a' : 'transparent', color: active ? '#f4f3ef' : 'rgba(23,25,26,0.55)', cursor: 'pointer' }}>{r}</button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Panel: Software */}
            <div style={{ background: '#f8f7f4', border: '1px solid rgba(23,25,26,0.14)', borderTop: '2px solid #4a6b7c', padding: '18px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <p className="font-mono text-[9px] tracking-[0.20em] uppercase" style={{ color: '#4a6b7c' }}>Software & Workflow</p>
              <div>
                <label style={{ display: 'block', fontFamily: "'IBM Plex Mono', monospace", fontSize: '9px', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(23,25,26,0.40)', marginBottom: '7px' }}>Editing / RAW</label>
                <div className="flex flex-wrap gap-1.5">
                  {editingAppsList.map(app => {
                    const active = draftProfile.editingApps.includes(app);
                    return (
                      <button key={app} onClick={() => setDraftProfile(prev => ({ ...prev, editingApps: active ? prev.editingApps.filter(a => a !== app) : [...prev.editingApps, app] }))}
                        className="font-mono text-[8px] tracking-[0.12em] uppercase"
                        style={{ padding: '4px 8px', border: active ? '1px solid #17191a' : '1px solid rgba(23,25,26,0.18)', background: active ? '#17191a' : 'transparent', color: active ? '#f4f3ef' : 'rgba(23,25,26,0.55)', cursor: 'pointer' }}>{app}</button>
                    );
                  })}
                </div>
                {draftProfile.editingApps.includes('Other') && (
                  <input type="text" value={draftProfile.otherEditingAppNote || ''} onChange={e => setDraftProfile(prev => ({ ...prev, otherEditingAppNote: e.target.value }))} placeholder="Specify editing app…"
                    style={{ width: '100%', marginTop: '8px', padding: '9px 12px', fontSize: '12px', color: '#17191a', background: 'rgba(23,25,26,0.04)', border: '1px solid rgba(23,25,26,0.14)', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                )}
              </div>
              <div>
                <label style={{ display: 'block', fontFamily: "'IBM Plex Mono', monospace", fontSize: '9px', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(23,25,26,0.40)', marginBottom: '7px' }}>Tethering / Capture</label>
                <div className="flex flex-wrap gap-1.5">
                  {tetheringAppsList.map(app => {
                    const active = draftProfile.tetheringApps.includes(app);
                    return (
                      <button key={app} onClick={() => setDraftProfile(prev => ({ ...prev, tetheringApps: active ? prev.tetheringApps.filter(a => a !== app) : [...prev.tetheringApps, app] }))}
                        className="font-mono text-[8px] tracking-[0.12em] uppercase"
                        style={{ padding: '4px 8px', border: active ? '1px solid #17191a' : '1px solid rgba(23,25,26,0.18)', background: active ? '#17191a' : 'transparent', color: active ? '#f4f3ef' : 'rgba(23,25,26,0.55)', cursor: 'pointer' }}>{app}</button>
                    );
                  })}
                </div>
                {draftProfile.tetheringApps.includes('Other') && (
                  <input type="text" value={draftProfile.otherTetheringAppNote || ''} onChange={e => setDraftProfile(prev => ({ ...prev, otherTetheringAppNote: e.target.value }))} placeholder="Specify tethering app…"
                    style={{ width: '100%', marginTop: '8px', padding: '9px 12px', fontSize: '12px', color: '#17191a', background: 'rgba(23,25,26,0.04)', border: '1px solid rgba(23,25,26,0.14)', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                )}
              </div>
            </div>

            {/* Panel: Strengths & Constraints */}
            <div style={{ background: '#f8f7f4', border: '1px solid rgba(23,25,26,0.14)', borderTop: '2px solid #a35a4a', padding: '18px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <p className="font-mono text-[9px] tracking-[0.20em] uppercase" style={{ color: '#a35a4a' }}>Strengths & Constraints</p>
              <div>
                <label style={{ display: 'block', fontFamily: "'IBM Plex Mono', monospace", fontSize: '9px', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(23,25,26,0.40)', marginBottom: '5px' }}>Strengths</label>
                <textarea value={draftProfile.strengths} onChange={e => setDraftProfile(prev => ({ ...prev, strengths: e.target.value }))} placeholder="Describe what you do best…"
                  style={{ width: '100%', padding: '9px 12px', fontSize: '12px', color: '#17191a', background: 'rgba(23,25,26,0.04)', border: '1px solid rgba(23,25,26,0.14)', outline: 'none', fontFamily: 'inherit', minHeight: '60px', resize: 'vertical', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontFamily: "'IBM Plex Mono', monospace", fontSize: '9px', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(23,25,26,0.40)', marginBottom: '5px' }}>Struggles</label>
                <textarea value={draftProfile.struggles} onChange={e => setDraftProfile(prev => ({ ...prev, struggles: e.target.value }))} placeholder="Where do you feel friction or stall?"
                  style={{ width: '100%', padding: '9px 12px', fontSize: '12px', color: '#17191a', background: 'rgba(23,25,26,0.04)', border: '1px solid rgba(23,25,26,0.14)', outline: 'none', fontFamily: 'inherit', minHeight: '60px', resize: 'vertical', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontFamily: "'IBM Plex Mono', monospace", fontSize: '9px', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(23,25,26,0.40)', marginBottom: '5px' }}>Physical Constraints</label>
                <textarea value={draftProfile.physicalConstraints} onChange={e => setDraftProfile(prev => ({ ...prev, physicalConstraints: e.target.value }))} placeholder="e.g. height, stamina, crowd tolerance"
                  style={{ width: '100%', padding: '9px 12px', fontSize: '12px', color: '#17191a', background: 'rgba(23,25,26,0.04)', border: '1px solid rgba(23,25,26,0.14)', outline: 'none', fontFamily: 'inherit', minHeight: '55px', resize: 'vertical', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontFamily: "'IBM Plex Mono', monospace", fontSize: '9px', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(23,25,26,0.40)', marginBottom: '5px' }}>Access Reality</label>
                <textarea value={draftProfile.accessReality} onChange={e => setDraftProfile(prev => ({ ...prev, accessReality: e.target.value }))} placeholder="e.g. public stands, press access, sidelines"
                  style={{ width: '100%', padding: '9px 12px', fontSize: '12px', color: '#17191a', background: 'rgba(23,25,26,0.04)', border: '1px solid rgba(23,25,26,0.14)', outline: 'none', fontFamily: 'inherit', minHeight: '55px', resize: 'vertical', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontFamily: "'IBM Plex Mono', monospace", fontSize: '9px', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(23,25,26,0.40)', marginBottom: '5px' }}>Time Budget</label>
                <textarea value={draftProfile.timeBudget} onChange={e => setDraftProfile(prev => ({ ...prev, timeBudget: e.target.value }))} placeholder="Typical time available per assignment"
                  style={{ width: '100%', padding: '9px 12px', fontSize: '12px', color: '#17191a', background: 'rgba(23,25,26,0.04)', border: '1px solid rgba(23,25,26,0.14)', outline: 'none', fontFamily: 'inherit', minHeight: '55px', resize: 'vertical', boxSizing: 'border-box' }} />
              </div>
            </div>

            {/* Panel: Growth Goals — full width */}
            <div className="md:col-span-2" style={{ background: '#f8f7f4', border: '1px solid rgba(23,25,26,0.14)', borderTop: '2px solid #4b6b52', padding: '18px' }}>
              <p className="font-mono text-[9px] tracking-[0.20em] uppercase mb-3" style={{ color: '#4b6b52' }}>Growth Goals</p>
              <textarea value={draftProfile.growthGoals} onChange={e => setDraftProfile(prev => ({ ...prev, growthGoals: e.target.value }))} placeholder="What are you currently trying to master?"
                style={{ width: '100%', padding: '9px 12px', fontSize: '12px', color: '#17191a', background: 'rgba(23,25,26,0.04)', border: '1px solid rgba(23,25,26,0.14)', outline: 'none', fontFamily: 'inherit', minHeight: '80px', resize: 'vertical', boxSizing: 'border-box' }} />
            </div>
          </div>

          {/* Actions */}
          <div style={{ borderTop: '1px solid rgba(23,25,26,0.12)', paddingTop: '16px', marginTop: '18px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <button onClick={handleResetProfile} disabled={!isProfileDirty}
              className="font-mono text-[9px] tracking-[0.18em] uppercase"
              style={{ padding: '9px 16px', border: '1px solid rgba(23,25,26,0.18)', background: 'transparent', color: isProfileDirty ? 'rgba(23,25,26,0.55)' : 'rgba(23,25,26,0.25)', cursor: isProfileDirty ? 'pointer' : 'not-allowed' }}>Discard</button>
            <button onClick={handleApplyProfile} disabled={!isProfileDirty}
              className="font-mono text-[9px] tracking-[0.18em] uppercase"
              style={{ padding: '9px 20px', background: isProfileDirty ? '#17191a' : 'rgba(23,25,26,0.12)', color: isProfileDirty ? '#f4f3ef' : 'rgba(23,25,26,0.30)', border: 'none', cursor: isProfileDirty ? 'pointer' : 'not-allowed' }}
              onMouseEnter={e => { if (isProfileDirty) { e.currentTarget.style.background = '#c9a227'; e.currentTarget.style.color = '#17191a'; } }}
              onMouseLeave={e => { if (isProfileDirty) { e.currentTarget.style.background = '#17191a'; e.currentTarget.style.color = '#f4f3ef'; } }}>Apply Changes</button>
          </div>
        </div>
      )}



      {activeTab === 'askpro' && (
        <ErrorBoundary>
        <AskProPage
          profile={profile}
          assignmentGenre={derivedPrimaryGenre}
          assignmentTimeframe={'2hr'}
          assignmentInput={''}
          askProInput={askProInput}
          setAskProInput={setAskProInput}
          askProAnswer={askProAnswer}
          isGeneratingAskPro={isGeneratingAskPro}
          onAskProSubmit={handleAskProSubmit}
          onReset={() => { setAskProInput(''); setAskProAnswer(''); }}
          isFieldMode={isFieldMode}
          onFeedback={(note) => {
            setFeedbackLog(prev => [...prev, { id: crypto.randomUUID(), section: 'Ask a Pro', note, createdAt: new Date().toISOString() }]);
          }}
          activeTab={activeTab}
        />
        </ErrorBoundary>
      )}



      {activeTab === 'cfe' && (
        <div className="animate-in fade-in duration-700">
          {/* Screen header */}
          <div style={{ borderBottom: '1px solid rgba(23,25,26,0.14)', paddingBottom: '18px', marginBottom: '22px' }} className="flex items-end justify-between gap-6">
            <div>
              <p className="font-mono text-[9px] tracking-[0.24em] text-brand-ink/40 uppercase mb-[9px]">Plan / Calls for Entry</p>
              <h1 className="font-sans font-semibold text-[42px] leading-none tracking-[-0.02em] text-brand-ink">Bulletin Board</h1>
            </div>
            <button
              onClick={refreshBulletinEvents}
              disabled={isFetchingBulletin}
              className="font-mono text-[9px] tracking-[0.18em] uppercase transition-colors"
              style={{ padding: '9px 16px', border: '1px solid rgba(23,25,26,0.18)', background: 'transparent', color: isFetchingBulletin ? 'rgba(23,25,26,0.30)' : 'rgba(23,25,26,0.55)', cursor: isFetchingBulletin ? 'not-allowed' : 'pointer' }}
            >
              {isFetchingBulletin ? 'Fetching…' : '↻ Refresh'}
            </button>
          </div>

          {/* Filter pills */}
          <div style={{ background: '#f4f3ef', border: '1px solid rgba(23,25,26,0.14)', padding: '14px 16px', marginBottom: '18px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div className="flex flex-wrap gap-2">
              {(['All', 'Competition', 'Grant', 'Fellowship', 'Residency', 'Open Call', 'Call for Entry', 'Portfolio Review', 'Festival', 'Event'] as const).map(t => {
                const active = typeFilter === t;
                return (
                  <button key={t} onClick={() => setTypeFilter(t)}
                    className="font-mono text-[8px] tracking-[0.14em] uppercase transition-colors"
                    style={{ padding: '5px 9px', border: active ? '1px solid #17191a' : '1px solid rgba(23,25,26,0.18)', background: active ? '#17191a' : 'transparent', color: active ? '#f4f3ef' : 'rgba(23,25,26,0.55)', cursor: 'pointer' }}
                  >{t === 'All' ? 'All Types' : t}</button>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-3 items-center">
              <select value={genreFilter} onChange={e => setGenreFilter(e.target.value as Genre | 'All')}
                style={{ padding: '7px 10px', fontSize: '11px', border: '1px solid rgba(23,25,26,0.18)', background: 'transparent', color: '#17191a', outline: 'none', cursor: 'pointer' }}>
                <option value="All">All Genres</option>
                {genreOptions.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
              <select value={regionFilter} onChange={e => setRegionFilter(e.target.value as BulletinRegion | 'All')}
                style={{ padding: '7px 10px', fontSize: '11px', border: '1px solid rgba(23,25,26,0.18)', background: 'transparent', color: '#17191a', outline: 'none', cursor: 'pointer' }}>
                <option value="All">All Regions</option>
                {(['Global', 'US', 'Europe', 'Asia', 'Latin America', 'Africa', 'Other'] as const).map(r => <option key={r} value={r}>{r}</option>)}
              </select>
              <div className="flex gap-1">
                {(['All', 'high', 'medium', 'low'] as const).map(p => {
                  const active = priorityFilter === p;
                  return (
                    <button key={p} onClick={() => setPriorityFilter(p)}
                      className="font-mono text-[8px] tracking-[0.14em] uppercase transition-colors"
                      style={{ padding: '5px 9px', border: active ? '1px solid #17191a' : '1px solid rgba(23,25,26,0.18)', background: active ? '#17191a' : 'transparent', color: active ? '#f4f3ef' : 'rgba(23,25,26,0.55)', cursor: 'pointer' }}
                    >{p === 'All' ? 'Any Priority' : p}</button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Cards */}
          {isFetchingBulletin && aiBulletinItems.length === 0 ? (
            <p className="font-mono text-[9px] tracking-[0.18em] uppercase pulse-brass py-10" style={{ color: '#c9a227' }}>Fetching events…</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {primaryBoardItems.length === 0 ? (
                <div className="col-span-full" style={{ borderLeft: '2px solid rgba(23,25,26,0.14)', paddingLeft: '14px', padding: '14px' }}>
                  <p className="font-mono text-[9px] tracking-[0.18em] uppercase" style={{ color: 'rgba(23,25,26,0.40)' }}>No Opportunities Match</p>
                </div>
              ) : (
                primaryBoardItems.map(item => <BulletinCard key={item.id} item={item} updateBulletinStatus={updateBulletinStatus} />)
              )}
            </div>
          )}

          {/* Shortlist / Applied nav panels */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
            <button onClick={() => setActiveTab('cfe-considering')} className="flex items-center justify-between text-left transition-colors"
              style={{ padding: '16px', border: '1px solid rgba(201,162,39,0.35)', background: 'rgba(201,162,39,0.04)', cursor: 'pointer' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#c9a227'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(201,162,39,0.35)'; }}>
              <div>
                <p className="font-mono text-[8px] tracking-[0.18em] uppercase mb-1" style={{ color: '#c9a227' }}>Shortlist</p>
                <p style={{ fontSize: '15px', fontWeight: 500, color: '#17191a' }}>On the shortlist</p>
                <p className="font-mono text-[8px] tracking-[0.12em] uppercase mt-1" style={{ color: 'rgba(23,25,26,0.42)' }}>{consideringItems.length} under consideration</p>
              </div>
              <span style={{ color: '#c9a227', fontSize: '16px' }}>→</span>
            </button>
            <button onClick={() => setActiveTab('cfe-applied')} className="flex items-center justify-between text-left transition-colors"
              style={{ padding: '16px', border: '1px solid rgba(75,107,82,0.35)', background: 'rgba(75,107,82,0.04)', cursor: 'pointer' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#4b6b52'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(75,107,82,0.35)'; }}>
              <div>
                <p className="font-mono text-[8px] tracking-[0.18em] uppercase mb-1" style={{ color: '#4b6b52' }}>Applications</p>
                <p style={{ fontSize: '15px', fontWeight: 500, color: '#17191a' }}>Applications sent</p>
                <p className="font-mono text-[8px] tracking-[0.12em] uppercase mt-1" style={{ color: 'rgba(23,25,26,0.42)' }}>{appliedItems.length} submitted</p>
              </div>
              <span style={{ color: '#4b6b52', fontSize: '16px' }}>→</span>
            </button>
          </div>

          {archivedBoardItems.length > 0 && (
            <div style={{ borderTop: '1px solid rgba(23,25,26,0.12)', paddingTop: '18px', marginTop: '18px' }}>
              <p className="font-mono text-[9px] tracking-[0.18em] uppercase mb-4" style={{ color: 'rgba(23,25,26,0.35)' }}>Archived ({archivedBoardItems.length})</p>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {archivedBoardItems.map(item => <BulletinCard key={item.id} item={item} updateBulletinStatus={updateBulletinStatus} onRemove={removeBulletinItem} />)}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'cfe-considering' && (
        <div className="animate-in fade-in duration-700">
          <div style={{ borderBottom: '1px solid rgba(23,25,26,0.14)', paddingBottom: '18px', marginBottom: '22px' }} className="flex items-end justify-between gap-4">
            <div>
              <button onClick={() => setActiveTab('cfe')} className="font-mono text-[8px] tracking-[0.14em] uppercase mb-2 transition-colors" style={{ color: 'rgba(23,25,26,0.45)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>← Bulletin Board</button>
              <p className="font-mono text-[9px] tracking-[0.24em] text-brand-ink/40 uppercase mb-[9px]">Plan / Shortlist</p>
              <h1 className="font-sans font-semibold text-[42px] leading-none tracking-[-0.02em] text-brand-ink">Shortlist</h1>
            </div>
            <p className="font-mono text-[9px] tracking-[0.18em] uppercase" style={{ color: '#c9a227' }}>{consideringItems.length} items</p>
          </div>
          {consideringItems.length === 0 ? (
            <div style={{ borderLeft: '2px solid rgba(201,162,39,0.40)', paddingLeft: '14px', padding: '14px' }}>
              <p className="font-mono text-[9px] tracking-[0.18em] uppercase" style={{ color: 'rgba(23,25,26,0.40)' }}>Nothing on your shortlist yet</p>
              <p style={{ fontSize: '12px', color: 'rgba(23,25,26,0.55)', marginTop: '4px' }}>Mark events as Considering from the Bulletin Board.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {consideringItems.map(item => <BulletinCard key={item.id} item={item} updateBulletinStatus={updateBulletinStatus} onRemove={removeBulletinItem} />)}
            </div>
          )}
        </div>
      )}

      {activeTab === 'cfe-applied' && (
        <div className="animate-in fade-in duration-700">
          <div style={{ borderBottom: '1px solid rgba(23,25,26,0.14)', paddingBottom: '18px', marginBottom: '22px' }} className="flex items-end justify-between gap-4">
            <div>
              <button onClick={() => setActiveTab('cfe')} className="font-mono text-[8px] tracking-[0.14em] uppercase mb-2 transition-colors" style={{ color: 'rgba(23,25,26,0.45)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>← Bulletin Board</button>
              <p className="font-mono text-[9px] tracking-[0.24em] text-brand-ink/40 uppercase mb-[9px]">Plan / Applications</p>
              <h1 className="font-sans font-semibold text-[42px] leading-none tracking-[-0.02em] text-brand-ink">Applied</h1>
            </div>
            <p className="font-mono text-[9px] tracking-[0.18em] uppercase" style={{ color: '#4b6b52' }}>{appliedItems.length} submitted</p>
          </div>
          {appliedItems.length === 0 ? (
            <div style={{ borderLeft: '2px solid rgba(75,107,82,0.40)', paddingLeft: '14px', padding: '14px' }}>
              <p className="font-mono text-[9px] tracking-[0.18em] uppercase" style={{ color: 'rgba(23,25,26,0.40)' }}>No applications recorded yet</p>
              <p style={{ fontSize: '12px', color: 'rgba(23,25,26,0.55)', marginTop: '4px' }}>Mark events as Applied from the Bulletin Board.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {appliedItems.map(item => <BulletinCard key={item.id} item={item} updateBulletinStatus={updateBulletinStatus} onRemove={removeBulletinItem} />)}
            </div>
          )}
        </div>
      )}

      {activeTab === 'calendar' && (
        <CalendarView
          sessions={sessions}
          weekPlans={weekPlans}
          scoutLocations={scoutLocations}
          profile={profile}
          gear={gear}
          onSaveWeekPlan={(plan) => setWeekPlans(prev => [plan, ...prev])}
          onDeleteWeekPlan={(id) => setWeekPlans(prev => prev.filter(p => p.id !== id))}
          onGoToSession={(id) => {
            setActiveTab('dashboard');
            setHighlightedSessionId(id);
            setTimeout(() => {
              document.getElementById(`session-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 150);
            setTimeout(() => setHighlightedSessionId(null), 2500);
          }}
        />
      )}

      {activeTab === 'archive' && (
        <div className="animate-in fade-in duration-700">
          <div style={{ borderBottom: '1px solid rgba(23,25,26,0.14)', paddingBottom: '18px', marginBottom: '22px' }} className="flex items-end justify-between gap-6">
            <div>
              <p className="font-mono text-[9px] tracking-[0.24em] text-brand-ink/40 uppercase mb-[9px]">You / Closed Work</p>
              <h1 className="font-sans font-semibold text-[42px] leading-none tracking-[-0.02em] text-brand-ink">Archive</h1>
            </div>
            <p className="font-mono text-[9px] tracking-[0.18em] uppercase" style={{ color: 'rgba(23,25,26,0.40)' }}>{sessions.filter(s => s.status === 'archived').length} sessions</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {sessions.filter(s => s.status === 'archived').length === 0 ? (
              <div className="col-span-full" style={{ borderLeft: '2px solid rgba(23,25,26,0.14)', padding: '14px' }}>
                <p className="font-mono text-[9px] tracking-[0.18em] uppercase" style={{ color: 'rgba(23,25,26,0.40)' }}>No Archived Sessions</p>
              </div>
            ) : (
              sessions.filter(s => s.status === 'archived').map(session => (
                <SessionCard key={session.id} session={session} onUpdateStatus={updateStatus} onUpdate={updateSession} onDelete={deleteSession} />
              ))
            )}
          </div>
        </div>
      )}

      {activeTab === 'gear' && (
        <div className="animate-in fade-in duration-700">
          <div style={{ borderBottom: '1px solid rgba(23,25,26,0.14)', paddingBottom: '18px', marginBottom: '22px' }} className="flex items-end justify-between gap-6">
            <div>
              <p className="font-mono text-[9px] tracking-[0.24em] text-brand-ink/40 uppercase mb-[9px]">You / Kit</p>
              <h1 className="font-sans font-semibold text-[42px] leading-none tracking-[-0.02em] text-brand-ink">Gear Locker</h1>
            </div>
            <p className="font-mono text-[9px] tracking-[0.18em] uppercase" style={{ color: 'rgba(23,25,26,0.40)' }}>{gear.length} items</p>
          </div>

          {/* Register form */}
          <div style={{ background: '#f8f7f4', border: '1px solid rgba(23,25,26,0.14)', padding: '20px', marginBottom: '18px' }}>
            <p className="font-mono text-[9px] tracking-[0.18em] uppercase mb-4" style={{ color: 'rgba(23,25,26,0.40)' }}>Register Equipment</p>
            <form onSubmit={addGearItem}>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
                <input name="gearName" placeholder="Name (e.g. Sony A9 III)" required
                  style={{ width: '100%', padding: '9px 12px', fontSize: '12px', color: '#17191a', background: 'rgba(23,25,26,0.04)', border: '1px solid rgba(23,25,26,0.14)', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                <select name="category" required
                  style={{ width: '100%', padding: '9px 12px', fontSize: '12px', color: '#17191a', background: 'rgba(23,25,26,0.04)', border: '1px solid rgba(23,25,26,0.14)', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}>
                  <option value="Body">Body</option>
                  <option value="Lens">Lens</option>
                  <option value="Flash">Flash</option>
                  <option value="Modifier">Modifier</option>
                  <option value="Support">Support</option>
                  <option value="Accessory">Accessory</option>
                </select>
                <input name="tags" placeholder="Tags (comma separated)"
                  style={{ width: '100%', padding: '9px 12px', fontSize: '12px', color: '#17191a', background: 'rgba(23,25,26,0.04)', border: '1px solid rgba(23,25,26,0.14)', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 12px', border: '1px solid rgba(23,25,26,0.14)', background: 'rgba(23,25,26,0.04)' }}>
                  <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '9px', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(23,25,26,0.50)' }}>Available</span>
                  <input name="available" type="checkbox" defaultChecked style={{ width: '14px', height: '14px', accentColor: '#c9a227' }} />
                </div>
              </div>
              <div className="flex gap-3">
                <textarea name="details" placeholder="Details / specs (e.g. 24-70mm f/2.8, stabilized)"
                  style={{ flex: 1, padding: '9px 12px', fontSize: '12px', color: '#17191a', background: 'rgba(23,25,26,0.04)', border: '1px solid rgba(23,25,26,0.14)', outline: 'none', fontFamily: 'inherit', minHeight: '60px', resize: 'vertical' }} />
                <button type="submit"
                  style={{ padding: '9px 20px', background: '#17191a', color: '#f4f3ef', border: 'none', fontFamily: "'IBM Plex Mono', monospace", fontSize: '9px', letterSpacing: '0.18em', textTransform: 'uppercase', cursor: 'pointer', flexShrink: 0 }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#c9a227'; e.currentTarget.style.color = '#17191a'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = '#17191a'; e.currentTarget.style.color = '#f4f3ef'; }}
                >+ Add</button>
              </div>
            </form>
          </div>

          {/* Gear cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {gear.length === 0 ? (
              <div className="col-span-full" style={{ borderLeft: '2px solid rgba(23,25,26,0.14)', padding: '14px' }}>
                <p className="font-mono text-[9px] tracking-[0.18em] uppercase" style={{ color: 'rgba(23,25,26,0.40)' }}>Locker Empty</p>
              </div>
            ) : (
              gear.map(item => (
                <div key={item.id} style={{ background: '#f8f7f4', border: '1px solid rgba(23,25,26,0.14)', padding: '16px', display: 'flex', flexDirection: 'column', opacity: item.available ? 1 : 0.55 }}>
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <span className="font-mono text-[8px] tracking-[0.14em] uppercase" style={{ color: 'rgba(23,25,26,0.40)', display: 'block', marginBottom: '4px' }}>{item.category}</span>
                      <p style={{ fontSize: '14px', fontWeight: 500, color: '#17191a', lineHeight: 1.3 }}>{item.name}</p>
                    </div>
                    <button onClick={() => deleteGearItem(item.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(23,25,26,0.25)', padding: '2px', fontSize: '11px' }}
                      onMouseEnter={e => (e.currentTarget.style.color = '#a35a4a')}
                      onMouseLeave={e => (e.currentTarget.style.color = 'rgba(23,25,26,0.25)')}>×</button>
                  </div>
                  {item.details && <p style={{ fontSize: '11px', color: 'rgba(23,25,26,0.60)', lineHeight: 1.55, marginBottom: '10px', flex: 1 }}>{item.details}</p>}
                  {item.tags && item.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-3">
                      {item.tags.map(tag => (
                        <span key={tag} className="font-mono text-[8px] tracking-[0.10em] uppercase" style={{ padding: '3px 6px', border: '1px solid rgba(23,25,26,0.14)', color: 'rgba(23,25,26,0.50)' }}>#{tag}</span>
                      ))}
                    </div>
                  )}
                  <div style={{ borderTop: '1px solid rgba(23,25,26,0.08)', paddingTop: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className="font-mono text-[8px] tracking-[0.14em] uppercase" style={{ color: item.available ? '#4b6b52' : '#a35a4a' }}>{item.available ? 'Available' : 'Out'}</span>
                    <button onClick={() => toggleGearAvailability(item.id)} className="font-mono text-[8px] tracking-[0.14em] uppercase transition-colors" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(23,25,26,0.40)' }}
                      onMouseEnter={e => (e.currentTarget.style.color = '#17191a')}
                      onMouseLeave={e => (e.currentTarget.style.color = 'rgba(23,25,26,0.40)')}>Toggle</button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {activeTab === 'scout' && (
        <ErrorBoundary>
          <LocationScoutView
            locations={scoutLocations}
            sessions={sessions}
            onAdd={addScoutLocation}
            onUpdate={updateScoutLocation}
            onDelete={deleteScoutLocation}
            onToggleFavorite={toggleScoutFavorite}
            onUseForAssignment={useLocationForAssignment}
          />
        </ErrorBoundary>
      )}

      {activeTab === 'today' && (
        <ErrorBoundary>
          <TodayView
            submissions={submissions}
            skillProgress={skillProgress}
            onSubmit={handleMissionSubmit}
          />
        </ErrorBoundary>
      )}

      {activeTab === 'skills' && (
        <ErrorBoundary>
          <SkillTreeView
            skillProgress={skillProgress}
            totalSubmissions={submissions.length}
            submissions={submissions}
          />
        </ErrorBoundary>
      )}

      {activeTab === 'history' && (
        <ErrorBoundary>
          <MissionHistoryView submissions={submissions} />
        </ErrorBoundary>
      )}
    </Layout>
  );
};

export default App;