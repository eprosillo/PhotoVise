
import React from 'react';
import { Session, SessionStatus } from '../types';
import { GENRE_ICONS } from '../constants';

interface SessionCardProps {
  session: Session;
  onUpdateStatus: (id: string, status: SessionStatus) => void;
  onDelete: (id: string) => void;
  hasJournal?: boolean;
  onGoToJournal?: () => void;
}

const SessionCard: React.FC<SessionCardProps> = ({ session, onUpdateStatus, onDelete, hasJournal, onGoToJournal }) => {
  const statuses: SessionStatus[] = ['shot', 'culled', 'edited', 'backed up', 'posted'];
  
  const getStatusColor = (status: SessionStatus) => {
    switch (status) {
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

  return (
    <div className={`bg-white rounded-sm shadow-sm border border-brand-black/5 overflow-hidden hover:shadow-md transition-all duration-500 ${isArchived ? 'opacity-80 grayscale-[0.3]' : ''}`}>
      <div className="p-8">
        <div className="flex justify-between items-start mb-6">
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <span className={`text-[9px] font-bold uppercase tracking-[0.2em] px-2.5 py-1 rounded-sm ${getStatusColor(session.status)}`}>
                {session.status}
              </span>
              {hasJournal && (
                <button 
                  onClick={onGoToJournal}
                  className="bg-brand-black text-white px-2 py-1 rounded-sm text-[8px] font-bold uppercase tracking-widest flex items-center gap-1 hover:bg-brand-rose transition-colors"
                  title="Has journal entry"
                >
                  <i className="fa-solid fa-book-open"></i> Journal
                </button>
              )}
            </div>
            <h3 className="text-2xl font-display text-brand-black mt-4 leading-none tracking-wider">{session.name.toUpperCase()}</h3>
            <div className="flex items-center gap-3 mt-3">
              <p className="text-[11px] text-brand-gray font-bold uppercase tracking-widest flex items-center gap-2">
                <i className="fa-solid fa-location-dot text-brand-blue"></i> {session.location}
              </p>
              <span className="text-brand-black/5">|</span>
              <p className="text-[11px] text-brand-gray font-bold uppercase tracking-widest">{session.date}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => onUpdateStatus(session.id, isArchived ? 'shot' : 'archived')}
              className={`transition-colors p-2 text-sm ${isArchived ? 'text-brand-blue hover:text-brand-black' : 'text-brand-black/10 hover:text-brand-blue'}`}
              title={isArchived ? "Un-archive" : "Archive"}
            >
              <i className={`fa-solid ${isArchived ? 'fa-box-open' : 'fa-box-archive'}`}></i>
            </button>
            <button 
              onClick={() => onDelete(session.id)}
              className="text-brand-black/10 hover:text-brand-rose transition-colors p-2"
              title="Delete Permanently"
            >
              <i className="fa-solid fa-xmark text-sm"></i>
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mb-6">
          {session.genre.map((g) => (
            <div key={g} className="flex items-center gap-2 px-3 py-2 bg-brand-white border border-brand-black/5 rounded-sm text-[10px] font-bold uppercase tracking-widest text-brand-gray shadow-sm">
              <span className="text-brand-blue text-[11px]">{GENRE_ICONS[g]}</span>
              {g}
            </div>
          ))}
        </div>

        {/* Display Session Notes */}
        {session.notes && (
          <div className="mb-8 p-4 bg-brand-white border-l-2 border-brand-rose rounded-r-sm">
            <p className="text-[9px] font-bold text-brand-gray uppercase tracking-[0.2em] mb-2">NOTES / BRIEF</p>
            <p className="text-[11px] text-brand-black leading-relaxed italic">{session.notes}</p>
          </div>
        )}

        {!isArchived && (
          <div className="space-y-4 pt-6 border-t border-brand-black/5">
            <p className="text-[9px] font-bold text-brand-black/30 uppercase tracking-[0.3em]">PROGRESS TRACKER</p>
            <div className="flex flex-wrap gap-1.5">
              {statuses.map((s) => (
                <button
                  key={s}
                  onClick={() => onUpdateStatus(session.id, s)}
                  className={`text-[9px] font-bold uppercase tracking-widest px-3 py-2 rounded-sm transition-all border ${
                    session.status === s 
                      ? 'bg-brand-rose text-white border-brand-rose shadow-md' 
                      : 'bg-white text-brand-gray border-brand-black/5 hover:border-brand-blue/30 hover:text-brand-blue'
                  }`}
                >
                  {s}
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
