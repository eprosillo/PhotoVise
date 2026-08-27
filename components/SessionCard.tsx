
import React, { useState } from 'react';
import { Session, SessionStatus, Genre, SessionType, AssignmentPriority, AssignmentTimeframe } from '../types';
import { GENRE_ICONS } from '../constants';
import LocationAutocomplete from './LocationAutocomplete';

const GENRE_OPTIONS: Genre[] = [
  'Street', 'Sports', 'Photojournalism', 'Portrait', 'Wedding', 'Event',
  'Landscape', 'Architecture', 'Documentary', 'Commercial', 'Editorial',
  'Fashion', 'Product', 'Food', 'Still Life', 'Wildlife', 'Macro', 'Astro',
  'Travel', 'Other',
];

const SESSION_TYPES: SessionType[] = ['Personal', 'Professional', 'School'];

const PRIORITY_OPTIONS: AssignmentPriority[] = ['high', 'medium', 'low'];

interface SessionCardProps {
  session: Session;
  onUpdateStatus: (id: string, status: SessionStatus) => void;
  onUpdate: (id: string, updates: Partial<Session>) => void;
  onDelete: (id: string) => void;
  onGenerateStrategy?: (sessionId: string, input: string, timeframe: AssignmentTimeframe) => Promise<void>;
}

const STATUS_LABELS: Record<Exclude<SessionStatus, 'archived'>, string> = {
  'todo':        'To Do',
  'in-progress': 'In Progress',
  'done':        'Done',
};

const STATUS_STYLE: Record<SessionStatus, { bar: string; text: string }> = {
  'todo':        { bar: 'rgba(23,25,26,0.15)', text: 'rgba(23,25,26,0.50)' },
  'in-progress': { bar: '#c9a227',             text: '#8a6b0f' },
  'done':        { bar: '#4b6b52',             text: '#3d5a44' },
  'archived':    { bar: 'rgba(23,25,26,0.12)', text: 'rgba(23,25,26,0.35)' },
};

const PRIORITY_STYLE: Record<AssignmentPriority, { bg: string; text: string; dot: string }> = {
  high:   { bg: 'rgba(163,90,74,0.10)',  text: '#8f4a3b', dot: '#a35a4a' },
  medium: { bg: 'rgba(201,162,39,0.10)', text: '#8a6b0f', dot: '#c9a227' },
  low:    { bg: 'rgba(23,25,26,0.07)',   text: 'rgba(23,25,26,0.50)', dot: 'rgba(23,25,26,0.30)' },
};

const TYPE_STYLE: Record<SessionType, { bg: string; text: string }> = {
  Personal:     { bg: 'rgba(75,107,82,0.10)',  text: '#3d5a44' },
  Professional: { bg: 'rgba(74,107,124,0.10)', text: '#3f5d6d' },
  School:       { bg: 'rgba(201,162,39,0.10)', text: '#8a6b0f' },
};

function getDaysUntil(deadline: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(deadline + 'T00:00:00');
  return Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function DueDateChip({ date }: { date: string }) {
  const days = getDaysUntil(date);
  let label: string;
  let color: string;

  if (days < 0) {
    label = 'Overdue';
    color = '#8f4a3b';
  } else if (days === 0) {
    label = 'Due today';
    color = '#8f4a3b';
  } else if (days <= 2) {
    label = `${days}d left`;
    color = '#8f4a3b';
  } else if (days <= 7) {
    label = `${days}d left`;
    color = '#8a6b0f';
  } else {
    const fmt = new Date(date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    label = `Due ${fmt}`;
    color = 'rgba(23,25,26,0.45)';
  }

  return (
    <span className="font-mono text-[9px] tracking-[0.14em] uppercase" style={{ color }}>
      <i className="fa-regular fa-clock mr-1 text-[8px]" />
      {label}
    </span>
  );
}

const TIMEFRAME_LABELS: Record<AssignmentTimeframe, string> = {
  '30min': '30 min', '1hr': '1 hr', '2hr': '2 hr', '4hr': '4 hr', 'fullday': 'Full day',
};

const SessionCard: React.FC<SessionCardProps> = ({ session, onUpdateStatus, onUpdate, onDelete, onGenerateStrategy }) => {
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(session.title || '');
  const [editDate, setEditDate] = useState(session.date);
  const [editLocation, setEditLocation] = useState(session.location);
  const [editGenre, setEditGenre] = useState(session.genre[0]);
  const [editNotes, setEditNotes] = useState(session.notes);
  const [editType, setEditType] = useState<SessionType | ''>(session.type || '');
  const [editPriority, setEditPriority] = useState<AssignmentPriority | ''>(session.priority || '');
  const [editDeadline, setEditDeadline] = useState(session.deadline || '');
  const [editDueDate, setEditDueDate] = useState(session.dueDate || '');
  const [editBrief, setEditBrief] = useState(session.brief || '');

  const [strategyExpanded, setStrategyExpanded] = useState(false);
  const [dayPlanExpanded, setDayPlanExpanded] = useState(false);
  const [scoutExpanded, setScoutExpanded] = useState(false);
  const [briefExpanded, setBriefExpanded] = useState(false);

  const [showStrategyForm, setShowStrategyForm] = useState(false);
  const [strategyInput, setStrategyInput] = useState(session.brief || '');
  const [strategyTimeframe, setStrategyTimeframe] = useState<AssignmentTimeframe>('2hr');
  const [isGeneratingStrategy, setIsGeneratingStrategy] = useState(false);

  const isArchived = session.status === 'archived';

  const handleSave = () => {
    const trimmedTitle = editTitle.trim();
    const newName = `${editDate}_${editLocation.replace(/\s+/g, '_')}_${editGenre}`;
    onUpdate(session.id, {
      title: trimmedTitle || undefined,
      date: editDate,
      location: editLocation,
      genre: [editGenre],
      notes: editNotes,
      name: newName,
      type: editType || undefined,
      priority: editPriority || undefined,
      deadline: editDeadline || undefined,
      dueDate: editDueDate || undefined,
      brief: editBrief.trim() || undefined,
    });
    setEditing(false);
  };

  const handleCancel = () => {
    setEditTitle(session.title || '');
    setEditDate(session.date);
    setEditLocation(session.location);
    setEditGenre(session.genre[0]);
    setEditNotes(session.notes);
    setEditType(session.type || '');
    setEditPriority(session.priority || '');
    setEditDeadline(session.deadline || '');
    setEditDueDate(session.dueDate || '');
    setEditBrief(session.brief || '');
    setEditing(false);
  };

  const FIELD: React.CSSProperties = { width: '100%', padding: '9px 12px', fontSize: '12px', color: '#17191a', background: 'rgba(23,25,26,0.04)', border: '1px solid rgba(23,25,26,0.14)', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' };

  if (editing) {
    return (
      <div style={{ background: '#f8f7f4', border: '1px solid #c9a227' }}>
        <div className="p-5 space-y-2">
          <p className="font-mono text-[9px] tracking-[0.18em] uppercase mb-3" style={{ color: '#8a6b0f' }}>Edit Assignment</p>

          <input type="text" value={editTitle} onChange={e => setEditTitle(e.target.value)} placeholder="Assignment title (optional)" style={FIELD} />

          <div className="grid grid-cols-2 gap-2">
            <input type="date" value={editDate} onChange={e => setEditDate(e.target.value)} style={FIELD} />
            <LocationAutocomplete name="editLocation" placeholder="Location" initialValue={editLocation} onChange={setEditLocation}
              className="w-full" style={{ padding: '9px 12px', fontSize: '12px', color: '#17191a', background: 'rgba(23,25,26,0.04)', border: '1px solid rgba(23,25,26,0.14)', outline: 'none', fontFamily: 'inherit' }} />
          </div>

          <select value={editGenre} onChange={e => setEditGenre(e.target.value as Genre)} style={FIELD}>
            {GENRE_OPTIONS.map(g => <option key={g} value={g}>{g}</option>)}
          </select>

          <div className="grid grid-cols-3 gap-2">
            <select value={editType} onChange={e => setEditType(e.target.value as SessionType | '')} style={FIELD}>
              <option value="">Category</option>
              {SESSION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <select value={editPriority} onChange={e => setEditPriority(e.target.value as AssignmentPriority | '')} style={FIELD}>
              <option value="">Priority</option>
              {PRIORITY_OPTIONS.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
            </select>
            <input type="date" value={editDueDate} onChange={e => setEditDueDate(e.target.value)} style={FIELD} title="Due date" />
          </div>

          <input type="date" value={editDeadline} onChange={e => setEditDeadline(e.target.value)} style={FIELD} title="Submission deadline (optional)" placeholder="Submission deadline" />

          <textarea value={editNotes} onChange={e => setEditNotes(e.target.value)} placeholder="Notes" style={{ ...FIELD, minHeight: '70px', resize: 'vertical' }} />
          <textarea value={editBrief} onChange={e => setEditBrief(e.target.value)} placeholder="Assignment brief / requirements (optional)" style={{ ...FIELD, minHeight: '70px', resize: 'vertical' }} />

          {(session.strategy || session.dayPlan || session.scoutNotes) && (
            <div className="pt-2 space-y-1.5">
              <p className="font-mono text-[9px] tracking-[0.14em] uppercase" style={{ color: 'rgba(23,25,26,0.35)' }}>Attached Docs</p>
              {session.strategy && (
                <div className="flex items-center justify-between px-3 py-2" style={{ border: '1px solid rgba(23,25,26,0.14)', background: 'rgba(23,25,26,0.03)' }}>
                  <span className="font-mono text-[8px] tracking-[0.14em] uppercase" style={{ color: '#4a6b7c' }}>Strategy</span>
                  <button onClick={() => onUpdate(session.id, { strategy: undefined })} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(23,25,26,0.30)', fontSize: '12px' }}>×</button>
                </div>
              )}
              {session.dayPlan && (
                <div className="flex items-center justify-between px-3 py-2" style={{ border: '1px solid rgba(23,25,26,0.14)', background: 'rgba(23,25,26,0.03)' }}>
                  <span className="font-mono text-[8px] tracking-[0.14em] uppercase" style={{ color: '#a35a4a' }}>Day Plan</span>
                  <button onClick={() => onUpdate(session.id, { dayPlan: undefined })} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(23,25,26,0.30)', fontSize: '12px' }}>×</button>
                </div>
              )}
              {session.scoutNotes && (
                <div className="flex items-center justify-between px-3 py-2" style={{ border: '1px solid rgba(23,25,26,0.14)', background: 'rgba(23,25,26,0.03)' }}>
                  <span className="font-mono text-[8px] tracking-[0.14em] uppercase" style={{ color: '#4b6b52' }}>Scout Notes</span>
                  <button onClick={() => onUpdate(session.id, { scoutNotes: undefined })} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(23,25,26,0.30)', fontSize: '12px' }}>×</button>
                </div>
              )}
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button
              onClick={handleSave}
              className="flex-1 font-mono text-[10px] tracking-[0.2em] uppercase text-brand-ink transition-colors"
              style={{ background: '#c9a227', minHeight: '44px' }}
              onMouseEnter={e => (e.currentTarget.style.background = '#dab538')}
              onMouseLeave={e => (e.currentTarget.style.background = '#c9a227')}
            >
              Save
            </button>
            <button
              onClick={handleCancel}
              className="flex-1 font-mono text-[10px] tracking-[0.18em] uppercase text-brand-ink/60 transition-colors"
              style={{ border: '1px solid rgba(23,25,26,0.2)', minHeight: '44px' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#17191a'; e.currentTarget.style.color = '#17191a'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(23,25,26,0.2)'; e.currentTarget.style.color = 'rgba(23,25,26,0.60)'; }}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  const activeStatuses: Exclude<SessionStatus, 'archived'>[] = ['todo', 'in-progress', 'done'];
  const currentStyle = STATUS_STYLE[session.status];

  return (
    <div
      className={`overflow-hidden transition-all duration-500 ${isArchived ? 'opacity-75' : ''}`}
      style={{ background: '#f8f7f4', border: '1px solid rgba(23,25,26,0.14)' }}
    >
      {/* Status bar strip */}
      <div style={{ height: '4px', background: currentStyle.bar }} />

      <div className="p-6">
        {/* Header row */}
        <div className="flex justify-between items-start mb-4">
          <div className="flex-1 min-w-0">
            {/* Meta row */}
            <div className="font-mono text-[9px] tracking-[0.14em] uppercase text-brand-ink/42 mb-2 flex items-center flex-wrap gap-x-3 gap-y-1">
              <span>{session.date}</span>
              {session.location && <><span>·</span><span>{session.location.toUpperCase()}</span></>}
              {session.genre.length > 0 && <><span>·</span><span>{session.genre.join(' · ').toUpperCase()}</span></>}
            </div>

            <h3 className="text-[15px] font-medium text-brand-ink leading-snug">
              {session.title || session.name.replace(/_/g, ' ')}
            </h3>

            {/* Chips row */}
            <div className="flex flex-wrap items-center gap-2 mt-2">
              {session.type && (() => {
                const ts = TYPE_STYLE[session.type];
                return (
                  <span className="font-mono text-[8px] tracking-[0.16em] uppercase px-[7px] py-[3px]"
                    style={{ background: ts.bg, color: ts.text }}>
                    {session.type}
                  </span>
                );
              })()}
              {session.priority && (() => {
                const ps = PRIORITY_STYLE[session.priority!];
                return (
                  <span className="font-mono text-[8px] tracking-[0.14em] uppercase px-[7px] py-[3px] flex items-center gap-1"
                    style={{ background: ps.bg, color: ps.text }}>
                    <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: ps.dot, display: 'inline-block' }} />
                    {session.priority}
                  </span>
                );
              })()}
              {(session.dueDate || session.deadline) && (
                <DueDateChip date={(session.dueDate || session.deadline)!} />
              )}
            </div>
          </div>

          <div className="flex items-center gap-1 flex-shrink-0 ml-4">
            <button onClick={() => setEditing(true)} className="text-brand-ink/20 hover:text-brand-ink/60 transition-colors p-2" title="Edit">
              <i className="fa-solid fa-pen text-xs"></i>
            </button>
            <button
              onClick={() => onUpdateStatus(session.id, isArchived ? 'todo' : 'archived')}
              className="text-brand-ink/20 hover:text-brand-ink/60 transition-colors p-2"
              title={isArchived ? 'Un-archive' : 'Archive'}
            >
              <i className={`fa-solid ${isArchived ? 'fa-box-open' : 'fa-box-archive'} text-xs`}></i>
            </button>
            <button onClick={() => onDelete(session.id)} className="text-brand-ink/20 hover:text-node-timing-ink transition-colors p-2" title="Delete">
              <i className="fa-solid fa-xmark text-xs"></i>
            </button>
          </div>
        </div>

        {/* Genre tags */}
        <div className="flex flex-wrap gap-[5px] mb-4">
          {session.genre.map((g) => (
            <span key={g} className="font-mono text-[8px] tracking-[0.14em] uppercase px-[7px] py-[4px]" style={{ border: '1px solid rgba(23,25,26,0.16)' }}>
              {g}
            </span>
          ))}
        </div>

        {/* Notes */}
        {session.notes && (
          <div className="mb-4" style={{ borderLeft: '2px solid rgba(23,25,26,0.18)', paddingLeft: '12px' }}>
            <p className="font-mono text-[8px] tracking-[0.14em] uppercase mb-1" style={{ color: 'rgba(23,25,26,0.38)' }}>Notes</p>
            <p style={{ fontSize: '12px', color: 'rgba(23,25,26,0.75)', lineHeight: 1.6 }}>{session.notes}</p>
          </div>
        )}

        {/* Brief */}
        {session.brief && (
          <div className="mb-3" style={{ border: '1px solid rgba(23,25,26,0.14)' }}>
            <button onClick={() => setBriefExpanded(v => !v)} className="w-full flex items-center justify-between px-4 py-2.5 transition-colors"
              style={{ background: 'rgba(23,25,26,0.04)', borderBottom: briefExpanded ? '1px solid rgba(23,25,26,0.10)' : 'none', cursor: 'pointer' }}>
              <span className="font-mono text-[8px] tracking-[0.16em] uppercase" style={{ color: 'rgba(23,25,26,0.55)' }}>Brief</span>
              <span style={{ fontSize: '10px', color: 'rgba(23,25,26,0.35)' }}>{briefExpanded ? '▲' : '▼'}</span>
            </button>
            {briefExpanded && (
              <div className="p-4 max-h-64 overflow-y-auto" style={{ background: '#fdfcfa' }}>
                {session.brief.split('\n').map((line, i) => (
                  <p key={i} style={{ fontSize: '12px', color: 'rgba(23,25,26,0.80)', lineHeight: 1.65, marginBottom: '6px' }} className="whitespace-pre-wrap">{line}</p>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Strategy */}
        {session.strategy && (
          <div className="mb-3" style={{ border: '1px solid rgba(23,25,26,0.14)', borderLeft: '2px solid #4a6b7c' }}>
            <button onClick={() => setStrategyExpanded(v => !v)} className="w-full flex items-center justify-between px-4 py-2.5 transition-colors"
              style={{ background: 'rgba(74,107,124,0.05)', borderBottom: strategyExpanded ? '1px solid rgba(23,25,26,0.10)' : 'none', cursor: 'pointer' }}>
              <span className="font-mono text-[8px] tracking-[0.16em] uppercase" style={{ color: '#4a6b7c' }}>Strategy</span>
              <span style={{ fontSize: '10px', color: 'rgba(23,25,26,0.35)' }}>{strategyExpanded ? '▲' : '▼'}</span>
            </button>
            {strategyExpanded && (
              <div className="p-4 max-h-64 overflow-y-auto" style={{ background: '#fdfcfa' }}>
                {session.strategy.split('\n').map((line, i) => (
                  <p key={i} style={{ fontSize: '12px', color: 'rgba(23,25,26,0.80)', lineHeight: 1.65, marginBottom: '6px' }} className="whitespace-pre-wrap">{line}</p>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Day Plan */}
        {session.dayPlan && (
          <div className="mb-3" style={{ border: '1px solid rgba(23,25,26,0.14)', borderLeft: '2px solid #a35a4a' }}>
            <button onClick={() => setDayPlanExpanded(v => !v)} className="w-full flex items-center justify-between px-4 py-2.5 transition-colors"
              style={{ background: 'rgba(163,90,74,0.05)', borderBottom: dayPlanExpanded ? '1px solid rgba(23,25,26,0.10)' : 'none', cursor: 'pointer' }}>
              <span className="font-mono text-[8px] tracking-[0.16em] uppercase" style={{ color: '#a35a4a' }}>Day Plan</span>
              <span style={{ fontSize: '10px', color: 'rgba(23,25,26,0.35)' }}>{dayPlanExpanded ? '▲' : '▼'}</span>
            </button>
            {dayPlanExpanded && (
              <div className="p-4 max-h-64 overflow-y-auto" style={{ background: '#fdfcfa' }}>
                {session.dayPlan.split('\n').map((line, i) => (
                  <p key={i} style={{ fontSize: '12px', color: 'rgba(23,25,26,0.80)', lineHeight: 1.65, marginBottom: '6px' }} className="whitespace-pre-wrap">{line}</p>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Scout Notes */}
        {session.scoutNotes && (
          <div className="mb-4" style={{ border: '1px solid rgba(23,25,26,0.14)', borderLeft: '2px solid #4b6b52' }}>
            <button onClick={() => setScoutExpanded(v => !v)} className="w-full flex items-center justify-between px-4 py-2.5 transition-colors"
              style={{ background: 'rgba(75,107,82,0.05)', borderBottom: scoutExpanded ? '1px solid rgba(23,25,26,0.10)' : 'none', cursor: 'pointer' }}>
              <span className="font-mono text-[8px] tracking-[0.16em] uppercase" style={{ color: '#4b6b52' }}>Scout Notes</span>
              <span style={{ fontSize: '10px', color: 'rgba(23,25,26,0.35)' }}>{scoutExpanded ? '▲' : '▼'}</span>
            </button>
            {scoutExpanded && (
              <div className="p-4 max-h-64 overflow-y-auto" style={{ background: '#fdfcfa' }}>
                {session.scoutNotes.split('\n').map((line, i) => (
                  <p key={i} style={{ fontSize: '12px', color: 'rgba(23,25,26,0.80)', lineHeight: 1.65, marginBottom: '6px' }} className="whitespace-pre-wrap">{line}</p>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Generate Strategy inline panel */}
        {!isArchived && onGenerateStrategy && (
          <div className="mb-4">
            {!showStrategyForm ? (
              <button onClick={() => { setStrategyInput(session.brief || ''); setShowStrategyForm(true); }}
                className="w-full font-mono text-[8px] tracking-[0.16em] uppercase transition-colors"
                style={{ padding: '9px', border: '1px dashed rgba(23,25,26,0.20)', background: 'transparent', color: 'rgba(23,25,26,0.42)', cursor: 'pointer' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = '#c9a227'; e.currentTarget.style.color = '#8a6b0f'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(23,25,26,0.20)'; e.currentTarget.style.color = 'rgba(23,25,26,0.42)'; }}>
                {session.strategy ? '↻ Regenerate Strategy' : '+ Generate Strategy'}
              </button>
            ) : (
              <div style={{ border: '1px solid rgba(23,25,26,0.14)', background: '#f8f7f4' }}>
                <div className="flex items-center justify-between px-4 py-2.5" style={{ borderBottom: '1px solid rgba(23,25,26,0.10)' }}>
                  <span className="font-mono text-[8px] tracking-[0.16em] uppercase" style={{ color: 'rgba(23,25,26,0.50)' }}>Generate Strategy</span>
                  <button onClick={() => setShowStrategyForm(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(23,25,26,0.30)', fontSize: '14px' }}>×</button>
                </div>
                <div className="p-4 space-y-3">
                  <textarea value={strategyInput} onChange={e => setStrategyInput(e.target.value)} placeholder="Describe the assignment brief or requirements…"
                    style={{ width: '100%', padding: '9px 12px', fontSize: '12px', color: '#17191a', background: 'rgba(23,25,26,0.04)', border: '1px solid rgba(23,25,26,0.14)', outline: 'none', fontFamily: 'inherit', minHeight: '70px', resize: 'vertical', boxSizing: 'border-box' }} />
                  <div className="flex flex-wrap gap-1.5">
                    {(Object.keys(TIMEFRAME_LABELS) as AssignmentTimeframe[]).map(tf => {
                      const active = strategyTimeframe === tf;
                      return (
                        <button key={tf} onClick={() => setStrategyTimeframe(tf)}
                          className="font-mono text-[8px] tracking-[0.12em] uppercase"
                          style={{ padding: '5px 9px', border: active ? '1px solid #17191a' : '1px solid rgba(23,25,26,0.18)', background: active ? '#17191a' : 'transparent', color: active ? '#f4f3ef' : 'rgba(23,25,26,0.55)', cursor: 'pointer' }}>
                          {TIMEFRAME_LABELS[tf]}
                        </button>
                      );
                    })}
                  </div>
                  <button disabled={isGeneratingStrategy}
                    onClick={async () => {
                      setIsGeneratingStrategy(true);
                      try { await onGenerateStrategy(session.id, strategyInput, strategyTimeframe); setShowStrategyForm(false); setStrategyExpanded(true); }
                      finally { setIsGeneratingStrategy(false); }
                    }}
                    className="w-full font-mono text-[9px] tracking-[0.18em] uppercase"
                    style={{ padding: '10px', background: isGeneratingStrategy ? 'rgba(23,25,26,0.12)' : '#17191a', color: isGeneratingStrategy ? 'rgba(23,25,26,0.30)' : '#f4f3ef', border: 'none', cursor: isGeneratingStrategy ? 'not-allowed' : 'pointer' }}
                    onMouseEnter={e => { if (!isGeneratingStrategy) { e.currentTarget.style.background = '#c9a227'; e.currentTarget.style.color = '#17191a'; } }}
                    onMouseLeave={e => { if (!isGeneratingStrategy) { e.currentTarget.style.background = '#17191a'; e.currentTarget.style.color = '#f4f3ef'; } }}>
                    {isGeneratingStrategy ? 'Generating…' : 'Build Strategy'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Status toggle */}
        {!isArchived && (
          <div className="pt-4" style={{ borderTop: '1px solid rgba(23,25,26,0.10)' }}>
            <p className="font-mono text-[9px] tracking-[0.14em] uppercase text-brand-ink/40 mb-2">Status</p>
            <div className="flex gap-2">
              {activeStatuses.map((s) => {
                const isActive = session.status === s;
                const style = STATUS_STYLE[s];
                return (
                  <button
                    key={s}
                    onClick={() => onUpdateStatus(session.id, s)}
                    className="flex-1 font-mono text-[8px] tracking-[0.14em] uppercase transition-colors"
                    style={{
                      padding: '8px 6px',
                      border: isActive ? `1px solid ${style.bar}` : '1px solid rgba(23,25,26,0.14)',
                      background: isActive ? style.bar : 'transparent',
                      color: isActive ? (s === 'todo' ? 'rgba(23,25,26,0.70)' : '#f4f3ef') : 'rgba(23,25,26,0.45)',
                      cursor: 'pointer',
                    }}
                  >
                    {STATUS_LABELS[s]}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SessionCard;
