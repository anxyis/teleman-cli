import { useState, useEffect, useLayoutEffect } from 'react';
import { api } from './api/bridge';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { Playground } from './pages/Playground';
import { BatchSender } from './pages/BatchSender';
import { AutoSyncer } from './pages/AutoSyncer';
import ReverseSyncer from './pages/ReverseSyncer';
import { SettingsModal } from './components/SettingsModal';
import { LogsPage } from './pages/LogsPage';
import { WelcomeScreen } from './components/WelcomeScreen';
import { ThemeProvider } from './context/ThemeContext';
import { AppLayout } from './layouts/AppLayout';

function ScrollToTop() {
  const { pathname } = useLocation();
  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [pathname]);
  return null;
}

function AppContent() {
  const [activeToken, setActiveToken] = useState('');
  const [savedBots, setSavedBots] = useState([]);
  const [showSettings, setShowSettings] = useState(false);
  const [loadingConfig, setLoadingConfig] = useState(true);

  const fetchConfig = async () => {
    try {
      const config = await api.getConfig();
      setActiveToken(config.activeToken);
      setSavedBots(config.savedBots as never[]);
    } catch (e) {
      console.error("Failed to fetch config", e);
    } finally {
      setLoadingConfig(false);
    }
  };

  useEffect(() => {
    fetchConfig();
  }, []);

  return (
    <BrowserRouter>
      <ScrollToTop />
      <AppLayout
        activeToken={activeToken}
        savedBots={savedBots}
        onBotChange={fetchConfig}
        onOpenSettings={() => setShowSettings(true)}
      >
        {loadingConfig ? (
          <div className="flex h-[50vh] items-center justify-center text-text-muted">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : (savedBots.length === 0) ? (
          <WelcomeScreen onAddBot={fetchConfig} />
        ) : (
          <Routes>
            <Route path="/" element={<Playground currentToken={activeToken} />} />
            <Route path="/batch" element={<BatchSender currentToken={activeToken} />} />
            <Route path="/autosyncer" element={<AutoSyncer />} />
            <Route path="/reverse-syncer" element={<ReverseSyncer />} />
            <Route path="/autosyncer/logs" element={<LogsPage />} />
          </Routes>
        )}
      </AppLayout>

      <SettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
      />
    </BrowserRouter>
  );
}

function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}

export default App;
