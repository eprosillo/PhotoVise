import React, { useState, useMemo } from 'react';
import { Session, SessionStatus } from '../types';

interface CalendarViewProps {
  sessions: Session[];
  onGoToSession: (sessionId: string) => void;
}

const STATUS_DOT: Record<SessionStatus, string> = {
  shot:       'bg-brand-rose',
  culled:     'bg-brand-blue',
  edited:     'bg-amber-400',
  'backed up':'bg-emerald-500',
  posted:     'bg-purple-500',
  archived:   'bg-brand-gray/40',
};

const STATUS_CHIP: Record<SessionStatus, string> = {
  shot:       'bg-brand-rose/10 text-brand-rose border-brand-rose/20',
  culled:     'bg-brand-blue/10 text-brand-blue border-brand-blue/20',
  edited:     'bg-amber-50 text-amber-700 border-amber-200',
  'backed up':'bg-emerald-50 text-emerald-700 border-emerald-200',
  posted:     'bg-purple-50 text-purple-700 border-purple-200',
  archived:   'bg-zinc-100 text-zinc-400 border-zinc-200',
};

const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

const toYMD = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const CalendarView: React.FC<CalendarViewProps> = ({ sessions, onGoToSession }) => {
  const today = new Date();
  const [current, setCurrent] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const prevMonth = () => setCurrent(new Date(current.getFullYear(), current.getMonth() - 1, 1));
  const nextMonth = () => setCurrent(new Date(current.getFullYear(), current.getMonth() + 1, 1));
  const goToday   = () => {
    setCurrent(new Date(today.getFullYear(), today.getMonth(), 1));
    setSelectedDate(toYMD(today));
  };

  // Build the grid cells for the current month view
  const cells = useMemo(() => {
    const year = current.getFullYear();
    const month = current.getMonth();
    const firstDow = new Date(year, month, 1).getDay();          // 0=Sun
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrev = new Date(year, month, 0).getDate();

    const result: { date: string; inMonth: boolean }[] = [];

    // Leading days from previous month
    for (let i = firstDow - 1; i >= 0; i--) {
      const d = new Date(year, month - 1, daysInPrev - i);
      result.push({ date: toYMD(d), inMonth: false });
    }
    // Current month days
    for (let d = 1; d <= daysInMonth; d++) {
      result.push({ date: toYMD(new Date(year, month, d)), inMonth: true });
    }
    // Trailing days to complete last row
    const remaining = 7 - (result.length % 7);
    if (remaining < 7) {
      for (let d = 1; d <= remaining; d++) {
        result.push({ date: toYMD(new Date(year, month + 1, d)), inMonth: false });
      }
    }
    return result;
  }, [current]);

  // Map date string → sessions
  const sessionsByDate = useMemo(() => {
    const map: Record<string, Session[]> = {};
    sessions.forEach(s => {
      if (!s.date) return;
      const key = s.date.slice(0, 10); // normalise to YYYY-MM-DD
      if (!map[key]) map[key] = [];
      map[key].push(s);
    });
    return map;
  }, [sessions]);

  const todayStr = toYMD(today);
  const selectedSessions = selectedDate ? (sessionsByDate[selectedDate] ?? []) : [];

  return (
    <div className="animate-in fade-in duration-700 space-y-8">
      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <h2 className="text-4xl font-display text-brand-black tracking-wide">CALENDAR</h2>
          <p className="text-brand-gray mt-2 text-sm font-medium">Sessions mapped by shoot date.</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={goToday}
            className="text-[9px] font-bold uppercase tracking-widest px-4 py-2 border border-brand-black/10 rounded-sm hover:border-brand-rose hover:text-brand-rose transition-all"
          >
            Today
          </button>
          <button
            onClick={prevMonth}
            className="w-8 h-8 flex items-center justify-center border border-brand-black/10 rounded-sm hover:border-brand-rose hover:text-brand-rose transition-all"
          >
            <i className="fa-solid fa-chevron-left text-[10px]"></i>
          </button>
          <span className="text-[13px] font-display tracking-widest text-brand-black min-w-[160px] text-center uppercase">
            {MONTHS[current.getMonth()]} {current.getFullYear()}
          </span>
          <button
            onClick={nextMonth}
            className="w-8 h-8 flex items-center justify-center border border-brand-black/10 rounded-sm hover:border-brand-rose hover:text-brand-rose transition-all"
          >
            <i className="fa-solid fa-chevron-right text-[10px]"></i>
          </button>
        </div>
      </header>

      {/* Calendar grid */}
      <div className="bg-white border border-brand-black/5 rounded-sm shadow-sm overflow-hidden">
        {/* Day-of-week header */}
        <div className="grid grid-cols-7 border-b border-brand-black/5">
          {DAYS.map(d => (
            <div key={d} className="py-3 text-center text-[9px] font-bold uppercase tracking-[0.2em] text-brand-gray">
              {d}
            </div>
          ))}
        </div>

        {/* Date cells */}
        <div className="grid grid-cols-7">
          {cells.map(({ date, inMonth }) => {
            const daySessions = sessionsByDate[date] ?? [];
            const isToday = date === todayStr;
            const isSelected = date === selectedDate;
            const hasArchivedOnly = daySessions.length > 0 && daySessions.every(s => s.status === 'archived');

            return (
              <button
                key={date}
                onClick={() => setSelectedDate(date === selectedDate ? null : date)}
                className={`min-h-[80px] md:min-h-[100px] p-2 md:p-3 text-left border-b border-r border-brand-black/5 transition-all relative
                  ${isSelected ? 'bg-brand-rose/5 ring-1 ring-inset ring-brand-rose/30' : 'hover:bg-brand-black/[0.02]'}
                  ${!inMonth ? 'bg-brand-black/[0.015]' : ''}
                `}
              >
                {/* Date number */}
                <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-bold mb-1
                  ${isToday ? 'bg-brand-rose text-white' : inMonth ? 'text-brand-black' : 'text-brand-gray/30'}
                `}>
                  {new Date(date + 'T12:00:00').getDate()}
                </span>

                {/* Session chips (desktop: title labels; mobile: dots only) */}
                <div className="space-y-1 hidden md:block">
                  {daySessions.slice(0, 3).map(s => (
                    <div
                      key={s.id}
                      className={`text-[8px] font-bold uppercase tracking-tight px-1.5 py-0.5 rounded-sm border truncate leading-tight
                        ${STATUS_CHIP[s.status]}
                        ${s.status === 'archived' ? 'opacity-50' : ''}
                      `}
                    >
                      {s.title || s.location || 'Untitled'}
                    </div>
                  ))}
                  {daySessions.length > 3 && (
                    <div className="text-[8px] font-bold text-brand-gray/50 uppercase tracking-widest pl-1">
                      +{daySessions.length - 3} more
                    </div>
                  )}
                </div>

                {/* Mobile: dot indicators */}
                {daySessions.length > 0 && (
                  <div className="flex gap-0.5 flex-wrap mt-1 md:hidden">
                    {daySessions.slice(0, 4).map(s => (
                      <span key={s.id} className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[s.status]} ${hasArchivedOnly ? 'opacity-40' : ''}`}></span>
                    ))}
                    {daySessions.length > 4 && <span className="text-[7px] text-brand-gray/40 font-bold">+{daySessions.length - 4}</span>}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Status legend */}
      <div className="flex flex-wrap gap-4">
        {(Object.keys(STATUS_DOT) as SessionStatus[]).filter(s => s !== 'archived').map(s => (
          <div key={s} className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${STATUS_DOT[s]}`}></span>
            <span className="text-[9px] font-bold uppercase tracking-widest text-brand-gray">{s}</span>
          </div>
        ))}
      </div>

      {/* Selected-day panel */}
      {selectedDate && (
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[10px] font-bold uppercase tracking-[0.3em] text-brand-black/40">
              {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
            </h3>
            <button onClick={() => setSelectedDate(null)} className="text-brand-gray/40 hover:text-brand-rose transition-colors">
              <i className="fa-solid fa-xmark text-sm"></i>
            </button>
          </div>

          {selectedSessions.length === 0 ? (
            <div className="py-12 text-center border border-dashed border-brand-black/10 rounded-sm">
              <p className="text-brand-gray/40 text-[10px] font-bold uppercase tracking-widest">No sessions on this day</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {selectedSessions.map(s => (
                <div
                  key={s.id}
                  className="bg-white border border-brand-black/5 rounded-sm shadow-sm overflow-hidden hover:shadow-md transition-all group"
                >
                  <div className="bg-brand-black px-5 py-4 flex items-center justify-between">
                    <div>
                      <p className="font-display text-lg text-white leading-none tracking-widest">
                        {(s.title || s.location || 'Untitled Session').toUpperCase()}
                      </p>
                      {s.title && s.location && (
                        <p className="text-[9px] text-brand-gray mt-1 uppercase tracking-widest">{s.location}</p>
                      )}
                    </div>
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_DOT[s.status]}`}></span>
                  </div>
                  <div className="px-5 py-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className={`text-[8px] font-bold uppercase tracking-widest px-2 py-1 rounded-sm border ${STATUS_CHIP[s.status]}`}>
                        {s.status}
                      </span>
                      {s.genre && s.genre.length > 0 && (
                        <span className="text-[8px] text-brand-gray uppercase tracking-widest font-bold">{s.genre.join(' · ')}</span>
                      )}
                    </div>
                    {s.notes && (
                      <p className="text-[10px] text-brand-gray leading-relaxed line-clamp-2">{s.notes}</p>
                    )}
                    <button
                      onClick={() => onGoToSession(s.id)}
                      className="w-full text-[9px] font-bold uppercase tracking-widest py-2.5 bg-brand-black/5 hover:bg-brand-rose hover:text-white text-brand-black rounded-sm transition-all active:scale-95"
                    >
                      Open Session <i className="fa-solid fa-arrow-right text-[8px] ml-1"></i>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default CalendarView;
