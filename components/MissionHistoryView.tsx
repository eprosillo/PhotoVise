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
      {/* Screen header */}
      <div
        style={{ borderBottom: '1px solid rgba(23,25,26,0.14)', paddingBottom: '18px', marginBottom: '22px' }}
        className="flex items-end justify-between gap-6"
      >
        <div>
          <p className="font-mono text-[9px] tracking-[0.24em] text-brand-ink/40 uppercase mb-[9px]">Grow / Submissions</p>
          <h1 className="font-sans font-semibold text-[42px] leading-none tracking-[-0.02em] text-brand-ink">History</h1>
        </div>
        <div className="text-right shrink-0">
          <p className="font-mono text-[9px] tracking-[0.2em] text-brand-ink/40 uppercase">Frames Logged</p>
          <p className="font-mono text-[30px] font-medium leading-none tracking-[-0.02em] text-brand-ink mt-1">
            {String(submissions.length).padStart(2, '0')}
          </p>
        </div>
      </div>

      {/* Filter pills */}
      <div className="flex flex-wrap gap-2 mb-6">
        {NODE_FILTERS.map(f => {
          const meta = f !== 'All' ? SKILL_NODE_META[f] : null;
          const isActive = filter === f;
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className="font-mono text-[9px] tracking-[0.18em] uppercase transition-colors"
              style={{
                padding: '7px 13px',
                border: isActive ? '1px solid #17191a' : '1px solid rgba(23,25,26,0.18)',
                background: isActive ? '#17191a' : 'transparent',
                color: isActive ? '#f4f3ef' : 'rgba(23,25,26,0.55)',
              }}
              onMouseEnter={e => { if (!isActive) { e.currentTarget.style.borderColor = '#17191a'; e.currentTarget.style.color = '#17191a'; } }}
              onMouseLeave={e => { if (!isActive) { e.currentTarget.style.borderColor = 'rgba(23,25,26,0.18)'; e.currentTarget.style.color = 'rgba(23,25,26,0.55)'; } }}
            >
              {f !== 'All' && meta && <i className={`fa-solid ${meta.icon} mr-1.5 text-[9px]`} style={{ color: isActive ? '#f4f3ef' : meta.hexColor }} />}
              {f.toUpperCase()} {f === 'All' ? String(submissions.length).padStart(2, '0') : String(sorted.filter(s => s.skillNode === f).length).padStart(2, '0')}
            </button>
          );
        })}
      </div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <div className="py-16">
          <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-brand-ink/40">No Shots Yet</p>
          <p className="text-[13px] text-brand-ink/50 mt-2">Complete missions to build your history.</p>
        </div>
      )}

      {/* 6-column grid */}
      {filtered.length > 0 && (
        <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
          {filtered.map(sub => {
            const meta = SKILL_NODE_META[sub.skillNode];
            return (
              <button
                key={sub.id}
                onClick={() => setSelected(sub)}
                className="relative group aspect-square overflow-hidden transition-colors"
                style={{ border: '1px solid rgba(23,25,26,0.12)' }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = '#c9a227')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(23,25,26,0.12)')}
              >
                <img src={sub.photoUrl} alt={sub.missionTitle} className="w-full h-full object-cover" />
                {/* Bottom overlay */}
                <div
                  className="absolute bottom-0 left-0 right-0 flex flex-col justify-end p-[4px]"
                  style={{ background: 'linear-gradient(to top, rgba(23,25,26,0.75), transparent)' }}
                >
                  <p className="font-mono text-[8px] tracking-[0.10em] leading-none" style={{ color: meta.hexColor }}>
                    {sub.skillNode.toUpperCase().slice(0, 4)}
                  </p>
                  <p className="font-mono text-[8px] tracking-[0.06em] text-brand-ink/35 leading-none mt-0.5">
                    {new Date(sub.createdAt).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' })}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Detail panel (inline, replaces lightbox) */}
      {selected && (() => {
        const meta = SKILL_NODE_META[selected.skillNode];
        return (
          <div
            className="flex flex-col md:flex-row gap-4 mt-[22px] p-[18px]"
            style={{ background: '#f8f7f4', border: '1px solid rgba(23,25,26,0.14)' }}
          >
            <div className="shrink-0 overflow-hidden" style={{ width: '132px', height: '132px', border: '1px solid rgba(23,25,26,0.12)' }}>
              <img src={selected.photoUrl} alt={selected.missionTitle} className="w-full h-full object-cover" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between font-mono text-[9px] tracking-[0.18em] uppercase mb-2">
                <span style={{ color: meta.hexInk }}>{selected.skillNode} · Selected Frame</span>
                <span className="text-brand-ink/40">
                  {new Date(selected.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
              </div>
              <p className="text-[15px] font-medium text-brand-ink mb-2">{selected.missionTitle}</p>
              <p className="text-[13px] leading-[1.65] text-brand-ink/70">{selected.feedbackText}</p>
              <button
                onClick={() => setSelected(null)}
                className="font-mono text-[9px] tracking-[0.18em] uppercase text-brand-ink/40 hover:text-brand-ink/70 transition-colors mt-3"
              >
                Close ×
              </button>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

export default MissionHistoryView;
