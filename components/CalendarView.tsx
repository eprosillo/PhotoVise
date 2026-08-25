import React, { useState, useMemo } from 'react';
import { Session, SessionStatus, WeekPlan, ScoutLocation, PhotographerProfile, GearItem } from '../types';
import { generateWeeklyPlan } from '../services/geminiService';

interface CalendarViewProps {
  sessions: Session[];
  weekPlans: WeekPlan[];
  scoutLocations: ScoutLocation[];
  profile: PhotographerProfile;
  gear: GearItem[];
  onSaveWeekPlan: (plan: WeekPlan) => void;
  onDeleteWeekPlan: (id: string) => void;
  onGoToSession: (sessionId: string) => void;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_COLOR: Record<SessionStatus, string> = {
  capturing:   '#4a6b7c',
  shot:        '#c9a227',
  culled:      '#a35a4a',
  edited:      '#4b6b52',
  'backed up': '#4b6b52',
  posted:      '#4a6b7c',
  archived:    'rgba(23,25,26,0.28)',
};

const GRID_DAYS   = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const WEEK_DAYS   = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const TIME_SLOTS  = ['Morning', 'Afternoon', 'Evening'] as const;
type  TimeSlot    = typeof TIME_SLOTS[number];
const MONTHS      = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const SHORT_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const toYMD = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const shortDate = (d: Date) => `${SHORT_MONTHS[d.getMonth()]} ${d.getDate()}`;

const getMondayOf = (date: Date): Date => {
  const d = new Date(date);
  const dow = d.getDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
};

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
  if (sameMonth) return `${SHORT_MONTHS[monday.getMonth()]} ${monday.getDate()}–${sunday.getDate()}, ${sunday.getFullYear()}`;
  if (sameYear)  return `${shortDate(monday)}–${shortDate(sunday)}, ${sunday.getFullYear()}`;
  return `${shortDate(monday)}, ${monday.getFullYear()}–${shortDate(sunday)}, ${sunday.getFullYear()}`;
};

// ── Simple markdown renderer ──────────────────────────────────────────────────

const MarkdownBlock: React.FC<{ text: string }> = ({ text }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
    {text.split('\n').map((line, i) => {
      if (!line.trim()) return <div key={i} style={{ height: '6px' }} />;
      if (/^###\s/.test(line))
        return <p key={i} className="font-mono text-[9px] tracking-[0.18em] uppercase mt-3 mb-1" style={{ color: 'rgba(23,25,26,0.45)' }}>{line.replace(/^###\s/, '')}</p>;
      if (/^##\s/.test(line))
        return <p key={i} className="font-mono text-[10px] tracking-[0.16em] uppercase mt-4 mb-1" style={{ color: '#17191a', fontWeight: 600 }}>{line.replace(/^##\s/, '')}</p>;
      if (/^#\s/.test(line))
        return <p key={i} style={{ fontSize: '14px', fontWeight: 600, color: '#17191a', marginTop: '16px' }}>{line.replace(/^#\s/, '')}</p>;
      const boldParsed = line.split(/\*\*([^*]+)\*\*/g).map((part, j) =>
        j % 2 === 1 ? <strong key={j} style={{ fontWeight: 600, color: '#17191a' }}>{part}</strong> : part
      );
      if (/^[-•]\s/.test(line))
        return <p key={i} style={{ fontSize: '13px', lineHeight: 1.65, color: 'rgba(23,25,26,0.65)', display: 'flex', gap: '8px' }}>
          <span style={{ color: '#c9a227', flexShrink: 0 }}>—</span><span>{boldParsed}</span>
        </p>;
      return <p key={i} style={{ fontSize: '13px', lineHeight: 1.65, color: 'rgba(23,25,26,0.65)' }}>{boldParsed}</p>;
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
          ? <mark key={i} style={{ background: 'rgba(201,162,39,0.20)', color: '#8a6b0f', padding: '0 2px' }}>{part}</mark>
          : part
      )}
    </>
  );
};

// ── DayAvailability ───────────────────────────────────────────────────────────

interface DayAvailability { enabled: boolean; times: Set<TimeSlot> }
const defaultAvailability = (): Record<string, DayAvailability> =>
  Object.fromEntries(WEEK_DAYS.map(d => [d, { enabled: false, times: new Set<TimeSlot>() }]));

// ── Tab button ────────────────────────────────────────────────────────────────

function TabBtn({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className="font-mono text-[9px] tracking-[0.18em] uppercase transition-colors"
      style={{
        padding: '9px 18px',
        background: active ? '#17191a' : 'transparent',
        color: active ? '#f4f3ef' : 'rgba(23,25,26,0.50)',
        border: active ? '1px solid #17191a' : '1px solid rgba(23,25,26,0.18)',
        cursor: 'pointer',
      }}
      onMouseEnter={e => { if (!active) { e.currentTarget.style.borderColor = '#17191a'; e.currentTarget.style.color = '#17191a'; } }}
      onMouseLeave={e => { if (!active) { e.currentTarget.style.borderColor = 'rgba(23,25,26,0.18)'; e.currentTarget.style.color = 'rgba(23,25,26,0.50)'; } }}
    >
      {label}
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

const CalendarView: React.FC<CalendarViewProps> = ({
  sessions, weekPlans, scoutLocations, profile, gear,
  onSaveWeekPlan, onDeleteWeekPlan, onGoToSession,
}) => {
  const today = new Date();
  const [view, setView] = useState<'calendar' | 'planner' | 'search'>('calendar');

  // Calendar state
  const [current, setCurrent]           = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // Planner state
  const [plannerSessions, setPlannerSessions]   = useState<Set<string>>(new Set());
  const [availability, setAvailability]         = useState<Record<string, DayAvailability>>(defaultAvailability);
  const [limitations, setLimitations]           = useState('');
  const [planResult, setPlanResult]             = useState('');
  const [isGenerating, setIsGenerating]         = useState(false);
  const [pinnedThisResult, setPinnedThisResult] = useState(false);
  const [weekMonday, setWeekMonday]             = useState<Date>(() => getMondayOf(today));

  // Search state
  const [searchQuery, setSearchQuery] = useState('');

  const currentWeekDates = useMemo(() => weekDates(weekMonday), [weekMonday]);
  const currentWeekLabel = useMemo(() => weekLabel(weekMonday), [weekMonday]);

  const prevWeek  = () => setWeekMonday(prev => { const d = new Date(prev); d.setDate(d.getDate() - 7); return d; });
  const nextWeek  = () => setWeekMonday(prev => { const d = new Date(prev); d.setDate(d.getDate() + 7); return d; });
  const prevMonth = () => setCurrent(new Date(current.getFullYear(), current.getMonth() - 1, 1));
  const nextMonth = () => setCurrent(new Date(current.getFullYear(), current.getMonth() + 1, 1));
  const goToday   = () => { setCurrent(new Date(today.getFullYear(), today.getMonth(), 1)); setSelectedDate(toYMD(today)); };

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
    sessions.forEach(s => { if (!s.date) return; const k = s.date.slice(0, 10); (map[k] ??= []).push(s); });
    return map;
  }, [sessions]);

  const todayStr         = toYMD(today);
  const selectedSessions = selectedDate ? (sessionsByDate[selectedDate] ?? []) : [];
  const activeSessions   = sessions.filter(s => s.status !== 'archived');

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return { sessions: [] };
    return {
      sessions: sessions.filter(s =>
        [s.title, s.location, s.name, s.notes, s.strategy, s.dayPlan, ...(s.genre ?? [])].some(f => f?.toLowerCase().includes(q))
      ),
    };
  }, [searchQuery, sessions]);

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

  const STATUS_NEXT_TASK: Record<SessionStatus, string> = {
    capturing:   'NEXT: Shoot day — plan the shoot, location scout, and gear prep.',
    shot:        'NEXT: Cull — review and select the best frames from the shoot.',
    culled:      'NEXT: Edit — process and retouch the selected images.',
    edited:      'NEXT: Back up — export finals and back up all files.',
    'backed up': 'NEXT: Deliver / post — send to client or publish online.',
    posted:      'NEXT: Archive — organise and store the completed project.',
    archived:    'NEXT: Complete — no remaining tasks.',
  };

  const formatProfileForContext = (): string => {
    const genres    = profile.primaryGenres.join(', ') || 'None specified';
    const style     = profile.styleKeywords.join(', ') || 'None specified';
    const editing   = profile.editingApps.join(', ')   || 'None specified';
    const tethering = profile.tetheringApps.join(', ') || 'None specified';
    return [
      'PHOTOGRAPHER PROFILE:',
      profile.name          ? `Name: ${profile.name}`                                 : null,
      profile.yearsShooting ? `Years Shooting: ${profile.yearsShooting}`               : null,
      `Primary Genres: ${genres}`,
      `Typical Work: ${profile.typicalWork || 'Not specified'}`,
      `Style Keywords: ${style}`,
      `Software Workflow: ${editing}`,
      `Tethering Apps: ${tethering}`,
      profile.otherEditingAppNote   ? `Note on Editing: ${profile.otherEditingAppNote}`     : null,
      profile.otherTetheringAppNote ? `Note on Tethering: ${profile.otherTetheringAppNote}` : null,
      `Risk Profile: ${profile.riskProfile}`,
      profile.strengths           ? `Strengths: ${profile.strengths}`                   : null,
      profile.struggles           ? `Struggles: ${profile.struggles}`                   : null,
      profile.physicalConstraints ? `Physical Constraints: ${profile.physicalConstraints}` : null,
      profile.accessReality       ? `Access Reality: ${profile.accessReality}`           : null,
      profile.timeBudget          ? `Time Budget: ${profile.timeBudget}`                 : null,
      profile.growthGoals         ? `Growth Goals: ${profile.growthGoals}`               : null,
    ].filter(Boolean).join('\n');
  };

  const formatGearForContext = (): string => {
    const available = gear.filter(g => g.available);
    if (available.length === 0) return '';
    const lines = available.map(g =>
      `- ${g.name} | ${g.category}` +
      (g.details          ? ` | Details: ${g.details}`      : '') +
      (g.tags?.length     ? ` | Tags: ${g.tags.join(', ')}` : '')
    );
    return 'AVAILABLE GEAR LOCKER:\n' + lines.join('\n');
  };

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
          `  Scheduled date: ${s.date}`,
          `  Location: ${s.location || 'N/A'}`,
          `  Genre: ${s.genre?.join(', ') || 'N/A'}`,
          `  Current status: ${s.status}`,
          `  ${STATUS_NEXT_TASK[s.status]}`,
        ];
        if (s.strategy) lines.push(`  Existing strategy notes: ${s.strategy.slice(0, 400)}`);
        if (s.dayPlan)  lines.push(`  Existing day plan notes: ${s.dayPlan.slice(0, 400)}`);
        const scout = scoutLocations.find(sl => sl.sessionId === s.id);
        if (scout) {
          lines.push(`  Scouted location:`);
          lines.push(`    Name: ${scout.name}`);
          if (scout.area)          lines.push(`    Area: ${scout.area}`);
          if (scout.mapLink)       lines.push(`    Map/Address: ${scout.mapLink}`);
          if (scout.bestTime)      lines.push(`    Best time: ${scout.bestTime}`);
          if (scout.lightingNotes) lines.push(`    Lighting: ${scout.lightingNotes}`);
          if (scout.accessNotes)   lines.push(`    Access: ${scout.accessNotes}`);
          if (scout.parkingNotes)  lines.push(`    Parking: ${scout.parkingNotes}`);
          if (scout.shotIdeas)     lines.push(`    Shot ideas: ${scout.shotIdeas}`);
          if (scout.safetyNotes)   lines.push(`    Safety: ${scout.safetyNotes}`);
          if (scout.backupSpot)    lines.push(`    Backup spot: ${scout.backupSpot}`);
        } else if (s.scoutNotes) {
          lines.push(`  Scouted location:\n${s.scoutNotes.split('\n').map((l: string) => `    ${l}`).join('\n')}`);
        }
        return lines.join('\n');
      }).join('\n\n');

    const availableDaysText = WEEK_DAYS
      .map((day, i) => ({ day, date: currentWeekDates[i] }))
      .filter(({ day }) => availability[day].enabled)
      .map(({ day, date }) => {
        const times = [...availability[day].times];
        const dateStr = `${day} ${shortDate(date)}, ${date.getFullYear()}`;
        return times.length > 0 ? `${dateStr}: ${times.join(', ')}` : `${dateStr}: any time`;
      })
      .join('\n');

    const profileContext = formatProfileForContext();
    const gearContext    = formatGearForContext();

    const prompt = `You are a professional photography scheduling assistant. Create a practical, forward-looking work schedule for the photographer for the week of ${currentWeekLabel}.

${profileContext}

${gearContext ? gearContext + '\n' : ''}SESSIONS TO PLAN:
${selectedSessionData}

PHOTOGRAPHER'S AVAILABLE DAYS & TIMES (use these exact dates):
${availableDaysText}

ADDITIONAL CONSTRAINTS & NOTES:
${limitations.trim() || 'None provided.'}

TODAY'S DATE: ${toYMD(today)}

INSTRUCTIONS:
- For each session, schedule ONLY the tasks that come NEXT based on its current status.
- Use the exact dates provided as headings for each day.
- Respect existing strategy and day plan notes.
- Avoid scheduling full shoot days back-to-back.
- Include one sentence of reasoning per day explaining why that task fits that day.
- End with a short prep checklist of things to do before the week starts.
- Be concise and action-oriented.`;

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

  // ── Calendar view ─────────────────────────────────────────────────────────

  const renderCalendar = () => (
    <div>
      {/* Month navigation */}
      <div className="flex items-center justify-between mb-5" style={{ borderBottom: '1px solid rgba(23,25,26,0.12)', paddingBottom: '14px' }}>
        <div className="flex items-center gap-3">
          <button onClick={prevMonth} style={{ padding: '6px 10px', border: '1px solid rgba(23,25,26,0.16)', background: 'transparent', cursor: 'pointer', color: 'rgba(23,25,26,0.55)' }}>‹</button>
          <span className="font-mono text-[11px] tracking-[0.16em] uppercase font-medium" style={{ color: '#17191a', minWidth: '160px', textAlign: 'center' }}>
            {MONTHS[current.getMonth()]} {current.getFullYear()}
          </span>
          <button onClick={nextMonth} style={{ padding: '6px 10px', border: '1px solid rgba(23,25,26,0.16)', background: 'transparent', cursor: 'pointer', color: 'rgba(23,25,26,0.55)' }}>›</button>
        </div>
        <button
          onClick={goToday}
          className="font-mono text-[8px] tracking-[0.16em] uppercase transition-colors"
          style={{ padding: '6px 12px', border: '1px solid rgba(23,25,26,0.18)', background: 'transparent', cursor: 'pointer', color: 'rgba(23,25,26,0.55)' }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = '#c9a227'; e.currentTarget.style.color = '#8a6b0f'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(23,25,26,0.18)'; e.currentTarget.style.color = 'rgba(23,25,26,0.55)'; }}
        >
          Today
        </button>
      </div>

      {/* Grid */}
      <div style={{ border: '1px solid rgba(23,25,26,0.14)' }}>
        {/* Day headers */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1px solid rgba(23,25,26,0.14)' }}>
          {GRID_DAYS.map(d => (
            <div key={d} className="font-mono text-[8px] tracking-[0.18em] uppercase text-center py-2" style={{ color: 'rgba(23,25,26,0.38)', borderRight: '1px solid rgba(23,25,26,0.08)' }}>{d}</div>
          ))}
        </div>
        {/* Cells */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
          {cells.map(({ date, inMonth }) => {
            const daySessions = sessionsByDate[date] ?? [];
            const isToday     = date === todayStr;
            const isSelected  = date === selectedDate;
            return (
              <button
                key={date}
                onClick={() => setSelectedDate(date === selectedDate ? null : date)}
                style={{
                  minHeight: '80px',
                  padding: '6px 5px',
                  textAlign: 'left',
                  borderRight: '1px solid rgba(23,25,26,0.08)',
                  borderBottom: '1px solid rgba(23,25,26,0.08)',
                  background: isSelected ? 'rgba(201,162,39,0.06)' : inMonth ? 'transparent' : 'rgba(23,25,26,0.02)',
                  cursor: 'pointer',
                  transition: 'background 0.15s',
                  outline: 'none',
                }}
                onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'rgba(23,25,26,0.02)'; }}
                onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = inMonth ? 'transparent' : 'rgba(23,25,26,0.02)'; }}
              >
                {/* Date number */}
                <span
                  className="font-mono text-[10px] inline-flex items-center justify-center mb-1"
                  style={{
                    width: '20px', height: '20px',
                    background: isToday ? '#c9a227' : 'transparent',
                    color: isToday ? '#17191a' : inMonth ? '#17191a' : 'rgba(23,25,26,0.25)',
                    fontWeight: isToday ? 600 : 400,
                  }}
                >
                  {new Date(date + 'T12:00:00').getDate()}
                </span>
                {/* Session rows */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  {daySessions.slice(0, 3).map(s => (
                    <div
                      key={s.id}
                      className="font-mono text-[8px] truncate"
                      style={{
                        padding: '1px 4px',
                        borderLeft: `2px solid ${STATUS_COLOR[s.status]}`,
                        color: 'rgba(23,25,26,0.65)',
                        background: 'rgba(23,25,26,0.04)',
                      }}
                    >
                      {s.title || s.location || 'Untitled'}
                    </div>
                  ))}
                  {daySessions.length > 3 && (
                    <p className="font-mono text-[7px] tracking-[0.10em]" style={{ color: 'rgba(23,25,26,0.38)', paddingLeft: '4px' }}>+{daySessions.length - 3}</p>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Status legend */}
      <div className="flex flex-wrap gap-4 mt-4">
        {(Object.entries(STATUS_COLOR) as [SessionStatus, string][]).map(([s, color]) => (
          <div key={s} className="flex items-center gap-1.5">
            <span style={{ width: '8px', height: '8px', background: color, display: 'inline-block' }} />
            <span className="font-mono text-[8px] tracking-[0.12em] uppercase" style={{ color: 'rgba(23,25,26,0.50)' }}>{s}</span>
          </div>
        ))}
      </div>

      {/* Selected date panel */}
      {selectedDate && (
        <div style={{ marginTop: '20px', borderTop: '1px solid rgba(23,25,26,0.12)', paddingTop: '18px' }}>
          <div className="flex items-center justify-between mb-4">
            <p className="font-mono text-[9px] tracking-[0.18em] uppercase" style={{ color: 'rgba(23,25,26,0.50)' }}>
              {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
            </p>
            <button
              onClick={() => setSelectedDate(null)}
              className="font-mono text-[8px] tracking-[0.14em] uppercase transition-colors"
              style={{ color: 'rgba(23,25,26,0.40)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              onMouseEnter={e => (e.currentTarget.style.color = '#17191a')}
              onMouseLeave={e => (e.currentTarget.style.color = 'rgba(23,25,26,0.40)')}
            >
              × Close
            </button>
          </div>
          {selectedSessions.length === 0 ? (
            <p className="font-mono text-[9px] tracking-[0.16em] uppercase" style={{ color: 'rgba(23,25,26,0.35)', padding: '20px 0' }}>
              Nothing logged on this day
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {selectedSessions.map(s => {
                const cardScout = scoutLocations.find(sl => sl.sessionId === s.id);
                return (
                  <div key={s.id} style={{ background: '#f8f7f4', border: '1px solid rgba(23,25,26,0.14)', borderLeft: `3px solid ${STATUS_COLOR[s.status]}`, padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: '14px', fontWeight: 500, color: '#17191a', marginBottom: '4px' }}>{s.title || s.location || 'Untitled'}</p>
                      <div className="flex flex-wrap gap-3 items-center">
                        <span className="font-mono text-[8px] tracking-[0.14em] uppercase" style={{ color: STATUS_COLOR[s.status] }}>{s.status}</span>
                        {s.genre && s.genre.length > 0 && (
                          <span className="font-mono text-[8px] tracking-[0.10em] uppercase" style={{ color: 'rgba(23,25,26,0.40)' }}>{s.genre.join(' · ')}</span>
                        )}
                        {(cardScout || s.scoutNotes) && (
                          <span className="font-mono text-[8px] tracking-[0.10em] uppercase" style={{ color: '#4b6b52' }}>
                            {cardScout ? cardScout.name : 'Scouted'}
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => onGoToSession(s.id)}
                      className="font-mono text-[8px] tracking-[0.14em] uppercase shrink-0 transition-colors"
                      style={{ padding: '6px 12px', border: '1px solid rgba(23,25,26,0.18)', background: 'transparent', cursor: 'pointer', color: 'rgba(23,25,26,0.55)' }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = '#c9a227'; e.currentTarget.style.color = '#8a6b0f'; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(23,25,26,0.18)'; e.currentTarget.style.color = 'rgba(23,25,26,0.55)'; }}
                    >
                      Open ↗
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );

  // ── Search view ───────────────────────────────────────────────────────────

  const renderSearch = () => (
    <div>
      <div style={{ position: 'relative', marginBottom: '18px' }}>
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search by title, location, genre, notes…"
          autoFocus
          style={{
            width: '100%', boxSizing: 'border-box',
            padding: '11px 40px 11px 14px',
            fontSize: '13px', color: '#17191a',
            background: 'rgba(23,25,26,0.04)',
            border: '1px solid rgba(23,25,26,0.14)',
            outline: 'none', fontFamily: 'inherit',
          }}
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: 'rgba(23,25,26,0.40)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px' }}
          >
            ×
          </button>
        )}
      </div>
      {!searchQuery.trim() ? (
        <p className="font-mono text-[9px] tracking-[0.18em] uppercase py-10" style={{ color: 'rgba(23,25,26,0.35)' }}>
          Type to search sessions
        </p>
      ) : searchResults.sessions.length === 0 ? (
        <p className="font-mono text-[9px] tracking-[0.18em] uppercase py-10" style={{ color: 'rgba(23,25,26,0.35)' }}>
          No results for "{searchQuery}"
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
          {searchResults.sessions.map((s, i) => (
            <div
              key={s.id}
              style={{
                background: '#f8f7f4',
                borderTop: i === 0 ? '1px solid rgba(23,25,26,0.14)' : 'none',
                borderBottom: '1px solid rgba(23,25,26,0.14)',
                borderLeft: `3px solid ${STATUS_COLOR[s.status]}`,
                borderRight: '1px solid rgba(23,25,26,0.14)',
                padding: '12px 16px',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: '14px', fontWeight: 500, color: '#17191a', marginBottom: '3px' }}>
                  <Highlight text={s.title || s.location || 'Untitled'} query={searchQuery} />
                </p>
                <div className="flex flex-wrap gap-3">
                  <span className="font-mono text-[8px] tracking-[0.12em] uppercase" style={{ color: STATUS_COLOR[s.status] }}>{s.status}</span>
                  <span className="font-mono text-[8px] tracking-[0.10em] uppercase" style={{ color: 'rgba(23,25,26,0.40)' }}>{s.date}</span>
                  {s.genre?.map(g => (
                    <span key={g} className="font-mono text-[8px] tracking-[0.10em] uppercase" style={{ color: 'rgba(23,25,26,0.40)' }}>{g}</span>
                  ))}
                </div>
                {s.notes && (
                  <p style={{ fontSize: '12px', color: 'rgba(23,25,26,0.55)', marginTop: '4px', lineHeight: 1.5, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                    <Highlight text={s.notes} query={searchQuery} />
                  </p>
                )}
              </div>
              <button
                onClick={() => onGoToSession(s.id)}
                className="font-mono text-[8px] tracking-[0.14em] uppercase shrink-0 transition-colors"
                style={{ padding: '6px 12px', border: '1px solid rgba(23,25,26,0.18)', background: 'transparent', cursor: 'pointer', color: 'rgba(23,25,26,0.55)' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = '#c9a227'; e.currentTarget.style.color = '#8a6b0f'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(23,25,26,0.18)'; e.currentTarget.style.color = 'rgba(23,25,26,0.55)'; }}
              >
                Open ↗
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  // ── Planner view ──────────────────────────────────────────────────────────

  const renderPlanner = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
      {activeSessions.length === 0 ? (
        <div style={{ borderLeft: '2px solid rgba(23,25,26,0.18)', paddingLeft: '16px', padding: '16px', marginTop: '8px' }}>
          <p className="font-mono text-[9px] tracking-[0.18em] uppercase" style={{ color: 'rgba(23,25,26,0.40)' }}>No Active Sessions</p>
          <p style={{ fontSize: '13px', color: 'rgba(23,25,26,0.55)', marginTop: '4px' }}>Add sessions on the Dashboard to start planning your week.</p>
        </div>
      ) : (
        <>
          {/* Step 1 — Sessions */}
          <div style={{ border: '1px solid rgba(23,25,26,0.14)', background: '#f8f7f4', padding: '20px' }}>
            <p className="font-mono text-[9px] tracking-[0.22em] uppercase mb-4" style={{ borderBottom: '1px solid rgba(23,25,26,0.10)', paddingBottom: '10px', color: 'rgba(23,25,26,0.45)' }}>
              <span style={{ color: '#c9a227' }}>01</span> — Select Sessions
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
              {activeSessions.map((s, i) => {
                const selected = plannerSessions.has(s.id);
                const linkedScout = scoutLocations.find(sl => sl.sessionId === s.id);
                return (
                  <button
                    key={s.id}
                    onClick={() => togglePlannerSession(s.id)}
                    className="w-full flex items-center gap-4 text-left transition-colors"
                    style={{
                      padding: '10px 0',
                      borderBottom: i < activeSessions.length - 1 ? '1px solid rgba(23,25,26,0.08)' : 'none',
                      background: selected ? 'rgba(201,162,39,0.04)' : 'transparent',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{
                      width: '12px', height: '12px', flexShrink: 0,
                      border: selected ? '1px solid #c9a227' : '1px solid rgba(23,25,26,0.25)',
                      background: selected ? '#c9a227' : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {selected && <span style={{ fontSize: '8px', color: '#17191a' }}>✓</span>}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: '13px', fontWeight: 500, color: '#17191a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {s.title || s.location || 'Untitled'}
                      </p>
                      <div className="flex items-center gap-3 flex-wrap mt-1">
                        <span className="font-mono text-[8px] tracking-[0.12em] uppercase" style={{ color: STATUS_COLOR[s.status] }}>{s.status}</span>
                        <span className="font-mono text-[8px] tracking-[0.10em] uppercase" style={{ color: 'rgba(23,25,26,0.40)' }}>{s.date}</span>
                        {(linkedScout || s.scoutNotes) && (
                          <span className="font-mono text-[8px] tracking-[0.10em] uppercase" style={{ color: '#4b6b52' }}>
                            {linkedScout ? linkedScout.name : 'Scout'}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Step 2 — Week of */}
          <div style={{ border: '1px solid rgba(23,25,26,0.14)', background: '#f8f7f4', padding: '20px' }}>
            <p className="font-mono text-[9px] tracking-[0.22em] uppercase mb-4" style={{ borderBottom: '1px solid rgba(23,25,26,0.10)', paddingBottom: '10px', color: 'rgba(23,25,26,0.45)' }}>
              <span style={{ color: '#c9a227' }}>02</span> — Choose Week
            </p>
            <div className="flex items-center gap-3 flex-wrap mb-4">
              <button onClick={prevWeek} style={{ padding: '6px 10px', border: '1px solid rgba(23,25,26,0.16)', background: 'transparent', cursor: 'pointer', color: 'rgba(23,25,26,0.55)' }}>‹</button>
              <span className="font-mono text-[10px] tracking-[0.14em] uppercase" style={{ color: '#17191a', padding: '6px 14px', border: '1px solid rgba(23,25,26,0.14)', background: 'rgba(23,25,26,0.04)' }}>
                Week of {currentWeekLabel}
              </span>
              <button onClick={nextWeek} style={{ padding: '6px 10px', border: '1px solid rgba(23,25,26,0.16)', background: 'transparent', cursor: 'pointer', color: 'rgba(23,25,26,0.55)' }}>›</button>
              <input
                type="date"
                onChange={e => { if (e.target.value) setWeekMonday(getMondayOf(new Date(e.target.value + 'T12:00:00'))); }}
                style={{ padding: '6px 10px', border: '1px solid rgba(23,25,26,0.16)', background: 'transparent', fontSize: '11px', color: '#17191a', outline: 'none', cursor: 'pointer' }}
              />
            </div>
            {/* Mini week strip */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px' }}>
              {currentWeekDates.map((d, i) => {
                const isT = toYMD(d) === todayStr;
                return (
                  <div key={i} style={{ textAlign: 'center', padding: '6px 2px', border: isT ? '1px solid #c9a227' : '1px solid rgba(23,25,26,0.10)', background: isT ? 'rgba(201,162,39,0.06)' : 'transparent' }}>
                    <p className="font-mono text-[7px] tracking-[0.12em] uppercase" style={{ color: 'rgba(23,25,26,0.40)' }}>{['M','T','W','T','F','S','S'][i]}</p>
                    <p className="font-mono text-[10px] font-medium" style={{ color: isT ? '#c9a227' : '#17191a', marginTop: '2px' }}>{d.getDate()}</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Step 3 — Availability */}
          <div style={{ border: '1px solid rgba(23,25,26,0.14)', background: '#f8f7f4', padding: '20px' }}>
            <p className="font-mono text-[9px] tracking-[0.22em] uppercase mb-4" style={{ borderBottom: '1px solid rgba(23,25,26,0.10)', paddingBottom: '10px', color: 'rgba(23,25,26,0.45)' }}>
              <span style={{ color: '#c9a227' }}>03</span> — Set Availability
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
              {WEEK_DAYS.map((day, i) => {
                const { enabled, times } = availability[day];
                const realDate = currentWeekDates[i];
                const isT = toYMD(realDate) === todayStr;
                return (
                  <div
                    key={day}
                    className="flex items-center gap-4 flex-wrap"
                    style={{
                      padding: '9px 0',
                      borderBottom: i < WEEK_DAYS.length - 1 ? '1px solid rgba(23,25,26,0.08)' : 'none',
                      background: enabled ? 'rgba(201,162,39,0.02)' : 'transparent',
                    }}
                  >
                    <button
                      onClick={() => toggleDay(day)}
                      style={{
                        width: '12px', height: '12px', flexShrink: 0,
                        border: enabled ? '1px solid #c9a227' : '1px solid rgba(23,25,26,0.25)',
                        background: enabled ? '#c9a227' : 'transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: 'pointer',
                      }}
                    >
                      {enabled && <span style={{ fontSize: '8px', color: '#17191a' }}>✓</span>}
                    </button>
                    <div style={{ width: '120px', flexShrink: 0 }}>
                      <span className="font-mono text-[9px] tracking-[0.14em] uppercase" style={{ color: enabled ? '#17191a' : 'rgba(23,25,26,0.35)' }}>{day.slice(0, 3)}</span>
                      <span className="font-mono text-[8px] tracking-[0.10em] uppercase ml-2" style={{ color: isT ? '#c9a227' : 'rgba(23,25,26,0.40)' }}>
                        {shortDate(realDate)}{isT ? ' · Today' : ''}
                      </span>
                    </div>
                    {enabled ? (
                      <div className="flex gap-2 flex-wrap">
                        {TIME_SLOTS.map(slot => (
                          <button
                            key={slot}
                            onClick={() => toggleTime(day, slot)}
                            className="font-mono text-[8px] tracking-[0.14em] uppercase transition-colors"
                            style={{
                              padding: '4px 10px',
                              border: times.has(slot) ? '1px solid #17191a' : '1px solid rgba(23,25,26,0.18)',
                              background: times.has(slot) ? '#17191a' : 'transparent',
                              color: times.has(slot) ? '#f4f3ef' : 'rgba(23,25,26,0.50)',
                              cursor: 'pointer',
                            }}
                          >
                            {slot}
                          </button>
                        ))}
                        {times.size === 0 && <span className="font-mono text-[8px] tracking-[0.12em] uppercase" style={{ color: 'rgba(23,25,26,0.30)' }}>Any time</span>}
                      </div>
                    ) : (
                      <span className="font-mono text-[8px] tracking-[0.10em] uppercase" style={{ color: 'rgba(23,25,26,0.22)' }}>Not available</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Step 4 — Limitations */}
          <div style={{ border: '1px solid rgba(23,25,26,0.14)', background: '#f8f7f4', padding: '20px' }}>
            <p className="font-mono text-[9px] tracking-[0.22em] uppercase mb-4" style={{ borderBottom: '1px solid rgba(23,25,26,0.10)', paddingBottom: '10px', color: 'rgba(23,25,26,0.45)' }}>
              <span style={{ color: '#c9a227' }}>04</span> — Constraints (Optional)
            </p>
            <textarea
              value={limitations}
              onChange={e => setLimitations(e.target.value)}
              placeholder="e.g. Job interview Tuesday afternoon, golden hour only for outdoor shoots…"
              style={{
                width: '100%', boxSizing: 'border-box',
                height: '90px', padding: '10px 12px',
                fontSize: '12px', color: '#17191a',
                background: 'rgba(23,25,26,0.04)',
                border: '1px solid rgba(23,25,26,0.14)',
                outline: 'none', resize: 'none', fontFamily: 'inherit',
              }}
            />
          </div>

          {/* Generate button */}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              disabled={!canGenerate || isGenerating}
              onClick={handleGenerate}
              className="font-mono text-[9px] tracking-[0.20em] uppercase transition-colors"
              style={{
                padding: '12px 28px',
                background: !canGenerate || isGenerating ? 'rgba(23,25,26,0.08)' : '#17191a',
                border: !canGenerate || isGenerating ? '1px solid rgba(23,25,26,0.14)' : '1px solid #17191a',
                color: !canGenerate || isGenerating ? 'rgba(23,25,26,0.30)' : '#f4f3ef',
                cursor: !canGenerate || isGenerating ? 'not-allowed' : 'pointer',
              }}
              onMouseEnter={e => { if (canGenerate && !isGenerating) { e.currentTarget.style.background = '#c9a227'; e.currentTarget.style.borderColor = '#c9a227'; e.currentTarget.style.color = '#17191a'; } }}
              onMouseLeave={e => { if (canGenerate && !isGenerating) { e.currentTarget.style.background = '#17191a'; e.currentTarget.style.borderColor = '#17191a'; e.currentTarget.style.color = '#f4f3ef'; } }}
            >
              {isGenerating ? 'Building Schedule…' : 'Generate Week Schedule'}
            </button>
          </div>

          {/* Result */}
          {(planResult || isGenerating) && (
            <div style={{ borderTop: '2px solid #c9a227', background: '#f8f7f4', border: '1px solid rgba(23,25,26,0.14)', borderTopWidth: '2px', borderTopColor: '#c9a227' }}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(23,25,26,0.10)' }}>
                <p className="font-mono text-[8px] tracking-[0.22em] uppercase mb-1" style={{ color: '#c9a227' }}>Photovise Scheduling AI</p>
                <p className="font-mono text-[10px] tracking-[0.14em] uppercase" style={{ color: '#17191a' }}>Week of {currentWeekLabel}</p>
              </div>
              <div style={{ padding: '20px' }}>
                {isGenerating && !planResult ? (
                  <div style={{ padding: '32px 0', textAlign: 'center' }}>
                    <p className="font-mono text-[9px] tracking-[0.18em] uppercase pulse-brass" style={{ color: '#c9a227' }}>Building schedule…</p>
                  </div>
                ) : (
                  <>
                    <MarkdownBlock text={planResult} />
                    <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid rgba(23,25,26,0.10)', display: 'flex', justifyContent: 'flex-end' }}>
                      <button
                        onClick={handlePin}
                        disabled={pinnedThisResult}
                        className="font-mono text-[9px] tracking-[0.18em] uppercase transition-colors"
                        style={{
                          padding: '9px 18px',
                          background: pinnedThisResult ? 'rgba(75,107,82,0.10)' : 'transparent',
                          border: pinnedThisResult ? '1px solid rgba(75,107,82,0.30)' : '1px solid rgba(23,25,26,0.20)',
                          color: pinnedThisResult ? '#3d5a44' : 'rgba(23,25,26,0.60)',
                          cursor: pinnedThisResult ? 'default' : 'pointer',
                        }}
                        onMouseEnter={e => { if (!pinnedThisResult) { e.currentTarget.style.borderColor = '#c9a227'; e.currentTarget.style.color = '#8a6b0f'; } }}
                        onMouseLeave={e => { if (!pinnedThisResult) { e.currentTarget.style.borderColor = 'rgba(23,25,26,0.20)'; e.currentTarget.style.color = 'rgba(23,25,26,0.60)'; } }}
                      >
                        {pinnedThisResult ? '✓ Pinned' : 'Pin This Schedule'}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Pinned plans */}
          {weekPlans.length > 0 && (
            <div style={{ borderTop: '1px solid rgba(23,25,26,0.12)', paddingTop: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <p className="font-mono text-[9px] tracking-[0.18em] uppercase mb-2" style={{ color: 'rgba(23,25,26,0.40)' }}>
                Pinned Schedules ({weekPlans.length})
              </p>
              {weekPlans.map(plan => (
                <PinnedPlanCard key={plan.id} plan={plan} onDelete={onDeleteWeekPlan} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );

  // ── Root render ───────────────────────────────────────────────────────────

  return (
    <div>
      {/* Screen header */}
      <div
        style={{ borderBottom: '1px solid rgba(23,25,26,0.14)', paddingBottom: '18px', marginBottom: '22px' }}
        className="flex items-end justify-between gap-6"
      >
        <div>
          <p className="font-mono text-[9px] tracking-[0.24em] text-brand-ink/40 uppercase mb-[9px]">Plan / Timeline</p>
          <h1 className="font-sans font-semibold text-[42px] leading-none tracking-[-0.02em] text-brand-ink">Calendar</h1>
        </div>
        {/* View tabs */}
        <div className="flex items-center gap-1">
          <TabBtn active={view === 'calendar'} onClick={() => setView('calendar')} label="Calendar" />
          <TabBtn active={view === 'planner'}  onClick={() => setView('planner')}  label="Planner"  />
          <TabBtn active={view === 'search'}   onClick={() => setView('search')}   label="Search"   />
        </div>
      </div>

      {view === 'calendar' ? renderCalendar() : view === 'planner' ? renderPlanner() : renderSearch()}
    </div>
  );
};

// ── PinnedPlanCard ────────────────────────────────────────────────────────────

const PinnedPlanCard: React.FC<{ plan: WeekPlan; onDelete: (id: string) => void }> = ({ plan, onDelete }) => {
  const [expanded, setExpanded] = useState(false);
  return (
    <div style={{ background: '#f8f7f4', border: '1px solid rgba(23,25,26,0.14)' }}>
      <div
        className="flex items-center justify-between cursor-pointer transition-colors"
        style={{ padding: '12px 16px', borderBottom: expanded ? '1px solid rgba(23,25,26,0.10)' : 'none' }}
        onClick={() => setExpanded(p => !p)}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <p className="font-mono text-[9px] tracking-[0.14em] uppercase font-medium" style={{ color: '#17191a' }}>Week of {plan.weekLabel}</p>
          <p className="font-mono text-[8px] tracking-[0.10em] uppercase mt-0.5" style={{ color: 'rgba(23,25,26,0.40)' }}>
            {plan.sessionTitles.slice(0, 3).join(' · ')}{plan.sessionTitles.length > 3 ? ` +${plan.sessionTitles.length - 3}` : ''}
            {' · '}{new Date(plan.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={e => { e.stopPropagation(); if (confirm('Delete this pinned schedule?')) onDelete(plan.id); }}
            className="font-mono text-[8px] tracking-[0.12em] uppercase transition-colors"
            style={{ color: 'rgba(23,25,26,0.30)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#a35a4a')}
            onMouseLeave={e => (e.currentTarget.style.color = 'rgba(23,25,26,0.30)')}
            title="Delete"
          >
            ×
          </button>
          <span className="font-mono text-[9px]" style={{ color: 'rgba(23,25,26,0.35)' }}>{expanded ? '▲' : '▼'}</span>
        </div>
      </div>
      {expanded && (
        <div style={{ padding: '16px 20px' }}>
          <MarkdownBlock text={plan.result} />
        </div>
      )}
    </div>
  );
};

export default CalendarView;
