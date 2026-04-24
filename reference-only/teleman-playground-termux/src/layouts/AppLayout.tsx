import React, { useState, useEffect } from 'react';
import { useTheme } from '../context/ThemeContext';
import { useStats } from '../hooks/useStats';
import { ModernHeader } from '../components/ModernHeader';
import { ModernBottomNav } from '../components/ModernBottomNav';
import { ModernSidebar } from '../components/navigation/ModernSidebar';
import { BotSelector } from '../components/BotSelector';
import { NetworkErrorNotification } from '../components/NetworkErrorNotification';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';

interface AppLayoutProps {
  children: React.ReactNode;
  activeToken: string;
  savedBots: any[];
  onBotChange: () => void;
  onOpenSettings: () => void;
}

export function AppLayout({ children, activeToken, savedBots, onBotChange, onOpenSettings }: AppLayoutProps) {
  const { currentTheme } = useTheme();
  const { stats } = useStats(2500);
  const [invertedLayout, setInvertedLayout] = useState(() => localStorage.getItem('invertedLayout') === 'true');

  useEffect(() => {
    const handleSettingsChange = (e: CustomEvent) => {
      if (e.detail.invertedLayout !== undefined) setInvertedLayout(e.detail.invertedLayout);
    };
    window.addEventListener('settingsChanged', handleSettingsChange as EventListener);
    return () => window.removeEventListener('settingsChanged', handleSettingsChange as EventListener);
  }, []);

  return (
    <div
      className={`min-h-screen text-text-main transition-colors duration-300 flex flex-col relative ${
        currentTheme?.background?.enabled ? 'bg-transparent' : 'bg-canvas'
      }`}
      key={currentTheme?.id + '-' + currentTheme?.background?.enabled}
    >
      {/* Theme Background Image */}
      {currentTheme?.background?.enabled && currentTheme?.background?.imagePath && (
        <div
          id="theme-background"
          key="theme-bg"
          className="fixed inset-0 bg-cover bg-center bg-no-repeat transition-opacity duration-300"
          style={{
            backgroundImage: `url(${API_BASE}/api/backgrounds/${currentTheme.background.imagePath})`,
            opacity: currentTheme.background.opacity || 0.5,
            zIndex: -1
          }}
        />
      )}

      {/* Network Error Notification */}
      <NetworkErrorNotification />

      {/* Desktop Sidebar (lg:flex) */}
      <ModernSidebar onOpenSettings={onOpenSettings}>
          <BotSelector
             currentBotToken={activeToken}
             savedBots={savedBots}
             onBotChange={onBotChange}
             onOpenSettings={onOpenSettings}
          />
      </ModernSidebar>

      {/* Mobile Top Element */}
      <div className="lg:hidden shrink-0">
          {invertedLayout ? (
            <ModernBottomNav position="top" />
          ) : (
            <ModernHeader
                activeToken={activeToken}
                savedBots={savedBots}
                onBotChange={onBotChange}
                onOpenSettings={onOpenSettings}
                position="top"
                stats={stats}
            />
          )}
      </div>

      {/* Main Content Wrapper */}
      <div className="lg:pl-[var(--w-sidebar-desktop,256px)] transition-all duration-300 flex-1 flex flex-col">
        {/* Content */}
        <main className={`flex-1 w-full max-w-7xl mx-auto p-0 lg:pb-0 relative ${invertedLayout ? 'pt-[var(--h-nav-mobile,96px)]' : 'pb-[var(--h-nav-mobile,96px)]'}`}>
            {children}
        </main>
      </div>

      {/* Mobile Bottom Element */}
      <div className="lg:hidden">
          {invertedLayout ? (
            <ModernHeader
                activeToken={activeToken}
                savedBots={savedBots}
                onBotChange={onBotChange}
                onOpenSettings={onOpenSettings}
                position="bottom"
            />
          ) : (
            <ModernBottomNav position="bottom" />
          )}
      </div>
    </div>
  );
}
