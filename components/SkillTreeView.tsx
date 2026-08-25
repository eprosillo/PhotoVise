import React from 'react';
import { SkillNodeProgress, Submission } from '../types';
import { SKILL_NODE_META, getLevel, getProgressToNextLevel, LEVEL_THRESHOLDS } from '../data/missions';

interface SkillTreeViewProps {
  skillProgress: SkillNodeProgress[];
  totalSubmissions: number;
  submissions?: Submission[];
}

const NODE_ORDER = ['Composition', 'Light', 'Timing', 'Moment'] as const;

const pad = (n: number) => String(n).padStart(2, '0');

const SkillNodeCard: React.FC<{ node: string; completions: number; recentSubs: Submission[] }> = ({ node, completions, recentSubs }) => {
  const meta = SKILL_NODE_META[node];
  const level = getLevel(completions);
  const { current, target, maxed } = getProgressToNextLevel(completions);
  const pct = maxed ? 100 : Math.round((current / target) * 100);

  // Last 3 submissions for this node
  const nodeSubs = recentSubs.filter(s => s.skillNode === node).slice(-3).reverse();
  const slots = [0, 1, 2];

  return (
    <div
      className="flex flex-col p-5"
      style={{
        background: '#f8f7f4',
        border: '1px solid rgba(23,25,26,0.14)',
        borderTop: `2px solid ${meta.hexColor}`,
      }}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-[18px]">
        <div>
          <p className="font-mono text-[10px] tracking-[0.22em] uppercase font-medium" style={{ color: meta.hexColor }}>
            {node}
          </p>
          <p className="text-[12px] leading-[1.6] text-brand-ink/50 mt-[5px]">{meta.description}</p>
        </div>
        <div className="text-right shrink-0 ml-4">
          <p className="font-mono font-medium text-[26px] leading-none tracking-[-0.02em] text-brand-ink">
            {pad(level)}
          </p>
          <p className="font-mono text-[8px] tracking-[0.2em] uppercase text-brand-ink/35 mt-1">Level</p>
        </div>
      </div>

      {/* Progress line */}
      <div className="flex items-center justify-between font-mono text-[9px] tracking-[0.14em] uppercase text-brand-ink/45 mb-[7px]">
        <span>{maxed ? 'Maxed Out' : `${current} / ${target} to Level ${level + 1}`}</span>
        <span>{completions} Total</span>
      </div>

      {/* 3px bar */}
      <div className="h-[3px] w-full mb-3" style={{ background: 'rgba(23,25,26,0.10)' }}>
        <div className="h-full progress-fill" style={{ width: `${pct}%`, background: meta.hexColor }} />
      </div>

      {/* Level pips */}
      <div className="flex gap-1 mb-5">
        {[1, 2, 3, 4, 5].map(l => (
          <div key={l} className="flex-1 h-[2px] pip-fill" style={{ background: l <= level ? meta.hexColor : 'rgba(23,25,26,0.12)' }} />
        ))}
      </div>

      {/* Recent submission thumbnails */}
      <div className="flex gap-[6px]">
        {slots.map(i => {
          const sub = nodeSubs[i];
          return sub ? (
            <div key={sub.id} className="flex-1 aspect-square overflow-hidden" style={{ border: '1px solid rgba(23,25,26,0.12)' }}>
              <img src={sub.photoUrl} alt={sub.missionTitle} className="w-full h-full object-cover" />
            </div>
          ) : (
            <div
              key={i}
              className="flex-1 aspect-square flex items-center justify-center"
              style={{ border: i === nodeSubs.length ? '1px dashed rgba(23,25,26,0.20)' : '1px dashed rgba(23,25,26,0.14)' }}
            >
              {i === nodeSubs.length && (
                <span className="font-mono text-[14px] text-brand-ink/20">+</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

const SkillTreeView: React.FC<SkillTreeViewProps> = ({ skillProgress, totalSubmissions, submissions = [] }) => {
  const getCompletions = (node: string) =>
    skillProgress.find(p => p.node === node)?.completions ?? 0;

  return (
    <div>
      {/* Screen header */}
      <div
        style={{ borderBottom: '1px solid rgba(23,25,26,0.14)', paddingBottom: '18px', marginBottom: '28px' }}
        className="flex items-end justify-between gap-6"
      >
        <div>
          <p className="font-mono text-[9px] tracking-[0.24em] text-brand-ink/40 uppercase mb-[9px]">Grow / Progress</p>
          <h1 className="font-sans font-semibold text-[42px] leading-none tracking-[-0.02em] text-brand-ink">Skill Tree</h1>
        </div>
        <div className="text-right shrink-0">
          <p className="font-mono text-[9px] tracking-[0.2em] text-brand-ink/40 uppercase">Missions Logged</p>
          <p className="font-mono text-[30px] font-medium leading-none tracking-[-0.02em] text-brand-ink mt-1">
            {String(totalSubmissions).padStart(2, '0')}
          </p>
        </div>
      </div>

      {/* Empty state prompt */}
      {totalSubmissions === 0 && (
        <div className="mb-6" style={{ borderLeft: '2px solid #c9a227', paddingLeft: '14px', padding: '14px 14px 14px 14px' }}>
          <p className="text-[13px] leading-[1.6] text-brand-ink/70">
            Complete your first Today mission and upload a shot to begin building your skill tree.
          </p>
        </div>
      )}

      {/* 2×2 grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {NODE_ORDER.map(node => (
          <SkillNodeCard
            key={node}
            node={node}
            completions={getCompletions(node)}
            recentSubs={submissions}
          />
        ))}
      </div>

      {/* Level thresholds legend */}
      <div
        className="flex flex-wrap gap-[28px] mt-7 pt-4"
        style={{ borderTop: '1px solid rgba(23,25,26,0.12)' }}
      >
        <span className="font-mono text-[9px] tracking-[0.16em] uppercase text-brand-ink/32">Level Thresholds</span>
        {([1, 2, 3, 4, 5] as const).map(l => (
          <span key={l} className="font-mono text-[9px] tracking-[0.12em] uppercase text-brand-ink/55">
            LV{l} {LEVEL_THRESHOLDS[l - 1]}+
          </span>
        ))}
      </div>
    </div>
  );
};

export default SkillTreeView;
