import { NavLink, useLocation } from 'react-router-dom';
import { DynamicIcon } from './common/DynamicIcon';
import { motion } from 'framer-motion';

const NAV_ITEMS = [
  { to: '/', icon: 'dashboard', label: 'Play' },
  { to: '/batch', icon: 'folders', label: 'Batch' },
  { to: '/autosyncer', icon: 'settings', label: 'Sync' },
  { to: '/reverse-syncer', icon: 'download', label: 'Down' }
];

const hideNavLabels = localStorage.getItem('hideNavLabels') === 'true';

interface ModernBottomNavProps {
  position?: 'top' | 'bottom';
}

export function ModernBottomNav({ position = 'bottom' }: ModernBottomNavProps) {
  const location = useLocation();

  return (
    <div className={`fixed ${position === 'top' ? 'top-0' : 'bottom-6'} left-0 right-0 z-50 flex justify-center ${position === 'top' ? '' : 'px-6'} pointer-events-none`}>
      <nav
        className={`pointer-events-auto flex items-center gap-1 bg-surface/80 backdrop-blur-2xl border-border/50 p-1.5 shadow-2xl transition-all ${position === 'top' ? 'w-full justify-around border-b rounded-none' : 'border'}`}
        style={{ borderRadius: position === 'top' ? '0' : 'var(--radius-navbar, 100px)' }}
      >
        {NAV_ITEMS.map((item) => {
          const isActive = location.pathname === item.to || (item.to !== '/' && location.pathname.startsWith(item.to));

          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={`relative flex items-center gap-2 px-5 py-2.5 transition-colors ${isActive ? 'text-on-primary' : 'text-text-muted hover:text-text-main'}`}
            >
              {isActive && (
                <motion.div
                  layoutId="nav-pill"
                  className="absolute inset-0 bg-primary border border-primary/20"
                  style={{
                    borderRadius: 'var(--radius-navbar, 100px)',
                    boxShadow: '0 10px 20px -5px rgba(var(--color-primary-rgb, 187, 134, 252), var(--glow-opacity, 0.2))'
                  }}
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                />
              )}

              <div className="relative flex items-center gap-2">
                <DynamicIcon name={item.icon as any} size={20} />
                {!hideNavLabels && <span className="text-xs font-bold tracking-tight">{item.label}</span>}
              </div>
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}

