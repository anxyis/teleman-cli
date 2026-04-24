import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Folders, Settings } from 'lucide-react';

const hideNavLabels = localStorage.getItem('hideNavLabels') === 'true';

export function MobileNav() {
  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 backdrop-blur-xl border-t pb-safe z-50 shadow-2xl transition-all duration-300 bg-slate-900/95 border-slate-800 h-16">
      <div className="flex items-center justify-around h-full pb-1">
        <NavLink
          to="/"
          className={({ isActive }) => `flex flex-col items-center gap-1 p-2 text-[10px] font-medium transition-all duration-200
            ${isActive
              ? 'text-blue-400 scale-105'
              : 'text-text-muted hover:text-text-main'}`
          }
        >
          <div className={`${window.location.pathname === '/' ? 'p-1 rounded-lg bg-blue-500/10' : ''}`}>
             <LayoutDashboard size={20} />
          </div>
          {!hideNavLabels && <span>Playground</span>}
        </NavLink>

        <NavLink
          to="/batch"
          className={({ isActive }) => `flex flex-col items-center gap-1 p-2 text-[10px] font-medium transition-all duration-200
            ${isActive
              ? 'text-blue-400 scale-105'
              : 'text-text-muted hover:text-text-main'}`
          }
        >
           <div className={`${window.location.pathname === '/batch' ? 'p-1 rounded-lg bg-blue-500/10' : ''}`}>
             <Folders size={20} />
           </div>
           {!hideNavLabels && <span>Batch</span>}
        </NavLink>

        <NavLink
          to="/autosyncer"
          className={({ isActive }) => `flex flex-col items-center gap-1 p-2 text-[10px] font-medium transition-all duration-200
            ${isActive
              ? 'text-purple-400 scale-105'
              : 'text-text-muted hover:text-text-main'}`
          }
        >
           <div className={`${window.location.pathname === '/autosyncer' ? 'p-1 rounded-lg bg-purple-500/10' : ''}`}>
             <Settings size={20} />
           </div>
           {!hideNavLabels && <span>Sync</span>}
        </NavLink>
      </div>
    </div>
  );
}
