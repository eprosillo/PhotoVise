import React from 'react';
import { SkillNodeProgress } from '../types';
import { SKILL_NODE_META, getLevel, getProgressToNextLevel, LEVEL_THRESHOLDS } from '../data/missions';

interface SkillTreeViewProps {
  skillProgress: SkillNodeProgress[];
  totalSubmissions: number;
}

const NODE_ORDER = ['Composition', 'Light', 'Timing', 'Moment'] as const;

const SkillNodeCard: React.FC<{ node: string; completions: number }> = ({ node, completions }) => {
  const meta = SKILL_NODE_META[node];
  const level = getLevel(completions);
  const { current, target, maxed } = getProgressToNextLevel(completions);
  const pct = maxed ? 100 : Math.round((current / target) * 100);

  return (
    <div className={`rounded-xl border p-6 flex flex-col gap-4 ${meta.bg} ${meta.border}`}>
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${meta.bg} border ${meta.border}`}>
            <i className={`fa-solid ${meta.icon} ${meta.color} text-base`} />
          </div>
          <div>
            <p className={`text-xs font-bold uppercase tracking-wider ${meta.color}`}>{node}</p>
            <p className="text-[10px] text-brand-black/40">{meta.description}</p>
          </div>
        </div>
        <div className="text-right">
          <p className={`text-2xl font-display ${meta.color}`}>{level}</p>
          <p className="text-[9px] font-bold uppercase tracking-widest text-brand-black/30">Level</p>
        </div>
      </div>

      {/* Progress bar */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] text-brand-black/40">
            {maxed ? 'Maxed out' : `${current} / ${target} to Level ${level + 1}`}
          </span>
          <span className="text-[10px] font-semibold text-brand-black/50">{completions} total</span>
        </div>
        <div className="h-2 bg-white/60 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ${meta.color.replace('text-', 'bg-')}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Level pips */}
      <div className="flex items-center gap-2">
        {[1, 2, 3, 4, 5].map(l => (
          <div
            key={l}
            className={`flex-1 h-1 rounded-full transition-all ${
              l <= level
                ? meta.color.replace('text-', 'bg-')
                : 'bg-white/50'
            }`}
          />
        ))}
      </div>

      {/* Unlock info */}
      {!maxed && (
        <p className="text-[10px] text-brand-black/30 leading-relaxed">
          Level {level + 1} unlocks at {LEVEL_THRESHOLDS[level]} completions
          {level < 4 && ` · Level ${level + 2} at ${LEVEL_THRESHOLDS[level + 1]}`}
        </p>
      )}
    </div>
  );
};

const SkillTreeView: React.FC<SkillTreeViewProps> = ({ skillProgress, totalSubmissions }) => {
  const getCompletions = (node: string) =>
    skillProgress.find(p => p.node === node)?.completions ?? 0;

  return (
    <div>
      <header className="mb-8">
        <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-brand-black/30 mb-1">Your Progress</p>
        <h2 className="text-4xl font-display text-brand-black tracking-wide">SKILL TREE</h2>
        {totalSubmissions > 0 && (
          <p className="text-sm text-brand-black/40 mt-2">{totalSubmissions} missions completed</p>
        )}
      </header>

      {totalSubmissions === 0 && (
        <div className="bg-brand-blue/5 border border-brand-blue/20 rounded-xl px-6 py-5 mb-6">
          <p className="text-sm font-semibold text-brand-blue mb-1">Start with Today's Mission</p>
          <p className="text-xs text-brand-black/50 leading-relaxed">
            Complete your first mission and upload a shot to begin building your skill tree.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {NODE_ORDER.map(node => (
          <SkillNodeCard key={node} node={node} completions={getCompletions(node)} />
        ))}
      </div>

      {/* Level legend */}
      <div className="mt-8 border-t border-brand-black/5 pt-6">
        <p className="text-[10px] font-bold uppercase tracking-widest text-brand-black/30 mb-4">Level Thresholds</p>
        <div className="flex flex-wrap gap-x-8 gap-y-2">
          {([1, 2, 3, 4, 5] as const).map(l => (
            <div key={l} className="flex items-center gap-2">
              <span className="text-xs font-bold text-brand-black/50">Lv {l}</span>
              <span className="text-xs text-brand-black/30">{LEVEL_THRESHOLDS[l - 1]}+ shots</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default SkillTreeView;
