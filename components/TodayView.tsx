import React, { useState, useEffect, useRef } from 'react';
import { Mission, Submission, SkillNodeProgress } from '../types';
import {
  getDailyMission,
  getLevel,
  getProgressToNextLevel,
  SKILL_NODE_META,
  MISSIONS,
} from '../data/missions';

type Phase = 'mission' | 'timer' | 'capture' | 'feedback';

interface TodayViewProps {
  submissions: Submission[];
  skillProgress: SkillNodeProgress[];
  onSubmit: (missionId: string, missionTitle: string, skillNode: Submission['skillNode'], photoFile: File) => Promise<Submission>;
}

const pad = (n: number) => String(n).padStart(2, '0');
const formatTime = (seconds: number) => `${pad(Math.floor(seconds / 60))}:${pad(seconds % 60)}`;

const DIFFICULTY_LABEL = { 1: 'STARTER', 2: 'DEVELOPING', 3: 'ADVANCED' } as const;

// ── Screen header shared pattern ──────────────────────────────────────────────

const ScreenHeader: React.FC<{
  eyebrow: string;
  title: string;
  readoutLabel?: string;
  readoutValue?: string;
}> = ({ eyebrow, title, readoutLabel, readoutValue }) => (
  <div
    style={{ borderBottom: '1px solid rgba(23,25,26,0.14)', paddingBottom: '18px', marginBottom: '28px' }}
    className="flex items-end justify-between gap-6"
  >
    <div>
      <p className="font-mono text-[9px] tracking-[0.24em] text-brand-ink/40 uppercase mb-[9px]">{eyebrow}</p>
      <h1 className="font-sans font-semibold text-[42px] md:text-[42px] text-[30px] leading-none tracking-[-0.02em] text-brand-ink">
        {title}
      </h1>
    </div>
    {readoutLabel && readoutValue && (
      <div className="text-right shrink-0">
        <p className="font-mono text-[9px] tracking-[0.2em] text-brand-ink/40 uppercase">{readoutLabel}</p>
        <p className="font-mono text-[30px] font-medium leading-none tracking-[-0.02em] text-brand-ink mt-1">{readoutValue}</p>
      </div>
    )}
  </div>
);

// ── ImagePlaceholder ──────────────────────────────────────────────────────────

const ImagePlaceholder: React.FC<{ caption?: string; className?: string }> = ({ caption, className = '' }) => (
  <div
    className={`relative overflow-hidden ${className}`}
    style={{
      background: 'repeating-linear-gradient(135deg,#e3e1da 0 6px,#eceae4 6px 12px)',
      border: '1px solid rgba(23,25,26,0.12)',
    }}
  >
    {caption && (
      <span className="absolute bottom-2 left-2 font-mono text-[8px] tracking-[0.14em] text-brand-ink/50 uppercase">{caption}</span>
    )}
  </div>
);

// ── MissionCard ───────────────────────────────────────────────────────────────

const MissionCard: React.FC<{
  mission: Mission;
  alreadyDoneToday: boolean;
  totalCompleted: number;
  submissions: Submission[];
  onStart: () => void;
  onPickAnother: () => void;
  onGoToHistory: () => void;
}> = ({ mission, alreadyDoneToday, totalCompleted, submissions, onStart, onPickAnother }) => {
  const meta = SKILL_NODE_META[mission.skillNode];
  const missionNumber = MISSIONS.findIndex(m => m.id === mission.id) + 1;
  const recentSubs = submissions.slice(-6).reverse();

  const lastFrame = submissions[submissions.length - 1];

  return (
    <div className="animate-in fade-in duration-500">
      <ScreenHeader
        eyebrow={`TODAY / MISSION ${String(missionNumber).padStart(2, '0')}`}
        title={mission.title}
        readoutLabel="TIMEBOX"
        readoutValue={`${pad(mission.timeBoxMinutes)}:00`}
      />

      {/* Two-column layout */}
      <div className="flex flex-col md:flex-row gap-5 items-stretch mb-9">
        {/* Left plate */}
        <div className="md:flex-[1.35]" style={{ aspectRatio: '3/2', position: 'relative', minHeight: '200px' }}>
          {lastFrame?.photoUrl ? (
            <img
              src={lastFrame.photoUrl}
              alt="last submission"
              className="w-full h-full object-cover"
              style={{ border: '1px solid rgba(23,25,26,0.12)' }}
            />
          ) : (
            <ImagePlaceholder caption="No shot yet" className="w-full h-full" />
          )}
          {/* Overlay bar */}
          <div
            className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-3 py-2 font-mono text-[9px] tracking-[0.16em] uppercase"
            style={{ background: 'rgba(23,25,26,0.86)', color: '#f4f3ef' }}
          >
            <span>NODE / {mission.skillNode.toUpperCase()}</span>
            <span style={{ color: '#e0bd4a' }}>DIFFICULTY {mission.difficulty} — {DIFFICULTY_LABEL[mission.difficulty]}</span>
          </div>
        </div>

        {/* Right spec panel */}
        <div
          className="md:flex-1 flex flex-col p-[22px]"
          style={{ background: '#f8f7f4', border: '1px solid rgba(23,25,26,0.14)' }}
        >
          {/* Data rows */}
          {[
            { label: 'SKILL NODE', value: mission.skillNode, color: meta.hexInk },
            { label: 'GENRE', value: mission.genre, color: undefined },
            { label: 'TIMEBOX', value: `${mission.timeBoxMinutes} MIN`, color: undefined },
            { label: 'STATUS', value: alreadyDoneToday ? 'COMPLETE' : 'NOT STARTED', color: alreadyDoneToday ? '#3d5a44' : '#8a6b0f', last: true },
          ].map(row => (
            <div
              key={row.label}
              className="flex items-center justify-between gap-3"
              style={{
                padding: '7px 0',
                borderTop: row.label !== 'SKILL NODE' ? '1px solid rgba(23,25,26,0.10)' : undefined,
                marginBottom: row.last ? '20px' : undefined,
              }}
            >
              <span className="font-mono text-[9px] tracking-[0.14em] text-brand-ink/42 uppercase">{row.label}</span>
              <span className="font-mono text-[9px] tracking-[0.14em] text-brand-ink font-medium" style={row.color ? { color: row.color } : undefined}>
                {row.value}
              </span>
            </div>
          ))}

          {/* Mission description */}
          <p className="text-[14px] leading-[1.65] text-brand-ink/82 mb-[18px]">{mission.promptDetail}</p>

          {/* Tip block */}
          <div className="mb-5" style={{ borderLeft: '2px solid #c9a227', paddingLeft: '14px' }}>
            <p className="font-mono text-[9px] tracking-[0.22em] uppercase mb-1" style={{ color: '#8a6b0f' }}>Technique Tip</p>
            <p className="text-[13px] leading-[1.6] text-brand-ink/70">{mission.tip}</p>
          </div>

          {/* Actions */}
          <div className="mt-auto flex flex-col gap-[9px]">
            {alreadyDoneToday && (
              <p className="font-mono text-[9px] tracking-[0.12em] uppercase" style={{ color: '#3d5a44' }}>
                Mission completed for today
              </p>
            )}
            <button
              onClick={onStart}
              className="font-mono text-[11px] font-semibold tracking-[0.2em] uppercase text-brand-ink transition-colors"
              style={{ background: '#c9a227', minHeight: '44px', padding: '15px' }}
              onMouseEnter={e => (e.currentTarget.style.background = '#dab538')}
              onMouseLeave={e => (e.currentTarget.style.background = '#c9a227')}
            >
              {alreadyDoneToday ? 'Do It Again' : 'Start Mission'}
            </button>
            <button
              onClick={onPickAnother}
              className="font-mono text-[10px] tracking-[0.18em] uppercase text-brand-ink/62 transition-colors"
              style={{ background: 'transparent', border: '1px solid rgba(23,25,26,0.2)', minHeight: '44px', padding: '12px 14px' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#17191a'; e.currentTarget.style.color = '#17191a'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(23,25,26,0.2)'; e.currentTarget.style.color = 'rgba(23,25,26,0.62)'; }}
            >
              Browse {MISSIONS.length} Missions
            </button>
          </div>
        </div>
      </div>

      {/* Contact sheet */}
      {recentSubs.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="font-mono text-[9px] tracking-[0.24em] uppercase text-brand-ink/40">
              Contact Sheet / Last {recentSubs.length} Submissions
            </p>
          </div>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
            {recentSubs.map(sub => (
              <div key={sub.id} className="aspect-square relative overflow-hidden" style={{ border: '1px solid rgba(23,25,26,0.12)' }}>
                <img src={sub.photoUrl} alt={sub.missionTitle} className="w-full h-full object-cover" />
                <div className="absolute bottom-0 left-0 right-0 p-1" style={{ background: 'rgba(23,25,26,0.7)' }}>
                  <p className="font-mono text-[8px] tracking-[0.1em] text-brand-panel/80 uppercase leading-none" style={{ color: SKILL_NODE_META[sub.skillNode]?.hexColor || '#f4f3ef' }}>
                    {sub.skillNode?.slice(0, 4).toUpperCase()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ── TimerScreen ───────────────────────────────────────────────────────────────

const TimerScreen: React.FC<{
  mission: Mission;
  onGotShot: () => void;
  onEnd: () => void;
}> = ({ mission, onGotShot, onEnd }) => {
  const [seconds, setSeconds] = useState(mission.timeBoxMinutes * 60);
  const [running, setRunning] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (running && seconds > 0) {
      intervalRef.current = setInterval(() => setSeconds(s => s - 1), 1000);
    } else if (seconds === 0) {
      setRunning(false);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [running, seconds]);

  const total = mission.timeBoxMinutes * 60;
  const pct = ((total - seconds) / total) * 100;
  const isComplete = seconds === 0;

  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] animate-in fade-in duration-300 text-center">
      <p className="font-mono text-[9px] tracking-[0.24em] text-brand-ink/40 uppercase mb-2">{mission.skillNode}</p>
      <p className="text-[15px] font-medium text-brand-ink/60 mb-10">{mission.title}</p>

      {/* Timer ring */}
      <div className="relative mb-8">
        <svg width="200" height="200" viewBox="0 0 200 200" className="-rotate-90">
          <circle cx="100" cy="100" r="90" fill="none" strokeWidth="6" stroke="rgba(23,25,26,0.10)" />
          <circle
            cx="100" cy="100" r="90" fill="none" strokeWidth="6"
            stroke={isComplete ? '#4b6b52' : '#c9a227'}
            strokeDasharray={`${2 * Math.PI * 90}`}
            strokeDashoffset={`${2 * Math.PI * 90 * (1 - pct / 100)}`}
            strokeLinecap="butt"
            style={{ transition: 'stroke-dashoffset 1s linear, stroke 300ms' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-mono font-medium text-[48px] leading-none tracking-[-0.02em] text-brand-ink">
            {formatTime(seconds)}
          </span>
          {isComplete && (
            <span className="font-mono text-[9px] tracking-[0.16em] uppercase mt-1" style={{ color: '#3d5a44' }}>Time's Up</span>
          )}
        </div>
      </div>

      <p className="text-[12px] text-brand-ink/40 max-w-xs mb-12 leading-[1.6]">{mission.tip}</p>

      <div className="flex flex-col gap-3 w-full max-w-xs">
        <button
          onClick={onGotShot}
          className="font-mono text-[11px] font-semibold tracking-[0.2em] uppercase text-brand-ink transition-colors"
          style={{ background: '#c9a227', minHeight: '44px', padding: '15px' }}
          onMouseEnter={e => (e.currentTarget.style.background = '#dab538')}
          onMouseLeave={e => (e.currentTarget.style.background = '#c9a227')}
        >
          I Got The Shot — Upload
        </button>
        <button
          onClick={() => setRunning(r => !r)}
          className="font-mono text-[9px] tracking-[0.18em] uppercase text-brand-ink/42 hover:text-brand-ink/70 transition-colors py-2"
        >
          {running ? 'Pause' : 'Resume'}
        </button>
        <button
          onClick={onEnd}
          className="font-mono text-[9px] tracking-[0.18em] uppercase text-brand-ink/30 hover:text-brand-ink/50 transition-colors py-2"
        >
          End Without Uploading
        </button>
      </div>
    </div>
  );
};

// ── CaptureScreen ─────────────────────────────────────────────────────────────

const CaptureScreen: React.FC<{
  mission: Mission;
  onFileSelected: (file: File) => void;
  onBack: () => void;
  isUploading: boolean;
}> = ({ mission, onFileSelected, onBack, isUploading }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    setPreview(URL.createObjectURL(file));
  };

  return (
    <div className="animate-in fade-in duration-300 max-w-lg mx-auto">
      <div style={{ borderBottom: '1px solid rgba(23,25,26,0.14)', paddingBottom: '18px', marginBottom: '28px' }}>
        <p className="font-mono text-[9px] tracking-[0.24em] text-brand-ink/40 uppercase mb-[9px]">{mission.title.toUpperCase()}</p>
        <h1 className="font-sans font-semibold text-[42px] leading-none tracking-[-0.02em] text-brand-ink">Upload Shot</h1>
      </div>

      {/* Drop zone */}
      <div
        onClick={() => inputRef.current?.click()}
        className="cursor-pointer mb-6 flex flex-col items-center justify-center transition-colors"
        style={{
          minHeight: '260px',
          border: preview ? '1px solid rgba(201,162,39,0.5)' : '2px dashed rgba(23,25,26,0.15)',
          overflow: 'hidden',
        }}
        onMouseEnter={e => { if (!preview) (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(201,162,39,0.5)'; }}
        onMouseLeave={e => { if (!preview) (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(23,25,26,0.15)'; }}
      >
        {preview ? (
          <img src={preview} alt="preview" className="w-full h-full object-cover" style={{ minHeight: '260px' }} />
        ) : (
          <div className="flex flex-col items-center justify-center py-16 px-8 text-center">
            <i className="fa-solid fa-camera text-brand-ink/15 text-3xl mb-4" />
            <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-brand-ink/40 mb-1">Tap to take or choose a photo</p>
          </div>
        )}
      </div>

      <input ref={inputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFile} />

      <div className="flex flex-col gap-3">
        <button
          onClick={() => selectedFile && onFileSelected(selectedFile)}
          disabled={!selectedFile || isUploading}
          className="font-mono text-[11px] font-semibold tracking-[0.2em] uppercase text-brand-ink transition-colors"
          style={{
            background: selectedFile && !isUploading ? '#c9a227' : 'rgba(23,25,26,0.10)',
            color: selectedFile && !isUploading ? '#17191a' : 'rgba(23,25,26,0.30)',
            minHeight: '44px',
            padding: '15px',
            cursor: selectedFile && !isUploading ? 'pointer' : 'not-allowed',
          }}
        >
          {isUploading ? 'Saving…' : 'Submit Shot'}
        </button>
        <button
          onClick={onBack}
          disabled={isUploading}
          className="font-mono text-[9px] tracking-[0.18em] uppercase text-brand-ink/30 hover:text-brand-ink/50 transition-colors py-2 text-center"
        >
          ← Back to Timer
        </button>
      </div>
    </div>
  );
};

// ── FeedbackCard ──────────────────────────────────────────────────────────────

const FeedbackCard: React.FC<{
  submission: Submission;
  skillProgress: SkillNodeProgress[];
  onDone: () => void;
}> = ({ submission, skillProgress, onDone }) => {
  const meta = SKILL_NODE_META[submission.skillNode];
  const nodeProgress = skillProgress.find(p => p.node === submission.skillNode);
  const completions = nodeProgress?.completions ?? 1;
  const level = getLevel(completions);
  const { current, target, maxed } = getProgressToNextLevel(completions);
  const pct = maxed ? 100 : Math.round((current / target) * 100);

  return (
    <div className="animate-in fade-in duration-500 max-w-lg mx-auto">
      <p className="font-mono text-[9px] tracking-[0.24em] uppercase mb-[9px]" style={{ color: '#3d5a44' }}>Mission Complete</p>
      <h1 className="font-sans font-semibold text-[42px] leading-none tracking-[-0.02em] text-brand-ink mb-7">{submission.missionTitle}</h1>

      {/* Frame */}
      <div className="overflow-hidden mb-6" style={{ border: '1px solid rgba(23,25,26,0.12)' }}>
        <img src={submission.photoUrl} alt="your shot" className="w-full object-cover" style={{ maxHeight: '280px' }} />
      </div>

      {/* Feedback */}
      <div className="mb-6" style={{ borderLeft: '2px solid #c9a227', paddingLeft: '14px' }}>
        <p className="font-mono text-[9px] tracking-[0.2em] uppercase mb-2" style={{ color: '#8a6b0f' }}>Response</p>
        <p className="text-[14px] leading-[1.65] text-brand-ink/78">{submission.feedbackText}</p>
      </div>

      {/* Node progress bar */}
      <div className="mb-8">
        <div className="flex items-center justify-between font-mono text-[9px] tracking-[0.14em] uppercase text-brand-ink/45 mb-[7px]">
          <span>{meta.description}</span>
          <span style={{ color: meta.hexInk }}>{maxed ? 'Maxed Out' : `${current} / ${target} to Level ${level + 1}`}</span>
        </div>
        <div className="h-[3px] w-full" style={{ background: 'rgba(23,25,26,0.10)' }}>
          <div className="h-full progress-fill" style={{ width: `${pct}%`, background: meta.hexColor }} />
        </div>
        {/* Level pips */}
        <div className="flex gap-1 mt-3">
          {[1, 2, 3, 4, 5].map(l => (
            <div key={l} className="flex-1 h-[2px] pip-fill" style={{ background: l <= level ? meta.hexColor : 'rgba(23,25,26,0.12)' }} />
          ))}
        </div>
      </div>

      <button
        onClick={onDone}
        className="font-mono text-[10px] tracking-[0.2em] uppercase w-full transition-colors"
        style={{ background: '#17191a', color: '#f4f3ef', minHeight: '44px', padding: '13px 20px' }}
        onMouseEnter={e => { e.currentTarget.style.background = '#c9a227'; e.currentTarget.style.color = '#17191a'; }}
        onMouseLeave={e => { e.currentTarget.style.background = '#17191a'; e.currentTarget.style.color = '#f4f3ef'; }}
      >
        Done
      </button>
    </div>
  );
};

// ── MissionBrowser ────────────────────────────────────────────────────────────

const MissionBrowser: React.FC<{
  submissions: Submission[];
  onSelect: (mission: Mission) => void;
  onBack: () => void;
}> = ({ submissions, onSelect, onBack }) => {
  const [filter, setFilter] = useState<string>('All');
  const completedIds = new Set(submissions.map(s => s.missionId));
  const filters = ['All', 'New', 'Done', 'Composition', 'Light', 'Timing', 'Moment'];

  const filtered = filter === 'All' ? MISSIONS : MISSIONS.filter(m =>
    filter === 'Done' ? completedIds.has(m.id) :
    filter === 'New'  ? !completedIds.has(m.id) :
    m.skillNode === filter
  );

  return (
    <div className="animate-in fade-in duration-300">
      <div style={{ borderBottom: '1px solid rgba(23,25,26,0.14)', paddingBottom: '18px', marginBottom: '22px' }}>
        <button
          onClick={onBack}
          className="font-mono text-[9px] tracking-[0.18em] uppercase text-brand-ink/40 hover:text-brand-ink/70 transition-colors mb-4 block"
        >
          ← Back
        </button>
        <h1 className="font-sans font-semibold text-[30px] leading-none tracking-[-0.02em] text-brand-ink">All Missions</h1>
      </div>

      {/* Filter pills */}
      <div className="flex flex-wrap gap-2 mb-6">
        {filters.map(f => {
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
              {f}
            </button>
          );
        })}
      </div>

      <div className="space-y-0">
        {filtered.map(mission => {
          const meta = SKILL_NODE_META[mission.skillNode];
          const done = completedIds.has(mission.id);
          return (
            <button
              key={mission.id}
              onClick={() => onSelect(mission)}
              className="w-full text-left transition-colors"
              style={{ padding: '16px 0', borderBottom: '1px solid rgba(23,25,26,0.10)' }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span
                      className="font-mono text-[8px] tracking-[0.14em] uppercase"
                      style={{ border: '1px solid rgba(23,25,26,0.16)', padding: '4px 7px', color: meta.hexInk }}
                    >
                      {mission.skillNode}
                    </span>
                    {done && (
                      <span className="font-mono text-[8px] tracking-[0.14em] uppercase" style={{ color: '#3d5a44' }}>✓ Done</span>
                    )}
                  </div>
                  <p className="text-[15px] font-medium text-brand-ink">{mission.title}</p>
                  <p className="font-mono text-[9px] tracking-[0.14em] text-brand-ink/42 mt-0.5 uppercase">{mission.genre} · {mission.timeBoxMinutes}MIN</p>
                </div>
                <span className="font-mono text-[10px] tracking-[0.12em] text-brand-ink/40 shrink-0">D{mission.difficulty}</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

// ── Main component ────────────────────────────────────────────────────────────

const TodayView: React.FC<TodayViewProps> = ({ submissions, skillProgress, onSubmit }) => {
  const [phase, setPhase] = useState<Phase>('mission');
  const [activeMission, setActiveMission] = useState<Mission>(getDailyMission);
  const [isUploading, setIsUploading] = useState(false);
  const [lastSubmission, setLastSubmission] = useState<Submission | null>(null);
  const [showBrowser, setShowBrowser] = useState(false);

  const totalCompleted = submissions.length;

  const handleSubmit = async (file: File) => {
    setIsUploading(true);
    try {
      const sub = await onSubmit(activeMission.id, activeMission.title, activeMission.skillNode, file);
      setLastSubmission(sub);
      setPhase('feedback');
    } catch {
      // error toast handled upstream
    } finally {
      setIsUploading(false);
    }
  };

  const handleDone = () => {
    setActiveMission(getDailyMission());
    setPhase('mission');
    setLastSubmission(null);
    setShowBrowser(false);
  };

  if (showBrowser) {
    return (
      <MissionBrowser
        submissions={submissions}
        onSelect={m => { setActiveMission(m); setShowBrowser(false); }}
        onBack={() => setShowBrowser(false)}
      />
    );
  }

  const todayStr = new Date().toISOString().split('T')[0];
  const alreadyDoneToday = submissions.some(s => new Date(s.createdAt).toISOString().split('T')[0] === todayStr);

  if (phase === 'mission') {
    return (
      <MissionCard
        mission={activeMission}
        alreadyDoneToday={alreadyDoneToday}
        totalCompleted={totalCompleted}
        submissions={submissions}
        onStart={() => setPhase('timer')}
        onPickAnother={() => setShowBrowser(true)}
        onGoToHistory={() => {}}
      />
    );
  }

  if (phase === 'timer') {
    return <TimerScreen mission={activeMission} onGotShot={() => setPhase('capture')} onEnd={() => setPhase('mission')} />;
  }

  if (phase === 'capture') {
    return <CaptureScreen mission={activeMission} onFileSelected={handleSubmit} onBack={() => setPhase('timer')} isUploading={isUploading} />;
  }

  if (phase === 'feedback' && lastSubmission) {
    return <FeedbackCard submission={lastSubmission} skillProgress={skillProgress} onDone={handleDone} />;
  }

  return null;
};

export default TodayView;
