import React from 'react';
import { NavLink } from 'react-router-dom';
import { DynamicIcon } from '../common/DynamicIcon';

interface ModernSidebarProps {
  children?: React.ReactNode;
  onOpenSettings?: () => void;
}

export function ModernSidebar({ children, onOpenSettings }: ModernSidebarProps) {
  return (
    <aside className="fixed left-0 top-0 bottom-0 w-64 bg-surface border-r border-border hidden lg:flex flex-col z-40 transition-all duration-300">

      {/* Brand */}
      <div className="h-16 flex items-center justify-center px-6 border-b border-border shrink-0">
        <div className="flex items-center gap-2 text-primary font-bold tracking-tight text-lg">
           <DynamicIcon name="terminal" size={24} />
           <span>TeleMan</span>
        </div>
      </div>

      {/* Nav Links */}
      <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
        <NavLink
          to="/"
          className={({ isActive }) => `flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group ${
            isActive
              ? 'bg-primary/10 text-primary font-bold'
              : 'text-text-muted hover:bg-surface-highlight hover:text-text-main'
          }`}
        >
           <DynamicIcon name="dashboard" size={20} />
           <span>Playground</span>
        </NavLink>

        <NavLink
          to="/batch"
          className={({ isActive }) => `flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group ${
            isActive
              ? 'bg-primary/10 text-primary font-bold'
              : 'text-text-muted hover:bg-surface-highlight hover:text-text-main'
          }`}
        >
           <DynamicIcon name="folders" size={20} />
           <span>Batch Sender</span>
        </NavLink>

        <NavLink
          to="/autosyncer"
          className={({ isActive }) => `flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group ${
            isActive
              ? 'bg-primary/10 text-primary font-bold'
              : 'text-text-muted hover:bg-surface-highlight hover:text-text-main'
          }`}
        >
           <DynamicIcon name="settings" size={20} />
           <span>Auto-Syncer</span>
        </NavLink>

        <NavLink
          to="/reverse-syncer"
          className={({ isActive }) => `flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group ${
            isActive
              ? 'bg-primary/10 text-primary font-bold'
              : 'text-text-muted hover:bg-surface-highlight hover:text-text-main'
          }`}
        >
           <DynamicIcon name="download" size={20} />
           <span>Reverse Syncer</span>
        </NavLink>

        {/* Global Settings Link */}
        {onOpenSettings && (
            <button
                onClick={onOpenSettings}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group text-text-muted hover:bg-surface-highlight hover:text-text-main"
            >
                <DynamicIcon name="settings" size={20} />
                <span>Settings</span>
            </button>
        )}
      </nav>

      {/* Optional Children (e.g. Bot Selector) */}
      {children && (
        <div className="p-4 border-t border-border shrink-0">
          {children}
        </div>
      )}

      {/* Footer / Bot Selector Placeholder */}
      <div className="p-4 border-t border-border shrink-0 text-xs text-text-muted text-center">
         v2.0 (Refactor)
      </div>

    </aside>
  );
}
