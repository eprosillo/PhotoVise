
import React from 'react';
import { Session } from '../types';
import { GENRE_ICONS } from '../constants';

interface SessionSelectorProps {
  sessions: Session[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  label: string;
}

const SessionSelector: React.FC<SessionSelectorProps> = ({ sessions, selectedIds, onToggle, label }) => {
  if (sessions.length === 0) return null;

  return (
    <div className="mb-8 animate-in fade-in slide-in-from-top-2 duration-500">
      <h3 className="text-[10px] font-bold uppercase tracking-[0.25em] text-brand-black/40 mb-4">{label}</h3>
      <div className="max-h-48 overflow-y-auto border border-brand-black/5 rounded-sm bg-white/50 custom-scrollbar">
        <div className="divide-y divide-brand-black/5">
          {sessions.map((session) => {
            const isSelected = selectedIds.includes(session.id);
            return (
              <button
                key={session.id}
                onClick={() => onToggle(session.id)}
                className={`w-full flex items-center gap-4 px-5 py-3 transition-all hover:bg-brand-black/5 text-left group ${
                  isSelected ? 'bg-brand-rose/5' : ''
                }`}
              >
                <div className={`w-4 h-4 rounded-sm border transition-all flex items-center justify-center flex-shrink-0 ${
                  isSelected ? 'bg-brand-rose border-brand-rose' : 'border-brand-black/20 bg-white group-hover:border-brand-rose/50'
                }`}>
                  {isSelected && <i className="fa-solid fa-check text-[10px] text-white"></i>}
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-brand-black truncate">
                      {session.title ? session.title.toUpperCase() : session.name.split('_').slice(1).join(' ').toUpperCase()}
                    </span>
                    <span className="text-[8px] text-brand-gray font-bold tracking-tighter">
                      {session.date}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 text-brand-gray/60 text-[9px] font-medium truncate uppercase tracking-widest">
                    <span>{session.location}</span>
                    <span className="text-brand-black/5">•</span>
                    <span>{session.genre.join(', ')}</span>
                  </div>
                </div>

                <div className={`text-[10px] transition-colors ${isSelected ? 'text-brand-rose' : 'text-brand-gray/30'}`}>
                  {GENRE_ICONS[session.genre[0]]}
                </div>
              </button>
            );
          })}
        </div>
      </div>
      <div className="mt-2 flex justify-between items-center">
        <p className="text-[9px] text-brand-gray font-bold uppercase tracking-wider italic">
          {selectedIds.length} SESSIONS ATTACHED TO CONTEXT
        </p>
      </div>
    </div>
  );
};

export default SessionSelector;
