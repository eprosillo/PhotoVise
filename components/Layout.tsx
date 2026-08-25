import React, { useState, useEffect } from 'react';
import FeedbackModal from './FeedbackModal';

interface UserLike {
  displayName?: string | null;
  email?: string | null;
  photoURL?: string | null;
}

interface StatusReadout {
  label: string;
  value: string | number;
}

interface LayoutProps {
  children: React.ReactNode;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  workflowSummary?: React.ReactNode;
  isFieldMode?: boolean;
  user?: UserLike | null;
  onSignOut?: () => void;
  statusReadouts?: StatusReadout[];
  dailyQuote?: { text: string; author: string };
}

const NAV_GROUPS = [
  {
    label: 'SHOOT',
    items: [
      { id: 'dashboard', label: 'Sessions',       index: '01' },
      { id: 'scout',     label: 'Location Scout', index: '02' },
      { id: 'history',   label: 'History',        index: '03' },
    ],
  },
  {
    label: 'PLAN',
    items: [
      { id: 'calendar',  label: 'Calendar',       index: '04' },
      { id: 'cfe',       label: 'Bulletin Board', index: '05' },
    ],
  },
  {
    label: 'GROW',
    items: [
      { id: 'today',     label: 'Today',          index: '06' },
      { id: 'skills',    label: 'Skill Tree',     index: '07' },
      { id: 'askpro',    label: 'Ask a Pro',      index: '08' },
    ],
  },
  {
    label: 'YOU',
    items: [
      { id: 'profile',   label: 'Profile',        index: '09' },
      { id: 'gear',      label: 'Gear Locker',    index: '10' },
      { id: 'archive',   label: 'Archive',        index: '11' },
    ],
  },
];

const ALL_ITEMS = NAV_GROUPS.flatMap(g => g.items);

const Layout: React.FC<LayoutProps> = ({
  children,
  activeTab,
  setActiveTab,
  isFieldMode,
  user,
  onSignOut,
  statusReadouts,
  dailyQuote,
}) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  const [isNarrow, setIsNarrow] = useState(window.innerWidth < 820);

  useEffect(() => {
    const handler = () => setIsNarrow(window.innerWidth < 820);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  const handleTabChange = (id: string) => {
    setActiveTab(id);
    setIsMenuOpen(false);
  };

  const handleLogoClick = () => {
    setActiveTab('today');
    setIsMenuOpen(false);
  };

  const userInitials = (() => {
    if (!user) return 'PV';
    const name = user.displayName || user.email || '';
    const parts = name.trim().split(/[\s@]+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return (name.slice(0, 2) || 'PV').toUpperCase();
  })();

  const userName = user?.displayName || user?.email?.split('@')[0] || '';

  const activeItem = ALL_ITEMS.find(i => i.id === activeTab) || ALL_ITEMS[0];

  const defaultReadouts: StatusReadout[] = statusReadouts || [];

  const navItemClass = (id: string) => {
    const isActive = activeTab === id;
    return [
      'flex items-center gap-3 w-full text-left px-6 py-[9px]',
      'border-l-2 transition-colors duration-150',
      isActive
        ? 'border-l-brand-accent bg-[rgba(23,25,26,0.05)] text-brand-ink font-semibold'
        : 'border-l-transparent text-brand-ink/60 hover:bg-[rgba(23,25,26,0.045)] hover:text-brand-ink/80',
    ].join(' ');
  };

  const RAIL = (
    <div
      style={{ borderRight: '1px solid rgba(23,25,26,0.12)' }}
      className={[
        'bg-brand-panel flex flex-col flex-shrink-0',
        isNarrow ? 'w-full' : 'w-[244px] h-screen',
      ].join(' ')}
    >
      {/* Brand block */}
      <div
        style={{ borderBottom: '1px solid rgba(23,25,26,0.12)' }}
        className={[
          'flex items-center justify-between',
          isNarrow ? 'px-[18px] py-[14px]' : 'px-6 pt-7 pb-6',
        ].join(' ')}
      >
        <button onClick={handleLogoClick} className="text-left focus:outline-none">
          <div className="font-sans font-bold text-[19px] tracking-[0.04em] text-brand-ink leading-none">
            PHOTOVISE
          </div>
          <div className="font-mono text-[9px] tracking-[0.18em] text-brand-ink/42 mt-[6px] uppercase">
            Workflow Instrument
          </div>
        </button>

        {isNarrow && (
          <button
            onClick={() => setIsMenuOpen(o => !o)}
            style={{ border: '1px solid rgba(23,25,26,0.2)' }}
            className="font-mono text-[9px] tracking-[0.18em] uppercase px-[14px] min-h-[44px] text-brand-ink/70 hover:text-brand-ink transition-colors"
          >
            {isMenuOpen ? 'CLOSE' : 'MENU'}
          </button>
        )}
      </div>

      {/* Nav */}
      {(!isNarrow || isMenuOpen) && (
        <>
          <nav className={['flex-1 overflow-y-auto custom-scrollbar flex flex-col', isNarrow ? 'py-3' : 'py-5'].join(' ')} style={{ gap: '22px' }}>
            {NAV_GROUPS.map(group => (
              <div key={group.label}>
                <div
                  className="font-mono text-[9px] tracking-[0.22em] uppercase text-brand-ink/34 px-6 pb-2"
                >
                  {group.label}
                </div>
                {group.items.map(item => (
                  <button
                    key={item.id}
                    onClick={() => handleTabChange(item.id)}
                    className={navItemClass(item.id)}
                    style={{ minHeight: isNarrow ? '44px' : undefined }}
                  >
                    <span className="font-mono text-[9px] text-brand-ink/32 w-4 shrink-0">{item.index}</span>
                    <span className={['text-[13px]', activeTab === item.id ? 'font-semibold' : 'font-normal'].join(' ')}>
                      {item.label}
                    </span>
                  </button>
                ))}
              </div>
            ))}
          </nav>

          {/* Footer chip */}
          <div
            style={{ borderTop: '1px solid rgba(23,25,26,0.12)' }}
            className="flex-shrink-0 flex items-center gap-[10px] px-6 py-[18px]"
          >
            <div className="w-[26px] h-[26px] rounded-full bg-brand-ink flex items-center justify-center shrink-0">
              <span className="font-mono text-[9px] font-semibold text-brand-panel">{userInitials}</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[11px] font-medium text-brand-ink truncate">{userName || 'Eduardo'}</div>
              <div className="font-mono text-[9px] tracking-[0.14em] text-brand-ink/38 uppercase">Signed In</div>
            </div>
            {onSignOut && (
              <button
                onClick={onSignOut}
                title="Sign out"
                className="text-brand-ink/40 hover:text-brand-ink/70 transition-colors text-[11px]"
              >
                <i className="fa-solid fa-arrow-right-from-bracket"></i>
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );

  const STATUS_STRIP = (
    <div
      style={{ borderBottom: '1px solid rgba(23,25,26,0.12)' }}
      className={[
        'bg-brand-panel2 flex-shrink-0',
        isNarrow ? 'px-[18px]' : 'px-8',
      ].join(' ')}
    >
      {/* Quote bar */}
      {dailyQuote && (
        <div
          style={{ borderBottom: '1px solid rgba(23,25,26,0.08)', padding: '10px 0 9px' }}
          className="flex items-baseline gap-3"
        >
          <span style={{ flexShrink: 0, width: '3px', height: '28px', background: '#c9a227', display: 'inline-block', alignSelf: 'center' }} />
          <p className="font-serif italic" style={{ fontSize: '13px', color: 'rgba(23,25,26,0.70)', lineHeight: 1.5, flex: 1, minWidth: 0 }}>
            "{dailyQuote.text}"
            <span className="font-mono not-italic" style={{ fontSize: '8px', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(23,25,26,0.38)', marginLeft: '10px', whiteSpace: 'nowrap' }}>
              — {dailyQuote.author}
            </span>
          </p>
        </div>
      )}
      {/* Status row */}
      <div className="flex items-center justify-between flex-wrap gap-[6px_18px]" style={{ minHeight: '38px', paddingTop: '6px', paddingBottom: '6px' }}>
        <div className="flex items-center flex-wrap gap-[6px_22px]">
          {defaultReadouts.map(r => (
            <span key={r.label} className="font-mono text-[9px] tracking-[0.16em] text-brand-ink/50 uppercase">
              {r.label} <span className="text-brand-ink/75">{r.value}</span>
            </span>
          ))}
        </div>
        <div className="flex items-center gap-[6px]">
          <span className="pulse-brass w-[5px] h-[5px] rounded-full bg-brand-accent inline-block"></span>
          <span className="font-mono text-[9px] tracking-[0.16em] text-brand-accent-ink uppercase">Engine Active</span>
        </div>
      </div>
    </div>
  );

  if (isNarrow) {
    return (
      <div className="flex flex-col min-h-screen bg-brand-canvas">
        {RAIL}
        {STATUS_STRIP}
        <main className="flex-1 overflow-y-auto custom-scrollbar">
          <div className="px-[18px] py-[26px] pb-[64px]">
            {children}
          </div>
        </main>

        {/* Field mode bottom strip */}
        {isFieldMode && (
          <div
            style={{ borderTop: '1px solid rgba(23,25,26,0.14)' }}
            className="fixed inset-x-0 bottom-0 z-50 bg-brand-ink flex"
          >
            {(['today', 'askpro'] as const).map(id => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={[
                  'flex-1 flex flex-col items-center gap-1 py-3 text-[11px] font-mono tracking-[0.12em] uppercase transition-colors',
                  activeTab === id ? 'text-brand-accent' : 'text-white/60',
                ].join(' ')}
              >
                {id === 'today' ? 'Today' : 'Ask Pro'}
              </button>
            ))}
          </div>
        )}

        <button
          onClick={() => setIsFeedbackOpen(true)}
          style={{ bottom: isFieldMode ? '4.5rem' : '1.25rem' }}
          className="fixed right-4 z-50 font-mono text-[9px] tracking-[0.14em] uppercase bg-brand-ink text-brand-panel/80 px-3 py-2 transition-colors hover:bg-brand-accent hover:text-brand-ink"
        >
          Feedback
        </button>
        <FeedbackModal isOpen={isFeedbackOpen} onClose={() => setIsFeedbackOpen(false)} currentPage={activeTab} />
      </div>
    );
  }

  return (
    <div className="flex flex-row h-screen bg-brand-canvas overflow-hidden">
      {RAIL}
      <div className="flex-1 min-w-0 flex flex-col">
        {STATUS_STRIP}
        <main className="flex-1 overflow-y-auto custom-scrollbar">
          <div className="px-8 py-10 pb-[72px]" style={{ maxWidth: activeTab === 'askpro' ? '820px' : '1040px' }}>
            {children}
          </div>
        </main>
      </div>

      <button
        onClick={() => setIsFeedbackOpen(true)}
        className="fixed bottom-5 right-5 z-50 font-mono text-[9px] tracking-[0.14em] uppercase bg-brand-ink text-brand-panel/80 px-3 py-2 transition-colors hover:bg-brand-accent hover:text-brand-ink"
      >
        Feedback
      </button>
      <FeedbackModal isOpen={isFeedbackOpen} onClose={() => setIsFeedbackOpen(false)} currentPage={activeTab} />
    </div>
  );
};

export default Layout;
