import React, { useState, useEffect, useRef } from 'react';
import { Mission, Submission, SkillNodeProgress } from '../types';
import {
  getDailyMission,
  getLevel,
  getProgressToNextLevel,
  getEncouragement,
  SKILL_NODE_META,
  MISSIONS,
} from '../data/missions';

// ── Types ─────────────────────────────────────────────────────────────────────

type Phase = 'mission' | 'timer' | 'capture' | 'feedback';

interface TodayViewProps {
  submissions: Submission[];
  skillProgress: SkillNodeProgress[];
  onSubmit: (missionId: string, missionTitle: string, skillNode: Submission['skillNode'], photoFile: File) => Promise<Submission>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const GENRE_COLOR: Record<string, string> = {
  Street:         'bg-brand-blue/10 text-brand-blue border-brand-blue/20',
  Sports:         'bg-brand-rose/10 text-brand-rose border-brand-rose/20',
  Photojournalism:'bg-amber-50 text-amber-700 border-amber-200',
  Any:            'bg-brand-black/5 text-brand-black/50 border-brand-black/10',
};

const DIFFICULTY_DOTS = (d: 1 | 2 | 3) => (
  <span className="flex items-center gap-0.5" title={`Difficulty ${d}/3`}>
    {[1, 2, 3].map(i => (
      <span key={i} className={`w-1.5 h-1.5 rounded-full ${i <= d ? 'bg-brand-rose' : 'bg-brand-black/10'}`} />
    ))}
  </span>
);

const pad = (n: number) => String(n).padStart(2, '0');

const formatTime = (seconds: number) => `${pad(Math.floor(seconds / 60))}:${pad(seconds % 60)}`;

// ── Sub-components ────────────────────────────────────────────────────────────

const MissionCard: React.FC<{
  mission: Mission;
  alreadyDoneToday: boolean;
  totalCompleted: number;
  onStart: () => void;
  onPickAnother: () => void;
}> = ({ mission, alreadyDoneToday, totalCompleted, onStart, onPickAnother }) => {
  const meta = SKILL_NODE_META[mission.skillNode];
  return (
    <div className="animate-in fade-in duration-500">
      {/* Header */}
      <header className="mb-10 flex items-start justify-between flex-wrap gap-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-brand-black/30 mb-1">Today's Mission</p>
          <h2 className="text-4xl font-display text-brand-black tracking-wide">
            {mission.title.toUpperCase()}
          </h2>
        </div>
        {totalCompleted > 0 && (
          <div className="text-right">
            <p className="text-[10px] font-bold uppercase tracking-widest text-brand-black/30">Total</p>
            <p className="text-2xl font-display text-brand-black">{totalCompleted}</p>
          </div>
        )}
      </header>

      {/* Mission card */}
      <div className="bg-brand-black rounded-xl p-8 text-white mb-6 shadow-xl border border-white/5">
        {/* Badges */}
        <div className="flex items-center gap-3 mb-6">
          <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded border ${GENRE_COLOR[mission.genre]}`}>
            {mission.genre}
          </span>
          <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded border ${meta.bg} ${meta.color} ${meta.border}`}>
            <i className={`fa-solid ${meta.icon} mr-1.5`} />{mission.skillNode}
          </span>
          <span className="ml-auto flex items-center gap-2 text-[10px] text-white/40 font-medium">
            <i className="fa-regular fa-clock text-[9px]" /> {mission.timeBoxMinutes} min
          </span>
        </div>

        {/* Description */}
        <p className="text-sm text-white/80 leading-relaxed mb-6">
          {mission.promptDetail}
        </p>

        {/* Tip */}
        <div className="border-t border-white/10 pt-5">
          <p className="text-[9px] font-bold uppercase tracking-[0.3em] text-brand-rose/60 mb-2">Technique tip</p>
          <p className="text-sm text-white/60 leading-relaxed italic">"{mission.tip}"</p>
        </div>

        {/* Difficulty */}
        <div className="flex items-center gap-2 mt-5">
          {DIFFICULTY_DOTS(mission.difficulty)}
          <span className="text-[9px] text-white/30 uppercase tracking-wider">
            {mission.difficulty === 1 ? 'Starter' : mission.difficulty === 2 ? 'Developing' : 'Advanced'}
          </span>
        </div>
      </div>

      {/* Already done today? */}
      {alreadyDoneToday && (
        <div className="flex items-center gap-2 mb-5 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3">
          <i className="fa-solid fa-check-circle text-emerald-500 text-sm" />
          <p className="text-xs font-semibold text-emerald-700">You already completed today's mission.</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-3">
        <button
          onClick={onStart}
          className="flex-1 flex items-center justify-center gap-2 bg-brand-blue text-white font-bold text-sm py-4 rounded-lg hover:bg-[#7a93a0] active:scale-95 transition-all shadow-sm"
        >
          <i className="fa-solid fa-bolt" />
          {alreadyDoneToday ? 'Do It Again' : 'Start Mission'}
        </button>
        <button
          onClick={onPickAnother}
          className="flex items-center justify-center gap-2 border border-brand-black/10 text-brand-black/60 text-xs font-semibold py-4 px-5 rounded-lg hover:bg-brand-black/5 active:scale-95 transition-all"
        >
          <i className="fa-solid fa-shuffle text-[10px]" /> Browse missions
        </button>
      </div>
    </div>
  );
};

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

  const pct = ((mission.timeBoxMinutes * 60 - seconds) / (mission.timeBoxMinutes * 60)) * 100;

  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] animate-in fade-in duration-300 text-center">
      {/* Mission label */}
      <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-brand-black/30 mb-2">{mission.skillNode}</p>
      <p className="text-base font-semibold text-brand-black/60 mb-10">{mission.title}</p>

      {/* Timer ring */}
      <div className="relative mb-8">
        <svg width="200" height="200" viewBox="0 0 200 200" className="-rotate-90">
          <circle cx="100" cy="100" r="90" fill="none" stroke="currentColor" strokeWidth="6" className="text-brand-black/5" />
          <circle
            cx="100" cy="100" r="90" fill="none" stroke="currentColor" strokeWidth="6"
            className={seconds === 0 ? 'text-emerald-500' : 'text-brand-blue'}
            strokeDasharray={`${2 * Math.PI * 90}`}
            strokeDashoffset={`${2 * Math.PI * 90 * (1 - pct / 100)}`}
            strokeLinecap="round"
            style={{ transition: 'stroke-dashoffset 1s linear' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-5xl font-display text-brand-black tracking-widest">
            {formatTime(seconds)}
          </span>
          {seconds === 0 && (
            <span className="text-xs font-semibold text-emerald-600 mt-1">Time's up</span>
          )}
        </div>
      </div>

      {/* Tip reminder */}
      <p className="text-xs text-brand-gray/60 italic max-w-xs mb-12 leading-relaxed">
        "{mission.tip}"
      </p>

      {/* Actions */}
      <div className="flex flex-col gap-3 w-full max-w-xs">
        <button
          onClick={onGotShot}
          className="w-full flex items-center justify-center gap-2 bg-brand-blue text-white font-bold text-sm py-4 rounded-lg hover:bg-[#7a93a0] active:scale-95 transition-all shadow-sm"
        >
          <i className="fa-solid fa-camera" /> I got the shot — upload
        </button>
        <button
          onClick={() => setRunning(r => !r)}
          className="text-xs font-medium text-brand-black/40 hover:text-brand-black/60 transition-colors py-2"
        >
          {running ? 'Pause' : 'Resume'}
        </button>
        <button
          onClick={onEnd}
          className="text-xs font-medium text-brand-black/30 hover:text-brand-black/50 transition-colors py-2"
        >
          End session without uploading
        </button>
      </div>
    </div>
  );
};

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
      <header className="mb-8 text-center">
        <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-brand-black/30 mb-1">{mission.title}</p>
        <h3 className="text-2xl font-display text-brand-black tracking-wide">Upload Your Shot</h3>
      </header>

      {/* Drop zone / preview */}
      <div
        onClick={() => inputRef.current?.click()}
        className={`relative rounded-xl border-2 border-dashed cursor-pointer transition-all mb-6 overflow-hidden
          ${preview ? 'border-brand-blue/40' : 'border-brand-black/15 hover:border-brand-blue/40 hover:bg-brand-blue/3'}
        `}
        style={{ minHeight: '260px' }}
      >
        {preview ? (
          <img src={preview} alt="preview" className="w-full h-full object-cover" style={{ minHeight: '260px' }} />
        ) : (
          <div className="flex flex-col items-center justify-center py-16 px-8 text-center">
            <i className="fa-solid fa-camera text-brand-black/20 text-3xl mb-4" />
            <p className="text-sm font-semibold text-brand-black/50 mb-1">Tap to take or choose a photo</p>
            <p className="text-xs text-brand-black/30">Opens camera on mobile</p>
          </div>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFile}
      />

      <div className="flex flex-col gap-3">
        <button
          onClick={() => selectedFile && onFileSelected(selectedFile)}
          disabled={!selectedFile || isUploading}
          className={`w-full flex items-center justify-center gap-2 font-bold text-sm py-4 rounded-lg transition-all active:scale-95 ${
            selectedFile && !isUploading
              ? 'bg-brand-blue text-white hover:bg-[#7a93a0] shadow-sm'
              : 'bg-brand-black/10 text-brand-black/30 cursor-not-allowed'
          }`}
        >
          {isUploading ? (
            <><i className="fa-solid fa-circle-notch fa-spin" /> Saving…</>
          ) : (
            <><i className="fa-solid fa-check" /> Submit shot</>
          )}
        </button>
        <button
          onClick={onBack}
          disabled={isUploading}
          className="text-xs font-medium text-brand-black/30 hover:text-brand-black/50 transition-colors py-2 text-center"
        >
          ← Back to timer
        </button>
      </div>
    </div>
  );
};

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
    <div className="animate-in fade-in duration-500 max-w-lg mx-auto text-center">
      {/* Celebration header */}
      <div className="mb-8">
        <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
          <i className="fa-solid fa-check text-emerald-600 text-2xl" />
        </div>
        <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-emerald-600 mb-1">Mission Complete</p>
        <h3 className="text-2xl font-display text-brand-black tracking-wide">{submission.missionTitle.toUpperCase()}</h3>
      </div>

      {/* Photo thumbnail */}
      <div className="rounded-xl overflow-hidden mb-6 shadow-md border border-brand-black/5">
        <img src={submission.photoUrl} alt="your shot" className="w-full object-cover" style={{ maxHeight: '280px' }} />
      </div>

      {/* Feedback text */}
      <div className="bg-white border border-brand-black/5 rounded-lg px-6 py-5 mb-6 text-left shadow-sm">
        <p className="text-[9px] font-bold uppercase tracking-[0.25em] text-brand-black/30 mb-2">Feedback</p>
        <p className="text-sm text-brand-black/80 leading-relaxed">{submission.feedbackText}</p>
      </div>

      {/* Node progress */}
      <div className={`rounded-lg border px-5 py-4 mb-8 text-left ${meta.bg} ${meta.border}`}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <i className={`fa-solid ${meta.icon} ${meta.color} text-sm`} />
            <span className={`text-xs font-bold ${meta.color}`}>{submission.skillNode}</span>
          </div>
          <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${meta.bg} ${meta.color} border ${meta.border}`}>
            Level {level}{maxed ? ' — Max' : ''}
          </span>
        </div>
        <div className="h-1.5 bg-white/60 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-1000 ${meta.color.replace('text-', 'bg-')}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        {!maxed && (
          <p className="text-[10px] text-brand-black/40 mt-1.5">{current} / {target} to Level {level + 1}</p>
        )}
      </div>

      <button
        onClick={onDone}
        className="w-full bg-brand-black text-white font-bold text-sm py-4 rounded-lg hover:bg-zinc-800 active:scale-95 transition-all"
      >
        Done
      </button>
    </div>
  );
};

const MissionBrowser: React.FC<{
  submissions: Submission[];
  onSelect: (mission: Mission) => void;
  onBack: () => void;
}> = ({ submissions, onSelect, onBack }) => {
  const [filter, setFilter] = useState<string>('All');
  const completedIds = new Set(submissions.map(s => s.missionId));

  const filtered = filter === 'All' ? MISSIONS : MISSIONS.filter(m =>
    filter === 'Done' ? completedIds.has(m.id) :
    filter === 'New'  ? !completedIds.has(m.id) :
    m.skillNode === filter
  );

  return (
    <div className="animate-in fade-in duration-300">
      <header className="mb-6 flex items-center gap-4">
        <button onClick={onBack} className="text-brand-black/40 hover:text-brand-black transition-colors">
          <i className="fa-solid fa-arrow-left" />
        </button>
        <h3 className="text-xl font-display text-brand-black tracking-wide">ALL MISSIONS</h3>
      </header>

      {/* Filter pills */}
      <div className="flex flex-wrap gap-2 mb-6">
        {['All', 'New', 'Done', 'Composition', 'Light', 'Timing', 'Moment'].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-full border transition-all ${
              filter === f
                ? 'bg-brand-black text-white border-brand-black'
                : 'border-brand-black/10 text-brand-black/50 hover:border-brand-black/30'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {filtered.map(mission => {
          const meta = SKILL_NODE_META[mission.skillNode];
          const done = completedIds.has(mission.id);
          return (
            <button
              key={mission.id}
              onClick={() => onSelect(mission)}
              className="w-full text-left bg-white border border-brand-black/5 rounded-lg p-5 hover:border-brand-blue/30 hover:shadow-sm transition-all active:scale-[0.99] group"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${meta.bg} ${meta.color} ${meta.border}`}>
                      {mission.skillNode}
                    </span>
                    <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${GENRE_COLOR[mission.genre]}`}>
                      {mission.genre}
                    </span>
                    {done && <i className="fa-solid fa-check-circle text-emerald-500 text-[10px]" />}
                  </div>
                  <p className="text-sm font-semibold text-brand-black group-hover:text-brand-blue transition-colors">{mission.title}</p>
                  <p className="text-xs text-brand-gray/60 mt-0.5 line-clamp-1">{mission.promptDetail}</p>
                </div>
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  {DIFFICULTY_DOTS(mission.difficulty)}
                  <span className="text-[9px] text-brand-black/30">{mission.timeBoxMinutes}m</span>
                </div>
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

  const todayStr = new Date().toISOString().split('T')[0];
  const alreadyDoneToday = submissions.some(s => new Date(s.createdAt).toISOString().split('T')[0] === todayStr);
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

  if (phase === 'mission') {
    return (
      <MissionCard
        mission={activeMission}
        alreadyDoneToday={alreadyDoneToday}
        totalCompleted={totalCompleted}
        onStart={() => setPhase('timer')}
        onPickAnother={() => setShowBrowser(true)}
      />
    );
  }

  if (phase === 'timer') {
    return (
      <TimerScreen
        mission={activeMission}
        onGotShot={() => setPhase('capture')}
        onEnd={() => setPhase('mission')}
      />
    );
  }

  if (phase === 'capture') {
    return (
      <CaptureScreen
        mission={activeMission}
        onFileSelected={handleSubmit}
        onBack={() => setPhase('timer')}
        isUploading={isUploading}
      />
    );
  }

  if (phase === 'feedback' && lastSubmission) {
    return (
      <FeedbackCard
        submission={lastSubmission}
        skillProgress={skillProgress}
        onDone={handleDone}
      />
    );
  }

  return null;
};

export default TodayView;
