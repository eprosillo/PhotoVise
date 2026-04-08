import React, { useState, useMemo } from 'react';
import { Session, SessionStatus, JournalEntry, WeekPlan } from '../types';
import { generateWeeklyPlan } from '../services/geminiService';

interface CalendarViewProps {
  sessions: Session[];
  journalEntries: JournalEntry[];
  weekPlans: WeekPlan[];
  onSaveWeekPlan: (plan: WeekPlan) => void;
  onDeleteWeekPlan: (id: string) => void;
  onGoToSession: (sessionId: string) => void;
  onGoToJournal: () => void;
}

// ── Shared constants ──────────────────────────────────────────────────────────

const STATUS_DOT: Record<SessionStatus, string> = {
  shot:        'bg-brand-rose',
  culled:      'bg-brand-blue',
  edited:      'bg-amber-400',
  'backed up': 'bg-emerald-500',
  posted:      'bg-purple-500',
  archived:    'bg-brand-gray/40',
};

const STATUS_CHIP: Record<SessionStatus, string> = {
  shot:        'bg-brand-rose/10 text-brand-rose border-brand-rose/20',
  culled:      'bg-brand-blue/10 text-brand-blue border-brand-blue/20',
  edited:      'bg-amber-50 text-amber-700 border-amber-200',
  'backed up': 'bg-emerald-50 text-emerald-700 border-emerald-200',
  posted:      'bg-purple-50 text-purple-700 border-purple-200',
  archived:    'bg-zinc-100 text-zinc-400 border-zinc-200',
};

const GRID_DAYS  = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const WEEK_DAYS  = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const TIME_SLOTS = ['Morning', 'Afternoon', 'Evening'] as const;
type  TimeSlot   = typeof TIME_SLOTS[number];
const MONTHS     = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const SHORT_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const toYMD = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const shortDate = (d: Date) =>
  `${SHORT_MONTHS[d.getMonth()]} ${d.getDate()}`;

/** Returns the Monday of the week containing `date` */
const getMondayOf = (date: Date): Date => {
  const d = new Date(date);
  const dow = d.getDay(); // 0=Sun
  const diff = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
};

/** Returns an array of 7 dates Mon–Sun for the week starting at monday */
const weekDates = (monday: Date): Date[] =>
  Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });

const weekLabel = (monday: Date): string => {
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const sameYear  = monday.getFullYear() === sunday.getFullYear();
  const sameMonth = monday.getMonth()    === sunday.getMonth();
  if (sameMonth)  return `${SHORT_MONTHS[monday.getMonth()]} ${monday.getDate()} – ${sunday.getDate()}, ${sunday.getFullYear()}`;
  if (sameYear)   return `${shortDate(monday)} – ${shortDate(sunday)}, ${sunday.getFullYear()}`;
  return `${shortDate(monday)}, ${monday.getFullYear()} – ${shortDate(sunday)}, ${sunday.getFullYear()}`;
};

// ── Simple markdown renderer ──────────────────────────────────────────────────
const MarkdownBlock: React.FC<{ text: string }> = ({ text }) => (
  <div className="space-y-1.5">
    {text.split('\n').map((line, i) => {
      if (!line.trim()) return <div key={i} className="h-2" />;
      if (/^###\s/.test(line))
        return <p key={i} className="text-[10px] font-bold uppercase tracking-[0.25em] text-brand-gray mt-4 mb-1">{line.replace(/^###\s/, '')}</p>;
      if (/^##\s/.test(line))
        return <p key={i} className="text-[11px] font-bold uppercase tracking-[0.3em] text-brand-black mt-5 mb-1">{line.replace(/^##\s/, '')}</p>;
      if (/^#\s/.test(line))
        return <p key={i} className="text-sm font-bold uppercase tracking-[0.3em] text-brand-black mt-5 mb-2">{line.replace(/^#\s/, '')}</p>;
      const boldParsed = line.split(/\*\*([^*]+)\*\*/g).map((part, j) =>
        j % 2 === 1 ? <strong key={j} className="font-bold text-brand-black">{part}</strong> : part
      );
      if (/^[-•]\s/.test(line))
        return <p key={i} className="text-[11px] text-brand-gray leading-relaxed flex gap-2"><span className="text-brand-rose flex-shrink-0">—</span><span>{boldParsed}</span></p>;
      return <p key={i} className="text-[11px] text-brand-gray leading-relaxed">{boldParsed}</p>;
    })}
  </div>
);

// ── Highlight matched text ────────────────────────────────────────────────────
const Highlight: React.FC<{ text: string; query: string }> = ({ text, query }) => {
  if (!query.trim()) return <>{text}</>;
  const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase()
          ? <mark key={i} className="bg-brand-rose/20 text-brand-rose rounded-sm px-0.5">{part}</mark>
          : part
      )}
    </>
  );
};

// ── Day availability ──────────────────────────────────────────────────────────
interface DayAvailability { enabled: boolean; times: Set<TimeSlot> }
const defaultAvailability = (): Record<string, DayAvailability> =>
  Object.fromEntries(WEEK_DAYS.map(d => [d, { enabled: false, times: new Set<TimeSlot>() }]));

// ── Main component ────────────────────────────────────────────────────────────
const CalendarView: React.FC<CalendarViewProps> = ({
  sessions, journalEntries, weekPlans, onSaveWeekPlan, onDeleteWeekPlan,
  onGoToSession, onGoToJournal,
}) => {
  const today = new Date();
  const [view, setView] = useState<'calendar' | 'planner' | 'search'>('calendar');

  // Calendar state
  const [current, setCurrent]           = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [showJournal, setShowJournal]   = useState(true);

  // Planner state
  const [plannerSessions, setPlannerSessions]   = useState<Set<string>>(new Set());
  const [availability, setAvailability]         = useState<Record<string, DayAvailability>>(defaultAvailability);
  const [limitations, setLimitations]           = useState('');
  const [planResult, setPlanResult]             = useState('');
  const [isGenerating, setIsGenerating]         = useState(false);
  const [pinnedThisResult, setPinnedThisResult] = useState(false);
  // "Week of" — defaults to current week's Monday
  const [weekMonday, setWeekMonday] = useState<Date>(() => getMondayOf(today));

  // Search state
  const [searchQuery, setSearchQuery] = useState('');

  // Derived week info
  const currentWeekDates  = useMemo(() => weekDates(weekMonday), [weekMonday]);
  const currentWeekLabel  = useMemo(() => weekLabel(weekMonday), [weekMonday]);

  const prevWeek = () => setWeekMonday(prev => { const d = new Date(prev); d.setDate(d.getDate() - 7); return d; });
  const nextWeek = () => setWeekMonday(prev => { const d = new Date(prev); d.setDate(d.getDate() + 7); return d; });

  // Calendar helpers
  const prevMonth = () => setCurrent(new Date(current.getFullYear(), current.getMonth() - 1, 1));
  const nextMonth = () => setCurrent(new Date(current.getFullYear(), current.getMonth() + 1, 1));
  const goToday   = () => {
    setCurrent(new Date(today.getFullYear(), today.getMonth(), 1));
    setSelectedDate(toYMD(today));
  };

  const cells = useMemo(() => {
    const year = current.getFullYear(), month = current.getMonth();
    const firstDow    = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrev  = new Date(year, month, 0).getDate();
    const result: { date: string; inMonth: boolean }[] = [];
    for (let i = firstDow - 1; i >= 0; i--)
      result.push({ date: toYMD(new Date(year, month - 1, daysInPrev - i)), inMonth: false });
    for (let d = 1; d <= daysInMonth; d++)
      result.push({ date: toYMD(new Date(year, month, d)), inMonth: true });
    const remaining = 7 - (result.length % 7);
    if (remaining < 7)
      for (let d = 1; d <= remaining; d++)
        result.push({ date: toYMD(new Date(year, month + 1, d)), inMonth: false });
    return result;
  }, [current]);

  const sessionsByDate = useMemo(() => {
    const map: Record<string, Session[]> = {};
    sessions.forEach(s => { if (!s.date) return; const k = s.date.slice(0,10); (map[k] ??= []).push(s); });
    return map;
  }, [sessions]);

  const journalByDate = useMemo(() => {
    const map: Record<string, JournalEntry[]> = {};
    journalEntries.forEach(e => { if (!e.date) return; const k = e.date.slice(0,10); (map[k] ??= []).push(e); });
    return map;
  }, [journalEntries]);

  const todayStr         = toYMD(today);
  const selectedSessions = selectedDate ? (sessionsByDate[selectedDate] ?? []) : [];
  const selectedJournal  = selectedDate ? (journalByDate[selectedDate] ?? []) : [];
  const activeSessions   = sessions.filter(s => s.status !== 'archived');

  // Search
  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return { sessions: [], journal: [] };
    return {
      sessions: sessions.filter(s =>
        [s.title, s.location, s.name, s.notes, s.strategy, s.dayPlan, ...(s.genre ?? [])].some(f => f?.toLowerCase().includes(q))
      ),
      journal: journalEntries.filter(e =>
        [e.title, e.notes, ...(e.tags ?? [])].some(f => f?.toLowerCase().includes(q))
      ),
    };
  }, [searchQuery, sessions, journalEntries]);

  // Planner helpers
  const togglePlannerSession = (id: string) =>
    setPlannerSessions(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });

  const toggleDay = (day: string) =>
    setAvailability(prev => ({ ...prev, [day]: { ...prev[day], enabled: !prev[day].enabled } }));

  const toggleTime = (day: string, time: TimeSlot) =>
    setAvailability(prev => {
      const times = new Set(prev[day].times);
      times.has(time) ? times.delete(time) : times.add(time);
      return { ...prev, [day]: { ...prev[day], times } };
    });

  const canGenerate = plannerSessions.size > 0 && WEEK_DAYS.some(d => availability[d].enabled);

  const handleGenerate = async () => {
    if (!canGenerate) return;
    setIsGenerating(true);
    setPlanResult('');
    setPinnedThisResult(false);

    const selectedSessionData = sessions
      .filter(s => plannerSessions.has(s.id))
      .map(s => {
        const lines = [
          `- Session: "${s.title || s.location || 'Untitled'}"`,
          `  Date: ${s.date}`, `  Location: ${s.location || 'N/A'}`,
          `  Genre: ${s.genre?.join(', ') || 'N/A'}`, `  Status: ${s.status}`,
        ];
        if (s.strategy) lines.push(`  Strategy: ${s.strategy.slice(0, 400)}...`);
        if (s.dayPlan)  lines.push(`  Day Plan: ${s.dayPlan.slice(0, 400)}...`);
        return lines.join('\n');
      }).join('\n\n');

    // Build availability text using real dates
    const availableDaysText = WEEK_DAYS
      .map((day, i) => ({ day, date: currentWeekDates[i] }))
      .filter(({ day }) => availability[day].enabled)
      .map(({ day, date }) => {
        const times = [...availability[day].times];
        const dateStr = `${day} ${shortDate(date)}, ${date.getFullYear()}`;
        return times.length > 0 ? `${dateStr}: ${times.join(', ')}` : `${dateStr}: any time`;
      })
      .join('\n');

    const prompt = `You are a professional photography scheduling assistant. Create a practical shooting and workflow schedule for the photographer for the week of ${currentWeekLabel}.\n\nSESSIONS TO SCHEDULE:\n${selectedSessionData}\n\nPHOTOGRAPHER'S AVAILABLE DAYS & TIMES (use these exact dates):\n${availableDaysText}\n\nADDITIONAL CONSTRAINTS & NOTES:\n${limitations.trim() || 'None provided.'}\n\nTODAY'S DATE: ${toYMD(today)}\n\nINSTRUCTIONS:\n- Assign specific sessions or session tasks (scouting, shooting, culling, editing, backup) to the available dates listed above.\n- Use the exact dates (e.g. "Monday Apr 7") as headings for each day.\n- Respect the session's existing strategy and day plan — use them to inform which tasks fit each phase.\n- Keep shoots on days with enough time; avoid cramming multiple full shoots on the same day.\n- Include brief reasoning for each day's assignment (1 sentence).\n- End with a short prep checklist for before the week starts.\n- Format clearly with each day as a heading.`;

    const result = await generateWeeklyPlan(prompt);
    setPlanResult(result);
    setIsGenerating(false);
  };

  const handlePin = () => {
    const plan: WeekPlan = {
      id: Date.now().toString() + Math.random().toString(36).slice(2, 7),
      weekOf: toYMD(weekMonday),
      weekLabel: currentWeekLabel,
      sessionTitles: sessions.filter(s => plannerSessions.has(s.id)).map(s => s.title || s.location || 'Untitled'),
      result: planResult,
      createdAt: Date.now(),
    };
    onSaveWeekPlan(plan);
    setPinnedThisResult(true);
  };

  // ── Calendar render ───────────────────────────────────────────────────────
  const renderCalendar = () => (
    <div className="space-y-8">
      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <h2 className="text-4xl font-display text-brand-black tracking-wide">CALENDAR</h2>
          <p className="text-brand-gray mt-2 text-sm font-medium">Sessions and journal entries mapped by date.</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={() => setShowJournal(p => !p)}
            className={`flex items-center gap-2 text-[9px] font-bold uppercase tracking-widest px-3 py-2 rounded-sm border transition-all ${showJournal ? 'bg-brand-black text-white border-brand-black' : 'border-brand-black/10 text-brand-gray hover:border-brand-black/30'}`}>
            <i className="fa-solid fa-book-open text-[9px]"></i> Journal
          </button>
          <button onClick={goToday} className="text-[9px] font-bold uppercase tracking-widest px-4 py-2 border border-brand-black/10 rounded-sm hover:border-brand-rose hover:text-brand-rose transition-all">Today</button>
          <button onClick={prevMonth} className="w-8 h-8 flex items-center justify-center border border-brand-black/10 rounded-sm hover:border-brand-rose hover:text-brand-rose transition-all">
            <i className="fa-solid fa-chevron-left text-[10px]"></i>
          </button>
          <span className="text-[13px] font-display tracking-widest text-brand-black min-w-[160px] text-center uppercase">
            {MONTHS[current.getMonth()]} {current.getFullYear()}
          </span>
          <button onClick={nextMonth} className="w-8 h-8 flex items-center justify-center border border-brand-black/10 rounded-sm hover:border-brand-rose hover:text-brand-rose transition-all">
            <i className="fa-solid fa-chevron-right text-[10px]"></i>
          </button>
        </div>
      </header>

      <div className="bg-white border border-brand-black/5 rounded-sm shadow-sm overflow-hidden">
        <div className="grid grid-cols-7 border-b border-brand-black/5">
          {GRID_DAYS.map(d => <div key={d} className="py-3 text-center text-[9px] font-bold uppercase tracking-[0.2em] text-brand-gray">{d}</div>)}
        </div>
        <div className="grid grid-cols-7">
          {cells.map(({ date, inMonth }) => {
            const daySessions = sessionsByDate[date] ?? [];
            const dayJournal  = showJournal ? (journalByDate[date] ?? []) : [];
            const isToday     = date === todayStr;
            const isSelected  = date === selectedDate;
            return (
              <button key={date} onClick={() => setSelectedDate(date === selectedDate ? null : date)}
                className={`min-h-[80px] md:min-h-[100px] p-2 md:p-3 text-left border-b border-r border-brand-black/5 transition-all
                  ${isSelected ? 'bg-brand-rose/5 ring-1 ring-inset ring-brand-rose/30' : 'hover:bg-brand-black/[0.02]'}
                  ${!inMonth ? 'bg-brand-black/[0.015]' : ''}
                `}>
                <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-bold mb-1
                  ${isToday ? 'bg-brand-rose text-white' : inMonth ? 'text-brand-black' : 'text-brand-gray/30'}`}>
                  {new Date(date + 'T12:00:00').getDate()}
                </span>
                <div className="space-y-1 hidden md:block">
                  {daySessions.slice(0, 2).map(s => (
                    <div key={s.id} className={`text-[8px] font-bold uppercase tracking-tight px-1.5 py-0.5 rounded-sm border truncate leading-tight ${STATUS_CHIP[s.status]}`}>
                      {s.title || s.location || 'Untitled'}
                    </div>
                  ))}
                  {dayJournal.slice(0, 2).map(e => (
                    <div key={e.id} className="text-[8px] font-bold uppercase tracking-tight px-1.5 py-0.5 rounded-sm border truncate leading-tight bg-purple-50 text-purple-700 border-purple-200">
                      <i className="fa-solid fa-book-open mr-1 text-[7px]"></i>{e.title || 'Journal'}
                    </div>
                  ))}
                  {(daySessions.length + dayJournal.length) > 4 && (
                    <div className="text-[8px] font-bold text-brand-gray/50 pl-1">+{(daySessions.length + dayJournal.length) - 4} more</div>
                  )}
                </div>
                {(daySessions.length > 0 || dayJournal.length > 0) && (
                  <div className="flex gap-0.5 flex-wrap mt-1 md:hidden">
                    {daySessions.slice(0, 3).map(s => <span key={s.id} className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[s.status]}`}></span>)}
                    {dayJournal.slice(0, 2).map(e => <span key={e.id} className="w-1.5 h-1.5 rounded-full bg-purple-400"></span>)}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap gap-4 items-center">
        {(Object.keys(STATUS_DOT) as SessionStatus[]).filter(s => s !== 'archived').map(s => (
          <div key={s} className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${STATUS_DOT[s]}`}></span>
            <span className="text-[9px] font-bold uppercase tracking-widest text-brand-gray">{s}</span>
          </div>
        ))}
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-purple-400"></span>
          <span className="text-[9px] font-bold uppercase tracking-widest text-brand-gray">Journal</span>
        </div>
      </div>

      {selectedDate && (
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-[10px] font-bold uppercase tracking-[0.3em] text-brand-black/40">
              {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
            </h3>
            <button onClick={() => setSelectedDate(null)} className="text-brand-gray/40 hover:text-brand-rose transition-colors">
              <i className="fa-solid fa-xmark text-sm"></i>
            </button>
          </div>
          {selectedSessions.length === 0 && selectedJournal.length === 0 && (
            <div className="py-12 text-center border border-dashed border-brand-black/10 rounded-sm">
              <p className="text-brand-gray/40 text-[10px] font-bold uppercase tracking-widest">Nothing logged on this day</p>
            </div>
          )}
          {selectedSessions.length > 0 && (
            <div>
              <p className="text-[9px] font-bold uppercase tracking-[0.25em] text-brand-black/30 mb-3">Sessions</p>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {selectedSessions.map(s => (
                  <div key={s.id} className="bg-white border border-brand-black/5 rounded-sm shadow-sm overflow-hidden hover:shadow-md transition-all">
                    <div className="bg-brand-black px-5 py-4 flex items-center justify-between">
                      <p className="font-display text-lg text-white leading-none tracking-widest truncate">{(s.title || s.location || 'Untitled').toUpperCase()}</p>
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ml-2 ${STATUS_DOT[s.status]}`}></span>
                    </div>
                    <div className="px-5 py-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className={`text-[8px] font-bold uppercase tracking-widest px-2 py-1 rounded-sm border ${STATUS_CHIP[s.status]}`}>{s.status}</span>
                        {s.genre && s.genre.length > 0 && <span className="text-[8px] text-brand-gray uppercase tracking-widest font-bold">{s.genre.join(' · ')}</span>}
                      </div>
                      {s.notes && <p className="text-[10px] text-brand-gray leading-relaxed line-clamp-2">{s.notes}</p>}
                      <button onClick={() => onGoToSession(s.id)} className="w-full text-[9px] font-bold uppercase tracking-widest py-2.5 bg-brand-black/5 hover:bg-brand-rose hover:text-white text-brand-black rounded-sm transition-all">
                        Open Session <i className="fa-solid fa-arrow-right text-[8px] ml-1"></i>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {selectedJournal.length > 0 && (
            <div>
              <p className="text-[9px] font-bold uppercase tracking-[0.25em] text-brand-black/30 mb-3">Journal Entries</p>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {selectedJournal.map(e => (
                  <div key={e.id} className="bg-white border border-purple-100 rounded-sm shadow-sm overflow-hidden hover:shadow-md transition-all">
                    <div className="bg-brand-black px-5 py-4 flex items-center justify-between">
                      <p className="font-display text-lg text-white leading-none tracking-widest truncate">{(e.title || 'Journal Entry').toUpperCase()}</p>
                      <i className="fa-solid fa-book-open text-purple-400/60 flex-shrink-0 ml-2"></i>
                    </div>
                    <div className="px-5 py-4 space-y-3">
                      {e.notes && <p className="text-[10px] text-brand-gray leading-relaxed line-clamp-3 italic">{e.notes}</p>}
                      {e.tags && e.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {e.tags.map(t => <span key={t} className="text-[8px] px-2 py-0.5 bg-purple-50 text-purple-600 border border-purple-100 rounded-sm font-bold uppercase tracking-widest">{t}</span>)}
                        </div>
                      )}
                      <button onClick={onGoToJournal} className="w-full text-[9px] font-bold uppercase tracking-widest py-2.5 bg-purple-50 hover:bg-purple-600 hover:text-white text-purple-700 rounded-sm transition-all">
                        Open Journal <i className="fa-solid fa-arrow-right text-[8px] ml-1"></i>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );

  // ── Search render ─────────────────────────────────────────────────────────
  const renderSearch = () => (
    <div className="space-y-8">
      <header>
        <h2 className="text-4xl font-display text-brand-black tracking-wide">SEARCH</h2>
        <p className="text-brand-gray mt-2 text-sm font-medium">Find sessions and journal entries by keyword.</p>
      </header>
      <div className="relative">
        <i className="fa-solid fa-magnifying-glass absolute left-5 top-1/2 -translate-y-1/2 text-brand-gray/40 text-sm"></i>
        <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search by title, location, genre, notes, tags, strategy..." autoFocus
          className="w-full pl-12 pr-5 py-4 bg-white border border-brand-black/10 rounded-sm focus:ring-2 focus:ring-brand-rose outline-none text-sm text-brand-black placeholder:text-brand-gray/40 shadow-sm" />
        {searchQuery && (
          <button onClick={() => setSearchQuery('')} className="absolute right-4 top-1/2 -translate-y-1/2 text-brand-gray/40 hover:text-brand-rose transition-colors">
            <i className="fa-solid fa-xmark"></i>
          </button>
        )}
      </div>
      {!searchQuery.trim() ? (
        <div className="py-20 text-center border border-dashed border-brand-black/10 rounded-sm">
          <i className="fa-solid fa-magnifying-glass text-brand-gray/20 text-3xl mb-4 block"></i>
          <p className="text-brand-gray/40 text-[10px] font-bold uppercase tracking-widest">Type to search your sessions and journal</p>
        </div>
      ) : searchResults.sessions.length === 0 && searchResults.journal.length === 0 ? (
        <div className="py-20 text-center border border-dashed border-brand-black/10 rounded-sm">
          <p className="text-brand-gray/40 text-[10px] font-bold uppercase tracking-widest">No results for "{searchQuery}"</p>
        </div>
      ) : (
        <div className="space-y-10">
          {searchResults.sessions.length > 0 && (
            <section>
              <p className="text-[9px] font-bold uppercase tracking-[0.3em] text-brand-black/30 mb-4 flex items-center gap-2">
                <i className="fa-solid fa-camera"></i> Sessions
                <span className="bg-brand-rose/10 text-brand-rose px-2 py-0.5 rounded-sm">{searchResults.sessions.length}</span>
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {searchResults.sessions.map(s => (
                  <div key={s.id} className="bg-white border border-brand-black/5 rounded-sm shadow-sm overflow-hidden hover:shadow-md transition-all">
                    <div className="bg-brand-black px-5 py-4 flex items-center justify-between">
                      <div>
                        <p className="font-display text-lg text-white leading-none tracking-widest"><Highlight text={(s.title || s.location || 'Untitled').toUpperCase()} query={searchQuery} /></p>
                        <p className="text-[9px] text-brand-gray mt-1 uppercase tracking-widest">{s.date}</p>
                      </div>
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ml-2 ${STATUS_DOT[s.status]}`}></span>
                    </div>
                    <div className="px-5 py-4 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-[8px] font-bold uppercase tracking-widest px-2 py-1 rounded-sm border ${STATUS_CHIP[s.status]}`}>{s.status}</span>
                        {s.genre?.map(g => <span key={g} className="text-[8px] text-brand-gray font-bold uppercase tracking-widest">{g}</span>)}
                      </div>
                      {s.notes && <p className="text-[10px] text-brand-gray leading-relaxed line-clamp-2"><Highlight text={s.notes} query={searchQuery} /></p>}
                      <button onClick={() => onGoToSession(s.id)} className="w-full text-[9px] font-bold uppercase tracking-widest py-2 bg-brand-black/5 hover:bg-brand-rose hover:text-white text-brand-black rounded-sm transition-all mt-2">
                        Open Session <i className="fa-solid fa-arrow-right text-[8px] ml-1"></i>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
          {searchResults.journal.length > 0 && (
            <section>
              <p className="text-[9px] font-bold uppercase tracking-[0.3em] text-brand-black/30 mb-4 flex items-center gap-2">
                <i className="fa-solid fa-book-open"></i> Journal Entries
                <span className="bg-purple-100 text-purple-600 px-2 py-0.5 rounded-sm">{searchResults.journal.length}</span>
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {searchResults.journal.map(e => (
                  <div key={e.id} className="bg-white border border-purple-100 rounded-sm shadow-sm overflow-hidden hover:shadow-md transition-all">
                    <div className="bg-brand-black px-5 py-4 flex items-center justify-between">
                      <div>
                        <p className="font-display text-lg text-white leading-none tracking-widest"><Highlight text={(e.title || 'Journal Entry').toUpperCase()} query={searchQuery} /></p>
                        <p className="text-[9px] text-brand-gray mt-1 uppercase tracking-widest">{e.date}</p>
                      </div>
                      <i className="fa-solid fa-book-open text-purple-400/60 ml-2"></i>
                    </div>
                    <div className="px-5 py-4 space-y-2">
                      {e.notes && <p className="text-[10px] text-brand-gray leading-relaxed line-clamp-3 italic"><Highlight text={e.notes} query={searchQuery} /></p>}
                      {e.tags && e.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {e.tags.map(t => (
                            <span key={t} className={`text-[8px] px-2 py-0.5 rounded-sm font-bold uppercase tracking-widest border ${t.toLowerCase().includes(searchQuery.toLowerCase()) ? 'bg-brand-rose/10 text-brand-rose border-brand-rose/20' : 'bg-purple-50 text-purple-600 border-purple-100'}`}>{t}</span>
                          ))}
                        </div>
                      )}
                      <button onClick={onGoToJournal} className="w-full text-[9px] font-bold uppercase tracking-widest py-2 bg-purple-50 hover:bg-purple-600 hover:text-white text-purple-700 rounded-sm transition-all mt-2">
                        Open Journal <i className="fa-solid fa-arrow-right text-[8px] ml-1"></i>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );

  // ── Week Planner render ───────────────────────────────────────────────────
  const renderPlanner = () => (
    <div className="space-y-10">
      <header>
        <h2 className="text-4xl font-display text-brand-black tracking-wide">WEEK PLANNER</h2>
        <p className="text-brand-gray mt-2 text-sm font-medium">AI schedules your sessions around your availability.</p>
      </header>

      {activeSessions.length === 0 ? (
        <div className="py-24 text-center border border-dashed border-brand-black/10 rounded-sm">
          <i className="fa-solid fa-calendar-days text-brand-gray/20 text-3xl mb-4 block"></i>
          <p className="text-brand-gray/40 text-[10px] font-bold uppercase tracking-widest">No active sessions to schedule</p>
        </div>
      ) : (
        <>
          {/* Step 1 — Sessions */}
          <section className="bg-white border border-brand-black/5 rounded-sm shadow-sm p-8 space-y-6">
            <h3 className="text-[10px] font-bold uppercase tracking-[0.3em] text-brand-black/30 border-b border-brand-black/5 pb-4">
              <span className="text-brand-rose mr-2">01</span> SELECT SESSIONS TO SCHEDULE
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {activeSessions.map(s => {
                const selected = plannerSessions.has(s.id);
                return (
                  <button key={s.id} onClick={() => togglePlannerSession(s.id)}
                    className={`flex items-center gap-4 p-4 rounded-sm border text-left transition-all ${selected ? 'border-brand-rose bg-brand-rose/5' : 'border-brand-black/5 hover:border-brand-black/15'}`}>
                    <div className={`w-4 h-4 rounded-sm border-2 flex items-center justify-center flex-shrink-0 transition-all ${selected ? 'bg-brand-rose border-brand-rose' : 'border-brand-gray/30'}`}>
                      {selected && <i className="fa-solid fa-check text-white text-[8px]"></i>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-bold text-brand-black uppercase tracking-widest truncate">{s.title || s.location || 'Untitled'}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-sm border ${STATUS_CHIP[s.status]}`}>{s.status}</span>
                        <span className="text-[9px] text-brand-gray">{s.date}</span>
                        {s.strategy && <span className="text-[8px] text-brand-blue font-bold uppercase tracking-widest"><i className="fa-solid fa-bolt mr-0.5"></i>Strategy</span>}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Step 2 — Week of */}
          <section className="bg-white border border-brand-black/5 rounded-sm shadow-sm p-8 space-y-6">
            <h3 className="text-[10px] font-bold uppercase tracking-[0.3em] text-brand-black/30 border-b border-brand-black/5 pb-4">
              <span className="text-brand-rose mr-2">02</span> CHOOSE WEEK
            </h3>
            <div className="flex items-center gap-3 flex-wrap">
              <button onClick={prevWeek} className="w-8 h-8 flex items-center justify-center border border-brand-black/10 rounded-sm hover:border-brand-rose hover:text-brand-rose transition-all">
                <i className="fa-solid fa-chevron-left text-[10px]"></i>
              </button>
              <div className="flex items-center gap-3 bg-brand-black/[0.03] px-5 py-2.5 rounded-sm border border-brand-black/5">
                <i className="fa-solid fa-calendar text-brand-rose text-[10px]"></i>
                <span className="text-[11px] font-bold uppercase tracking-widest text-brand-black">Week of {currentWeekLabel}</span>
              </div>
              <button onClick={nextWeek} className="w-8 h-8 flex items-center justify-center border border-brand-black/10 rounded-sm hover:border-brand-rose hover:text-brand-rose transition-all">
                <i className="fa-solid fa-chevron-right text-[10px]"></i>
              </button>
              {/* Jump to date */}
              <div className="flex items-center gap-2">
                <span className="text-[9px] text-brand-gray/50 uppercase tracking-widest font-bold">Jump to:</span>
                <input
                  type="date"
                  onChange={e => { if (e.target.value) setWeekMonday(getMondayOf(new Date(e.target.value + 'T12:00:00'))); }}
                  className="text-[10px] font-bold border border-brand-black/10 rounded-sm px-3 py-2 focus:ring-1 focus:ring-brand-rose outline-none bg-white"
                />
              </div>
            </div>
            {/* Mini week preview */}
            <div className="grid grid-cols-7 gap-1">
              {currentWeekDates.map((d, i) => (
                <div key={i} className={`text-center p-2 rounded-sm border ${toYMD(d) === todayStr ? 'border-brand-rose bg-brand-rose/5' : 'border-brand-black/5 bg-brand-black/[0.01]'}`}>
                  <p className="text-[8px] font-bold uppercase tracking-widest text-brand-gray">{['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][i]}</p>
                  <p className={`text-[11px] font-bold mt-0.5 ${toYMD(d) === todayStr ? 'text-brand-rose' : 'text-brand-black'}`}>{d.getDate()}</p>
                  <p className="text-[7px] text-brand-gray/50 uppercase">{SHORT_MONTHS[d.getMonth()]}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Step 3 — Availability */}
          <section className="bg-white border border-brand-black/5 rounded-sm shadow-sm p-8 space-y-6">
            <h3 className="text-[10px] font-bold uppercase tracking-[0.3em] text-brand-black/30 border-b border-brand-black/5 pb-4">
              <span className="text-brand-rose mr-2">03</span> SET YOUR AVAILABILITY
            </h3>
            <div className="space-y-2">
              {WEEK_DAYS.map((day, i) => {
                const { enabled, times } = availability[day];
                const realDate = currentWeekDates[i];
                return (
                  <div key={day} className={`rounded-sm border transition-all ${enabled ? 'border-brand-black/10 bg-brand-black/[0.015]' : 'border-brand-black/5'}`}>
                    <div className="flex items-center gap-4 px-5 py-3 flex-wrap">
                      <button onClick={() => toggleDay(day)}
                        className={`w-4 h-4 rounded-sm border-2 flex items-center justify-center flex-shrink-0 transition-all ${enabled ? 'bg-brand-rose border-brand-rose' : 'border-brand-gray/30'}`}>
                        {enabled && <i className="fa-solid fa-check text-white text-[8px]"></i>}
                      </button>
                      <div className="flex items-baseline gap-2 w-44 flex-shrink-0">
                        <span className={`text-[10px] font-bold uppercase tracking-[0.2em] ${enabled ? 'text-brand-black' : 'text-brand-gray/40'}`}>{day.slice(0,3)}</span>
                        <span className={`text-[9px] ${toYMD(realDate) === todayStr ? 'text-brand-rose font-bold' : 'text-brand-gray/50'}`}>
                          {shortDate(realDate)}{toYMD(realDate) === todayStr ? ' · Today' : ''}
                        </span>
                      </div>
                      {enabled ? (
                        <div className="flex gap-2 flex-wrap">
                          {TIME_SLOTS.map(slot => (
                            <button key={slot} onClick={() => toggleTime(day, slot)}
                              className={`text-[8px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-sm border transition-all ${times.has(slot) ? 'bg-brand-black text-white border-brand-black' : 'bg-white text-brand-gray border-brand-black/10 hover:border-brand-black/30'}`}>
                              {slot === 'Morning' ? '🌅' : slot === 'Afternoon' ? '☀️' : '🌙'} {slot}
                            </button>
                          ))}
                          {times.size === 0 && <span className="text-[9px] text-brand-gray/40 italic self-center">Any time</span>}
                        </div>
                      ) : (
                        <span className="text-[9px] text-brand-gray/25 italic">Not available</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Step 4 — Limitations */}
          <section className="bg-white border border-brand-black/5 rounded-sm shadow-sm p-8 space-y-4">
            <h3 className="text-[10px] font-bold uppercase tracking-[0.3em] text-brand-black/30 border-b border-brand-black/5 pb-4">
              <span className="text-brand-rose mr-2">04</span> ADDITIONAL CONSTRAINTS (OPTIONAL)
            </h3>
            <textarea value={limitations} onChange={e => setLimitations(e.target.value)}
              placeholder="e.g. I have a job interview on Tuesday afternoon, golden hour only for outdoor shoots, avoid back-to-back editing days..."
              className="w-full h-28 p-4 bg-brand-white border border-brand-black/5 rounded-sm focus:ring-1 focus:ring-brand-rose outline-none text-sm leading-relaxed text-brand-black placeholder:text-brand-gray/40 resize-none" />
          </section>

          {/* Generate button */}
          <div className="flex justify-end">
            <button disabled={!canGenerate || isGenerating} onClick={handleGenerate}
              className={`flex items-center gap-3 px-10 py-4 rounded-sm font-bold uppercase tracking-[0.2em] text-[10px] transition-all ${!canGenerate || isGenerating ? 'bg-brand-white text-brand-gray border border-brand-black/5 cursor-not-allowed' : 'bg-brand-rose text-white hover:shadow-md active:scale-95 shadow-sm'}`}>
              {isGenerating ? <><i className="fa-solid fa-circle-notch animate-spin"></i> BUILDING YOUR SCHEDULE...</> : <><i className="fa-solid fa-calendar-check"></i> GENERATE WEEK SCHEDULE</>}
            </button>
          </div>

          {/* Result */}
          {(planResult || isGenerating) && (
            <section className="bg-white border border-brand-black/5 rounded-sm shadow-sm overflow-hidden animate-in fade-in duration-500">
              <div className="bg-brand-black px-8 py-5 flex items-center justify-between">
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-[0.3em] text-brand-rose mb-1">PHOTOVISE SCHEDULING AI</p>
                  <p className="font-display text-xl text-white tracking-widest">WEEK OF {currentWeekLabel.toUpperCase()}</p>
                </div>
                <i className="fa-solid fa-calendar-week text-brand-rose/40 text-xl"></i>
              </div>
              <div className="p-8">
                {isGenerating && !planResult ? (
                  <div className="py-12 text-center">
                    <i className="fa-solid fa-circle-notch animate-spin text-brand-rose text-xl mb-3 block"></i>
                    <p className="text-brand-gray/50 text-[10px] font-bold uppercase tracking-widest">Building your schedule...</p>
                  </div>
                ) : (
                  <>
                    <MarkdownBlock text={planResult} />
                    <div className="mt-8 pt-6 border-t border-brand-black/5 flex justify-end">
                      <button onClick={handlePin} disabled={pinnedThisResult}
                        className={`flex items-center gap-2 px-6 py-3 rounded-sm text-[9px] font-bold uppercase tracking-widest transition-all ${pinnedThisResult ? 'bg-emerald-50 text-emerald-600 border border-emerald-200 cursor-default' : 'bg-brand-black text-white hover:bg-zinc-700 active:scale-95 shadow-sm'}`}>
                        <i className={`fa-solid ${pinnedThisResult ? 'fa-circle-check' : 'fa-thumbtack'}`}></i>
                        {pinnedThisResult ? 'Pinned!' : 'Pin This Schedule'}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </section>
          )}

          {/* Pinned plans */}
          {weekPlans.length > 0 && (
            <section className="pt-10 border-t border-brand-black/5 space-y-6">
              <h3 className="text-[10px] font-bold uppercase tracking-[0.3em] text-brand-black/30 flex items-center gap-2">
                <i className="fa-solid fa-thumbtack text-brand-rose"></i> PINNED SCHEDULES ({weekPlans.length})
              </h3>
              <div className="space-y-4">
                {weekPlans.map(plan => (
                  <PinnedPlanCard key={plan.id} plan={plan} onDelete={onDeleteWeekPlan} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );

  return (
    <div className="animate-in fade-in duration-700 space-y-8">
      <div className="flex gap-1 bg-brand-black/5 p-1 rounded-sm w-fit">
        {([
          { key: 'calendar', icon: 'fa-calendar',         label: 'Calendar'     },
          { key: 'planner',  icon: 'fa-calendar-week',    label: 'Week Planner' },
          { key: 'search',   icon: 'fa-magnifying-glass', label: 'Search'       },
        ] as const).map(({ key, icon, label }) => (
          <button key={key} onClick={() => setView(key)}
            className={`px-6 py-2 text-[9px] font-bold uppercase tracking-[0.2em] rounded-sm transition-all ${view === key ? 'bg-brand-black text-white shadow-sm' : 'text-brand-gray hover:text-brand-black'}`}>
            <i className={`fa-solid ${icon} mr-2`}></i>{label}
          </button>
        ))}
      </div>
      {view === 'calendar' ? renderCalendar() : view === 'planner' ? renderPlanner() : renderSearch()}
    </div>
  );
};

// ── Pinned plan card (collapsible) ────────────────────────────────────────────
const PinnedPlanCard: React.FC<{ plan: WeekPlan; onDelete: (id: string) => void }> = ({ plan, onDelete }) => {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="bg-white border border-brand-black/5 rounded-sm shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 cursor-pointer hover:bg-brand-black/[0.02] transition-all" onClick={() => setExpanded(p => !p)}>
        <div className="flex items-center gap-4">
          <i className="fa-solid fa-thumbtack text-brand-rose text-[10px]"></i>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-brand-black">Week of {plan.weekLabel}</p>
            <p className="text-[9px] text-brand-gray/60 mt-0.5 uppercase tracking-widest">
              {plan.sessionTitles.slice(0, 3).join(' · ')}{plan.sessionTitles.length > 3 ? ` +${plan.sessionTitles.length - 3} more` : ''}
              {' · '}Saved {new Date(plan.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={e => { e.stopPropagation(); if (confirm('Delete this pinned schedule?')) onDelete(plan.id); }}
            className="text-brand-gray/30 hover:text-brand-rose transition-colors p-1" title="Delete">
            <i className="fa-solid fa-trash text-[10px]"></i>
          </button>
          <i className={`fa-solid fa-chevron-${expanded ? 'up' : 'down'} text-brand-gray/40 text-[10px]`}></i>
        </div>
      </div>
      {expanded && (
        <div className="px-6 pb-6 pt-2 border-t border-brand-black/5 animate-in fade-in duration-300">
          <MarkdownBlock text={plan.result} />
        </div>
      )}
    </div>
  );
};

export default CalendarView;
