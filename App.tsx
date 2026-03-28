import React, { useState, useEffect, useMemo, useRef } from 'react';
import Layout from './components/Layout';
import SessionCard from './components/SessionCard';
import SessionSelector from './components/SessionSelector';
import LocationAutocomplete from './components/LocationAutocomplete';
import { Session, SessionStatus, Genre, GearItem, GearCategory, CfeBulletinItem, BulletinStatus, BulletinRegion, BulletinPriority, PhotoQuote, JournalEntry, JournalImage, PhotographerProfile, EditingApp, TetheringApp, FeedbackEntry, AssignmentTimeframe } from './types';
import { generateWeeklyPlan, generateAssignmentGuide, askProQuestion, fetchBulletinEvents } from './services/geminiService';
import { createCalendarEventForSession } from './services/calendarService';
import { GENRE_ICONS } from './constants';
import { PHOTO_QUOTES } from './quotes';
import { useAuth } from './AuthContext';
import LoginScreen from './LoginScreen';
import { useFirestore } from './hooks/useFirestore';

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
          className="text-[11px] text-brand-gray font-bold uppercase tracking-widest underline underline-offset-4 decoration-brand-rose/30 hover:text-brand-rose transition-colors"
          onClick={() => setIsOpen(true)}
        >
          This missed the mark
        </button>
      ) : (
        <div className="space-y-2 bg-brand-white p-3 border border-brand-black/5 rounded-sm animate-in fade-in slide-in-from-top-1 duration-200">
          <textarea
            className="w-full resize-none rounded-sm border border-brand-black/10 bg-white p-2 text-[11px] outline-none focus:ring-1 focus:ring-brand-rose"
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What didn’t feel right about this advice?"
          />
          <div className="flex gap-4">
            <button
              type="button"
              className="text-[10px] font-bold uppercase tracking-widest text-brand-gray"
              onClick={() => {
                setIsOpen(false);
                setNote('');
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              className="text-[10px] font-bold uppercase tracking-widest text-brand-rose"
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

  const askButtonClass = props.isFieldMode ? 'w-full py-4 text-[12px]' : 'px-10 py-4 text-[10px]';

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
        <div className="bg-brand-black rounded-sm p-8 text-brand-white shadow-xl border border-white/5">
          <div className="space-y-6">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-[0.25em] text-brand-rose block mb-3">
                Your question
              </label>
              <textarea
                ref={askProInputRef}
                className="w-full bg-white/5 border border-white/10 rounded-sm px-5 py-4 text-sm focus:ring-1 focus:ring-brand-rose outline-none transition-all placeholder:text-white/20 min-h-[200px] resize-none"
                value={props.askProInput}
                onChange={(e) => props.setAskProInput(e.target.value)}
                placeholder={askProPlaceholder}
              />
            </div>
            
            <div className="flex justify-end">
              <button
                onClick={props.onAskProSubmit}
                disabled={props.isGeneratingAskPro || !props.askProInput.trim()}
                className={`flex items-center justify-center gap-3 rounded-sm font-bold uppercase tracking-[0.2em] transition-all shadow-lg ${askButtonClass} ${
                  props.isGeneratingAskPro || !props.askProInput.trim()
                    ? 'bg-brand-gray/20 text-brand-gray cursor-not-allowed'
                    : 'bg-brand-rose text-brand-white hover:bg-[#c99595] active:scale-95'
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

        <div className="bg-white rounded-sm border border-brand-black/5 shadow-sm overflow-hidden flex flex-col h-full">
          <div className="bg-brand-black/5 px-8 py-5 border-b border-brand-black/5 flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-brand-black/40">The Pro's Response</span>
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
                    className="text-[11px] font-bold text-brand-rose uppercase tracking-widest underline underline-offset-4"
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
                <p className="text-[10px] font-bold uppercase tracking-[0.2em]">Your answer from the pro will appear here.</p>
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
}

const BulletinCard: React.FC<BulletinCardProps> = ({ item, updateBulletinStatus }) => {
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
    <div className={`bg-white rounded-sm border border-brand-black/5 shadow-sm overflow-hidden flex flex-col group hover:shadow-md transition-all duration-500 ${isArchived ? 'opacity-80 grayscale-[0.4]' : ''}`}>
      <div className="bg-brand-black p-6 text-brand-white flex items-center justify-between">
        <div>
          <div className="flex gap-2 items-center mb-2">
            <span className="text-[8px] font-bold uppercase tracking-[0.2em] bg-white/10 px-2 py-0.5 rounded-sm text-brand-rose">
              {item.type}
            </span>
            <span className={`text-[8px] font-bold uppercase tracking-widest ${priorityConfig[item.priority].color}`}>
              <i className="fa-solid fa-bolt mr-1"></i> {item.priority}
            </span>
          </div>
          <h3 className="font-display text-2xl leading-none tracking-widest">{item.name.toUpperCase()}</h3>
        </div>
        <i className="fa-solid fa-newspaper text-brand-rose/40 text-xl"></i>
      </div>
      
      <div className="p-8 flex-1 flex flex-col">
        <div className="flex justify-between items-start mb-4">
          {item.organizer && (
            <p className="text-[10px] font-bold text-brand-gray uppercase tracking-[0.2em]">
              ORGANIZER: <span className="text-brand-black">{item.organizer}</span>
            </p>
          )}
          <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-sm tracking-widest ${statusConfig[item.status].color}`}>
            {statusConfig[item.status].label}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="bg-brand-white p-3 rounded-sm border border-brand-black/5">
            <p className="text-[8px] text-brand-gray uppercase font-bold tracking-tighter mb-1">Deadline</p>
            <p className={`text-[11px] font-bold ${item.deadline === 'Rolling' ? 'text-brand-blue' : 'text-brand-rose'}`}>
              {item.deadline || 'TBA'}
            </p>
          </div>
          <div className="bg-brand-white p-3 rounded-sm border border-brand-black/5">
            <p className="text-[8px] text-brand-gray uppercase font-bold tracking-tighter mb-1">Region / Location</p>
            <p className="text-[10px] text-brand-black font-bold uppercase truncate">
              {item.region} {item.location && `• ${item.location}`}
            </p>
          </div>
        </div>

        <div className="bg-brand-white p-3 rounded-sm border border-brand-black/5 mb-6">
          <p className="text-[8px] text-brand-gray uppercase font-bold tracking-tighter mb-1">Entry Fee</p>
          <p className="text-[11px] text-brand-black font-bold uppercase truncate">
            {item.fee || 'Free'}
          </p>
        </div>

        {item.genres && (
          <div className="flex flex-wrap gap-1.5 mb-6">
            {item.genres.map(g => (
              <span key={g} className="text-[9px] px-2 py-1 bg-brand-blue/5 text-brand-blue font-bold uppercase tracking-widest rounded-sm border border-brand-blue/10">
                {g}
              </span>
            ))}
          </div>
        )}

        {item.blurb && (
          <p className="text-[11px] text-brand-gray leading-relaxed mb-8 flex-1 italic">
            {item.blurb}
          </p>
        )}

        <div className="mt-auto space-y-4 pt-6 border-t border-brand-black/5">
          <div className="flex gap-2">
            <a 
              href={item.url} 
              target="_blank" 
              rel="noopener noreferrer"
              className="flex-1 bg-brand-black text-white hover:bg-zinc-700 font-bold uppercase tracking-[0.2em] text-[10px] rounded-sm py-4 text-center transition-all active:scale-95 shadow-lg flex items-center justify-center gap-2"
            >
              VIEW DETAILS <i className="fa-solid fa-arrow-up-right-from-square text-[9px]"></i>
            </a>
            {!isArchived ? (
              <button 
                onClick={() => updateBulletinStatus(item.id, 'archived')}
                className="px-5 bg-brand-white border border-brand-black/5 hover:bg-brand-rose/5 text-brand-gray hover:text-brand-rose transition-all rounded-sm"
                title="Archive"
              >
                <i className="fa-solid fa-box-archive"></i>
              </button>
            ) : (
              <button 
                onClick={() => updateBulletinStatus(item.id, 'unmarked')}
                className="px-5 bg-brand-white border border-brand-black/5 hover:bg-brand-blue/5 text-brand-gray hover:text-brand-blue transition-all rounded-sm"
                title="Restore"
              >
                <i className="fa-solid fa-box-open"></i>
              </button>
            )}
          </div>

          {!isArchived && (
            <div className="flex gap-2">
              <button
                onClick={() => updateBulletinStatus(item.id, 'considering')}
                className={`flex-1 text-[9px] font-bold uppercase tracking-widest py-2 rounded-sm border transition-all ${
                  item.status === 'considering'
                    ? 'bg-amber-100 text-amber-700 border-amber-200'
                    : 'bg-white text-brand-gray border-brand-black/5 hover:border-amber-200'
                }`}
              >
                Considering
              </button>
              <button
                onClick={() => updateBulletinStatus(item.id, 'applied')}
                className={`flex-1 text-[9px] font-bold uppercase tracking-widest py-2 rounded-sm border transition-all ${
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
      <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">
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
        <span key={app} className="inline-flex items-center gap-1.5 text-[10px] font-bold text-white/50 uppercase tracking-widest">
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
      if (data.journal)          setJournalEntries(data.journal);
      if (data.profile)          setProfile(data.profile);
      if (data.bulletinState)    setBulletinState(data.bulletinState);
      if (data.bulletinItems)    setAiBulletinItems(data.bulletinItems);
      if (data.bulletinFetchedAt !== undefined) setBulletinFetchedAt(data.bulletinFetchedAt);
      if (data.feedback)         setFeedbackLog(data.feedback);
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
  // Images are base64 and can exceed Firestore's 1MB document limit,
  // so we strip them before the cloud write. They remain intact in localStorage.
  useEffect(() => {
    localStorage.setItem('pingstudio_journal', JSON.stringify(journalEntries));
    const journalWithoutImages = journalEntries.map(entry => ({ ...entry, images: [] }));
    saveUserData({ journal: journalWithoutImages });
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
      status: 'shot',
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

  const getBulletinItemStatus = (id: string): BulletinStatus => {
    return bulletinState[id] || 'unmarked';
  };

  const refreshBulletinEvents = async () => {
    setIsFetchingBulletin(true);
    const items = await fetchBulletinEvents(genreFilter, regionFilter);
    if (items.length > 0) {
      setAiBulletinItems(items);
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
    if (!files) return;
    // Reset input so the same file can be re-selected after removal
    e.target.value = '';
    Array.from(files).forEach((file: File) => {
      compressImage(file).then(dataUrl => {
        setJournalForm(prev => ({
          ...prev,
          images: [
            ...prev.images,
            {
              id: Date.now().toString() + Math.random().toString(36).substring(2, 9),
              name: file.name,
              dataUrl
            }
          ]
        }));
      }).catch(() => {
        console.warn('Image compression failed for', file.name);
      });
    });
  };

  const deleteJournalEntry = (id: string) => {
    if (confirm("Permanently delete this journal entry?")) {
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
    <div className="bg-brand-white border border-brand-black/5 rounded-sm p-5 shadow-sm">
      <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand-black/50 mb-3 flex items-center gap-2">
        <i className="fa-solid fa-toolbox text-brand-rose"></i> Gear in Locker
      </h4>
      <div className="max-h-32 overflow-y-auto no-scrollbar space-y-2">
        {gear.length === 0 ? (
          <p className="text-[10px] text-brand-gray/50 italic">No gear registered.</p>
        ) : (
          gear.map(item => (
            <div key={item.id} className="flex justify-between items-center text-[10px] py-1 border-b border-brand-black/5 last:border-0">
              <span className={`font-bold uppercase tracking-wider ${item.available ? 'text-brand-black' : 'text-brand-gray/40 line-through'}`}>
                {item.name}
              </span>
              <span className="text-[8px] px-1.5 py-0.5 bg-brand-black/5 rounded-sm text-brand-gray font-bold uppercase">{item.category}</span>
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
      <div className="bg-brand-white border border-brand-black/5 rounded-sm p-5 shadow-sm">
        <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand-black/50 mb-3 flex items-center gap-2">
          <i className="fa-solid fa-trophy text-brand-rose"></i> Bulletin Highlights
        </h4>
        <div className="space-y-3">
          {upcoming.length === 0 ? (
            <p className="text-[10px] text-brand-gray/50 italic">No upcoming deadlines.</p>
          ) : (
            upcoming.map(item => (
              <div key={item.id} className="border-b border-brand-black/5 last:border-0 pb-2 last:pb-0">
                <p className="text-[10px] font-bold text-brand-black truncate uppercase tracking-wider">{item.name}</p>
                <div className="flex justify-between items-center mt-1">
                  <span className="text-[8px] text-brand-rose font-bold uppercase tracking-widest">{item.deadline}</span>
                  <span className="text-[8px] text-brand-gray uppercase font-bold tracking-tighter">{item.type}</span>
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
      return matchGenre && matchRegion && matchPriority && item.status === 'unmarked';
    });

    return filtered.sort((a, b) => {
      const userPriority: Record<BulletinPriority, number> = { high: 3, medium: 2, low: 1 };
      const diffPriority = userPriority[b.priority] - userPriority[a.priority];
      if (diffPriority !== 0) return diffPriority;
      if (a.deadline === 'Rolling') return 1;
      if (b.deadline === 'Rolling') return -1;
      return (a.deadline || 'TBA').localeCompare(b.deadline || 'TBA');
    });
  }, [enrichedBulletin, genreFilter, regionFilter, priorityFilter]);

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
                <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand-black">Field mode</label>
                <button 
                  onClick={() => setIsFieldMode(!isFieldMode)}
                  className={`w-10 h-5 rounded-full transition-all relative ${isFieldMode ? 'bg-brand-rose' : 'bg-brand-gray/30'}`}
                >
                  <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all ${isFieldMode ? 'left-6' : 'left-1'}`}></div>
                </button>
              </div>
              <p className="text-[8px] font-bold text-brand-gray/60 uppercase tracking-tighter">Simplify layout for on-assignment use.</p>
            </div>
          </header>

          <section className="bg-brand-white border border-brand-black/5 rounded-sm p-8 mb-12 shadow-sm relative overflow-hidden group hover:border-brand-rose/20 transition-all duration-700">
             <div className="absolute top-0 left-0 w-1 h-full bg-brand-rose/20"></div>
             <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-brand-rose mb-6">DAILY INSPIRATION</p>
             <div className="max-w-2xl">
               <p className="text-xl md:text-2xl font-serif italic text-brand-black leading-snug mb-4">
                 "{dailyQuote.text}"
               </p>
               <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-gray">
                 — {dailyQuote.author}
               </p>
             </div>
             <i className="fa-solid fa-quote-right absolute bottom-6 right-8 text-4xl text-brand-black/5"></i>
          </section>

          <section className="bg-brand-black rounded-sm p-8 text-brand-white mb-12 shadow-xl border border-white/5">
            <h3 className="text-[10px] font-bold uppercase tracking-[0.25em] text-brand-rose mb-6">LOG NEW SESSION</h3>
            <form onSubmit={addSession} className="space-y-4">
              <input
                name="title"
                type="text"
                placeholder="SESSION TITLE (OPTIONAL)"
                className="w-full bg-white/5 border border-white/10 rounded-sm px-4 py-3 text-xs focus:ring-1 focus:ring-brand-rose outline-none transition-all placeholder:text-white/20 uppercase"
              />
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
                <input 
                  name="date" 
                  type="date" 
                  required
                  className="bg-white/5 border border-white/10 rounded-sm px-4 py-3 text-xs focus:ring-1 focus:ring-brand-rose outline-none transition-all"
                />
                <LocationAutocomplete 
                  name="location" 
                  placeholder="LOCATION (E.G. AUSTIN)" 
                  required
                  className="bg-white/5 border border-white/10 rounded-sm px-4 py-3 text-xs focus:ring-1 focus:ring-brand-rose outline-none transition-all placeholder:text-white/20 uppercase"
                />
                <select 
                  name="genre"
                  required
                  className="bg-white/5 border border-white/10 rounded-sm px-4 py-3 text-xs focus:ring-1 focus:ring-brand-rose outline-none transition-all uppercase"
                >
                  {genreOptions.map(g => (
                    <option key={g} value={g} className="text-brand-black">{g}</option>
                  ))}
                </select>
                <button 
                  type="submit"
                  className="bg-brand-rose hover:bg-[#c99595] text-white font-bold uppercase tracking-[0.2em] text-[10px] rounded-sm py-3 transition-all active:scale-95 shadow-lg"
                >
                  INDEX SESSION
                </button>
              </div>
              <textarea 
                name="notes"
                placeholder="NOTES / CREATIVE BRIEF"
                className="w-full bg-white/5 border border-white/10 rounded-sm px-4 py-3 text-xs focus:ring-1 focus:ring-brand-rose outline-none transition-all placeholder:text-white/20 min-h-[80px]"
              />
            </form>
          </section>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {sessions.filter(s => s.status !== 'archived').length === 0 ? (
              <div className="col-span-full py-24 text-center border border-dashed border-brand-gray/20 rounded-sm">
                <p className="text-brand-gray text-[10px] font-bold uppercase tracking-widest">NO ACTIVE SESSIONS DETECTED</p>
              </div>
            ) : (
              sessions.filter(s => s.status !== 'archived').map(session => (
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

      {activeTab === 'profile' && (
        <div className="animate-in fade-in duration-700">
          <header className="mb-10 flex justify-between items-end">
            <div>
              <h2 className="text-4xl font-display text-brand-black tracking-wide">PHOTOGRAPHER PROFILE</h2>
              <p className="text-brand-gray mt-2 text-sm font-medium">Define your shooting style, constraints, and growth goals.</p>
            </div>
            {profileSuccessMsg && (
              <div className="bg-emerald-500 text-white text-[10px] font-bold uppercase tracking-widest px-4 py-2 rounded-sm shadow-lg animate-in slide-in-from-right fade-in duration-500">
                <i className="fa-solid fa-check mr-2"></i> Profile Applied Successfully
              </div>
            )}
          </header>

          {user && (
            <div className="mb-8 flex items-center justify-between bg-white border border-brand-black/5 rounded-sm px-6 py-4 shadow-sm">
              <div className="flex items-center gap-4">
                {user.photoURL ? (
                  <img src={user.photoURL} alt="avatar" className="w-9 h-9 rounded-full object-cover border border-brand-black/10" />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-brand-rose/10 flex items-center justify-center">
                    <i className="fa-solid fa-user text-brand-rose text-sm"></i>
                  </div>
                )}
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-widest text-brand-black">{user.displayName || 'Photographer'}</p>
                  <p className="text-[10px] text-brand-gray mt-0.5">{user.email}</p>
                </div>
              </div>
              <button
                onClick={signOut}
                className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-widest text-brand-gray border border-brand-black/10 px-4 py-2 rounded-sm hover:bg-brand-rose hover:text-white hover:border-brand-rose transition-all"
              >
                <i className="fa-solid fa-arrow-right-from-bracket text-[10px]"></i>
                SIGN OUT
              </button>
            </div>
          )}

          <section className="bg-white rounded-sm border border-brand-black/5 p-10 shadow-sm">
            <div className="space-y-12">
              <div>
                <h3 className="text-[10px] font-bold uppercase tracking-[0.3em] text-brand-rose mb-6 border-b border-brand-black/5 pb-2">BASICS</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div>
                    <label className="text-[9px] font-bold uppercase tracking-widest text-brand-gray block mb-2">NAME</label>
                    <input 
                      type="text"
                      value={draftProfile.name}
                      onChange={e => setDraftProfile(prev => ({ ...prev, name: e.target.value }))}
                      className="w-full bg-brand-white border border-brand-black/5 rounded-sm px-4 py-3 text-xs focus:ring-1 focus:ring-brand-rose outline-none transition-all uppercase tracking-widest"
                      placeholder="E.G. JANE DOE"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] font-bold uppercase tracking-widest text-brand-gray block mb-2">YEARS SHOOTING</label>
                    <input 
                      type="text"
                      value={draftProfile.yearsShooting}
                      onChange={e => setDraftProfile(prev => ({ ...prev, yearsShooting: e.target.value }))}
                      className="w-full bg-brand-white border border-brand-black/5 rounded-sm px-4 py-3 text-xs focus:ring-1 focus:ring-brand-rose outline-none transition-all uppercase tracking-widest"
                      placeholder="E.G. 5 YEARS, OR SINCE 2018"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="text-[9px] font-bold uppercase tracking-widest text-brand-gray block mb-3">PRIMARY GENRES</label>
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
                          className={`text-[9px] font-bold px-4 py-2 rounded-sm border transition-all ${
                            draftProfile.primaryGenres.includes(g)
                              ? 'bg-brand-rose text-white border-brand-rose'
                              : 'bg-brand-white text-brand-gray border-brand-black/5'
                          }`}
                        >
                          {g.toUpperCase()}
                        </button>
                      ))}
                    </div>
                    {draftProfile.primaryGenres.includes('Other') && (
                      <input
                        type="text"
                        value={draftProfile.otherGenreNote || ''}
                        onChange={e => setDraftProfile(prev => ({ ...prev, otherGenreNote: e.target.value }))}
                        placeholder="Specify your genre..."
                        className="mt-3 w-full bg-brand-white border border-brand-rose/30 rounded-sm px-4 py-2.5 text-[10px] text-brand-black placeholder-brand-gray/40 focus:ring-1 focus:ring-brand-rose outline-none"
                      />
                    )}
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-[10px] font-bold uppercase tracking-[0.3em] text-brand-rose mb-6 border-b border-brand-black/5 pb-2">SOFTWARE & WORKFLOW</h3>
                <div className="space-y-8">
                  <div>
                    <label className="text-[9px] font-bold uppercase tracking-widest text-brand-gray block mb-3">EDITING / RAW</label>
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
                          className={`text-[9px] font-bold px-4 py-2 rounded-sm border transition-all ${
                            draftProfile.editingApps.includes(app)
                              ? 'bg-brand-blue text-white border-brand-blue'
                              : 'bg-brand-white text-brand-gray border-brand-black/5'
                          }`}
                        >
                          {app.toUpperCase()}
                        </button>
                      ))}
                    </div>
                    {draftProfile.editingApps.includes('Other') && (
                      <input
                        type="text"
                        value={draftProfile.otherEditingAppNote || ''}
                        onChange={e => setDraftProfile(prev => ({ ...prev, otherEditingAppNote: e.target.value }))}
                        placeholder="Specify your editing app..."
                        className="mt-3 w-full bg-brand-white border border-brand-blue/30 rounded-sm px-4 py-2.5 text-[10px] text-brand-black placeholder-brand-gray/40 focus:ring-1 focus:ring-brand-blue outline-none"
                      />
                    )}
                  </div>
                  <div>
                    <label className="text-[9px] font-bold uppercase tracking-widest text-brand-gray block mb-3">TETHERING / CAPTURE</label>
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
                          className={`text-[9px] font-bold px-4 py-2 rounded-sm border transition-all ${
                            draftProfile.tetheringApps.includes(app)
                              ? 'bg-brand-rose text-white border-brand-rose'
                              : 'bg-brand-white text-brand-gray border-brand-black/5'
                          }`}
                        >
                          {app.toUpperCase()}
                        </button>
                      ))}
                    </div>
                    {draftProfile.tetheringApps.includes('Other') && (
                      <input
                        type="text"
                        value={draftProfile.otherTetheringAppNote || ''}
                        onChange={e => setDraftProfile(prev => ({ ...prev, otherTetheringAppNote: e.target.value }))}
                        placeholder="Specify your tethering app..."
                        className="mt-3 w-full bg-brand-white border border-brand-rose/30 rounded-sm px-4 py-2.5 text-[10px] text-brand-black placeholder-brand-gray/40 focus:ring-1 focus:ring-brand-rose outline-none"
                      />
                    )}
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-[10px] font-bold uppercase tracking-[0.3em] text-brand-rose mb-6 border-b border-brand-black/5 pb-2">WORK & STYLE</h3>
                <div className="space-y-6">
                  <div>
                    <label className="text-[9px] font-bold uppercase tracking-widest text-brand-gray block mb-2">TYPICAL WORK / SCOPE</label>
                    <textarea 
                      value={draftProfile.typicalWork}
                      onChange={e => setDraftProfile(prev => ({ ...prev, typicalWork: e.target.value }))}
                      className="w-full bg-brand-white border border-brand-black/5 rounded-sm px-4 py-3 text-xs focus:ring-1 focus:ring-brand-rose outline-none transition-all min-h-[80px]"
                      placeholder="E.G. EDITORIAL ASSIGNMENTS, STREET PHOTOGRAPHY SERIES"
                    />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div>
                      <label className="text-[9px] font-bold uppercase tracking-widest text-brand-gray block mb-2">STYLE KEYWORDS</label>
                      <input 
                        type="text"
                        value={styleKeywordsDraft}
                        onChange={e => setStyleKeywordsDraft(e.target.value)}
                        className="w-full bg-brand-white border border-brand-black/5 rounded-sm px-4 py-3 text-xs focus:ring-1 focus:ring-brand-rose outline-none transition-all"
                        placeholder="cinematic, high contrast, natural light…"
                      />
                      <p className="text-[8px] text-brand-gray mt-2 tracking-tighter">Type style keywords separated by commas, e.g. cinematic, high contrast, natural light.</p>
                    </div>
                    <div>
                      <label className="text-[9px] font-bold uppercase tracking-widest text-brand-gray block mb-2">RISK PROFILE</label>
                      <div className="flex gap-2">
                        {(['cautious', 'balanced', 'experimental'] as PhotographerProfile['riskProfile'][]).map((r) => (
                          <button
                            key={r}
                            onClick={() => setDraftProfile(prev => ({ ...prev, riskProfile: r }))}
                            className={`flex-1 text-[9px] font-bold py-3 rounded-sm border transition-all uppercase tracking-widest ${
                              draftProfile.riskProfile === r
                                ? 'bg-brand-black text-white border-brand-black'
                                : 'bg-brand-white text-brand-gray border-brand-black/5'
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
                <h3 className="text-[10px] font-bold uppercase tracking-[0.3em] text-brand-rose mb-6 border-b border-brand-black/5 pb-2">STRENGTHS & STRUGGLES</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div>
                    <label className="text-[9px] font-bold uppercase tracking-widest text-brand-gray block mb-2">STRENGTHS</label>
                    <textarea 
                      value={draftProfile.strengths}
                      onChange={e => setDraftProfile(prev => ({ ...prev, strengths: e.target.value }))}
                      className="w-full bg-brand-white border border-brand-black/5 rounded-sm px-4 py-3 text-xs focus:ring-1 focus:ring-brand-rose outline-none transition-all min-h-[100px]"
                      placeholder="DESCRIBE WHAT YOU DO BEST..."
                    />
                  </div>
                  <div>
                    <label className="text-[9px] font-bold uppercase tracking-widest text-brand-gray block mb-2">STRUGGLES / CHALLENGES</label>
                    <textarea 
                      value={draftProfile.struggles}
                      onChange={e => setDraftProfile(prev => ({ ...prev, struggles: e.target.value }))}
                      className="w-full bg-brand-white border border-brand-black/5 rounded-sm px-4 py-3 text-xs focus:ring-1 focus:ring-brand-rose outline-none transition-all min-h-[100px]"
                      placeholder="WHERE DO YOU FEEL FRICTION OR STALL?"
                    />
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-[10px] font-bold uppercase tracking-[0.3em] text-brand-rose mb-6 border-b border-brand-black/5 pb-2">CONSTRAINTS & REALITY</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                  <div className="md:col-span-1">
                    <label className="text-[9px] font-bold uppercase tracking-widest text-brand-gray block mb-2">PHYSICAL CONSTRAINTS</label>
                    <textarea 
                      value={draftProfile.physicalConstraints}
                      onChange={e => setDraftProfile(prev => ({ ...prev, physicalConstraints: e.target.value }))}
                      className="w-full bg-brand-white border border-brand-black/5 rounded-sm px-4 py-3 text-xs focus:ring-1 focus:ring-brand-rose outline-none transition-all min-h-[80px]"
                      placeholder="E.G. HEIGHT, STAMINA, CROWD TOLERANCE"
                    />
                  </div>
                  <div className="md:col-span-1">
                    <label className="text-[9px] font-bold uppercase tracking-widest text-brand-gray block mb-2">ACCESS REALITY</label>
                    <textarea 
                      value={draftProfile.accessReality}
                      onChange={e => setDraftProfile(prev => ({ ...prev, accessReality: e.target.value }))}
                      className="w-full bg-brand-white border border-brand-black/5 rounded-sm px-4 py-3 text-xs focus:ring-1 focus:ring-brand-rose outline-none transition-all min-h-[80px]"
                      placeholder="E.G. PUBLIC STANDS, PRESS ACCESS, SIDELINES"
                    />
                  </div>
                  <div className="md:col-span-1">
                    <label className="text-[9px] font-bold uppercase tracking-widest text-brand-gray block mb-2">TIME BUDGET</label>
                    <textarea 
                      value={draftProfile.timeBudget}
                      onChange={e => setDraftProfile(prev => ({ ...prev, timeBudget: e.target.value }))}
                      className="w-full bg-brand-white border border-brand-black/5 rounded-sm px-4 py-3 text-xs focus:ring-1 focus:ring-brand-rose outline-none transition-all min-h-[80px]"
                      placeholder="TYPICAL TIME AVAILABLE PER ASSIGNMENT"
                    />
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-[10px] font-bold uppercase tracking-[0.3em] text-brand-rose mb-6 border-b border-brand-black/5 pb-2">GROWTH GOALS</h3>
                <div>
                  <label className="text-[9px] font-bold uppercase tracking-widest text-brand-gray block mb-2">2-3 TARGET SKILLS OR PATTERNS</label>
                  <textarea 
                    value={draftProfile.growthGoals}
                    onChange={e => setDraftProfile(prev => ({ ...prev, growthGoals: e.target.value }))}
                    className="w-full bg-brand-white border border-brand-black/5 rounded-sm px-4 py-4 text-xs focus:ring-1 focus:ring-brand-rose outline-none transition-all min-h-[100px]"
                    placeholder="WHAT ARE YOU CURRENTLY TRYING TO MASTER?"
                  />
                </div>
              </div>

              {/* Profile Actions */}
              <div className="pt-10 flex flex-col md:flex-row gap-4 justify-end border-t border-brand-black/5">
                <button
                  onClick={handleResetProfile}
                  disabled={!isProfileDirty}
                  className={`px-8 py-4 rounded-sm text-[10px] font-bold uppercase tracking-[0.2em] transition-all border ${
                    isProfileDirty 
                      ? 'bg-white text-brand-gray border-brand-black/10 hover:bg-brand-black/5' 
                      : 'bg-white text-brand-gray/30 border-brand-black/5 cursor-not-allowed'
                  }`}
                >
                  Discard Edits
                </button>
                <button
                  onClick={handleApplyProfile}
                  disabled={!isProfileDirty}
                  className={`px-12 py-4 rounded-sm text-[10px] font-bold uppercase tracking-[0.2em] transition-all shadow-lg ${
                    isProfileDirty 
                      ? 'bg-brand-rose text-white hover:bg-[#c99595] active:scale-95' 
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
            <div className="lg:col-span-3 bg-white rounded-sm border border-brand-black/5 p-8 shadow-sm">
              <SessionSelector 
                sessions={sessions.filter(s => s.status !== 'archived')} 
                selectedIds={selectedPlannerSessionIds} 
                onToggle={toggleSessionInPlanner}
                label="ATTACH SESSIONS TO PLANNING CONTEXT"
              />

              <textarea
                className="w-full h-40 p-5 bg-brand-white border border-brand-black/5 rounded-sm focus:ring-1 focus:ring-brand-rose outline-none transition-all text-sm leading-relaxed text-brand-black placeholder:text-brand-gray/40"
                placeholder="Outline your upcoming week, availability, and specific shoot goals..."
                value={plannerInput}
                onChange={(e) => setPlannerInput(e.target.value)}
              />
              <div className="mt-6 flex justify-end">
                <button
                  disabled={isGeneratingPlan || (!plannerInput.trim() && selectedPlannerSessionIds.length === 0)}
                  onClick={handleGeneratePlan}
                  className={`flex items-center gap-3 px-10 py-4 rounded-sm font-bold uppercase tracking-[0.2em] text-[10px] transition-all ${
                    isGeneratingPlan || (!plannerInput.trim() && selectedPlannerSessionIds.length === 0)
                      ? 'bg-brand-white text-brand-gray border border-brand-black/5 cursor-not-allowed' 
                      : 'bg-brand-rose text-white hover:shadow-md active:scale-95 shadow-sm'
                  }`}
                >
                  {isGeneratingPlan ? (
                    <><i className="fa-solid fa-circle-notch animate-spin"></i> PROCESSING</>
                  ) : (
                    <><i className="fa-solid fa-wand-magic-sparkles"></i> COMPILE STRATEGY</>
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
            <div className="bg-brand-black rounded-sm shadow-2xl overflow-hidden border border-white/10">
              <div className="px-8 py-5 border-b border-white/10 flex items-center justify-between flex-wrap gap-3">
                <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-brand-rose">DOCUMENT: ASSIGNMENT STRATEGY</span>
                <div className="flex items-center gap-3 flex-wrap">
                  <button
                    onClick={() => handleCopy(plannerOutput, setPlannerCopied)}
                    className="text-[9px] font-bold uppercase tracking-widest text-brand-blue hover:text-white transition-colors border border-brand-blue/30 px-3 py-1 rounded-sm bg-brand-blue/5"
                  >
                    {plannerCopied ? 'COPIED' : 'COPY TEXT'}
                  </button>
                  <div className="flex items-center gap-2">
                    <select
                      value={plannerAttachId}
                      onChange={e => { setPlannerAttachId(e.target.value); setPlannerAttached(false); }}
                      className="bg-white/5 border border-white/10 text-white text-[9px] font-bold uppercase tracking-widest px-3 py-1 rounded-sm outline-none focus:ring-1 focus:ring-brand-rose"
                    >
                      <option value="" className="text-brand-black">ATTACH TO SESSION...</option>
                      {sessions.filter(s => s.status !== 'archived').map(s => (
                        <option key={s.id} value={s.id} className="text-brand-black">
                          {s.title ? s.title.toUpperCase() : `${s.location} — ${s.date}`}
                        </option>
                      ))}
                    </select>
                    {plannerAttachId && (
                      <button
                        onClick={() => attachStrategyToSession(plannerAttachId, plannerOutput, 'strategy', () => setPlannerAttached(true))}
                        className="text-[9px] font-bold uppercase tracking-widest text-brand-rose hover:text-white transition-colors border border-brand-rose/40 px-3 py-1 rounded-sm bg-brand-rose/5"
                      >
                        {plannerAttached ? '✓ ATTACHED' : 'ATTACH'}
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
            <div className="lg:col-span-3 bg-brand-black rounded-sm p-10 text-white shadow-2xl relative overflow-hidden border border-white/5">
              <div className="relative z-10">
                {!isFieldMode && <h3 className="text-2xl font-display mb-6 tracking-widest text-brand-rose">ASSIGNMENT BRIEF</h3>}
                <div className="flex flex-col gap-6">
                  <div className="bg-white/5 p-6 rounded-sm border border-white/10 mb-2">
                    <SessionSelector
                      sessions={sessions.filter(s => s.status !== 'archived')}
                      selectedIds={selectedAssignmentSessionIds}
                      onToggle={toggleSessionInAssignment}
                      label="ATTACH RELEVANT ASSIGNMENT SESSIONS"
                    />
                    {sessions.some(s => selectedAssignmentSessionIds.includes(s.id) && s.strategy) && (
                      <button
                        type="button"
                        onClick={() => setIncludeAttachedStrategy(v => !v)}
                        className={`mt-3 flex items-center gap-3 w-full px-4 py-3 rounded-sm border transition-all ${
                          includeAttachedStrategy
                            ? 'bg-brand-rose/10 border-brand-rose/40 text-brand-rose'
                            : 'bg-white/5 border-white/10 text-white/40 hover:border-white/30 hover:text-white/60'
                        }`}
                      >
                        <div className={`w-4 h-4 rounded-sm border flex items-center justify-center flex-shrink-0 transition-all ${
                          includeAttachedStrategy ? 'bg-brand-rose border-brand-rose' : 'border-white/20'
                        }`}>
                          {includeAttachedStrategy && <i className="fa-solid fa-check text-[9px] text-white"></i>}
                        </div>
                        <span className="text-[9px] font-bold uppercase tracking-[0.2em]">
                          INCLUDE ATTACHED STRATEGY AS FOUNDATION
                        </span>
                        <i className="fa-solid fa-file-contract ml-auto text-[10px] opacity-50"></i>
                      </button>
                    )}
                  </div>

                  <div className="flex flex-col gap-3 mb-2">
                    <label className="text-[9px] font-bold uppercase tracking-[0.3em] text-white/50">ASSIGNMENT TIMEFRAME</label>
                    <div className="flex flex-wrap gap-2">
                      {(['30min', '1hr', '2hr', '4hr', 'fullday'] as AssignmentTimeframe[]).map((tf) => (
                        <button
                          key={tf}
                          type="button"
                          onClick={() => setAssignmentTimeframe(tf)}
                          className={`text-[9px] font-bold uppercase tracking-widest px-4 py-2 rounded-sm border transition-all ${
                            assignmentTimeframe === tf 
                              ? 'bg-brand-rose text-white border-brand-rose shadow-md scale-105' 
                              : 'bg-white/5 text-white/40 border-white/10 hover:border-brand-rose/50 hover:text-white'
                          }`}
                        >
                          {tf === '30min' ? '30 MIN' : 
                           tf === '1hr' ? '1 HOUR' : 
                           tf === '2hr' ? '2 HOURS' : 
                           tf === '4hr' ? '4 HOURS' : 'FULL DAY'}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-col">
                    <textarea
                      ref={assignmentInputRef}
                      className="w-full h-32 p-5 bg-white/5 border border-white/10 rounded-sm focus:ring-1 focus:ring-brand-rose outline-none transition-all text-sm leading-relaxed text-zinc-100 placeholder:text-white/20"
                      placeholder={assignmentPlaceholder}
                      value={assignmentInput}
                      onChange={(e) => setAssignmentInput(e.target.value)}
                    />
                    {isFieldMode && lastAssignmentInput && (
                      <button
                        type="button"
                        className="mt-2 self-start text-[10px] font-bold uppercase tracking-widest text-brand-rose/60 hover:text-brand-rose underline underline-offset-4 decoration-brand-rose/20"
                        onClick={() => setAssignmentInput(lastAssignmentInput)}
                      >
                        Use last assignment brief
                      </button>
                    )}
                  </div>
                  <button
                    disabled={isGeneratingAssignment || (!assignmentInput.trim() && selectedAssignmentSessionIds.length === 0)}
                    onClick={handleGenerateAssignment}
                    className={`bg-brand-rose hover:bg-[#c99595] text-white font-bold uppercase tracking-[0.2em] text-[10px] rounded-sm py-4 px-12 transition-all active:scale-95 flex items-center justify-center gap-3 shadow-lg ${isGeneratingAssignment || (!assignmentInput.trim() && selectedAssignmentSessionIds.length === 0) ? 'opacity-40 cursor-not-allowed' : ''}`}
                  >
                    {isGeneratingAssignment ? (
                      <><i className="fa-solid fa-circle-notch animate-spin"></i> GENERATING STRATEGY</>
                    ) : (
                      <><i className="fa-solid fa-bolt"></i> START ASSIGNMENT PLAN</>
                    )}
                  </button>
                </div>
              </div>
              {!isFieldMode && <div className="absolute top-0 right-0 -mr-24 -mt-24 w-96 h-96 bg-brand-rose/5 blur-[120px] rounded-full"></div>}
            </div>

            {!isFieldMode && (
              <div className="lg:col-span-1 space-y-4">
                <GearSummary />
                <div className="bg-white border border-brand-black/5 rounded-sm p-5 shadow-sm space-y-3">
                  <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand-black/50 flex items-center gap-2">
                    <i className="fa-solid fa-wand-sparkles text-brand-rose"></i> EXPERT GUIDANCE
                  </h4>
                  <button 
                    onClick={() => setActiveTab('processing')}
                    className="w-full text-left px-3 py-3 bg-brand-rose/5 border border-brand-rose/10 rounded-sm text-[10px] font-bold uppercase tracking-widest text-brand-rose hover:bg-brand-rose hover:text-white transition-all flex items-center justify-between group"
                  >
                    <span>Open Processing Guides</span>
                    <i className="fa-solid fa-chevron-right text-[8px] group-hover:translate-x-1 transition-transform"></i>
                  </button>
                </div>
                <BulletinSummary />
              </div>
            )}
          </div>

          {assignmentOutput && (
            <div className="bg-brand-black rounded-sm shadow-2xl overflow-hidden border border-white/10">
              <div className="px-8 py-5 border-b border-white/10 flex items-center justify-between flex-wrap gap-3">
                <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-brand-blue">DOCUMENT: ACCELERATED DELIVERY PLAN</span>
                <div className="flex items-center gap-3 flex-wrap">
                  <button
                    onClick={() => handleCopy(assignmentOutput, setAssignmentCopied)}
                    className="text-[9px] font-bold uppercase tracking-widest text-brand-rose hover:text-white transition-colors border border-brand-rose/30 px-3 py-1 rounded-sm bg-brand-rose/5"
                  >
                    {assignmentCopied ? 'COPIED' : 'COPY TEXT'}
                  </button>
                  <div className="flex items-center gap-2">
                    <select
                      value={assignmentAttachId}
                      onChange={e => { setAssignmentAttachId(e.target.value); setAssignmentAttached(false); }}
                      className="bg-white/5 border border-white/10 text-white text-[9px] font-bold uppercase tracking-widest px-3 py-1 rounded-sm outline-none focus:ring-1 focus:ring-brand-blue"
                    >
                      <option value="" className="text-brand-black">ATTACH TO SESSION...</option>
                      {sessions.filter(s => s.status !== 'archived').map(s => (
                        <option key={s.id} value={s.id} className="text-brand-black">
                          {s.title ? s.title.toUpperCase() : `${s.location} — ${s.date}`}
                        </option>
                      ))}
                    </select>
                    {assignmentAttachId && (
                      <button
                        onClick={() => attachStrategyToSession(assignmentAttachId, assignmentOutput, 'dayPlan', () => setAssignmentAttached(true))}
                        className="text-[9px] font-bold uppercase tracking-widest text-brand-blue hover:text-white transition-colors border border-brand-blue/40 px-3 py-1 rounded-sm bg-brand-blue/5"
                      >
                        {assignmentAttached ? '✓ ATTACHED' : 'ATTACH'}
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
                      className="mt-6 block text-[11px] font-bold text-brand-rose uppercase tracking-widest underline underline-offset-4 decoration-brand-rose/20"
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
                    <div key={box.genre} className="bg-white rounded-sm border border-brand-black/5 rounded-sm p-8 shadow-sm">
                      <h4 className="text-xs font-semibold tracking-wide uppercase text-brand-gray mb-1 flex items-center gap-2">
                        <i className="fa-solid fa-wand-sparkles text-brand-rose"></i> {box.title}
                      </h4>
                      {!isFieldMode && (
                        <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-brand-rose mb-6">
                          Processing - Culling - Shooting
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
                <div className="bg-brand-black rounded-sm p-6 text-white shadow-xl">
                  <h4 className="text-[10px] font-bold uppercase tracking-[0.3em] text-brand-rose mb-4 border-b border-white/10 pb-2">ACTIVE CONTEXT</h4>
                  <div className="space-y-4">
                    <div>
                      <p className="text-[8px] font-bold uppercase tracking-widest text-white/40 mb-1">Active Genre(s)</p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {getActiveGenres(profile, derivedAssignmentGenre).map(g => (
                          <span key={g} className="text-[9px] px-2 py-0.5 bg-white/10 rounded-sm font-bold uppercase tracking-tighter">{g}</span>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="text-[8px] font-bold uppercase tracking-widest text-white/40 mb-1">Software Stack</p>
                      <SystemStatusApps profile={profile} />
                    </div>
                    <div>
                      <p className="text-[8px] font-bold uppercase tracking-widest text-white/40 mb-1">Delivery Timeframe</p>
                      <p className="text-[11px] font-bold uppercase tracking-wider text-brand-rose">{assignmentTimeframe}</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setActiveTab('profile')}
                    className="mt-8 w-full py-3 bg-white/5 border border-white/10 rounded-sm text-[9px] font-bold uppercase tracking-widest hover:bg-brand-rose hover:border-brand-rose transition-all"
                  >
                    Edit Profile
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

          <section className="bg-brand-black rounded-sm p-8 text-brand-white mb-12 shadow-xl border border-white/5">
            <h3 className="text-[10px] font-bold uppercase tracking-[0.25em] text-brand-rose mb-6">NEW JOURNAL ENTRY</h3>
            <form onSubmit={handleCreateJournalEntry} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="text-[9px] font-bold uppercase tracking-widest text-white/50 block mb-2">DATE</label>
                  <input 
                    type="date"
                    value={journalForm.date}
                    onChange={e => setJournalForm(prev => ({ ...prev, date: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-sm px-4 py-3 text-xs focus:ring-1 focus:ring-brand-rose outline-none transition-all"
                    required
                  />
                </div>
                <div>
                  <label className="text-[9px] font-bold uppercase tracking-widest text-white/50 block mb-2">ENTRY TITLE</label>
                  <input 
                    type="text"
                    placeholder="E.G. MORNING FOG AT MOUNT RAINIER"
                    value={journalForm.title}
                    onChange={e => setJournalForm(prev => ({ ...prev, title: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-sm px-4 py-3 text-xs focus:ring-1 focus:ring-brand-rose outline-none transition-all placeholder:text-white/20 uppercase"
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
                <label className="text-[9px] font-bold uppercase tracking-widest text-white/50 block mb-2">REFLECTION / NOTES</label>
                <textarea 
                  placeholder="WHAT WORKED? WHAT DIDN'T? WHAT DID YOU LEARN?"
                  value={journalForm.notes}
                  onChange={e => setJournalForm(prev => ({ ...prev, notes: e.target.value }))}
                  className="w-full bg-white/5 border border-white/10 rounded-sm px-4 py-4 text-xs focus:ring-1 focus:ring-brand-rose outline-none transition-all placeholder:text-white/20 min-h-[120px] leading-relaxed"
                  required
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <label className="text-[9px] font-bold uppercase tracking-widest text-white/50 block mb-2">TAGS (COMMA SEPARATED)</label>
                  <input 
                    type="text"
                    placeholder="E.G. LIGHTING WIN, GEAR ISSUE"
                    value={journalForm.tags}
                    onChange={e => setJournalForm(prev => ({ ...prev, tags: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-sm px-4 py-3 text-xs focus:ring-1 focus:ring-brand-rose outline-none transition-all placeholder:text-white/20 uppercase"
                  />
                </div>
                <div>
                  <label className="text-[9px] font-bold uppercase tracking-widest text-white/50 block mb-2">RESULT QUALITY (1-5)</label>
                  <select 
                    value={journalForm.resultRating}
                    onChange={e => setJournalForm(prev => ({ ...prev, resultRating: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-sm px-4 py-3 text-xs focus:ring-1 focus:ring-brand-rose outline-none transition-all uppercase"
                  >
                    {[1,2,3,4,5].map(v => <option key={v} value={v} className="text-brand-black">{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[9px] font-bold uppercase tracking-widest text-white/50 block mb-2">PROCESS FLOW (1-5)</label>
                  <select 
                    value={journalForm.processRating}
                    onChange={e => setJournalForm(prev => ({ ...prev, processRating: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-sm px-4 py-3 text-xs focus:ring-1 focus:ring-brand-rose outline-none transition-all uppercase"
                  >
                    {[1,2,3,4,5].map(v => <option key={v} value={v} className="text-brand-black">{v}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[9px] font-bold uppercase tracking-widest text-white/50 block mb-2">ATTACH IMAGES / CAMERA</label>
                <div className="flex flex-wrap gap-4 items-center">
                   <label className="cursor-pointer bg-white/5 border border-white/10 rounded-sm px-8 py-6 hover:bg-white/10 transition-all flex flex-col items-center gap-3">
                      <i className="fa-solid fa-camera-retro text-2xl text-brand-rose"></i>
                      <span className="text-[9px] font-bold uppercase tracking-widest text-white/40">SELECT FILES OR CAMERA</span>
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
                       <div key={img.id} className="relative w-20 h-20 border border-white/10 rounded-sm overflow-hidden group">
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
                  className="w-full bg-brand-rose hover:bg-[#c99595] text-white font-bold uppercase tracking-[0.2em] text-[10px] rounded-sm py-5 transition-all active:scale-[0.99] shadow-lg flex items-center justify-center gap-3"
                >
                  <i className="fa-solid fa-pen-nib"></i> COMMIT ENTRY TO LOGBOOK
                </button>
              </div>
            </form>
          </section>

          <section className="space-y-8">
            <div className="bg-brand-white border border-brand-black/5 rounded-sm p-8 shadow-sm">
              <label className="text-[10px] font-bold uppercase tracking-[0.3em] text-brand-black/30 block mb-4">FIND REFLECTIONS</label>
              <div className="relative">
                <input 
                  type="text"
                  placeholder="SEARCH BY TITLE OR TAGS..."
                  value={journalSearch}
                  onChange={(e) => setJournalSearch(e.target.value)}
                  className="w-full bg-white border border-brand-black/5 rounded-sm px-12 py-4 text-xs focus:ring-1 focus:ring-brand-rose outline-none transition-all placeholder:text-brand-gray/30 uppercase tracking-widest font-bold"
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
              <div className="py-24 text-center border border-dashed border-brand-gray/20 rounded-sm">
                <p className="text-brand-gray text-[10px] font-bold uppercase tracking-widest">
                  {journalSearch ? "NO JOURNAL ENTRIES MATCH THIS SEARCH" : "NO JOURNAL ENTRIES DETECTED"}
                </p>
              </div>
            ) : (
              filteredJournalEntries.map(entry => (
                <div key={entry.id} className="bg-white rounded-sm border border-brand-black/5 shadow-sm overflow-hidden flex flex-col animate-in fade-in slide-in-from-bottom-2 duration-500">
                  <div className="bg-brand-black p-6 text-brand-white flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-4 mb-2">
                        <span className="text-[9px] font-bold uppercase tracking-[0.3em] text-brand-rose">{entry.date}</span>
                        {entry.resultRating && (
                          <div className="flex gap-0.5 text-brand-blue text-[8px]">
                            {[...Array(5)].map((_, i) => (
                              <i key={i} className={`fa-solid fa-star ${i < entry.resultRating! ? '' : 'opacity-20'}`}></i>
                            ))}
                          </div>
                        )}
                      </div>
                      <h3 className="font-display text-2xl leading-none tracking-widest">{entry.title.toUpperCase()}</h3>
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
                              <span key={sid} className="text-[8px] font-bold uppercase tracking-widest px-2 py-1 bg-brand-blue/5 text-brand-blue border border-brand-blue/10 rounded-sm">
                                SESSION: {s.name.split('_').slice(1).join(' ')}
                              </span>
                            ) : null;
                          })}
                        </div>
                        
                        <p className="text-[11px] text-brand-black leading-relaxed whitespace-pre-wrap italic">
                          "{entry.notes}"
                        </p>

                        <div className="flex flex-wrap gap-1.5">
                          {entry.tags.map(tag => (
                            <span key={tag} className="text-[8px] font-bold uppercase tracking-widest text-brand-gray bg-brand-black/5 px-2 py-1 rounded-sm">
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
                                className="block aspect-square rounded-sm overflow-hidden border border-brand-black/5 hover:border-brand-rose transition-all group"
                             >
                               <img src={img.dataUrl} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" alt="journal" />
                             </a>
                           ))}
                         </div>
                         {entry.processRating && (
                           <div className="bg-brand-white p-4 rounded-sm border border-brand-black/5">
                             <p className="text-[8px] font-bold text-brand-gray uppercase tracking-widest mb-2">PROCESS FLOW</p>
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
              <p className="text-brand-gray mt-2 text-sm font-medium">AI-powered calls for entry and upcoming photography events.</p>
            </div>
            <button
              onClick={refreshBulletinEvents}
              disabled={isFetchingBulletin}
              className="flex items-center gap-2 px-4 py-2 bg-brand-rose text-white text-[9px] font-bold uppercase tracking-widest rounded-sm disabled:opacity-50 hover:bg-brand-rose/80 transition-colors"
            >
              <i className={`fa-solid fa-rotate-right text-[10px] ${isFetchingBulletin ? 'animate-spin' : ''}`}></i>
              {isFetchingBulletin ? 'FETCHING...' : 'REFRESH EVENTS'}
            </button>
          </header>

          <section className="bg-white border border-brand-black/5 rounded-sm p-8 shadow-sm space-y-8">
            <h3 className="text-[10px] font-bold uppercase tracking-[0.3em] text-brand-black/30 border-b border-brand-black/5 pb-4">FILTERS & PRIORITIES</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
              <div>
                <label className="text-[9px] font-bold uppercase tracking-widest text-brand-gray block mb-3">Genre Focus</label>
                <div className="flex flex-wrap gap-2">
                  <button 
                    onClick={() => setGenreFilter('All')}
                    className={`text-[9px] font-bold px-3 py-1.5 rounded-sm border transition-all ${genreFilter === 'All' ? 'bg-brand-rose text-white border-brand-rose' : 'bg-white text-brand-gray border-brand-black/5'}`}
                  >ALL</button>
                  {genreOptions.slice(0, 5).map((g: Genre) => (
                    <button 
                      key={g}
                      onClick={() => setGenreFilter(g)}
                      className={`text-[9px] font-bold px-3 py-1.5 rounded-sm border transition-all ${genreFilter === g ? 'bg-brand-rose text-white border-brand-rose' : 'bg-white text-brand-gray border-brand-black/5'}`}
                    >{g.toUpperCase()}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-[9px] font-bold uppercase tracking-widest text-brand-gray block mb-3">Region</label>
                <select 
                  value={regionFilter} 
                  onChange={(e) => setRegionFilter(e.target.value as BulletinRegion | 'All')}
                  className="w-full bg-brand-white border border-brand-black/5 rounded-sm px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest focus:ring-1 focus:ring-brand-rose outline-none"
                >
                  <option value="All">All Regions</option>
                  {['Global', 'US', 'Europe', 'Asia', 'Latin America', 'Africa', 'Other'].map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[9px] font-bold uppercase tracking-widest text-brand-gray block mb-3">Priority Level</label>
                <div className="flex flex-wrap gap-2">
                  <button 
                    onClick={() => setPriorityFilter('All')}
                    className={`text-[9px] font-bold px-3 py-1.5 rounded-sm border transition-all ${priorityFilter === 'All' ? 'bg-brand-black text-white border-brand-black' : 'bg-white text-brand-gray border-brand-black/5'}`}
                  >ALL</button>
                  {(['high', 'medium', 'low'] as BulletinPriority[]).map((p) => (
                    <button 
                      key={p}
                      onClick={() => setPriorityFilter(p)}
                      className={`text-[9px] font-bold px-3 py-1.5 rounded-sm border transition-all ${priorityFilter === p ? 'bg-brand-black text-white border-brand-black' : 'bg-white text-brand-gray border-brand-black/5'}`}
                    >{p.toUpperCase()}</button>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section>
            {isFetchingBulletin && aiBulletinItems.length === 0 ? (
              <div className="py-24 text-center border border-dashed border-brand-gray/20 rounded-sm">
                <i className="fa-solid fa-circle-notch animate-spin text-brand-rose text-xl mb-4 block"></i>
                <p className="text-brand-gray text-[10px] font-bold uppercase tracking-widest">FETCHING UPCOMING EVENTS...</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {primaryBoardItems.length === 0 ? (
                  <div className="col-span-full py-24 text-center border border-dashed border-brand-gray/20 rounded-sm">
                    <p className="text-brand-gray text-[10px] font-bold uppercase tracking-widest">NO OPPORTUNITIES MATCH THESE FILTERS</p>
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
              className="group flex items-center justify-between p-6 bg-white border-2 border-amber-200 hover:border-amber-400 rounded-sm shadow-sm hover:shadow-md transition-all text-left"
            >
              <div className="flex items-center gap-4">
                <div className="w-1.5 h-12 bg-amber-400 rounded-sm flex-shrink-0"></div>
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-[0.25em] text-amber-600 mb-1 flex items-center gap-2">
                    <i className="fa-solid fa-bookmark"></i> SHORTLIST
                  </p>
                  <p className="text-xl font-display text-brand-black tracking-wide">ON THE SHORTLIST</p>
                  <p className="text-[10px] text-brand-gray mt-1">{consideringItems.length} {consideringItems.length === 1 ? 'opportunity' : 'opportunities'} under consideration</p>
                </div>
              </div>
              <i className="fa-solid fa-arrow-right text-amber-400 group-hover:translate-x-1 transition-transform"></i>
            </button>

            <button
              onClick={() => setActiveTab('cfe-applied')}
              className="group flex items-center justify-between p-6 bg-white border-2 border-emerald-200 hover:border-emerald-400 rounded-sm shadow-sm hover:shadow-md transition-all text-left"
            >
              <div className="flex items-center gap-4">
                <div className="w-1.5 h-12 bg-emerald-500 rounded-sm flex-shrink-0"></div>
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-[0.25em] text-emerald-600 mb-1 flex items-center gap-2">
                    <i className="fa-solid fa-paper-plane"></i> APPLICATIONS
                  </p>
                  <p className="text-xl font-display text-brand-black tracking-wide">APPLICATIONS SENT</p>
                  <p className="text-[10px] text-brand-gray mt-1">{appliedItems.length} {appliedItems.length === 1 ? 'application' : 'applications'} submitted</p>
                </div>
              </div>
              <i className="fa-solid fa-arrow-right text-emerald-500 group-hover:translate-x-1 transition-transform"></i>
            </button>
          </section>

          {archivedBoardItems.length > 0 && (
            <section className="pt-16 border-t border-brand-black/5">
              <h3 className="text-[10px] font-bold uppercase tracking-[0.3em] text-brand-black/30 mb-8 flex items-center gap-3">
                <i className="fa-solid fa-box-archive"></i> ARCHIVED OPPORTUNITIES
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {archivedBoardItems.map((item) => (
                  <BulletinCard key={item.id} item={item} updateBulletinStatus={updateBulletinStatus} />
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
              className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-widest text-brand-gray hover:text-brand-rose transition-colors mb-6"
            >
              <i className="fa-solid fa-arrow-left text-[8px]"></i> Bulletin Board
            </button>
            <div className="flex items-center gap-4">
              <div className="w-1.5 h-10 bg-amber-400 rounded-sm"></div>
              <div>
                <h2 className="text-4xl font-display text-brand-black tracking-wide">ON THE SHORTLIST</h2>
                <p className="text-brand-gray mt-1 text-sm font-medium">{consideringItems.length} {consideringItems.length === 1 ? 'opportunity' : 'opportunities'} under consideration</p>
              </div>
            </div>
          </header>
          {consideringItems.length === 0 ? (
            <div className="py-24 text-center border border-dashed border-amber-200 rounded-sm">
              <i className="fa-solid fa-bookmark text-amber-300 text-2xl mb-4 block"></i>
              <p className="text-brand-gray text-[10px] font-bold uppercase tracking-widest">NO EVENTS ON YOUR SHORTLIST YET</p>
              <p className="text-brand-gray/50 text-[10px] mt-2">Mark events as Considering from the Bulletin Board.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {consideringItems.map((item) => (
                <BulletinCard key={item.id} item={item} updateBulletinStatus={updateBulletinStatus} />
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
              className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-widest text-brand-gray hover:text-brand-rose transition-colors mb-6"
            >
              <i className="fa-solid fa-arrow-left text-[8px]"></i> Bulletin Board
            </button>
            <div className="flex items-center gap-4">
              <div className="w-1.5 h-10 bg-emerald-500 rounded-sm"></div>
              <div>
                <h2 className="text-4xl font-display text-brand-black tracking-wide">APPLICATIONS SENT</h2>
                <p className="text-brand-gray mt-1 text-sm font-medium">{appliedItems.length} {appliedItems.length === 1 ? 'application' : 'applications'} submitted</p>
              </div>
            </div>
          </header>
          {appliedItems.length === 0 ? (
            <div className="py-24 text-center border border-dashed border-emerald-200 rounded-sm">
              <i className="fa-solid fa-paper-plane text-emerald-300 text-2xl mb-4 block"></i>
              <p className="text-brand-gray text-[10px] font-bold uppercase tracking-widest">NO APPLICATIONS RECORDED YET</p>
              <p className="text-brand-gray/50 text-[10px] mt-2">Mark events as Applied from the Bulletin Board.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {appliedItems.map((item) => (
                <BulletinCard key={item.id} item={item} updateBulletinStatus={updateBulletinStatus} />
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'archive' && (
        <div className="animate-in fade-in duration-700">
          <header className="mb-10">
            <h2 className="text-4xl font-display text-brand-black tracking-wide">ARCHIVE</h2>
            <p className="text-brand-gray mt-2 text-sm font-medium">Completed sessions stored for reference.</p>
          </header>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {sessions.filter(s => s.status === 'archived').length === 0 ? (
              <div className="col-span-full py-24 text-center border border-dashed border-brand-gray/20 rounded-sm">
                <p className="text-brand-gray text-[10px] font-bold uppercase tracking-widest">NO SESSIONS ARCHIVED YET</p>
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

          <section className="bg-brand-black rounded-sm p-8 text-brand-white mb-12 shadow-xl border border-white/5">
            <h3 className="text-[10px] font-bold uppercase tracking-[0.25em] text-brand-rose mb-6">REGISTER NEW EQUIPMENT</h3>
            <form onSubmit={addGearItem} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <input 
                  name="gearName" 
                  placeholder="NAME (E.G. SONY A9 III)" 
                  required
                  className="bg-white/5 border border-white/10 rounded-sm px-4 py-3 text-xs focus:ring-1 focus:ring-brand-rose outline-none transition-all placeholder:text-white/20 uppercase"
                />
                <select 
                  name="category"
                  required
                  className="bg-white/5 border border-white/10 rounded-sm px-4 py-3 text-xs focus:ring-1 focus:ring-brand-rose outline-none transition-all uppercase"
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
                  placeholder="TAGS (COMMA SEPARATED)" 
                  className="bg-white/5 border border-white/10 rounded-sm px-4 py-3 text-xs focus:ring-1 focus:ring-brand-rose outline-none transition-all placeholder:text-white/20 uppercase"
                />
                <div className="flex items-center justify-between bg-white/5 border border-white/10 rounded-sm px-4 py-3">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-white/50">AVAILABLE</span>
                  <input name="available" type="checkbox" defaultChecked className="accent-brand-rose h-4 w-4" />
                </div>
              </div>
              <div className="flex gap-4 items-start">
                <textarea 
                  name="details"
                  placeholder="EQUIPMENT DETAILS / SPECS (E.G. 24-70MM 2.8, STABILIZED)"
                  className="flex-1 bg-white/5 border border-white/10 rounded-sm px-4 py-3 text-xs focus:ring-1 focus:ring-brand-rose outline-none transition-all placeholder:text-white/20 min-h-[60px]"
                />
                <button 
                  type="submit"
                  className="bg-brand-rose hover:bg-[#c99595] text-white font-bold uppercase tracking-[0.2em] text-[10px] rounded-sm py-3 px-10 h-[60px] transition-all active:scale-95 shadow-lg"
                >
                  ADD TO LOCKER
                </button>
              </div>
            </form>
          </section>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {gear.length === 0 ? (
              <div className="col-span-full py-24 text-center border border-dashed border-brand-gray/20 rounded-sm">
                <p className="text-brand-gray text-[10px] font-bold uppercase tracking-widest">GEAR LOCKER EMPTY</p>
              </div>
            ) : (
              gear.map(item => (
                <div key={item.id} className={`bg-white rounded-sm border border-brand-black/5 p-6 shadow-sm transition-all duration-300 hover:shadow-md flex flex-col ${!item.available ? 'opacity-60' : ''}`}>
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <span className="text-[8px] font-bold uppercase tracking-[0.2em] bg-brand-black/5 px-2 py-0.5 rounded-sm text-brand-gray mb-2 inline-block">
                        {item.category}
                      </span>
                      <h3 className="text-xl font-display text-brand-black tracking-wider leading-none uppercase">{item.name}</h3>
                    </div>
                    <button 
                      onClick={() => deleteGearItem(item.id)}
                      className="text-brand-black/10 hover:text-brand-rose transition-colors"
                    >
                      <i className="fa-solid fa-trash-can text-xs"></i>
                    </button>
                  </div>
                  {item.details && (
                    <p className="text-[11px] text-brand-gray leading-relaxed mb-4 flex-1 italic">{item.details}</p>
                  )}
                  {item.tags && item.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-6">
                      {item.tags.map(tag => (
                        <span key={tag} className="text-[8px] font-bold uppercase tracking-widest text-brand-blue bg-brand-blue/5 px-1.5 py-0.5 rounded-sm">
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="pt-4 border-t border-brand-black/5 flex items-center justify-between">
                    <span className={`text-[9px] font-bold uppercase tracking-widest ${item.available ? 'text-emerald-600' : 'text-brand-rose'}`}>
                      {item.available ? 'AVAILABLE' : 'UNAVAILABLE'}
                    </span>
                    <button 
                      onClick={() => toggleGearAvailability(item.id)}
                      className="text-[9px] font-bold uppercase tracking-[0.2em] text-brand-blue hover:text-brand-black transition-colors"
                    >
                      TOGGLE STATUS
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