import React from 'react';
import { useTheme } from '../../context/ThemeContext';

interface PageLayoutProps {
  /** Main content area */
  children: React.ReactNode;

  /**
   * Desktop-only sidebar content.
   * On mobile, this might be rendered in a drawer or hidden.
   */
  sidebar?: React.ReactNode;

  /**
   * Page title/actions for mobile header.
   * On desktop, this might merge into the top bar or sidebar.
   */
  header?: React.ReactNode;

  /**
   * If true, disables the default container scroll on desktop
   * allowing children to manage their own scroll areas (e.g., chat apps).
   */
  disableScroll?: boolean;
}

export function PageLayout({ children, sidebar, header, disableScroll = false }: PageLayoutProps) {
  const { currentTheme } = useTheme();
  const hasBackground = currentTheme?.background?.enabled && currentTheme?.background?.imagePath;
  
  return (
    <div 
      className={`flex flex-col min-h-screen lg:h-screen text-text-main transition-colors duration-300 ${
        hasBackground ? 'bg-transparent' : 'bg-canvas'
      }`}
      key={currentTheme?.id + '-' + currentTheme?.background?.enabled}
    >

      {/* Mobile Header (lg:hidden) - Only show if header prop is provided */}
      {header && (
        <div
          className={`lg:hidden sticky top-0 z-40 border-b border-border flex items-center px-4 shrink-0 transition-all duration-300 min-h-[var(--h-header-mobile,64px)] py-2 ${
            hasBackground ? 'bg-surface/80' : 'bg-surface/80'
          }`}
        >
          {header}
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">

        {/* Desktop Sidebar (lg:block) */}
        {sidebar && (
          <aside
            className={`hidden lg:flex flex-col border-r border-border shrink-0 transition-all duration-300 ${
              hasBackground ? 'bg-transparent' : 'bg-surface'
            }`}
            style={{ width: 'var(--w-sidebar-desktop, 256px)' }}
          >
            {sidebar}
          </aside>
        )}

        {/* Main Content Area */}
        <main className={`flex-1 flex flex-col relative min-w-0 ${disableScroll ? 'overflow-hidden' : ''}`}>

          {/* Scroll Container */}
          <div
            className={`flex-1 w-full transition-all duration-300 ${
              disableScroll
                ? 'overflow-hidden flex flex-col'
                : 'overflow-y-auto'
            }`}
          >
             <div className="p-4 lg:p-6 pb-[var(--h-nav-mobile,80px)] lg:pb-6 min-h-full">
                {children}
             </div>
          </div>

        </main>
      </div>
    </div>
  );
}
