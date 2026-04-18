import React, { useState, useEffect, useMemo, useRef } from 'react';
import Layout from './components/Layout';
import CalendarView from './components/CalendarView';
import SessionCard from './components/SessionCard';
import SessionSelector from './components/SessionSelector';
import LocationAutocomplete from './components/LocationAutocomplete';
import { Session, SessionStatus, Genre, GearItem, GearCategory, CfeBulletinItem, CfeType, BulletinStatus, BulletinRegion, BulletinPriority, PhotoQuote, JournalEntry, JournalImage, PhotographerProfile, EditingApp, TetheringApp, FeedbackEntry, AssignmentTimeframe, WeekPlan } from './types';
import { generateWeeklyPlan, generateAssignmentGuide, askProQuestion, fetchBulletinEvents } from './services/geminiService';
import { createCalendarEventForSession } from './services/calendarService';
import { GENRE_ICONS } from './constants';
import { PHOTO_QUOTES } from './quotes';
import { useAuth } from './AuthContext';
import LoginScreen from './LoginScreen';
import { useFirestore } from './hooks/useFirestore';
import { storage } from './firebase';
import { ref as storageRef, uploadString, getDownloadURL, deleteObject } from 'firebase/storage';

// Helper to determine which genres are currently active for the guidance system
function getActiveGenres(profile: PhotographerProfile, assignmentGenre: Genre | 'All'): Genre[] {
  if (assignmentGenre !== 'All') {
    // If user explicitly picked a genre for this assignment, use only that
    return [assignmentGenre];
  }

  // Otherwise, use only what the user selected in their applied Profile
  if (profile.primaryGenres && profile.primaryGenres.length > 0) {
    return profile.primaryGenres;
  }

  // No genres selected anywhere
  return [];
}

interface ProcessingContext {
  profile: PhotographerProfile;
  assignmentGenre: Genre | 'All';
  assignmentTimeframe: AssignmentTimeframe;
  assignmentInput: string;
}

interface ProcessingGuideBox {
  genre: Genre;
  title: string;
  bullets: string[];
}

function buildProcessingGuideBoxes(ctx: ProcessingContext): ProcessingGuideBox[] {
  const { profile, assignmentGenre, assignmentTimeframe, assignmentInput } = ctx;
  const activeGenres = getActiveGenres(profile, assignmentGenre);

  const boxes: ProcessingGuideBox[] = [];

  const lower = assignmentInput.toLowerCase();
  const isTight = assignmentTimeframe === '30min' || assignmentTimeframe === '1hr';
  const isLong = assignmentTimeframe === '4hr' || assignmentTimeframe === 'fullday';

  const addCommonOverlays = (bullets: string[]) => {
    if (isTight) {
      bullets.unshift(
        'On a tight deadline, do a ruthless first pass: remove only obvious technical misses and get to a usable edit quickly.'
      );
    } else if (isLong) {
      bullets.push(
        'With more time, plan a second pass focused on consistency, sequence order, and a tight final story.'
      );
    }
    if (lower.includes('client') || lower.includes('editor') || lower.includes('deadline')) {
      bullets.push(
        'Cull toward a concise, high-impact selection; send fewer, stronger images your client can review quickly instead of a huge dump.'
      );
    }
    if (lower.includes('social') || lower.includes('reel') || lower.includes('stories')) {
      bullets.push(
        'Tag frames that crop well to vertical and think in sequences of 3–5 images that can run as a story or reel.'
      );
    }
  };

  for (const genre of activeGenres) {
    const bullets: string[] = [];

    // SPORTS / PJ / EVENT
    if (genre === 'Sports' || genre === 'Photojournalism' || genre === 'Event') {
      bullets.push(
        'When shooting, ride higher shutter speeds and continuous AF; shoot short controlled bursts around peak action instead of spraying entire plays.',
        'Prioritize peak action and clean faces; reject frames with soft focus, blocked players, or confusing overlaps first.',
        'From each burst, keep only the single frame that best tells the story; delete near-duplicates with weaker body language.',
        'In processing, add contrast and clarity to emphasize impact, keeping skin tones and whites under control so uniforms and highlights don’t clip.'
      );
    }
    // STREET / DOCUMENTARY / TRAVEL
    else if (genre === 'Street' || genre === 'Documentary' || genre === 'Travel') {
      bullets.push(
        'On the street, work promising scenes in layers and give yourself multiple passes at a background rather than chasing random one-offs.',
        'Cull for gesture, layering, and tension in the frame; drop images where the moment has not fully "landed."',
        'Group similar scenes and keep only the strongest read from each variation to avoid repetitive sequences.',
        'In processing, use subtle contrast and local dodging/burning to guide the eye, keeping color and grain realistic so the scene still feels honest.'
      );
    }
    // LANDSCAPE / ARCHITECTURE / ASTRO
    else if (genre === 'Landscape' || genre === 'Architecture' || genre === 'Astro') {
      bullets.push(
        'On location, lock in a strong composition on a tripod and wait for micro-changes in light, clouds, or traffic rather than constantly reframing.',
        'Zoom in to check micro-sharpness and fine detail; reject tripod-induced near-duplicates that are even slightly soft.',
        'Compare similar compositions side by side and keep the frame with the best light and cleanest edges.',
        'In processing, focus on clean tonal separations and edge contrast; avoid heavy halos or overcooked HDR that breaks realism.'
      );
    }
    // PORTRAIT / WEDDING / FASHION
    else if (genre === 'Portrait' || genre === 'Wedding' || genre === 'Fashion') {
      bullets.push(
        'While shooting, direct clearly and shoot short bursts through expressions so you can later pick the most flattering micro-moment.',
        'Cull first for expression and connection; reject blinks, awkward mouth shapes, and bad posture even if the light is good.',
        'In group frames, only keep images where all key subjects look good; one person blinking is enough to reject.',
        'In processing, keep skin tones natural; use gentle dodging/burning and cleanup instead of heavy blurring so the subject still feels real.'
      );
    } else {
      // Generic for other genres
      bullets.push(
        'On every shoot, aim to alternate wide, medium, and tight frames so your edit has built-in variety.',
        'Cull in two passes: first for obvious technical rejects, then for story and variety so the final set feels intentional.',
        'In processing, build a consistent baseline look (contrast, color, white balance) before doing heavier local adjustments.'
      );
    }

    addCommonOverlays(bullets);

    boxes.push({
      genre,
      title: `${genre} Processing Guide`,
      bullets: bullets.slice(0, 10),
    });
  }

  // Fallback when no genres are selected
  if (boxes.length === 0) {
    const bullets: string[] = [
      'On every shoot, alternate wide, medium, and tight frames so your edit has built-in variety.',
      'Cull in two passes: first technical rejects, then story and variety for an intentional final set.',
      'Build a consistent baseline look across the set before moving to hero-frame adjustments.'
    ];
    addCommonOverlays(bullets);
    boxes.push({
      genre: 'Other',
      title: 'General Processing Guide',
      bullets,
    });
  }

  return boxes;
}

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

  return (
    <div className="animate-in fade-in duration-700">
      <header className="mb-10">
        <h2 className="text-4xl font-display text-brand-black tracking-wide uppercase">Ask a Pro</h2>
        {!props.isFieldMode && (
          <p className="text-brand-gray mt-2 text-sm font-medium">Ask questions and get answers from a photographer who works in your genres.</p>
        )}
      </header>

      <div className={containerClass}>
        <div className="bg-brand-black rounded-lg p-8 text-brand-white shadow-xl border border-white/5">
          <div className="space-y-6">
            <div>
              <label className="text-xs font-medium text-brand-rose/80 block mb-3">
                Your question
              </label>
              <textarea
                ref={askProInputRef}
                className="w-full bg-white/5 border border-white/10 rounded-md px-5 py-4 text-sm focus:ring-1 focus:ring-brand-blue outline-none transition-all placeholder:text-white/20 min-h-[200px] resize-none"
                value={props.askProInput}
                onChange={(e) => props.setAskProInput(e.target.value)}
                placeholder={askProPlaceholder}
              />
            </div>
            
            <div className="flex justify-end">
              <button
                onClick={props.onAskProSubmit}
                disabled={props.isGeneratingAskPro || !props.askProInput.trim()}
                className={`flex items-center justify-center gap-3 rounded-md text-sm font-semibold transition-all shadow-lg ${askButtonClass} ${
                  props.isGeneratingAskPro || !props.askProInput.trim()
                    ? 'bg-brand-gray/20 text-brand-gray cursor-not-allowed'
                    : 'bg-brand-blue text-white hover:bg-[#7a93a0] active:scale-95'
                }`}
              >
                {props.isGeneratingAskPro ? (
                  <><i className="fa-solid fa-circle-notch animate-spin"></i> Consulting...</>
                ) : (
                  <><i className="fa-solid fa-paper-plane"></i> Ask the Pro</>
                )}
              </button>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-brand-black/5 shadow-sm overflow-hidden flex flex-col h-full">
          <div className="bg-brand-black/5 px-8 py-5 border-b border-brand-black/5 flex items-center justify-between">
            <span className="text-xs font-medium text-brand-black/40">The Pro's Response</span>
            <i className="fa-solid fa-pen-nib text-brand-rose/40"></i>
          </div>
          <div className="p-10 flex-1 overflow-y-auto custom-scrollbar min-h-[300px]">
            {props.askProAnswer ? (
              <div className="space-y-4">
                <div className="text-sm text-brand-black leading-relaxed whitespace-pre-wrap font-medium">
                  {visibleAnswer}
                </div>
                {props.isFieldMode && isLong && (
                  <button
                    type="button"
                    className="text-xs font-medium text-brand-rose underline underline-offset-4"
                    onClick={() => setShowFullAskProAnswer(v => !v)}
                  >
                    {showFullAskProAnswer ? 'Show less' : 'Show full answer'}
                  </button>
                )}
                <FeedbackFlag section="Ask a Pro" onSubmit={props.onFeedback} />
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center opacity-30 space-y-4 py-20">
                <i className="fa-solid fa-comment-dots text-4xl"></i>
                <p className="text-sm text-brand-gray/50">Your answer from the pro will appear here.</p>
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

  return (
    <div className={`bg-white rounded-lg border border-brand-black/5 shadow-sm overflow-hidden flex flex-col group hover:shadow-md transition-all duration-500 ${isArchived ? 'opacity-80 grayscale-[0.4]' : ''}`}>
      <div className="bg-brand-black p-6 text-brand-white flex items-center justify-between">
        <div>
          <div className="flex gap-2 items-center mb-2">
            <span className="text-xs font-medium bg-white/10 px-2 py-0.5 rounded text-brand-rose">
              {item.type}
            </span>
            <span className={`text-xs font-medium ${priorityConfig[item.priority].color}`}>
              <i className="fa-solid fa-bolt mr-1"></i> {item.priority}
            </span>
          </div>
          <h3 className="text-xl font-bold leading-snug">{item.name}</h3>
        </div>
        <i className="fa-solid fa-newspaper text-brand-rose/40 text-xl"></i>
      </div>
      
      <div className="p-8 flex-1 flex flex-col">
        <div className="flex justify-between items-start mb-4">
          {item.organizer && (
            <p className="text-xs text-brand-gray">
              Organizer: <span className="text-brand-black font-medium">{item.organizer}</span>
            </p>
          )}
          <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${statusConfig[item.status].color}`}>
            {statusConfig[item.status].label}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="bg-brand-white p-3 rounded-md border border-brand-black/5">
            <p className="text-xs text-brand-gray/70 mb-1">Deadline</p>
            <p className={`text-sm font-semibold ${item.deadline === 'Rolling' ? 'text-brand-blue' : 'text-brand-rose'}`}>
              {item.deadline || 'TBA'}
            </p>
          </div>
          <div className="bg-brand-white p-3 rounded-md border border-brand-black/5">
            <p className="text-xs text-brand-gray/70 mb-1">Region / location</p>
            <p className="text-sm font-semibold text-brand-black truncate">
              {item.region} {item.location && `• ${item.location}`}
            </p>
          </div>
        </div>

        <div className="bg-brand-white p-3 rounded-md border border-brand-black/5 mb-6">
          <p className="text-xs text-brand-gray/70 mb-1">Entry fee</p>
          <p className="text-sm font-semibold text-brand-black">
            {item.fee || 'Free'}
          </p>
        </div>

        {item.genres && (
          <div className="flex flex-wrap gap-1.5 mb-6">
            {item.genres.map(g => (
              <span key={g} className="text-xs px-2 py-1 bg-brand-blue/5 text-brand-blue font-medium rounded-md border border-brand-blue/10">
                {g}
              </span>
            ))}
          </div>
        )}

        {item.blurb && (
          <p className="text-sm text-brand-gray leading-relaxed mb-8 flex-1 italic">
            {item.blurb}
          </p>
        )}

        <div className="mt-auto space-y-4 pt-6 border-t border-brand-black/5">
          <div className="flex gap-2">
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 bg-brand-black text-white hover:bg-zinc-700 text-sm font-semibold rounded-md py-4 text-center transition-all active:scale-95 shadow-lg flex items-center justify-center gap-2"
            >
              View details <i className="fa-solid fa-arrow-up-right-from-square text-xs"></i>
            </a>
            {!isArchived ? (
              <button
                onClick={() => updateBulletinStatus(item.id, 'archived')}
                className="px-5 bg-brand-white border border-brand-black/5 hover:bg-brand-rose/5 text-brand-gray hover:text-brand-rose transition-all rounded-md"
                title="Archive"
              >
                <i className="fa-solid fa-box-archive"></i>
              </button>
            ) : (
              <button
                onClick={() => updateBulletinStatus(item.id, 'unmarked')}
                className="px-5 bg-brand-white border border-brand-black/5 hover:bg-brand-blue/5 text-brand-gray hover:text-brand-blue transition-all rounded-md"
                title="Restore"
              >
                <i className="fa-solid fa-box-open"></i>
              </button>
            )}
            {onRemove && (
              <button
                onClick={() => onRemove(item.id)}
                className="px-5 bg-brand-white border border-brand-black/5 hover:bg-brand-rose/5 text-brand-gray hover:text-brand-rose transition-all rounded-md"
                title="Remove"
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            )}
          </div>

          {!isArchived && (
            <div className="flex gap-2">
              <button
                onClick={() => updateBulletinStatus(item.id, 'considering')}
                className={`flex-1 text-xs font-medium py-2 rounded-md border transition-all ${
                  item.status === 'considering'
                    ? 'bg-amber-100 text-amber-700 border-amber-200'
                    : 'bg-white text-brand-gray border-brand-black/5 hover:border-amber-200'
                }`}
              >
                Considering
              </button>
              <button
                onClick={() => updateBulletinStatus(item.id, 'applied')}
                className={`flex-1 text-xs font-medium py-2 rounded-md border transition-all ${
                  item.status === 'applied'
                    ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                    : 'bg-white text-brand-gray border-brand-black/5 hover:border-emerald-200'
                }`}
              >
                Applied
              </button>
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
      '- Answer as a seasoned professional photographer who actively works in the FOCUS GENRE FOR THIS QUESTION.',
      '- Use a relaxed, conversational tone — like you are talking to a friend or mentee. It should read like a normal human / AI chat reply.',
      '- Write in the first person (“I” / “you”), avoid formal or academic language.',
      '- Do NOT structure the answer as a numbered plan, checklist, or with section headers (no “Step 1/Step 2”, no “Overview/Plan/Deliverables” etc.).',
      '- Instead, write 3–8 short paragraphs of flowing text. Use bullets only if they genuinely make something clearer, not as a default.',
      '- You can cover shooting approach, culling decisions, processing choices, and client/editor communication if relevant, but keep the flow conversational.',
    ].join('\n')
  );

  return pieces.join('\n\n');
}

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
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isFieldMode, setIsFieldMode] = useState<boolean>(false);
  const [feedbackLog, setFeedbackLog] = useState<FeedbackEntry[]>(() =>
    loadFromStorage<FeedbackEntry[]>('pingstudio_feedback', [])
  );
  const [lastAssignmentInput, setLastAssignmentInput] = useState<string>('');
  const [showFullAssignmentOutput, setShowFullAssignmentOutput] = useState(false);
  
  const assignmentInputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isFieldMode && activeTab === 'assignment') {
      assignmentInputRef.current?.focus();
      assignmentInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [isFieldMode, activeTab]);

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
  const [dashboardDateSort, setDashboardDateSort] = useState<'newest' | 'oldest'>('newest');

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

  // Journal Entries State
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>(() =>
    loadFromStorage<JournalEntry[]>('pingstudio_journal', [])
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

  const [plannerInput, setPlannerInput] = useState('');
  const [plannerOutput, setPlannerOutput] = useState('');
  const [isGeneratingPlan, setIsGeneratingPlan] = useState(false);
  const [selectedPlannerSessionIds, setSelectedPlannerSessionIds] = useState<string[]>([]);
  const [plannerCopied, setPlannerCopied] = useState(false);
  const [plannerAttachId, setPlannerAttachId] = useState('');
  const [plannerAttached, setPlannerAttached] = useState(false);

  const [assignmentInput, setAssignmentInput] = useState('');
  const [assignmentOutput, setAssignmentOutput] = useState('');
  const [isGeneratingAssignment, setIsGeneratingAssignment] = useState(false);
  const [selectedAssignmentSessionIds, setSelectedAssignmentSessionIds] = useState<string[]>([]);
  const [assignmentCopied, setAssignmentCopied] = useState(false);
  const [assignmentAttachId, setAssignmentAttachId] = useState('');
  const [assignmentAttached, setAssignmentAttached] = useState(false);
  const [includeAttachedStrategy, setIncludeAttachedStrategy] = useState(false);
  const [assignmentTimeframe, setAssignmentTimeframe] = useState<AssignmentTimeframe>('2hr');

  // Derived Genre Focus based on selected sessions
  const derivedAssignmentGenre = useMemo((): Genre | 'All' => {
    const selected = sessions.filter((s) => selectedAssignmentSessionIds.includes(s.id));
    const genres = new Set<Genre>();
    for (const s of selected) {
      if (s.genre) {
        s.genre.forEach(g => genres.add(g));
      }
    }
    if (genres.size === 1) {
      return Array.from(genres)[0];
    }
    return 'All';
  }, [selectedAssignmentSessionIds, sessions]);

  // Journal Search State
  const [journalSearch, setJournalSearch] = useState('');

  // Journal Form State
  const [journalForm, setJournalForm] = useState<{
    date: string;
    sessionIds: string[];
    title: string;
    notes: string;
    tags: string;
    resultRating: string;
    processRating: string;
    images: JournalImage[];
  }>({
    date: new Date().toISOString().split('T')[0],
    sessionIds: [],
    title: '',
    notes: '',
    tags: '',
    resultRating: '5',
    processRating: '5',
    images: []
  });

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
      if (data.journal) {
        setJournalEntries(data.journal);
      }
      if (data.profile)          setProfile(data.profile);
      if (data.bulletinState)    setBulletinState(data.bulletinState);
      if (data.bulletinItems)    setAiBulletinItems(data.bulletinItems);
      if (data.bulletinFetchedAt !== undefined) setBulletinFetchedAt(data.bulletinFetchedAt);
      if (data.feedback)         setFeedbackLog(data.feedback);
      if (data.weekPlans)        setWeekPlans(data.weekPlans);
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

  // Persist journal entries (localStorage + Firestore)
  // Images are now Firebase Storage URLs (not base64), so they're safe to store in Firestore.
  useEffect(() => {
    localStorage.setItem('pingstudio_journal', JSON.stringify(journalEntries));
    saveUserData({ journal: journalEntries });
  }, [journalEntries]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const addSession = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const date = formData.get('date') as string;
    const location = formData.get('location') as string;
    const genre = formData.get('genre') as Genre;
    const notes = formData.get('notes') as string;
    const title = (formData.get('title') as string).trim();

    const name = `${date}_${location.replace(/\s+/g, '_')}_${genre}`;

    const newSession: Session = {
      id: Date.now().toString(),
      name,
      title: title || undefined,
      date,
      location,
      genre: [genre],
      status: 'capturing',
      notes: notes || ''
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
    
    return "ATTACHED SESSION CONTEXT:\n" + selected.map(s => 
      `- ${s.date} | ${s.location} | ${s.genre.join(', ')} | Status: ${s.status}${s.notes ? ` | Notes: ${s.notes}` : ''}`
    ).join('\n');
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

  const toggleSessionInPlanner = (id: string) => {
    setSelectedPlannerSessionIds(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const toggleSessionInAssignment = (id: string) => {
    setSelectedAssignmentSessionIds(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleGeneratePlan = async () => {
    if (!plannerInput.trim() && selectedPlannerSessionIds.length === 0) return;
    setIsGeneratingPlan(true);
    
    const profileContext = formatProfileForContext(profile);
    const gearContext = formatGearForContext();
    const sessionContext = formatSessionsForContext(selectedPlannerSessionIds);

    const pieces: string[] = [];
    if (profileContext.trim()) pieces.push(profileContext);
    if (gearContext.trim()) pieces.push(gearContext);
    if (sessionContext.trim()) pieces.push(sessionContext);
    if (plannerInput.trim()) {
      pieces.push("PLANNER INSTRUCTIONS:\n" + plannerInput.trim());
    }

    const combinedPrompt = pieces.join("\n\n");
    
    const finalPrompt = combinedPrompt + "\n\n" +
      "You are an expert professional photographer and assignment editor. " +
      "CRITICAL: Use the PHOTOGRAPHER PROFILE provided above to tailor the assignment strategy to this specific individual's " +
      "strengths, software workflow, growth goals, physical constraints, and access level. Adjust the tone and " +
      "risk level of your suggestions based on their Risk Profile. " +
      "Using the available gear and attached session context above, create a detailed ASSIGNMENT STRATEGY for the upcoming work. " +
      "CRITICAL: Do not use the words 'week' or 'weekly' in your response. " +
      "Refer to it solely as an 'assignment strategy', 'assignment plan', or 'shooting plan'. " +
      "For each distinct assignment, include sections that cover:\n" +
      "1) Objective: What success looks like.\n" +
      "2) Shot List & Examples: Specific shot ideas suited to the focus genre.\n" +
      "3) Gear Recommendations: Use available gear list.\n" +
      "4) Time of Day: Best windows for lighting.\n" +
      "5) Camera Settings: Suggested technical starting points.\n" +
      "6) Workflow Tips: Software-specific advice (refer to Profile).\n" +
      "7) Additional Gear Suggestions: Treatments for missing kit.\n\n" +
      "Write the plan as a clear, practical document I can follow in the field.";

    const result = await generateWeeklyPlan(finalPrompt);
    setPlannerOutput(result);
    setIsGeneratingPlan(false);
  };

  const handleGenerateAssignment = async () => {
    if (!assignmentInput.trim() && selectedAssignmentSessionIds.length === 0) return;
    setIsGeneratingAssignment(true);
    setLastAssignmentInput(assignmentInput);
    setShowFullAssignmentOutput(false);

    const timeframeLabel = {
      '30min': '30 minutes',
      '1hr': '1 hour',
      '2hr': '2 hours',
      '4hr': '4 hours',
      'fullday': 'a full day (8+ hours)',
    }[assignmentTimeframe];

    const genreLabel = derivedAssignmentGenre === 'All' ? 'General / All Genres' : derivedAssignmentGenre;
    const context = formatSessionsForContext(selectedAssignmentSessionIds);
    const profileContext = formatProfileForContext(profile);
    
    const pieces: string[] = [];
    if (profileContext.trim()) pieces.push(profileContext);
    if (context.trim()) pieces.push(context);
    if (assignmentInput.trim()) {
      pieces.push('ASSIGNMENT DETAILS:\n' + assignmentInput.trim());
    }
    if (includeAttachedStrategy) {
      const strategies = sessions
        .filter(s => selectedAssignmentSessionIds.includes(s.id) && s.strategy)
        .map(s => {
          const label = s.title || s.location;
          return `--- Strategy for ${label} ---\n${s.strategy}`;
        });
      if (strategies.length > 0) {
        pieces.push('ATTACHED ASSIGNMENT STRATEGY (use this as the foundation and adapt it into an execution-ready day-of plan):\n\n' + strategies.join('\n\n'));
      }
    }
    pieces.push(`ASSIGNMENT GENRE FOCUS: ${genreLabel.toUpperCase()}`);
    pieces.push(`TIME WINDOW FOR THIS ASSIGNMENT: ${timeframeLabel.toUpperCase()}`);

    const combinedPrompt = pieces.join('\n\n');

    const finalPrompt = combinedPrompt + "\n\n" +
      "As an expert professional photographer and assignment editor, provide an ACCELERATED DELIVERY STRATEGY. " +
      "Tailor all recommendations (shot list, gear choices, time of day, camera settings, workflow tips) to the ASSIGNMENT GENRE FOCUS and the user's software workflow in their Profile. " +
      "If it is a specific genre, make your advice strongly grounded in that genre’s best practices. " +
      "Design the plan so it can realistically be executed within the specified time window. " +
      "Include sections for: \n" +
      "1) Rapid Shot List: Essential frames.\n" +
      "2) Accelerated Workflow: Profile-compatible backup and culling steps.\n" +
      "3) Delivery Milestones: Pacing targets.\n" +
      "4) RED ZONE Checklist: Critical gear and safety checks.";

    const result = await generateAssignmentGuide(finalPrompt);
    setAssignmentOutput(result);
    setIsGeneratingAssignment(false);
  };

  const handleAskProSubmit = async () => {
    if (!askProInput.trim()) return;
    setIsGeneratingAskPro(true);
    try {
      const prompt = buildAskProPrompt({
        profile,
        assignmentGenre: derivedAssignmentGenre,
        assignmentTimeframe,
        assignmentInput,
        question: askProInput,
      });
      const answer = await askProQuestion(prompt);
      setAskProAnswer(answer);
    } finally {
      setIsGeneratingAskPro(false);
    }
  };

  const handleCreateJournalEntry = (e: React.FormEvent) => {
    e.preventDefault();
    const tagsArr = journalForm.tags.split(',').map(t => t.trim()).filter(t => t !== '');
    
    const newEntry: JournalEntry = {
      id: Date.now().toString(),
      date: journalForm.date,
      sessionIds: journalForm.sessionIds,
      title: journalForm.title,
      notes: journalForm.notes,
      tags: tagsArr,
      resultRating: parseInt(journalForm.resultRating, 10) || 5,
      processRating: parseInt(journalForm.processRating, 10) || 5,
      images: journalForm.images
    };

    setJournalEntries(prev => [newEntry, ...prev]);
    
    setJournalForm({
      date: new Date().toISOString().split('T')[0],
      sessionIds: [],
      title: '',
      notes: '',
      tags: '',
      resultRating: '5',
      processRating: '5',
      images: []
    });
  };

  // Compress an image file to a max dimension of 800px at 70% JPEG quality
  const compressImage = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onloadend = () => {
        const img = new Image();
        img.onerror = reject;
        img.onload = () => {
          const MAX = 800;
          let { width, height } = img;
          if (width > MAX || height > MAX) {
            if (width > height) { height = Math.round((height * MAX) / width); width = MAX; }
            else { width = Math.round((width * MAX) / height); height = MAX; }
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', 0.7));
        };
        img.src = reader.result as string;
      };
      reader.readAsDataURL(file);
    });

  const handleJournalImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const fileArray = Array.from(files) as File[];
    e.target.value = '';
    fileArray.forEach((file: File) => {
      const imageId = Date.now().toString() + Math.random().toString(36).substring(2, 9);
      compressImage(file)
        .catch(() => new Promise<string>((resolve, reject) => {
          const r = new FileReader();
          r.onerror = reject;
          r.onloadend = () => resolve(r.result as string);
          r.readAsDataURL(file);
        }))
        .then(async (dataUrl) => {
          // If user is signed in, upload to Firebase Storage and use the URL
          if (user?.uid) {
            const path = `journal/${user.uid}/${imageId}`;
            const imgRef = storageRef(storage, path);
            await uploadString(imgRef, dataUrl, 'data_url');
            const url = await getDownloadURL(imgRef);
            setJournalForm(prev => ({
              ...prev,
              images: [...prev.images, { id: imageId, name: file.name, dataUrl: url }]
            }));
          } else {
            // Fallback: store base64 locally when not signed in
            setJournalForm(prev => ({
              ...prev,
              images: [...prev.images, { id: imageId, name: file.name, dataUrl }]
            }));
          }
        })
        .catch(err => console.error('Journal image upload failed:', err));
    });
  };

  const deleteJournalEntry = (id: string) => {
    if (confirm("Permanently delete this journal entry?")) {
      const entry = journalEntries.find(e => e.id === id);
      if (entry && user?.uid) {
        entry.images.forEach(img => {
          const path = `journal/${user.uid}/${img.id}`;
          deleteObject(storageRef(storage, path)).catch(() => {});
        });
      }
      setJournalEntries(prev => prev.filter(e => e.id !== id));
    }
  };

  const filteredJournalEntries = useMemo(() => {
    const query = journalSearch.trim().toLowerCase();
    if (!query) return journalEntries;

    return journalEntries.filter(entry => {
      const inTitle = entry.title.toLowerCase().includes(query);
      const inTags = entry.tags.some(tag => tag.toLowerCase().includes(query));
      return inTitle || inTags;
    });
  }, [journalEntries, journalSearch]);

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

  const maxCharsOutput = 800;
  const isLongOutput = assignmentOutput.length > maxCharsOutput;
  const visibleAssignmentOutput = isFieldMode && isLongOutput && !showFullAssignmentOutput
    ? assignmentOutput.slice(0, maxCharsOutput) + '…'
    : assignmentOutput;

  const assignmentPlaceholder = isFieldMode
    ? 'Describe the assignment in 1–2 lines…'
    : 'Describe the assignment scope for accelerated delivery...';

  // ── Auth gate ────────────────────────────────────────────────────────────────
  if (authLoading) {
    // Brief splash while Firebase resolves the auth state
    return (
      <div className="min-h-screen bg-brand-black flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-5xl font-display text-brand-rose tracking-wider leading-none mb-4">PHOTOVISE</h1>
          <i className="fa-solid fa-circle-notch animate-spin text-brand-gray text-lg"></i>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginScreen />;
  }

  return (
    <Layout activeTab={activeTab} setActiveTab={setActiveTab} workflowSummary={conciseWorkflowLabel} isFieldMode={isFieldMode} user={user} onSignOut={signOut}>
      {activeTab === 'dashboard' && (
        <div className="animate-in fade-in duration-700">
          <header className="mb-10 flex justify-between items-start">
            <div>
              <h2 className="text-4xl font-display text-brand-black tracking-wide">PRODUCTION LOGBOOK</h2>
              <p className="text-brand-gray mt-2 text-sm font-medium">Tracking professional workflow status and backup integrity.</p>
            </div>
            {/* Field Mode Toggle - Dashboard Only */}
            <div className="flex flex-col items-end gap-1">
              <div className="flex items-center gap-3">
                <label className="text-sm font-medium text-brand-black/70">Field mode</label>
                <button 
                  onClick={() => setIsFieldMode(!isFieldMode)}
                  className={`w-10 h-5 rounded-full transition-all relative ${isFieldMode ? 'bg-brand-blue' : 'bg-brand-gray/30'}`}
                >
                  <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all ${isFieldMode ? 'left-6' : 'left-1'}`}></div>
                </button>
              </div>
              <p className="text-xs text-brand-gray/50 font-normal">Simplify layout for on-assignment use.</p>
            </div>
          </header>

          <section className="bg-brand-white border border-brand-black/5 rounded-lg p-8 mb-12 shadow-sm relative overflow-hidden group hover:border-brand-rose/20 transition-all duration-700">
             <div className="absolute top-0 left-0 w-1 h-full bg-brand-rose/20"></div>
             <p className="text-xs font-semibold text-brand-rose/70 mb-5">
               {profile.name.trim() ? `Hi ${profile.name.trim().split(' ')[0]}, here's your daily inspiration` : 'Daily inspiration'}
             </p>
             <div className="max-w-2xl">
               <p className="text-xl md:text-2xl font-serif italic text-brand-black leading-snug mb-4">
                 "{dailyQuote.text}"
               </p>
               <p className="text-sm font-medium text-brand-gray/70">
                 — {dailyQuote.author}
               </p>
             </div>
             <i className="fa-solid fa-quote-right absolute bottom-6 right-8 text-4xl text-brand-black/5"></i>
          </section>

          <section className="bg-brand-black rounded-lg p-8 text-brand-white mb-12 shadow-xl border border-white/5">
            <h3 className="text-xs font-semibold text-brand-rose/80 mb-5">Log new session</h3>
            <form onSubmit={addSession} className="space-y-4">
              <input
                name="title"
                type="text"
                placeholder="Session title (optional)"
                className="w-full bg-white/5 border border-white/10 rounded-md px-4 py-3 text-xs focus:ring-1 focus:ring-brand-blue outline-none transition-all placeholder:text-white/20"
              />
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
                <input
                  name="date"
                  type="date"
                  required
                  className="bg-white/5 border border-white/10 rounded-md px-4 py-3 text-xs focus:ring-1 focus:ring-brand-blue outline-none transition-all"
                />
                <LocationAutocomplete
                  name="location"
                  placeholder="Location (e.g. Austin)"
                  required
                  className="bg-white/5 border border-white/10 rounded-md px-4 py-3 text-xs focus:ring-1 focus:ring-brand-blue outline-none transition-all placeholder:text-white/20"
                />
                <select
                  name="genre"
                  required
                  className="bg-white/5 border border-white/10 rounded-md px-4 py-3 text-xs focus:ring-1 focus:ring-brand-blue outline-none transition-all"
                >
                  {genreOptions.map(g => (
                    <option key={g} value={g} className="text-brand-black">{g}</option>
                  ))}
                </select>
                <button
                  type="submit"
                  className="bg-brand-blue hover:bg-[#7a93a0] text-white text-sm font-semibold rounded-md py-3 transition-all active:scale-95 shadow-lg"
                >
                  Index session
                </button>
              </div>
              <textarea
                name="notes"
                placeholder="Notes / creative brief"
                className="w-full bg-white/5 border border-white/10 rounded-md px-4 py-3 text-xs focus:ring-1 focus:ring-brand-blue outline-none transition-all placeholder:text-white/20 min-h-[80px]"
              />
            </form>
          </section>

          {/* ── Dashboard filters ── */}
          {(() => {
            const activeSessions = sessions.filter(s => s.status !== 'archived');
            const presentGenres = Array.from(new Set(activeSessions.flatMap(s => s.genre ?? []))) as Genre[];
            const filtered = activeSessions
              .filter(s =>
                (dashboardGenreFilter === 'All' || (s.genre ?? []).includes(dashboardGenreFilter)) &&
                (dashboardStatusFilter === 'All' || s.status === dashboardStatusFilter)
              )
              .sort((a, b) => {
                const da = a.date || '', db = b.date || '';
                return dashboardDateSort === 'newest' ? db.localeCompare(da) : da.localeCompare(db);
              });

            const hasFilters = dashboardGenreFilter !== 'All' || dashboardStatusFilter !== 'All';

            return (
              <>
                {activeSessions.length > 0 && (
                  <div className="mb-8 space-y-4">
                    <div className="flex flex-col md:flex-row md:items-center gap-4 flex-wrap">
                      {/* Genre filter */}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-brand-gray/50 font-medium mb-2">Genre</p>
                        <div className="flex flex-wrap gap-1.5">
                          <button
                            onClick={() => setDashboardGenreFilter('All')}
                            className={`text-xs font-medium px-3 py-1.5 rounded-md border transition-all ${dashboardGenreFilter === 'All' ? 'bg-brand-black text-white border-brand-black' : 'bg-white text-brand-gray border-brand-black/10 hover:border-brand-black/30'}`}
                          >All</button>
                          {presentGenres.map(g => (
                            <button key={g}
                              onClick={() => setDashboardGenreFilter(g)}
                              className={`text-xs font-medium px-3 py-1.5 rounded-md border transition-all ${dashboardGenreFilter === g ? 'bg-brand-blue text-white border-brand-blue' : 'bg-white text-brand-gray border-brand-black/10 hover:border-brand-blue/30'}`}
                            >{g}</button>
                          ))}
                        </div>
                      </div>

                      {/* Status filter */}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-brand-gray/50 font-medium mb-2">Progress</p>
                        <div className="flex flex-wrap gap-1.5">
                          {(['All', 'capturing', 'shot', 'culled', 'edited', 'backed up', 'posted'] as const).map(s => (
                            <button key={s}
                              onClick={() => setDashboardStatusFilter(s)}
                              className={`text-xs font-medium px-3 py-1.5 rounded-md border transition-all ${dashboardStatusFilter === s ? 'bg-brand-black text-white border-brand-black' : 'bg-white text-brand-gray border-brand-black/10 hover:border-brand-black/30'}`}
                            >{s === 'All' ? 'All' : { capturing: 'Capturing', shot: 'Culling', culled: 'Editing', edited: 'Backing Up', 'backed up': 'Posting', posted: 'Complete' }[s]}</button>
                          ))}
                        </div>
                      </div>

                      {/* Date sort */}
                      <div className="flex-shrink-0">
                        <p className="text-xs text-brand-gray/50 font-medium mb-2">Date</p>
                        <button
                          onClick={() => setDashboardDateSort(p => p === 'newest' ? 'oldest' : 'newest')}
                          className="flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-md border border-brand-black/10 bg-white text-brand-gray hover:border-brand-black/30 transition-all"
                        >
                          <i className={`fa-solid fa-arrow-${dashboardDateSort === 'newest' ? 'down' : 'up'}-short-wide text-[9px]`}></i>
                          {dashboardDateSort === 'newest' ? 'Newest first' : 'Oldest first'}
                        </button>
                      </div>
                    </div>

                    {/* Results summary + clear */}
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-brand-gray/40 font-normal">
                        {filtered.length} of {activeSessions.length} session{activeSessions.length !== 1 ? 's' : ''}
                      </p>
                      {hasFilters && (
                        <button
                          onClick={() => { setDashboardGenreFilter('All'); setDashboardStatusFilter('All'); }}
                          className="text-xs text-brand-gray/50 hover:text-brand-black hover:underline"
                        >
                          <i className="fa-solid fa-xmark mr-1"></i>Clear filters
                        </button>
                      )}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {activeSessions.length === 0 ? (
                    <div className="col-span-full py-24 text-center border border-dashed border-brand-gray/20 rounded-lg">
                      <p className="text-sm font-medium text-brand-gray/50">No active sessions detected</p>
                    </div>
                  ) : filtered.length === 0 ? (
                    <div className="col-span-full py-16 text-center border border-dashed border-brand-gray/20 rounded-lg">
                      <p className="text-sm font-medium text-brand-gray/50 mb-2">No sessions match these filters</p>
                      <button onClick={() => { setDashboardGenreFilter('All'); setDashboardStatusFilter('All'); }} className="text-xs text-brand-rose font-medium hover:underline">
                        Clear filters
                      </button>
                    </div>
                  ) : (
                    filtered.map(session => (
                      <div key={session.id} id={`session-${session.id}`} className={`transition-all duration-700 ${highlightedSessionId === session.id ? 'ring-2 ring-brand-rose ring-offset-2 rounded-lg' : ''}`}>
                        <SessionCard
                          session={session}
                          onUpdateStatus={updateStatus}
                          onUpdate={updateSession}
                          onDelete={deleteSession}
                          hasJournal={journalEntries.some(e => e.sessionIds.includes(session.id))}
                          onGoToJournal={() => setActiveTab('journal')}
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
          <header className="mb-10 flex justify-between items-end">
            <div>
              <h2 className="text-4xl font-display text-brand-black tracking-wide">PHOTOGRAPHER PROFILE</h2>
              <p className="text-brand-gray mt-2 text-sm font-medium">Define your shooting style, constraints, and growth goals.</p>
            </div>
            {profileSuccessMsg && (
              <div className="bg-emerald-500 text-white text-xs font-medium px-4 py-2 rounded-md shadow-lg animate-in slide-in-from-right fade-in duration-500">
                <i className="fa-solid fa-check mr-2"></i> Profile applied
              </div>
            )}
          </header>

          {user && (
            <div className="mb-8 flex items-center justify-between bg-white border border-brand-black/5 rounded-lg px-6 py-4 shadow-sm">
              <div className="flex items-center gap-4">
                {user.photoURL ? (
                  <img src={user.photoURL} alt="avatar" className="w-9 h-9 rounded-full object-cover border border-brand-black/10" />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-brand-rose/10 flex items-center justify-center">
                    <i className="fa-solid fa-user text-brand-rose text-sm"></i>
                  </div>
                )}
                <div>
                  <p className="text-sm font-semibold text-brand-black">{user.displayName || 'Photographer'}</p>
                  <p className="text-xs text-brand-gray mt-0.5">{user.email}</p>
                </div>
              </div>
              <button
                onClick={signOut}
                className="flex items-center gap-2 text-xs font-medium text-brand-gray border border-brand-black/10 px-4 py-2 rounded-md hover:bg-brand-black/5 hover:text-brand-black transition-all"
              >
                <i className="fa-solid fa-arrow-right-from-bracket text-xs"></i>
                Sign out
              </button>
            </div>
          )}

          <section className="bg-white rounded-lg border border-brand-black/5 p-10 shadow-sm">
            <div className="space-y-12">
              <div>
                <h3 className="text-xs font-semibold text-brand-rose mb-5 border-b border-brand-black/5 pb-2">Basics</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div>
                    <label className="text-xs font-medium text-brand-gray/70 block mb-2">Name</label>
                    <input 
                      type="text"
                      value={draftProfile.name}
                      onChange={e => setDraftProfile(prev => ({ ...prev, name: e.target.value }))}
                      className="w-full bg-brand-white border border-brand-black/5 rounded-md px-4 py-3 text-xs focus:ring-1 focus:ring-brand-blue outline-none transition-all"
                      placeholder="e.g. Jane Doe"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-brand-gray/70 block mb-2">Years shooting</label>
                    <input 
                      type="text"
                      value={draftProfile.yearsShooting}
                      onChange={e => setDraftProfile(prev => ({ ...prev, yearsShooting: e.target.value }))}
                      className="w-full bg-brand-white border border-brand-black/5 rounded-md px-4 py-3 text-xs focus:ring-1 focus:ring-brand-blue outline-none transition-all"
                      placeholder="e.g. 5 years, or since 2018"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="text-xs font-medium text-brand-gray/70 block mb-3">Primary genres</label>
                    <div className="flex flex-wrap gap-2">
                      {genreOptions.map((g: Genre) => (
                        <button
                          key={g}
                          onClick={() => setDraftProfile(prev => ({
                            ...prev,
                            primaryGenres: prev.primaryGenres.includes(g)
                              ? prev.primaryGenres.filter(pg => pg !== g)
                              : [...prev.primaryGenres, g]
                          }))}
                          className={`text-xs font-medium px-4 py-2 rounded-md border transition-all ${
                            draftProfile.primaryGenres.includes(g)
                              ? 'bg-brand-blue text-white border-brand-blue'
                              : 'bg-brand-white text-brand-gray border-brand-black/5'
                          }`}
                        >
                          {g}
                        </button>
                      ))}
                    </div>
                    {draftProfile.primaryGenres.includes('Other') && (
                      <input
                        type="text"
                        value={draftProfile.otherGenreNote || ''}
                        onChange={e => setDraftProfile(prev => ({ ...prev, otherGenreNote: e.target.value }))}
                        placeholder="Specify your genre..."
                        className="mt-3 w-full bg-brand-white border border-brand-rose/30 rounded-md px-4 py-2.5 text-xs text-brand-black placeholder-brand-gray/40 focus:ring-1 focus:ring-brand-blue outline-none"
                      />
                    )}
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-xs font-semibold text-brand-rose mb-5 border-b border-brand-black/5 pb-2">Software & workflow</h3>
                <div className="space-y-8">
                  <div>
                    <label className="text-xs font-medium text-brand-gray/70 block mb-3">Editing / RAW</label>
                    <div className="flex flex-wrap gap-2">
                      {editingAppsList.map(app => (
                        <button
                          key={app}
                          onClick={() => setDraftProfile(prev => ({
                            ...prev,
                            editingApps: prev.editingApps.includes(app)
                              ? prev.editingApps.filter(a => a !== app)
                              : [...prev.editingApps, app]
                          }))}
                          className={`text-xs font-medium px-4 py-2 rounded-md border transition-all ${
                            draftProfile.editingApps.includes(app)
                              ? 'bg-brand-blue text-white border-brand-blue'
                              : 'bg-brand-white text-brand-gray border-brand-black/5'
                          }`}
                        >
                          {app}
                        </button>
                      ))}
                    </div>
                    {draftProfile.editingApps.includes('Other') && (
                      <input
                        type="text"
                        value={draftProfile.otherEditingAppNote || ''}
                        onChange={e => setDraftProfile(prev => ({ ...prev, otherEditingAppNote: e.target.value }))}
                        placeholder="Specify your editing app..."
                        className="mt-3 w-full bg-brand-white border border-brand-blue/30 rounded-md px-4 py-2.5 text-xs text-brand-black placeholder-brand-gray/40 focus:ring-1 focus:ring-brand-blue outline-none"
                      />
                    )}
                  </div>
                  <div>
                    <label className="text-xs font-medium text-brand-gray/70 block mb-3">Tethering / capture</label>
                    <div className="flex flex-wrap gap-2">
                      {tetheringAppsList.map(app => (
                        <button
                          key={app}
                          onClick={() => setDraftProfile(prev => ({
                            ...prev,
                            tetheringApps: prev.tetheringApps.includes(app)
                              ? prev.tetheringApps.filter(a => a !== app)
                              : [...prev.tetheringApps, app]
                          }))}
                          className={`text-xs font-medium px-4 py-2 rounded-md border transition-all ${
                            draftProfile.tetheringApps.includes(app)
                              ? 'bg-brand-blue text-white border-brand-blue'
                              : 'bg-brand-white text-brand-gray border-brand-black/5'
                          }`}
                        >
                          {app}
                        </button>
                      ))}
                    </div>
                    {draftProfile.tetheringApps.includes('Other') && (
                      <input
                        type="text"
                        value={draftProfile.otherTetheringAppNote || ''}
                        onChange={e => setDraftProfile(prev => ({ ...prev, otherTetheringAppNote: e.target.value }))}
                        placeholder="Specify your tethering app..."
                        className="mt-3 w-full bg-brand-white border border-brand-rose/30 rounded-md px-4 py-2.5 text-xs text-brand-black placeholder-brand-gray/40 focus:ring-1 focus:ring-brand-blue outline-none"
                      />
                    )}
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-xs font-semibold text-brand-rose mb-5 border-b border-brand-black/5 pb-2">Work & style</h3>
                <div className="space-y-6">
                  <div>
                    <label className="text-xs font-medium text-brand-gray/70 block mb-2">Typical work / scope</label>
                    <textarea 
                      value={draftProfile.typicalWork}
                      onChange={e => setDraftProfile(prev => ({ ...prev, typicalWork: e.target.value }))}
                      className="w-full bg-brand-white border border-brand-black/5 rounded-md px-4 py-3 text-xs focus:ring-1 focus:ring-brand-blue outline-none transition-all min-h-[80px]"
                      placeholder="e.g. editorial assignments, street photography series"
                    />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div>
                      <label className="text-xs font-medium text-brand-gray/70 block mb-2">Style keywords</label>
                      <input 
                        type="text"
                        value={styleKeywordsDraft}
                        onChange={e => setStyleKeywordsDraft(e.target.value)}
                        className="w-full bg-brand-white border border-brand-black/5 rounded-md px-4 py-3 text-xs focus:ring-1 focus:ring-brand-blue outline-none transition-all"
                        placeholder="cinematic, high contrast, natural light…"
                      />
                      <p className="text-xs text-brand-gray mt-2">Type style keywords separated by commas, e.g. cinematic, high contrast, natural light.</p>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-brand-gray/70 block mb-2">Risk profile</label>
                      <div className="flex gap-2">
                        {(['cautious', 'balanced', 'experimental'] as PhotographerProfile['riskProfile'][]).map((r) => (
                          <button
                            key={r}
                            onClick={() => setDraftProfile(prev => ({ ...prev, riskProfile: r }))}
                            className={`flex-1 text-xs font-medium py-3 rounded-md border transition-all ${
                              draftProfile.riskProfile === r
                                ? 'bg-brand-black text-white border-brand-black'
                                : 'bg-brand-white text-brand-gray border-brand-black/5 hover:border-brand-black/20'
                            }`}
                          >
                            {r}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-xs font-semibold text-brand-rose mb-5 border-b border-brand-black/5 pb-2">Strengths & struggles</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div>
                    <label className="text-xs font-medium text-brand-gray/70 block mb-2">Strengths</label>
                    <textarea 
                      value={draftProfile.strengths}
                      onChange={e => setDraftProfile(prev => ({ ...prev, strengths: e.target.value }))}
                      className="w-full bg-brand-white border border-brand-black/5 rounded-md px-4 py-3 text-xs focus:ring-1 focus:ring-brand-blue outline-none transition-all min-h-[100px]"
                      placeholder="Describe what you do best..."
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-brand-gray/70 block mb-2">Struggles / challenges</label>
                    <textarea 
                      value={draftProfile.struggles}
                      onChange={e => setDraftProfile(prev => ({ ...prev, struggles: e.target.value }))}
                      className="w-full bg-brand-white border border-brand-black/5 rounded-md px-4 py-3 text-xs focus:ring-1 focus:ring-brand-blue outline-none transition-all min-h-[100px]"
                      placeholder="Where do you feel friction or stall?"
                    />
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-xs font-semibold text-brand-rose mb-5 border-b border-brand-black/5 pb-2">Constraints & reality</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                  <div className="md:col-span-1">
                    <label className="text-xs font-medium text-brand-gray/70 block mb-2">Physical constraints</label>
                    <textarea 
                      value={draftProfile.physicalConstraints}
                      onChange={e => setDraftProfile(prev => ({ ...prev, physicalConstraints: e.target.value }))}
                      className="w-full bg-brand-white border border-brand-black/5 rounded-md px-4 py-3 text-xs focus:ring-1 focus:ring-brand-blue outline-none transition-all min-h-[80px]"
                      placeholder="e.g. height, stamina, crowd tolerance"
                    />
                  </div>
                  <div className="md:col-span-1">
                    <label className="text-xs font-medium text-brand-gray/70 block mb-2">Access reality</label>
                    <textarea 
                      value={draftProfile.accessReality}
                      onChange={e => setDraftProfile(prev => ({ ...prev, accessReality: e.target.value }))}
                      className="w-full bg-brand-white border border-brand-black/5 rounded-md px-4 py-3 text-xs focus:ring-1 focus:ring-brand-blue outline-none transition-all min-h-[80px]"
                      placeholder="e.g. public stands, press access, sidelines"
                    />
                  </div>
                  <div className="md:col-span-1">
                    <label className="text-xs font-medium text-brand-gray/70 block mb-2">Time budget</label>
                    <textarea 
                      value={draftProfile.timeBudget}
                      onChange={e => setDraftProfile(prev => ({ ...prev, timeBudget: e.target.value }))}
                      className="w-full bg-brand-white border border-brand-black/5 rounded-md px-4 py-3 text-xs focus:ring-1 focus:ring-brand-blue outline-none transition-all min-h-[80px]"
                      placeholder="Typical time available per assignment"
                    />
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-xs font-semibold text-brand-rose mb-5 border-b border-brand-black/5 pb-2">Growth goals</h3>
                <div>
                  <label className="text-xs font-medium text-brand-gray/70 block mb-2">Growth goals</label>
                  <textarea 
                    value={draftProfile.growthGoals}
                    onChange={e => setDraftProfile(prev => ({ ...prev, growthGoals: e.target.value }))}
                    className="w-full bg-brand-white border border-brand-black/5 rounded-md px-4 py-4 text-xs focus:ring-1 focus:ring-brand-blue outline-none transition-all min-h-[100px]"
                    placeholder="What are you currently trying to master?"
                  />
                </div>
              </div>

              {/* Profile Actions */}
              <div className="pt-10 flex flex-col md:flex-row gap-4 justify-end border-t border-brand-black/5">
                <button
                  onClick={handleResetProfile}
                  disabled={!isProfileDirty}
                  className={`px-8 py-4 rounded-md text-sm font-medium transition-all border ${
                    isProfileDirty
                      ? 'bg-white text-brand-gray border-brand-black/10 hover:bg-brand-black/5'
                      : 'bg-white text-brand-gray/30 border-brand-black/5 cursor-not-allowed'
                  }`}
                >
                  Discard edits
                </button>
                <button
                  onClick={handleApplyProfile}
                  disabled={!isProfileDirty}
                  className={`px-12 py-4 rounded-md text-sm font-semibold transition-all shadow-lg ${
                    isProfileDirty
                      ? 'bg-brand-blue text-white hover:bg-[#7a93a0] active:scale-95'
                      : 'bg-brand-gray/10 text-brand-gray/30 cursor-not-allowed shadow-none'
                  }`}
                >
                  Apply Profile Changes
                </button>
              </div>
            </div>
          </section>
        </div>
      )}

      {activeTab === 'planner' && (
        <div className="animate-in slide-in-from-bottom-4 duration-700">
          <header className="mb-10">
            <h2 className="text-4xl font-display text-brand-black tracking-wide">ASSIGNMENT PLANNER</h2>
            <p className="text-brand-gray mt-2 text-sm font-medium">Detailed strategies for upcoming assignments.</p>
          </header>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 mb-10">
            <div className="lg:col-span-3 bg-white rounded-lg border border-brand-black/5 p-8 shadow-sm">
              <SessionSelector
                sessions={sessions.filter(s => s.status !== 'archived')}
                selectedIds={selectedPlannerSessionIds}
                onToggle={toggleSessionInPlanner}
                label="Attach sessions to planning context"
              />

              <textarea
                className="w-full h-40 p-5 bg-brand-white border border-brand-black/5 rounded-md focus:ring-1 focus:ring-brand-blue outline-none transition-all text-sm leading-relaxed text-brand-black placeholder:text-brand-gray/40"
                placeholder="Outline your upcoming week, availability, and specific shoot goals..."
                value={plannerInput}
                onChange={(e) => setPlannerInput(e.target.value)}
              />
              <div className="mt-6 flex justify-end">
                <button
                  disabled={isGeneratingPlan || (!plannerInput.trim() && selectedPlannerSessionIds.length === 0)}
                  onClick={handleGeneratePlan}
                  className={`flex items-center gap-3 px-10 py-4 rounded-md text-sm font-semibold transition-all ${
                    isGeneratingPlan || (!plannerInput.trim() && selectedPlannerSessionIds.length === 0)
                      ? 'bg-brand-white text-brand-gray border border-brand-black/5 cursor-not-allowed'
                      : 'bg-brand-blue text-white hover:bg-[#7a93a0] hover:shadow-md active:scale-95 shadow-sm'
                  }`}
                >
                  {isGeneratingPlan ? (
                    <><i className="fa-solid fa-circle-notch animate-spin"></i> Processing</>
                  ) : (
                    <><i className="fa-solid fa-wand-magic-sparkles"></i> Compile strategy</>
                  )}
                </button>
              </div>
            </div>
            
            <div className="lg:col-span-1 space-y-4">
              <GearSummary />
              <BulletinSummary />
            </div>
          </div>

          {plannerOutput && (
            <div className="bg-brand-black rounded-lg shadow-2xl overflow-hidden border border-white/10">
              <div className="px-8 py-5 border-b border-white/10 flex items-center justify-between flex-wrap gap-3">
                <span className="text-xs font-semibold text-brand-rose">Assignment strategy</span>
                <div className="flex items-center gap-3 flex-wrap">
                  <button
                    onClick={() => {
                      setPlannerInput('');
                      setPlannerOutput('');
                      setSelectedPlannerSessionIds([]);
                      setPlannerAttachId('');
                      setPlannerAttached(false);
                    }}
                    className="text-xs font-medium text-white/70 hover:text-brand-rose transition-colors border border-white/20 hover:border-brand-rose/30 px-3 py-1 rounded-md"
                  >
                    <i className="fa-solid fa-rotate-left mr-1.5"></i>Reset
                  </button>
                  <button
                    onClick={() => handleCopy(plannerOutput, setPlannerCopied)}
                    className="text-xs font-medium text-brand-blue hover:text-white transition-colors border border-brand-blue/30 px-3 py-1 rounded-md bg-brand-blue/5"
                  >
                    {plannerCopied ? 'Copied' : 'Copy text'}
                  </button>
                  <div className="flex items-center gap-2">
                    <select
                      value={plannerAttachId}
                      onChange={e => { setPlannerAttachId(e.target.value); setPlannerAttached(false); }}
                      className="bg-white/5 border border-white/10 text-white text-xs font-medium px-3 py-1 rounded-md outline-none focus:ring-1 focus:ring-brand-blue"
                    >
                      <option value="" className="text-brand-black">Attach to session...</option>
                      {sessions.filter(s => s.status !== 'archived').map(s => (
                        <option key={s.id} value={s.id} className="text-brand-black">
                          {s.title || `${s.location} — ${s.date}`}
                        </option>
                      ))}
                    </select>
                    {plannerAttachId && (
                      <button
                        onClick={() => attachStrategyToSession(plannerAttachId, plannerOutput, 'strategy', () => setPlannerAttached(true))}
                        className="text-xs font-medium text-brand-rose hover:text-white transition-colors border border-brand-rose/40 px-3 py-1 rounded-md bg-brand-rose/5"
                      >
                        {plannerAttached ? '✓ Attached' : 'Attach'}
                      </button>
                    )}
                  </div>
                  <i className="fa-solid fa-file-contract text-brand-blue"></i>
                </div>
              </div>
              <div className="p-1 text-brand-black">
                <div className="bg-brand-white p-10 font-medium leading-relaxed shadow-inner">
                  {String(plannerOutput || '').split('\n').map((line, i) => (
                    <p key={i} className="mb-4 last:mb-0 whitespace-pre-wrap">{line}</p>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'assignment' && (
        <div className="animate-in slide-in-from-bottom-4 duration-700">
          <header className="mb-10">
            <h2 className="text-4xl font-display text-brand-black tracking-wide">ASSIGNMENT MODE</h2>
            {!isFieldMode && (
              <p className="text-brand-gray mt-2 text-sm font-medium">Critical fast-track workflow.</p>
            )}
          </header>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 mb-10">
            <div className="lg:col-span-3 bg-brand-black rounded-lg p-10 text-white shadow-2xl relative overflow-hidden border border-white/5">
              <div className="relative z-10">
                {!isFieldMode && <h3 className="text-xl font-bold mb-6 text-brand-rose">Assignment brief</h3>}
                <div className="flex flex-col gap-6">
                  <div className="bg-white/5 p-6 rounded-lg border border-white/10 mb-2">
                    <SessionSelector
                      sessions={sessions.filter(s => s.status !== 'archived')}
                      selectedIds={selectedAssignmentSessionIds}
                      onToggle={toggleSessionInAssignment}
                      label="Attach relevant assignment sessions"
                    />
                    {sessions.some(s => selectedAssignmentSessionIds.includes(s.id) && s.strategy) && (
                      <button
                        type="button"
                        onClick={() => setIncludeAttachedStrategy(v => !v)}
                        className={`mt-3 flex items-center gap-3 w-full px-4 py-3 rounded-md border transition-all ${
                          includeAttachedStrategy
                            ? 'bg-brand-blue/10 border-brand-blue/40 text-brand-blue'
                            : 'bg-white/5 border-white/10 text-white/40 hover:border-white/30 hover:text-white/60'
                        }`}
                      >
                        <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-all ${
                          includeAttachedStrategy ? 'bg-brand-blue border-brand-blue' : 'border-white/20'
                        }`}>
                          {includeAttachedStrategy && <i className="fa-solid fa-check text-[9px] text-white"></i>}
                        </div>
                        <span className="text-xs font-medium text-white/80">
                          Include attached strategy as foundation
                        </span>
                        <i className="fa-solid fa-file-contract ml-auto text-[10px] opacity-50"></i>
                      </button>
                    )}
                  </div>

                  <div className="flex flex-col gap-3 mb-2">
                    <label className="text-xs font-medium text-white/50">Timeframe</label>
                    <div className="flex flex-wrap gap-2">
                      {(['30min', '1hr', '2hr', '4hr', 'fullday'] as AssignmentTimeframe[]).map((tf) => (
                        <button
                          key={tf}
                          type="button"
                          onClick={() => setAssignmentTimeframe(tf)}
                          className={`text-xs font-medium px-4 py-2 rounded-md border transition-all ${
                            assignmentTimeframe === tf
                              ? 'bg-brand-blue text-white border-brand-blue shadow-md scale-105'
                              : 'bg-white/5 text-white/40 border-white/10 hover:border-brand-blue/50 hover:text-white'
                          }`}
                        >
                          {tf === '30min' ? '30 min' :
                           tf === '1hr' ? '1 hour' :
                           tf === '2hr' ? '2 hours' :
                           tf === '4hr' ? '4 hours' : 'Full day'}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-col">
                    <textarea
                      ref={assignmentInputRef}
                      className="w-full h-32 p-5 bg-white/5 border border-white/10 rounded-md focus:ring-1 focus:ring-brand-blue outline-none transition-all text-sm leading-relaxed text-zinc-100 placeholder:text-white/20"
                      placeholder={assignmentPlaceholder}
                      value={assignmentInput}
                      onChange={(e) => setAssignmentInput(e.target.value)}
                    />
                    {isFieldMode && lastAssignmentInput && (
                      <button
                        type="button"
                        className="mt-2 self-start text-xs font-medium text-brand-rose/60 hover:text-brand-rose underline underline-offset-4 decoration-brand-rose/20"
                        onClick={() => setAssignmentInput(lastAssignmentInput)}
                      >
                        Use last assignment brief
                      </button>
                    )}
                  </div>
                  <button
                    disabled={isGeneratingAssignment || (!assignmentInput.trim() && selectedAssignmentSessionIds.length === 0)}
                    onClick={handleGenerateAssignment}
                    className={`bg-brand-blue hover:bg-[#7a93a0] text-white text-sm font-semibold rounded-md py-4 px-12 transition-all active:scale-95 flex items-center justify-center gap-3 shadow-lg ${isGeneratingAssignment || (!assignmentInput.trim() && selectedAssignmentSessionIds.length === 0) ? 'opacity-40 cursor-not-allowed' : ''}`}
                  >
                    {isGeneratingAssignment ? (
                      <><i className="fa-solid fa-circle-notch animate-spin"></i> Generating strategy</>
                    ) : (
                      <><i className="fa-solid fa-bolt"></i> Start assignment plan</>
                    )}
                  </button>
                </div>
              </div>
              {!isFieldMode && <div className="absolute top-0 right-0 -mr-24 -mt-24 w-96 h-96 bg-brand-rose/5 blur-[120px] rounded-full"></div>}
            </div>

            {!isFieldMode && (
              <div className="lg:col-span-1 space-y-4">
                <GearSummary />
                <div className="bg-white border border-brand-black/5 rounded-lg p-5 shadow-sm space-y-3">
                  <h4 className="text-xs font-medium text-brand-black/50 flex items-center gap-2">
                    <i className="fa-solid fa-wand-sparkles text-brand-rose"></i> Expert guidance
                  </h4>
                  <button
                    onClick={() => setActiveTab('processing')}
                    className="w-full text-left px-3 py-3 bg-brand-rose/5 border border-brand-rose/10 rounded-md text-xs font-medium text-brand-rose hover:bg-brand-rose hover:text-white transition-all flex items-center justify-between group"
                  >
                    <span>Open processing guides</span>
                    <i className="fa-solid fa-chevron-right text-[8px] group-hover:translate-x-1 transition-transform"></i>
                  </button>
                </div>
                <BulletinSummary />
              </div>
            )}
          </div>

          {assignmentOutput && (
            <div className="bg-brand-black rounded-lg shadow-2xl overflow-hidden border border-white/10">
              <div className="px-8 py-5 border-b border-white/10 flex items-center justify-between flex-wrap gap-3">
                <span className="text-xs font-semibold text-brand-blue">Accelerated delivery plan</span>
                <div className="flex items-center gap-3 flex-wrap">
                  <button
                    onClick={() => {
                      setAssignmentInput('');
                      setAssignmentOutput('');
                      setSelectedAssignmentSessionIds([]);
                      setAssignmentAttachId('');
                      setAssignmentAttached(false);
                      setLastAssignmentInput('');
                      setShowFullAssignmentOutput(false);
                    }}
                    className="text-xs font-medium text-white/70 hover:text-brand-rose transition-colors border border-white/20 hover:border-brand-rose/30 px-3 py-1 rounded-md"
                  >
                    <i className="fa-solid fa-rotate-left mr-1.5"></i>Reset
                  </button>
                  <button
                    onClick={() => handleCopy(assignmentOutput, setAssignmentCopied)}
                    className="text-xs font-medium text-brand-rose hover:text-white transition-colors border border-brand-rose/30 px-3 py-1 rounded-md bg-brand-rose/5"
                  >
                    {assignmentCopied ? 'Copied' : 'Copy text'}
                  </button>
                  <div className="flex items-center gap-2">
                    <select
                      value={assignmentAttachId}
                      onChange={e => { setAssignmentAttachId(e.target.value); setAssignmentAttached(false); }}
                      className="bg-white/5 border border-white/10 text-white text-xs font-medium px-3 py-1 rounded-md outline-none focus:ring-1 focus:ring-brand-blue"
                    >
                      <option value="" className="text-brand-black">Attach to session...</option>
                      {sessions.filter(s => s.status !== 'archived').map(s => (
                        <option key={s.id} value={s.id} className="text-brand-black">
                          {s.title || `${s.location} — ${s.date}`}
                        </option>
                      ))}
                    </select>
                    {assignmentAttachId && (
                      <button
                        onClick={() => attachStrategyToSession(assignmentAttachId, assignmentOutput, 'dayPlan', () => setAssignmentAttached(true))}
                        className="text-xs font-medium text-brand-blue hover:text-white transition-colors border border-brand-blue/40 px-3 py-1 rounded-md bg-brand-blue/5"
                      >
                        {assignmentAttached ? '✓ Attached' : 'Attach'}
                      </button>
                    )}
                  </div>
                  <i className="fa-solid fa-stopwatch text-brand-rose"></i>
                </div>
              </div>
              <div className="p-1 text-brand-black">
                <div className="bg-brand-white p-10 font-medium leading-relaxed">
                  <div className="whitespace-pre-wrap">
                    {visibleAssignmentOutput}
                  </div>
                  {isFieldMode && isLongOutput && (
                    <button
                      type="button"
                      className="mt-6 block text-xs font-medium text-brand-rose underline underline-offset-4 decoration-brand-rose/20"
                      onClick={() => setShowFullAssignmentOutput(v => !v)}
                    >
                      {showFullAssignmentOutput ? 'Show less' : 'Show full plan'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'askpro' && (
        <AskProPage
          profile={profile}
          assignmentGenre={derivedAssignmentGenre}
          assignmentTimeframe={assignmentTimeframe}
          assignmentInput={assignmentInput}
          askProInput={askProInput}
          setAskProInput={setAskProInput}
          askProAnswer={askProAnswer}
          isGeneratingAskPro={isGeneratingAskPro}
          onAskProSubmit={handleAskProSubmit}
          isFieldMode={isFieldMode}
          onFeedback={(note) => {
            setFeedbackLog(prev => [...prev, { id: crypto.randomUUID(), section: 'Ask a Pro', note, createdAt: new Date().toISOString() }]);
          }}
          activeTab={activeTab}
        />
      )}

      {activeTab === 'processing' && (
        <div className="animate-in fade-in duration-700 space-y-12">
          <header className="mb-10">
            <h2 className="text-4xl font-display text-brand-black tracking-wide">PROCESSING GUIDES</h2>
            {!isFieldMode && (
              <p className="text-brand-gray mt-2 text-sm font-medium">Expert technical guidance based on your profile and active assignment.</p>
            )}
          </header>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="md:col-span-2">
              <div className="grid grid-cols-1 gap-6">
                {buildProcessingGuideBoxes({
                  profile,
                  assignmentGenre: derivedAssignmentGenre,
                  assignmentTimeframe,
                  assignmentInput,
                }).map((box) => {
                  const visibleBullets = isFieldMode ? box.bullets.slice(0, 3) : box.bullets;
                  return (
                    <div key={box.genre} className="bg-white rounded-lg border border-brand-black/5 p-8 shadow-sm">
                      <h4 className="text-xs font-semibold text-brand-gray mb-1 flex items-center gap-2">
                        <i className="fa-solid fa-wand-sparkles text-brand-rose"></i> {box.title}
                      </h4>
                      {!isFieldMode && (
                        <p className="text-xs font-semibold text-brand-rose mb-6">
                          Processing · Culling · Shooting
                        </p>
                      )}
                      <ul className="space-y-4">
                        {visibleBullets.map((item, idx) => (
                          <li key={idx} className="flex gap-3 text-xs text-brand-gray leading-relaxed items-start">
                            <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-brand-rose flex-shrink-0" />
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                      <FeedbackFlag 
                        section="Processing Guides" 
                        onSubmit={(note) => {
                          setFeedbackLog(prev => [...prev, { id: crypto.randomUUID(), section: 'Processing Guides', note, createdAt: new Date().toISOString() }]);
                        }} 
                      />
                    </div>
                  );
                })}
              </div>
            </div>
            {!isFieldMode && (
              <div className="space-y-6">
                <div className="bg-brand-black rounded-lg p-6 text-white shadow-xl">
                  <h4 className="text-xs font-medium text-brand-rose/80 mb-4 border-b border-white/10 pb-2">Active context</h4>
                  <div className="space-y-4">
                    <div>
                      <p className="text-xs text-white/40 mb-1">Active genre(s)</p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {getActiveGenres(profile, derivedAssignmentGenre).map(g => (
                          <span key={g} className="text-xs px-2 py-0.5 bg-white/10 rounded font-medium">{g}</span>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs text-white/40 mb-1">Software stack</p>
                      <SystemStatusApps profile={profile} />
                    </div>
                    <div>
                      <p className="text-xs text-white/40 mb-1">Delivery timeframe</p>
                      <p className="text-sm font-semibold text-brand-rose">{assignmentTimeframe}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setActiveTab('profile')}
                    className="mt-8 w-full py-3 bg-white/5 border border-white/10 rounded-md text-xs font-medium hover:bg-brand-blue hover:border-brand-blue transition-all"
                  >
                    Edit profile
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'journal' && (
        <div className="animate-in fade-in duration-700 space-y-12">
          <header className="mb-10">
            <h2 className="text-4xl font-display text-brand-black tracking-wide">PHOTO JOURNAL</h2>
            <p className="text-brand-gray mt-2 text-sm font-medium">Reflective entries linked to assignments and sessions.</p>
          </header>

          <section className="bg-brand-black rounded-lg p-8 text-brand-white mb-12 shadow-xl border border-white/5">
            <h3 className="text-xs font-semibold text-brand-rose mb-6">New journal entry</h3>
            <form onSubmit={handleCreateJournalEntry} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="text-xs font-medium text-white/50 block mb-2">Date</label>
                  <input
                    type="date"
                    value={journalForm.date}
                    onChange={e => setJournalForm(prev => ({ ...prev, date: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-md px-4 py-3 text-xs focus:ring-1 focus:ring-brand-blue outline-none transition-all"
                    required
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-white/50 block mb-2">Entry title</label>
                  <input
                    type="text"
                    placeholder="e.g. Morning fog at Mount Rainier"
                    value={journalForm.title}
                    onChange={e => setJournalForm(prev => ({ ...prev, title: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-md px-4 py-3 text-xs focus:ring-1 focus:ring-brand-blue outline-none transition-all placeholder:text-white/20"
                    required
                  />
                </div>
              </div>

              <div>
                <SessionSelector
                  sessions={sessions.filter(s => s.status !== 'archived')}
                  selectedIds={journalForm.sessionIds}
                  onToggle={id => setJournalForm(prev => ({
                    ...prev,
                    sessionIds: prev.sessionIds.includes(id)
                      ? prev.sessionIds.filter(sid => sid !== id)
                      : [...prev.sessionIds, id]
                  }))}
                  label="LINK TO SESSIONS"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-white/50 block mb-2">Reflection / notes</label>
                <textarea
                  placeholder="What worked? What didn't? What did you learn?"
                  value={journalForm.notes}
                  onChange={e => setJournalForm(prev => ({ ...prev, notes: e.target.value }))}
                  className="w-full bg-white/5 border border-white/10 rounded-md px-4 py-4 text-xs focus:ring-1 focus:ring-brand-blue outline-none transition-all placeholder:text-white/20 min-h-[120px] leading-relaxed"
                  required
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <label className="text-xs font-medium text-white/50 block mb-2">Tags (comma separated)</label>
                  <input
                    type="text"
                    placeholder="e.g. lighting win, gear issue"
                    value={journalForm.tags}
                    onChange={e => setJournalForm(prev => ({ ...prev, tags: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-md px-4 py-3 text-xs focus:ring-1 focus:ring-brand-blue outline-none transition-all placeholder:text-white/20"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-white/50 block mb-2">Result quality (1–5)</label>
                  <select
                    value={journalForm.resultRating}
                    onChange={e => setJournalForm(prev => ({ ...prev, resultRating: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-md px-4 py-3 text-xs focus:ring-1 focus:ring-brand-blue outline-none transition-all"
                  >
                    {[1,2,3,4,5].map(v => <option key={v} value={v} className="text-brand-black">{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-white/50 block mb-2">Process flow (1–5)</label>
                  <select
                    value={journalForm.processRating}
                    onChange={e => setJournalForm(prev => ({ ...prev, processRating: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-md px-4 py-3 text-xs focus:ring-1 focus:ring-brand-blue outline-none transition-all"
                  >
                    {[1,2,3,4,5].map(v => <option key={v} value={v} className="text-brand-black">{v}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-white/50 block mb-2">Attach images</label>
                <div className="flex flex-wrap gap-4 items-center">
                   <label className="cursor-pointer bg-white/5 border border-white/10 rounded-md px-8 py-6 hover:bg-white/10 transition-all flex flex-col items-center gap-3">
                      <i className="fa-solid fa-camera-retro text-2xl text-brand-rose"></i>
                      <span className="text-xs font-medium text-white/40">Select files</span>
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={handleJournalImageUpload}
                        className="hidden"
                      />
                   </label>
                   <div className="flex flex-wrap gap-3">
                     {journalForm.images.map(img => (
                       <div key={img.id} className="relative w-20 h-20 border border-white/10 rounded-md overflow-hidden group">
                         <img src={img.dataUrl} className="w-full h-full object-cover" alt="preview" />
                         <button 
                            type="button"
                            onClick={() => setJournalForm(prev => ({ ...prev, images: prev.images.filter(i => i.id !== img.id) }))}
                            className="absolute inset-0 bg-brand-rose/80 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white"
                         >
                           <i className="fa-solid fa-trash-can"></i>
                         </button>
                       </div>
                     ))}
                   </div>
                </div>
              </div>

              <div className="pt-4">
                <button 
                  type="submit"
                  className="w-full bg-brand-blue hover:bg-[#7a93a0] text-white text-sm font-semibold rounded-md py-5 transition-all active:scale-[0.99] shadow-lg flex items-center justify-center gap-3"
                >
                  <i className="fa-solid fa-pen-nib"></i> Commit entry to logbook
                </button>
              </div>
            </form>
          </section>

          <section className="space-y-8">
            <div className="bg-brand-white border border-brand-black/5 rounded-lg p-8 shadow-sm">
              <label className="text-xs font-medium text-brand-black/40 block mb-4">Find reflections</label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search by title or tags..."
                  value={journalSearch}
                  onChange={(e) => setJournalSearch(e.target.value)}
                  className="w-full bg-white border border-brand-black/5 rounded-md px-12 py-4 text-sm focus:ring-1 focus:ring-brand-blue outline-none transition-all placeholder:text-brand-gray/30"
                />
                <i className="fa-solid fa-magnifying-glass absolute left-4 top-1/2 -translate-y-1/2 text-brand-rose/40"></i>
                {journalSearch && (
                  <button 
                    onClick={() => setJournalSearch('')}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-brand-gray/30 hover:text-brand-rose transition-colors"
                  >
                    <i className="fa-solid fa-circle-xmark"></i>
                  </button>
                )}
              </div>
            </div>

            {filteredJournalEntries.length === 0 ? (
              <div className="py-24 text-center border border-dashed border-brand-gray/20 rounded-lg">
                <p className="text-sm text-brand-gray/50">
                  {journalSearch ? "No journal entries match this search" : "No journal entries yet"}
                </p>
              </div>
            ) : (
              filteredJournalEntries.map(entry => (
                <div key={entry.id} className="bg-white rounded-lg border border-brand-black/5 shadow-sm overflow-hidden flex flex-col animate-in fade-in slide-in-from-bottom-2 duration-500">
                  <div className="bg-brand-black p-6 text-brand-white flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-4 mb-2">
                        <span className="text-xs font-medium text-brand-rose">{entry.date}</span>
                        {entry.resultRating && (
                          <div className="flex gap-0.5 text-brand-blue text-xs">
                            {[...Array(5)].map((_, i) => (
                              <i key={i} className={`fa-solid fa-star ${i < entry.resultRating! ? '' : 'opacity-20'}`}></i>
                            ))}
                          </div>
                        )}
                      </div>
                      <h3 className="text-xl font-bold leading-snug">{entry.title}</h3>
                    </div>
                    <button 
                      onClick={() => deleteJournalEntry(entry.id)}
                      className="text-white/10 hover:text-brand-rose transition-colors p-2"
                    >
                      <i className="fa-solid fa-trash-can text-sm"></i>
                    </button>
                  </div>
                  
                  <div className="p-8">
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                      <div className="lg:col-span-2 space-y-6">
                        <div className="flex flex-wrap gap-2">
                          {entry.sessionIds.map(sid => {
                            const s = sessions.find(sess => sess.id === sid);
                            return s ? (
                              <span key={sid} className="text-xs font-medium px-2 py-1 bg-brand-blue/5 text-brand-blue border border-brand-blue/10 rounded">
                                Session: {s.name.split('_').slice(1).join(' ')}
                              </span>
                            ) : null;
                          })}
                        </div>
                        
                        <p className="text-sm text-brand-black leading-relaxed whitespace-pre-wrap italic">
                          "{entry.notes}"
                        </p>

                        <div className="flex flex-wrap gap-1.5">
                          {entry.tags.map(tag => (
                            <span key={tag} className="text-xs font-medium text-brand-gray bg-brand-black/5 px-2 py-1 rounded">
                              #{tag}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="lg:col-span-1 border-l border-brand-black/5 pl-8 space-y-6">
                         <div className="grid grid-cols-2 gap-2">
                           {entry.images.map(img => (
                             <a
                                key={img.id}
                                href={img.dataUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="block aspect-square rounded-md overflow-hidden border border-brand-black/5 hover:border-brand-rose transition-all group"
                             >
                               <img src={img.dataUrl} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" alt="journal" />
                             </a>
                           ))}
                         </div>
                         {entry.processRating && (
                           <div className="bg-brand-white p-4 rounded-md border border-brand-black/5">
                             <p className="text-xs font-medium text-brand-gray/70 mb-2">Process flow</p>
                             <div className="flex gap-1 text-brand-rose text-[9px]">
                                {[...Array(5)].map((_, i) => (
                                  <i key={i} className={`fa-solid fa-bolt ${i < entry.processRating! ? '' : 'opacity-20'}`}></i>
                                ))}
                             </div>
                           </div>
                         )}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </section>
        </div>
      )}

      {activeTab === 'cfe' && (
        <div className="animate-in fade-in duration-700 space-y-12">
          <header className="mb-10 flex flex-col md:flex-row md:items-end md:justify-between gap-6">
            <div>
              <h2 className="text-4xl font-display text-brand-black tracking-wide">BULLETIN BOARD</h2>
              <p className="text-brand-gray mt-2 text-sm font-medium">Competitions, grants, fellowships, portfolio reviews, calls for entry, and more.</p>
            </div>
            <button
              onClick={refreshBulletinEvents}
              disabled={isFetchingBulletin}
              className="flex items-center gap-2 px-4 py-2 bg-brand-blue text-white text-xs font-medium rounded-md disabled:opacity-50 hover:bg-[#7a93a0] transition-colors"
            >
              <i className={`fa-solid fa-rotate-right text-xs ${isFetchingBulletin ? 'animate-spin' : ''}`}></i>
              {isFetchingBulletin ? 'Fetching...' : 'Refresh events'}
            </button>
          </header>

          <section className="bg-white border border-brand-black/5 rounded-lg p-8 shadow-sm space-y-8">
            <h3 className="text-xs font-medium text-brand-black/40 border-b border-brand-black/5 pb-4">Filters & search</h3>
            <div className="space-y-6">
              {/* Opportunity Type */}
              <div>
                <label className="text-xs font-medium text-brand-gray/70 block mb-3">Opportunity Type</label>
                <div className="flex flex-wrap gap-2">
                  {(['All', 'Competition', 'Grant', 'Fellowship', 'Residency', 'Open Call', 'Call for Entry', 'Portfolio Review', 'Festival', 'Event'] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setTypeFilter(t)}
                      className={`text-xs font-medium px-3 py-1.5 rounded-md border transition-all ${typeFilter === t ? 'bg-brand-blue text-white border-brand-blue' : 'bg-white text-brand-gray border-brand-black/5 hover:border-brand-blue/30'}`}
                    >{t === 'All' ? 'All types' : t}</button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Genre */}
                <div>
                  <label className="text-xs font-medium text-brand-gray/70 block mb-3">Genre Focus</label>
                  <select
                    value={genreFilter}
                    onChange={(e) => setGenreFilter(e.target.value as Genre | 'All')}
                    className="w-full bg-brand-white border border-brand-black/5 rounded-md px-4 py-2.5 text-xs focus:ring-1 focus:ring-brand-blue outline-none"
                  >
                    <option value="All">All Genres</option>
                    {genreOptions.map((g: Genre) => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
                {/* Region */}
                <div>
                  <label className="text-xs font-medium text-brand-gray/70 block mb-3">Region</label>
                  <select
                    value={regionFilter}
                    onChange={(e) => setRegionFilter(e.target.value as BulletinRegion | 'All')}
                    className="w-full bg-brand-white border border-brand-black/5 rounded-md px-4 py-2.5 text-xs focus:ring-1 focus:ring-brand-blue outline-none"
                  >
                    <option value="All">All Regions</option>
                    {(['Global', 'US', 'Europe', 'Asia', 'Latin America', 'Africa', 'Other'] as const).map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                {/* Priority */}
                <div>
                  <label className="text-xs font-medium text-brand-gray/70 block mb-3">Priority Level</label>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => setPriorityFilter('All')}
                      className={`text-xs font-medium px-3 py-1.5 rounded-md border transition-all ${priorityFilter === 'All' ? 'bg-brand-black text-white border-brand-black' : 'bg-white text-brand-gray border-brand-black/5'}`}
                    >All</button>
                    {(['high', 'medium', 'low'] as BulletinPriority[]).map((p) => (
                      <button
                        key={p}
                        onClick={() => setPriorityFilter(p)}
                        className={`text-xs font-medium px-3 py-1.5 rounded-md border transition-all ${priorityFilter === p ? 'bg-brand-black text-white border-brand-black' : 'bg-white text-brand-gray border-brand-black/5'}`}
                      >{p.charAt(0).toUpperCase() + p.slice(1)}</button>
                    ))}
                  </div>
                </div>
              </div>
              <p className="text-xs text-brand-gray/60">
                <i className="fa-solid fa-circle-info mr-1"></i> Filters apply instantly to loaded results. Hit <span className="font-medium text-brand-rose">Refresh events</span> to fetch a new set matching your selection.
              </p>
            </div>
          </section>

          <section>
            {isFetchingBulletin && aiBulletinItems.length === 0 ? (
              <div className="py-24 text-center border border-dashed border-brand-gray/20 rounded-lg">
                <i className="fa-solid fa-circle-notch animate-spin text-brand-rose text-xl mb-4 block"></i>
                <p className="text-brand-gray text-xs font-medium">Fetching upcoming events...</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {primaryBoardItems.length === 0 ? (
                  <div className="col-span-full py-24 text-center border border-dashed border-brand-gray/20 rounded-lg">
                    <p className="text-brand-gray text-xs font-medium">No opportunities match these filters</p>
                  </div>
                ) : (
                  primaryBoardItems.map((item) => (
                    <BulletinCard key={item.id} item={item} updateBulletinStatus={updateBulletinStatus} />
                  ))
                )}
              </div>
            )}
          </section>

          <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <button
              onClick={() => setActiveTab('cfe-considering')}
              className="group flex items-center justify-between p-6 bg-white border-2 border-amber-200 hover:border-amber-400 rounded-lg shadow-sm hover:shadow-md transition-all text-left"
            >
              <div className="flex items-center gap-4">
                <div className="w-1.5 h-12 bg-amber-400 rounded flex-shrink-0"></div>
                <div>
                  <p className="text-xs font-medium text-amber-600 mb-1 flex items-center gap-2">
                    <i className="fa-solid fa-bookmark"></i> Shortlist
                  </p>
                  <p className="text-xl font-bold text-brand-black">On the shortlist</p>
                  <p className="text-xs text-brand-gray mt-1">{consideringItems.length} {consideringItems.length === 1 ? 'opportunity' : 'opportunities'} under consideration</p>
                </div>
              </div>
              <i className="fa-solid fa-arrow-right text-amber-400 group-hover:translate-x-1 transition-transform"></i>
            </button>

            <button
              onClick={() => setActiveTab('cfe-applied')}
              className="group flex items-center justify-between p-6 bg-white border-2 border-emerald-200 hover:border-emerald-400 rounded-lg shadow-sm hover:shadow-md transition-all text-left"
            >
              <div className="flex items-center gap-4">
                <div className="w-1.5 h-12 bg-emerald-500 rounded flex-shrink-0"></div>
                <div>
                  <p className="text-xs font-medium text-emerald-600 mb-1 flex items-center gap-2">
                    <i className="fa-solid fa-paper-plane"></i> Applications
                  </p>
                  <p className="text-xl font-bold text-brand-black">Applications sent</p>
                  <p className="text-xs text-brand-gray mt-1">{appliedItems.length} {appliedItems.length === 1 ? 'application' : 'applications'} submitted</p>
                </div>
              </div>
              <i className="fa-solid fa-arrow-right text-emerald-500 group-hover:translate-x-1 transition-transform"></i>
            </button>
          </section>

          {archivedBoardItems.length > 0 && (
            <section className="pt-16 border-t border-brand-black/5">
              <h3 className="text-xs font-medium text-brand-black/30 mb-8 flex items-center gap-3">
                <i className="fa-solid fa-box-archive"></i> Archived opportunities
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {archivedBoardItems.map((item) => (
                  <BulletinCard key={item.id} item={item} updateBulletinStatus={updateBulletinStatus} onRemove={removeBulletinItem} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {activeTab === 'cfe-considering' && (
        <div className="animate-in fade-in duration-700 space-y-12">
          <header className="mb-10">
            <button
              onClick={() => setActiveTab('cfe')}
              className="flex items-center gap-2 text-xs font-medium text-brand-gray hover:text-brand-rose transition-colors mb-6"
            >
              <i className="fa-solid fa-arrow-left text-[9px]"></i> Bulletin Board
            </button>
            <div className="flex items-center gap-4">
              <div className="w-1.5 h-10 bg-amber-400 rounded"></div>
              <div>
                <h2 className="text-4xl font-display text-brand-black tracking-wide">ON THE SHORTLIST</h2>
                <p className="text-brand-gray mt-1 text-sm font-medium">{consideringItems.length} {consideringItems.length === 1 ? 'opportunity' : 'opportunities'} under consideration</p>
              </div>
            </div>
          </header>
          {consideringItems.length === 0 ? (
            <div className="py-24 text-center border border-dashed border-amber-200 rounded-lg">
              <i className="fa-solid fa-bookmark text-amber-300 text-2xl mb-4 block"></i>
              <p className="text-brand-gray text-xs font-medium">No events on your shortlist yet</p>
              <p className="text-brand-gray/50 text-xs mt-2">Mark events as Considering from the Bulletin Board.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {consideringItems.map((item) => (
                <BulletinCard key={item.id} item={item} updateBulletinStatus={updateBulletinStatus} onRemove={removeBulletinItem} />
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'cfe-applied' && (
        <div className="animate-in fade-in duration-700 space-y-12">
          <header className="mb-10">
            <button
              onClick={() => setActiveTab('cfe')}
              className="flex items-center gap-2 text-xs font-medium text-brand-gray hover:text-brand-rose transition-colors mb-6"
            >
              <i className="fa-solid fa-arrow-left text-[9px]"></i> Bulletin Board
            </button>
            <div className="flex items-center gap-4">
              <div className="w-1.5 h-10 bg-emerald-500 rounded"></div>
              <div>
                <h2 className="text-4xl font-display text-brand-black tracking-wide">APPLICATIONS SENT</h2>
                <p className="text-brand-gray mt-1 text-sm font-medium">{appliedItems.length} {appliedItems.length === 1 ? 'application' : 'applications'} submitted</p>
              </div>
            </div>
          </header>
          {appliedItems.length === 0 ? (
            <div className="py-24 text-center border border-dashed border-emerald-200 rounded-lg">
              <i className="fa-solid fa-paper-plane text-emerald-300 text-2xl mb-4 block"></i>
              <p className="text-brand-gray text-xs font-medium">No applications recorded yet</p>
              <p className="text-brand-gray/50 text-xs mt-2">Mark events as Applied from the Bulletin Board.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {appliedItems.map((item) => (
                <BulletinCard key={item.id} item={item} updateBulletinStatus={updateBulletinStatus} onRemove={removeBulletinItem} />
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'calendar' && (
        <CalendarView
          sessions={sessions}
          journalEntries={journalEntries}
          weekPlans={weekPlans}
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
          onGoToJournal={() => setActiveTab('journal')}
        />
      )}

      {activeTab === 'archive' && (
        <div className="animate-in fade-in duration-700">
          <header className="mb-10">
            <h2 className="text-4xl font-display text-brand-black tracking-wide">ARCHIVE</h2>
            <p className="text-brand-gray mt-2 text-sm font-medium">Completed sessions stored for reference.</p>
          </header>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {sessions.filter(s => s.status === 'archived').length === 0 ? (
              <div className="col-span-full py-24 text-center border border-dashed border-brand-gray/20 rounded-lg">
                <p className="text-brand-gray text-xs font-medium">No sessions archived yet</p>
              </div>
            ) : (
              sessions.filter(s => s.status === 'archived').map(session => (
                <SessionCard
                  key={session.id}
                  session={session}
                  onUpdateStatus={updateStatus}
                  onUpdate={updateSession}
                  onDelete={deleteSession}
                  hasJournal={journalEntries.some(e => e.sessionIds.includes(session.id))}
                  onGoToJournal={() => setActiveTab('journal')}
                />
              ))
            )}
          </div>
        </div>
      )}

      {activeTab === 'gear' && (
        <div className="animate-in fade-in duration-700">
          <header className="mb-10">
            <h2 className="text-4xl font-display text-brand-black tracking-wide">GEAR LOCKER</h2>
            <p className="text-brand-gray mt-2 text-sm font-medium">Equipment inventory informing strategy and planning.</p>
          </header>

          <section className="bg-brand-black rounded-lg p-8 text-brand-white mb-12 shadow-xl border border-white/5">
            <h3 className="text-xs font-semibold text-brand-rose mb-6">Register new equipment</h3>
            <form onSubmit={addGearItem} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <input
                  name="gearName"
                  placeholder="Name (e.g. Sony A9 III)"
                  required
                  className="bg-white/5 border border-white/10 rounded-md px-4 py-3 text-xs focus:ring-1 focus:ring-brand-blue outline-none transition-all placeholder:text-white/20"
                />
                <select
                  name="category"
                  required
                  className="bg-white/5 border border-white/10 rounded-md px-4 py-3 text-xs focus:ring-1 focus:ring-brand-blue outline-none transition-all"
                >
                  <option value="Body" className="text-brand-black">Body</option>
                  <option value="Lens" className="text-brand-black">Lens</option>
                  <option value="Flash" className="text-brand-black">Flash</option>
                  <option value="Modifier" className="text-brand-black">Modifier</option>
                  <option value="Support" className="text-brand-black">Support</option>
                  <option value="Accessory" className="text-brand-black">Accessory</option>
                </select>
                <input
                  name="tags"
                  placeholder="Tags (comma separated)"
                  className="bg-white/5 border border-white/10 rounded-md px-4 py-3 text-xs focus:ring-1 focus:ring-brand-blue outline-none transition-all placeholder:text-white/20"
                />
                <div className="flex items-center justify-between bg-white/5 border border-white/10 rounded-md px-4 py-3">
                  <span className="text-xs font-medium text-white/50">Available</span>
                  <input name="available" type="checkbox" defaultChecked className="accent-brand-rose h-4 w-4" />
                </div>
              </div>
              <div className="flex gap-4 items-start">
                <textarea
                  name="details"
                  placeholder="Equipment details / specs (e.g. 24-70mm f/2.8, stabilized)"
                  className="flex-1 bg-white/5 border border-white/10 rounded-md px-4 py-3 text-xs focus:ring-1 focus:ring-brand-blue outline-none transition-all placeholder:text-white/20 min-h-[60px]"
                />
                <button
                  type="submit"
                  className="bg-brand-blue hover:bg-[#7a93a0] text-white text-sm font-semibold rounded-md py-3 px-10 h-[60px] transition-all active:scale-95 shadow-lg"
                >
                  Add to locker
                </button>
              </div>
            </form>
          </section>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {gear.length === 0 ? (
              <div className="col-span-full py-24 text-center border border-dashed border-brand-gray/20 rounded-lg">
                <p className="text-brand-gray text-xs font-medium">Gear locker empty</p>
              </div>
            ) : (
              gear.map(item => (
                <div key={item.id} className={`bg-white rounded-lg border border-brand-black/5 p-6 shadow-sm transition-all duration-300 hover:shadow-md flex flex-col ${!item.available ? 'opacity-60' : ''}`}>
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <span className="text-xs font-medium bg-brand-black/5 px-2 py-0.5 rounded text-brand-gray mb-2 inline-block">
                        {item.category}
                      </span>
                      <h3 className="text-base font-semibold text-brand-black leading-snug mt-1">{item.name}</h3>
                    </div>
                    <button 
                      onClick={() => deleteGearItem(item.id)}
                      className="text-brand-black/10 hover:text-brand-rose transition-colors"
                    >
                      <i className="fa-solid fa-trash-can text-xs"></i>
                    </button>
                  </div>
                  {item.details && (
                    <p className="text-xs text-brand-gray leading-relaxed mb-4 flex-1 italic">{item.details}</p>
                  )}
                  {item.tags && item.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-6">
                      {item.tags.map(tag => (
                        <span key={tag} className="text-xs font-medium text-brand-blue bg-brand-blue/5 px-1.5 py-0.5 rounded">
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="pt-4 border-t border-brand-black/5 flex items-center justify-between">
                    <span className={`text-xs font-medium ${item.available ? 'text-emerald-600' : 'text-brand-rose'}`}>
                      {item.available ? 'Available' : 'Unavailable'}
                    </span>
                    <button
                      onClick={() => toggleGearAvailability(item.id)}
                      className="text-xs font-medium text-brand-blue hover:text-brand-black transition-colors"
                    >
                      Toggle status
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </Layout>
  );
};

export default App;