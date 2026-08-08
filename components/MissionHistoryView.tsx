import React, { useState } from 'react';
import { Submission, SkillNodeType } from '../types';
import { SKILL_NODE_META } from '../data/missions';

interface MissionHistoryViewProps {
  submissions: Submission[];
}

const NODE_FILTERS: Array<SkillNodeType | 'All'> = ['All', 'Composition', 'Light', 'Timing', 'Moment'];

const MissionHistoryView: React.FC<MissionHistoryViewProps> = ({ submissions }) => {
  const [filter, setFilter] = useState<SkillNodeType | 'All'>('All');
  const [selected, setSelected] = useState<Submission | null>(null);

  const sorted = [...submissions].sort((a, b) => b.createdAt - a.createdAt);
  const filtered = filter === 'All' ? sorted : sorted.filter(s => s.skillNode === filter);

  return (
    <div>
      <header className="mb-8">
        <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-brand-black/30 mb-1">Archive</p>
        <h2 className="text-4xl font-display text-brand-black tracking-wide">HISTORY</h2>
      </header>

      {/* Filter pills */}
      <div className="flex flex-wrap gap-2 mb-6">
        {NODE_FILTERS.map(f => {
          const meta = f !== 'All' ? SKILL_NODE_META[f] : null;
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-full border transition-all ${
                filter === f
                  ? meta
                    ? `${meta.bg} ${meta.color} ${meta.border}`
                    : 'bg-brand-black text-white border-brand-black'
                  : 'border-brand-black/10 text-brand-black/50 hover:border-brand-black/30'
              }`}
            >
              {f !== 'All' && meta && <i className={`fa-solid ${meta.icon} mr-1.5 text-[9px]`} />}
              {f}
            </button>
          );
        })}
      </div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <div className="text-center py-20 text-brand-black/30">
          <i className="fa-solid fa-images text-3xl mb-3 block" />
          <p className="text-sm font-semibold">No shots yet{filter !== 'All' ? ` for ${filter}` : ''}</p>
          <p className="text-xs mt-1">Complete missions to build your history.</p>
        </div>
      )}

      {/* Grid */}
      {filtered.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {filtered.map(sub => {
            const meta = SKILL_NODE_META[sub.skillNode];
            return (
              <button
                key={sub.id}
                onClick={() => setSelected(sub)}
                className="relative group rounded-xl overflow-hidden border border-brand-black/5 aspect-square hover:shadow-md transition-all active:scale-[0.98]"
              >
                <img
                  src={sub.photoUrl}
                  alt={sub.missionTitle}
                  className="w-full h-full object-cover"
                />
                {/* Overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/0 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-3">
                  <p className="text-[10px] font-bold text-white line-clamp-1">{sub.missionTitle}</p>
                  <span className={`text-[9px] font-bold ${meta.color} mt-0.5`}>{sub.skillNode}</span>
                </div>
                {/* Node badge */}
                <div className={`absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center ${meta.bg} border ${meta.border}`}>
                  <i className={`fa-solid ${meta.icon} ${meta.color} text-[8px]`} />
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Lightbox */}
      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setSelected(null)}
        >
          <div
            className="bg-white rounded-2xl overflow-hidden max-w-lg w-full shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <img src={selected.photoUrl} alt={selected.missionTitle} className="w-full object-cover max-h-72" />
            <div className="p-6">
              <div className="flex items-center gap-2 mb-3">
                {(() => {
                  const meta = SKILL_NODE_META[selected.skillNode];
                  return (
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded border ${meta.bg} ${meta.color} ${meta.border}`}>
                      <i className={`fa-solid ${meta.icon} mr-1`} />{selected.skillNode}
                    </span>
                  );
                })()}
                <span className="text-[10px] text-brand-black/30 ml-auto">
                  {new Date(selected.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
              </div>
              <p className="text-sm font-bold text-brand-black mb-2">{selected.missionTitle}</p>
              <p className="text-xs text-brand-black/60 leading-relaxed">{selected.feedbackText}</p>
              <button
                onClick={() => setSelected(null)}
                className="mt-5 w-full border border-brand-black/10 text-brand-black/50 text-xs font-semibold py-3 rounded-lg hover:bg-brand-black/5 transition-all"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MissionHistoryView;
