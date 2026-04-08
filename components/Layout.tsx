import React, { useState } from 'react';

interface UserLike {
  displayName?: string | null;
  email?: string | null;
  photoURL?: string | null;
}

interface LayoutProps {
  children: React.ReactNode;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  workflowSummary?: React.ReactNode;
  isFieldMode?: boolean;
  /** Authenticated Firebase user (optional — passed by App.tsx after auth gate) */
  user?: UserLike | null;
  /** Called when the user clicks "Sign out" */
  onSignOut?: () => void;
}

const Layout: React.FC<LayoutProps> = ({ children, activeTab, setActiveTab, workflowSummary, isFieldMode, user, onSignOut }) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: 'fa-gauge' },
    { id: 'profile', label: 'Profile', icon: 'fa-user-gear' },
    { id: 'planner', label: 'Assignment Planner', icon: 'fa-calendar-days' },
    { id: 'assignment', label: 'Assignment Mode', icon: 'fa-bolt' },
    { id: 'processing', label: 'Processing Guides', icon: 'fa-wand-sparkles' },
    { id: 'askpro', label: 'Ask a Pro', icon: 'fa-comments' },
    { id: 'calendar', label: 'Calendar', icon: 'fa-calendar' },
    { id: 'journal', label: 'Journal', icon: 'fa-book-open' },
    { id: 'gear', label: 'Gear Locker', icon: 'fa-toolbox' },
    { id: 'cfe', label: 'Bulletin Board', icon: 'fa-trophy' },
    { id: 'archive', label: 'Archive', icon: 'fa-box-archive' },
  ];

  const handleTabChange = (id: string) => {
    setActiveTab(id);
    setIsMenuOpen(false);
  };

  const handleLogoClick = () => {
    setActiveTab('dashboard');
    setIsMenuOpen(false);
  };

  const isCoreFieldItem = (label: string) => ['Assignment Mode', 'Processing Guides', 'Ask a Pro'].includes(label);
  const isDashboard = (label: string) => label === 'Dashboard';

  // Navigation items to show in the mobile dropdown based on mode
  const normalMobileLabels = [
    'Dashboard',
    'Profile',
    'Assignment Planner',
    'Assignment Mode',
    'Processing Guides',
    'Ask a Pro',
    'Calendar',
    'Journal',
    'Gear Locker',
    'Bulletin Board',
    'Archive',
  ];

  const fieldMobileLabels = [
    'Dashboard',
    'Assignment Mode',
    'Processing Guides',
    'Ask a Pro',
  ];

  const mobileNavItems = navItems.filter((item) =>
    isFieldMode
      ? fieldMobileLabels.includes(item.label)
      : normalMobileLabels.includes(item.label)
  );

  const activeNavItem = navItems.find(item => item.id === activeTab) ||
    navItems.find(item => activeTab.startsWith(item.id + '-')) ||
    navItems[0];

  // Derive user initials for the avatar
  const userInitials = (() => {
    if (!user) return '';
    const name = user.displayName || user.email || '';
    const parts = name.trim().split(/[\s@]+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
  })();

  return (
    <div className={`flex flex-col md:flex-row md:h-screen ${isFieldMode ? 'pb-20' : ''}`}>
      {/* Mobile Navigation Header */}
      <nav className="md:hidden bg-brand-black text-brand-white sticky top-0 z-50 border-b border-white/5">
        <div className="px-6 py-4 flex items-center justify-between">
          <button onClick={handleLogoClick} className="text-left focus:outline-none">
            <h1 className="text-2xl font-display leading-none text-brand-rose tracking-wider cursor-pointer">
              PHOTOVISE
            </h1>
          </button>

          <div className="flex items-center gap-3">
            {/* Mobile: user avatar + sign-out */}
            {user && onSignOut && (
              <button
                onClick={onSignOut}
                title="Sign out"
                className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-sm px-3 py-1.5 text-[9px] font-bold uppercase tracking-[0.2em] text-brand-gray hover:text-brand-rose transition-all active:scale-95"
              >
                {user.photoURL ? (
                  <img src={user.photoURL} alt="avatar" className="w-4 h-4 rounded-full object-cover" />
                ) : (
                  <span className="w-4 h-4 rounded-full bg-brand-blue flex items-center justify-center text-[7px] font-bold text-white">
                    {userInitials}
                  </span>
                )}
                <i className="fa-solid fa-arrow-right-from-bracket text-[9px]"></i>
              </button>
            )}

            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="flex items-center gap-3 bg-white/5 px-4 py-2 rounded-sm border border-white/10 text-[10px] font-bold uppercase tracking-[0.2em] transition-all active:scale-95 min-w-[140px] justify-between"
            >
              <span className="font-display text-xs truncate max-w-[100px]">
                {isMenuOpen ? 'CLOSE' : activeNavItem.label}
              </span>
              <i className={`fa-solid ${isMenuOpen ? 'fa-xmark' : 'fa-chevron-down'} text-brand-rose`}></i>
            </button>
          </div>
        </div>

        {/* Mobile Dropdown Menu */}
        {isMenuOpen && (
          <div className="bg-brand-white border-b border-brand-black/5 animate-in slide-in-from-top duration-300 max-h-[70vh] overflow-y-auto custom-scrollbar">
            <div className="flex flex-col py-2">
              {mobileNavItems.map((item) => {
                // Uniform styling for all items in the mobile dropdown
                return (
                  <button
                    key={item.id}
                    onClick={() => handleTabChange(item.id)}
                    className={`flex items-center gap-4 px-8 py-5 text-[10px] font-bold uppercase tracking-[0.2em] transition-all text-left border-l-4 ${
                      activeTab === item.id || activeTab.startsWith(item.id + '-')
                        ? 'bg-brand-black/5 text-brand-rose border-brand-rose'
                        : 'text-brand-black border-transparent hover:bg-brand-black/5'
                    }`}
                  >
                    <i className={`fa-solid ${item.icon} w-5 text-sm`}></i>
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </nav>

      {/* Desktop Sidebar Navigation */}
      <nav className="hidden md:flex flex-col w-64 bg-brand-black text-brand-white flex-shrink-0 border-r border-white/5 z-20 h-screen">
        <div className="p-10 flex-shrink-0">
          <button onClick={handleLogoClick} className="text-left focus:outline-none">
            <h1 className="text-4xl font-display leading-none text-brand-rose cursor-pointer">
              PHOTOVISE
            </h1>
          </button>
          <p className="text-[9px] text-brand-gray mt-2 uppercase tracking-[0.3em] font-bold">Photography workflow assistant</p>
        </div>

        <div className="flex flex-col flex-1 overflow-y-auto custom-scrollbar mt-4">
          {navItems.map((item) => {
            const fieldClasses = isFieldMode
              ? isCoreFieldItem(item.label)
                ? 'font-bold text-white scale-105'
                : isDashboard(item.label)
                  ? ''
                  : 'opacity-30'
              : '';
            return (
              <button
                key={item.id}
                onClick={() => handleTabChange(item.id)}
                className={`flex items-center gap-4 px-10 py-5 text-[10px] font-bold uppercase tracking-[0.2em] transition-all border-l-4 ${
                  activeTab === item.id || activeTab.startsWith(item.id + '-')
                    ? 'bg-white/5 text-white border-brand-rose shadow-[inset_10px_0_15px_-10px_rgba(212,165,165,0.1)]'
                    : 'text-brand-gray border-transparent hover:text-brand-rose hover:bg-white/5'
                } ${fieldClasses}`}
              >
                <i className={`fa-solid ${item.icon} w-5 text-sm`}></i>
                {item.label}
              </button>
            );
          })}
        </div>

        {/* Desktop-only System Status */}
        {!isFieldMode && (
          <div className="flex-shrink-0 p-10 space-y-4 border-t border-white/5">
            <div className="bg-white/5 p-5 rounded-sm border border-white/5">
              <p className="text-[9px] font-bold text-brand-gray uppercase tracking-[0.3em] mb-4">SYSTEM STATUS</p>
              <div className="space-y-3">
                {workflowSummary ? (
                  <div className="text-[10px] font-bold text-white/40 leading-relaxed uppercase tracking-[0.2em]">
                    {workflowSummary}
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-3 text-[10px] font-bold text-white/50 uppercase tracking-widest">
                      <span className="w-1.5 h-1.5 rounded-full bg-brand-blue animate-pulse"></span>
                      <span>ENGINE IDLE</span>
                    </div>
                    <div className="flex items-center gap-3 text-[10px] font-bold text-white/50 uppercase tracking-widest">
                      <span className="w-1.5 h-1.5 rounded-full bg-brand-rose"></span>
                      <span>AWAITING INPUT</span>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* User avatar + sign-out (desktop) */}
            {user && onSignOut && (
              <div className="flex items-center gap-3 bg-white/5 p-4 rounded-sm border border-white/5">
                {/* Avatar */}
                {user.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt="avatar"
                    className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-brand-blue flex items-center justify-center flex-shrink-0">
                    <span className="text-[9px] font-bold text-white">{userInitials}</span>
                  </div>
                )}

                {/* Name / email */}
                <div className="flex-1 min-w-0">
                  <p className="text-[9px] font-bold text-white/70 uppercase tracking-[0.15em] truncate">
                    {user.displayName || user.email?.split('@')[0] || 'Signed in'}
                  </p>
                  <p className="text-[8px] text-brand-gray/50 uppercase tracking-widest truncate">
                    {user.email || ''}
                  </p>
                </div>

                {/* Sign out */}
                <button
                  onClick={onSignOut}
                  title="Sign out"
                  className="flex-shrink-0 text-brand-gray/50 hover:text-brand-rose transition-colors"
                >
                  <i className="fa-solid fa-arrow-right-from-bracket text-[11px]"></i>
                </button>
              </div>
            )}
          </div>
        )}
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 bg-brand-white overflow-y-auto custom-scrollbar">
        <div className="max-w-5xl mx-auto p-6 md:p-14">
          {children}
        </div>
      </main>

      {/* Field Mode Quick Access Bottom Strip */}
      {isFieldMode && (
        <div className="fixed inset-x-0 bottom-0 z-50 bg-brand-black/95 backdrop-blur-md border-t border-white/10 px-4 py-3 animate-in slide-in-from-bottom duration-300">
          <div className="max-w-md mx-auto flex items-center justify-between gap-3">
            <button
              onClick={() => setActiveTab('assignment')}
              className={`flex-1 flex flex-col items-center gap-1 py-2 rounded-sm transition-all ${
                activeTab === 'assignment' ? 'bg-brand-rose text-white' : 'bg-white/5 text-white/60'
              }`}
            >
              <i className="fa-solid fa-bolt text-xs"></i>
              <span className="text-[8px] font-bold uppercase tracking-tighter">Assignment</span>
            </button>
            <button
              onClick={() => setActiveTab('processing')}
              className={`flex-1 flex flex-col items-center gap-1 py-2 rounded-sm transition-all ${
                activeTab === 'processing' ? 'bg-brand-rose text-white' : 'bg-white/5 text-white/60'
              }`}
            >
              <i className="fa-solid fa-wand-sparkles text-xs"></i>
              <span className="text-[8px] font-bold uppercase tracking-tighter">Guides</span>
            </button>
            <button
              onClick={() => setActiveTab('askpro')}
              className={`flex-1 flex flex-col items-center gap-1 py-2 rounded-sm transition-all ${
                activeTab === 'askpro' ? 'bg-brand-rose text-white' : 'bg-white/5 text-white/60'
              }`}
            >
              <i className="fa-solid fa-comments text-xs"></i>
              <span className="text-[8px] font-bold uppercase tracking-tighter">Ask Pro</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Layout;
