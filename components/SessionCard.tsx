
import React, { useState } from 'react';
import { Session, SessionStatus, Genre, SessionType } from '../types';
import { GENRE_ICONS } from '../constants';
import LocationAutocomplete from './LocationAutocomplete';

const GENRE_OPTIONS: Genre[] = [
  'Street', 'Sports', 'Photojournalism', 'Portrait', 'Wedding', 'Event',
  'Landscape', 'Architecture', 'Documentary', 'Commercial', 'Editorial',
  'Fashion', 'Product', 'Food', 'Still Life', 'Wildlife', 'Macro', 'Astro',
  'Travel', 'Other',
];

const SESSION_TYPES: SessionType[] = ['Class', 'Internship', 'Personal'];

interface SessionCardProps {
  session: Session;
  onUpdateStatus: (id: string, status: SessionStatus) => void;
  onUpdate: (id: string, updates: Partial<Session>) => void;
  onDelete: (id: string) => void;
}

const STATUS_STAGE_LABELS: Record<SessionStatus, string> = {
  'capturing': 'Capturing',
  'shot': 'Culling',
  'culled': 'Editing',
  'edited': 'Backing Up',
  'backed up': 'Posting',
  'posted': 'Complete',
  'archived': 'Archived',
};

const TYPE_STYLE: Record<SessionType, { bg: string; text: string; border: string; icon: string }> = {
  Class:      { bg: 'bg-brand-blue/10',  text: 'text-brand-blue',  border: 'border-brand-blue/20',  icon: 'fa-graduation-cap' },
  Internship: { bg: 'bg-amber-50',       text: 'text-amber-700',   border: 'border-amber-200',      icon: 'fa-briefcase' },
  Personal:   { bg: 'bg-emerald-50',     text: 'text-emerald-700', border: 'border-emerald-200',    icon: 'fa-person' },
};

function getDaysUntil(deadline: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(deadline + 'T00:00:00');
  return Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function DeadlineChip({ deadline }: { deadline: string }) {
  const days = getDaysUntil(deadline);
  let label: string;
  let cls: string;

  if (days < 0) {
    label = 'Overdue';
    cls = 'bg-brand-rose/15 text-brand-rose border-brand-rose/30';
  } else if (days === 0) {
    label = 'Due today';
    cls = 'bg-brand-rose/15 text-brand-rose border-brand-rose/30';
  } else if (days <= 2) {
    label = `${days}d left`;
    cls = 'bg-brand-rose/10 text-brand-rose border-brand-rose/20';
  } else if (days <= 7) {
    label = `${days}d left`;
    cls = 'bg-amber-50 text-amber-700 border-amber-200';
  } else {
    const fmt = new Date(deadline + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    label = `Due ${fmt}`;
    cls = 'bg-brand-black/5 text-brand-black/50 border-brand-black/10';
  }

  return (
    <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded border ${cls}`}>
      <i className="fa-regular fa-clock text-[9px]" />
      {label}
    </span>
  );
}

const SessionCard: React.FC<SessionCardProps> = ({ session, onUpdateStatus, onUpdate, onDelete }) => {
  const statuses: SessionStatus[] = ['capturing', 'shot', 'culled', 'edited', 'backed up', 'posted'];

  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(session.title || '');
  const [editDate, setEditDate] = useState(session.date);
  const [editLocation, setEditLocation] = useState(session.location);
  const [editGenre, setEditGenre] = useState(session.genre[0]);
  const [editNotes, setEditNotes] = useState(session.notes);
  const [editType, setEditType] = useState<SessionType | ''>(session.type || '');
  const [editDeadline, setEditDeadline] = useState(session.deadline || '');
  const [editBrief, setEditBrief] = useState(session.brief || '');

  const [strategyExpanded, setStrategyExpanded] = useState(false);
  const [dayPlanExpanded, setDayPlanExpanded] = useState(false);
  const [scoutExpanded, setScoutExpanded] = useState(false);
  const [briefExpanded, setBriefExpanded] = useState(false);

  const getStatusColor = (status: SessionStatus) => {
    switch (status) {
      case 'capturing': return 'bg-amber-100 text-amber-700';
      case 'shot': return 'bg-brand-rose/10 text-brand-rose';
      case 'culled': return 'bg-brand-blue/10 text-brand-blue';
      case 'edited': return 'bg-brand-black/5 text-brand-black';
      case 'backed up': return 'bg-brand-gray/10 text-brand-gray';
      case 'posted': return 'bg-emerald-100 text-emerald-700';
      case 'archived': return 'bg-zinc-800 text-zinc-300';
      default: return 'bg-zinc-100 text-zinc-600';
    }
  };

  const isArchived = session.status === 'archived';
  const typeStyle = session.type ? TYPE_STYLE[session.type] : null;

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
      deadline: editDeadline || undefined,
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
    setEditDeadline(session.deadline || '');
    setEditBrief(session.brief || '');
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-brand-blue/30 overflow-hidden">
        <div className="p-8 space-y-3">
          <p className="text-xs font-semibold text-brand-blue/70 mb-4">Edit session</p>

          <input
            type="text"
            value={editTitle}
            onChange={e => setEditTitle(e.target.value)}
            placeholder="Session title (optional)"
            className="w-full border border-brand-black/10 rounded-md px-4 py-3 text-xs focus:ring-1 focus:ring-brand-blue outline-none placeholder:text-brand-black/20"
          />

          <div className="grid grid-cols-2 gap-3">
            <input
              type="date"
              value={editDate}
              onChange={e => setEditDate(e.target.value)}
              className="border border-brand-black/10 rounded-md px-4 py-3 text-xs focus:ring-1 focus:ring-brand-blue outline-none"
            />
            <LocationAutocomplete
              name="editLocation"
              placeholder="Location"
              initialValue={editLocation}
              onChange={setEditLocation}
              className="border border-brand-black/10 rounded-md px-4 py-3 text-xs focus:ring-1 focus:ring-brand-blue outline-none placeholder:text-brand-black/20"
            />
          </div>

          <select
            value={editGenre}
            onChange={e => setEditGenre(e.target.value as Genre)}
            className="w-full border border-brand-black/10 rounded-md px-4 py-3 text-xs focus:ring-1 focus:ring-brand-blue outline-none"
          >
            {GENRE_OPTIONS.map(g => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>

          {/* Type + Deadline row */}
          <div className="grid grid-cols-2 gap-3">
            <select
              value={editType}
              onChange={e => setEditType(e.target.value as SessionType | '')}
              className="border border-brand-black/10 rounded-md px-4 py-3 text-xs focus:ring-1 focus:ring-brand-blue outline-none"
            >
              <option value="">Type (optional)</option>
              {SESSION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <input
              type="date"
              value={editDeadline}
              onChange={e => setEditDeadline(e.target.value)}
              placeholder="Deadline (optional)"
              className="border border-brand-black/10 rounded-md px-4 py-3 text-xs focus:ring-1 focus:ring-brand-blue outline-none text-brand-black/70"
            />
          </div>

          <textarea
            value={editNotes}
            onChange={e => setEditNotes(e.target.value)}
            placeholder="Notes"
            className="w-full border border-brand-black/10 rounded-md px-4 py-3 text-xs focus:ring-1 focus:ring-brand-blue outline-none placeholder:text-brand-black/20 min-h-[70px]"
          />

          <textarea
            value={editBrief}
            onChange={e => setEditBrief(e.target.value)}
            placeholder="Assignment brief / requirements (optional)"
            className="w-full border border-brand-black/10 rounded-md px-4 py-3 text-xs focus:ring-1 focus:ring-brand-blue outline-none placeholder:text-brand-black/20 min-h-[70px]"
          />

          {(session.strategy || session.dayPlan || session.scoutNotes) && (
            <div className="pt-2 space-y-2">
              <p className="text-xs font-medium text-brand-black/30">Attached documents</p>
              {session.strategy && (
                <div className="flex items-center justify-between px-3 py-2 bg-brand-blue/5 border border-brand-blue/20 rounded-md">
                  <div className="flex items-center gap-2">
                    <i className="fa-solid fa-file-contract text-brand-blue text-[9px]"></i>
                    <span className="text-xs font-medium text-brand-blue">Assignment Strategy</span>
                  </div>
                  <button onClick={() => onUpdate(session.id, { strategy: undefined })} className="text-brand-black/20 hover:text-brand-rose transition-colors text-[10px]">
                    <i className="fa-solid fa-xmark"></i>
                  </button>
                </div>
              )}
              {session.dayPlan && (
                <div className="flex items-center justify-between px-3 py-2 bg-brand-rose/5 border border-brand-rose/20 rounded-md">
                  <div className="flex items-center gap-2">
                    <i className="fa-solid fa-stopwatch text-brand-rose text-[9px]"></i>
                    <span className="text-xs font-medium text-brand-rose">Assignment Day Plan</span>
                  </div>
                  <button onClick={() => onUpdate(session.id, { dayPlan: undefined })} className="text-brand-black/20 hover:text-brand-rose transition-colors text-[10px]">
                    <i className="fa-solid fa-xmark"></i>
                  </button>
                </div>
              )}
              {session.scoutNotes && (
                <div className="flex items-center justify-between px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-md">
                  <div className="flex items-center gap-2">
                    <i className="fa-solid fa-map-pin text-emerald-600 text-[9px]"></i>
                    <span className="text-xs font-medium text-emerald-600">Scouted Location</span>
                  </div>
                  <button onClick={() => onUpdate(session.id, { scoutNotes: undefined })} className="text-brand-black/20 hover:text-brand-rose transition-colors text-[10px]">
                    <i className="fa-solid fa-xmark"></i>
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button onClick={handleSave} className="flex-1 bg-brand-blue text-white text-sm font-semibold py-3 rounded-md hover:bg-[#7a93a0] transition-all">
              Save
            </button>
            <button onClick={handleCancel} className="flex-1 border border-brand-black/10 text-brand-gray text-sm font-medium py-3 rounded-md hover:border-brand-black/20 transition-all">
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-lg shadow-sm border border-brand-black/5 overflow-hidden hover:shadow-md transition-all duration-500 ${isArchived ? 'opacity-80 grayscale-[0.3]' : ''}`}>
      <div className="p-8">
        {/* Header row */}
        <div className="flex justify-between items-start mb-6">
          <div className="flex-1 min-w-0">
            {/* Status + type + deadline chips */}
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <span className={`text-xs font-medium px-2.5 py-1 rounded ${getStatusColor(session.status)}`}>
                {STATUS_STAGE_LABELS[session.status]}
              </span>
              {typeStyle && session.type && (
                <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded border ${typeStyle.bg} ${typeStyle.text} ${typeStyle.border}`}>
                  <i className={`fa-solid ${typeStyle.icon} text-[9px]`} />
                  {session.type}
                </span>
              )}
              {session.deadline && <DeadlineChip deadline={session.deadline} />}
            </div>

            <h3 className="text-2xl font-display text-brand-black leading-none tracking-wider">
              {session.title ? session.title.toUpperCase() : session.name.toUpperCase()}
            </h3>
            <div className="flex items-center gap-3 mt-3">
              <p className="text-xs text-brand-gray font-medium flex items-center gap-2">
                <i className="fa-solid fa-location-dot text-brand-blue"></i> {session.location}
              </p>
              <span className="text-brand-black/5">|</span>
              <p className="text-xs text-brand-gray font-medium">{session.date}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <button onClick={() => setEditing(true)} className="text-brand-black/10 hover:text-brand-blue transition-colors p-2" title="Edit Session">
              <i className="fa-solid fa-pen text-sm"></i>
            </button>
            <button
              onClick={() => onUpdateStatus(session.id, isArchived ? 'shot' : 'archived')}
              className={`transition-colors p-2 text-sm ${isArchived ? 'text-brand-blue hover:text-brand-black' : 'text-brand-black/10 hover:text-brand-blue'}`}
              title={isArchived ? 'Un-archive' : 'Archive'}
            >
              <i className={`fa-solid ${isArchived ? 'fa-box-open' : 'fa-box-archive'}`}></i>
            </button>
            <button onClick={() => onDelete(session.id)} className="text-brand-black/10 hover:text-brand-rose transition-colors p-2" title="Delete Permanently">
              <i className="fa-solid fa-xmark text-sm"></i>
            </button>
          </div>
        </div>

        {/* Genre pills */}
        <div className="flex flex-wrap gap-2 mb-6">
          {session.genre.map((g) => (
            <div key={g} className="flex items-center gap-2 px-3 py-2 bg-brand-white border border-brand-black/5 rounded-md text-xs font-medium text-brand-gray shadow-sm">
              <span className="text-brand-blue text-[11px]">{GENRE_ICONS[g]}</span>
              {g}
            </div>
          ))}
        </div>

        {/* Notes */}
        {session.notes && (
          <div className="mb-6 p-4 bg-brand-white border-l-2 border-brand-rose rounded-r-md">
            <p className="text-xs font-medium text-brand-gray/60 mb-2">Notes</p>
            <p className="text-xs text-brand-black leading-relaxed italic">{session.notes}</p>
          </div>
        )}

        {/* Brief */}
        {session.brief && (
          <div className="mb-4 border border-violet-200 rounded-lg overflow-hidden">
            <button
              onClick={() => setBriefExpanded(v => !v)}
              className="w-full flex items-center justify-between px-4 py-3 bg-violet-50 hover:bg-violet-100/60 transition-colors"
            >
              <div className="flex items-center gap-2">
                <i className="fa-solid fa-file-lines text-violet-600 text-[10px]"></i>
                <span className="text-xs font-semibold text-violet-700">Assignment Brief</span>
              </div>
              <i className={`fa-solid fa-chevron-${briefExpanded ? 'up' : 'down'} text-violet-400 text-[9px]`}></i>
            </button>
            {briefExpanded && (
              <div className="p-4 bg-white border-t border-violet-100 max-h-72 overflow-y-auto custom-scrollbar">
                {session.brief.split('\n').map((line, i) => (
                  <p key={i} className="text-sm text-brand-black/80 leading-relaxed mb-2 last:mb-0 whitespace-pre-wrap">{line}</p>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Strategy */}
        {session.strategy && (
          <div className="mb-4 border border-brand-blue/20 rounded-lg overflow-hidden">
            <button
              onClick={() => setStrategyExpanded(v => !v)}
              className="w-full flex items-center justify-between px-4 py-3 bg-brand-blue/5 hover:bg-brand-blue/10 transition-colors"
            >
              <div className="flex items-center gap-2">
                <i className="fa-solid fa-file-contract text-brand-blue text-[10px]"></i>
                <span className="text-xs font-semibold text-brand-blue">Assignment Strategy</span>
              </div>
              <i className={`fa-solid fa-chevron-${strategyExpanded ? 'up' : 'down'} text-brand-blue/50 text-[9px]`}></i>
            </button>
            {strategyExpanded && (
              <div className="p-4 bg-white border-t border-brand-blue/10 max-h-72 overflow-y-auto custom-scrollbar">
                {session.strategy.split('\n').map((line, i) => (
                  <p key={i} className="text-sm text-brand-black/80 leading-relaxed mb-2 last:mb-0 whitespace-pre-wrap">{line}</p>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Day Plan */}
        {session.dayPlan && (
          <div className="mb-4 border border-brand-rose/20 rounded-lg overflow-hidden">
            <button
              onClick={() => setDayPlanExpanded(v => !v)}
              className="w-full flex items-center justify-between px-4 py-3 bg-brand-rose/5 hover:bg-brand-rose/10 transition-colors"
            >
              <div className="flex items-center gap-2">
                <i className="fa-solid fa-stopwatch text-brand-rose text-[10px]"></i>
                <span className="text-xs font-semibold text-brand-rose">Assignment Day Plan</span>
              </div>
              <i className={`fa-solid fa-chevron-${dayPlanExpanded ? 'up' : 'down'} text-brand-rose/50 text-[9px]`}></i>
            </button>
            {dayPlanExpanded && (
              <div className="p-4 bg-white border-t border-brand-rose/10 max-h-72 overflow-y-auto custom-scrollbar">
                {session.dayPlan.split('\n').map((line, i) => (
                  <p key={i} className="text-sm text-brand-black/80 leading-relaxed mb-2 last:mb-0 whitespace-pre-wrap">{line}</p>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Scout Notes */}
        {session.scoutNotes && (
          <div className="mb-8 border border-emerald-200 rounded-lg overflow-hidden">
            <button
              onClick={() => setScoutExpanded(v => !v)}
              className="w-full flex items-center justify-between px-4 py-3 bg-emerald-50 hover:bg-emerald-100/60 transition-colors"
            >
              <div className="flex items-center gap-2">
                <i className="fa-solid fa-map-pin text-emerald-600 text-[10px]"></i>
                <span className="text-xs font-semibold text-emerald-600">Scouted Location</span>
              </div>
              <i className={`fa-solid fa-chevron-${scoutExpanded ? 'up' : 'down'} text-emerald-400 text-[9px]`}></i>
            </button>
            {scoutExpanded && (
              <div className="p-4 bg-white border-t border-emerald-100 max-h-72 overflow-y-auto custom-scrollbar">
                {session.scoutNotes.split('\n').map((line, i) => (
                  <p key={i} className="text-sm text-brand-black/80 leading-relaxed mb-2 last:mb-0 whitespace-pre-wrap">{line}</p>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Progress pipeline */}
        {!isArchived && (
          <div className="space-y-4 pt-6 border-t border-brand-black/5">
            <p className="text-xs font-medium text-brand-black/40">Progress</p>
            <div className="flex flex-wrap gap-1.5">
              {statuses.map((s) => (
                <button
                  key={s}
                  onClick={() => onUpdateStatus(session.id, s)}
                  className={`text-xs font-medium px-3 py-2 rounded-md transition-all border ${
                    session.status === s
                      ? 'bg-brand-blue text-white border-brand-blue shadow-md'
                      : 'bg-white text-brand-gray border-brand-black/5 hover:border-brand-blue/30 hover:text-brand-blue'
                  }`}
                >
                  {STATUS_STAGE_LABELS[s]}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SessionCard;
