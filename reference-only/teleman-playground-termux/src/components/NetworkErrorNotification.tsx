import { useState, useEffect } from 'react';
import { DynamicIcon } from './common/DynamicIcon';
import axios from 'axios';

const API_BASE = '';

interface NetworkError {
    mode: string;
    message: string;
    timestamp: number;
}

export function NetworkErrorNotification() {
    const [error, setError] = useState<NetworkError | null>(null);
    const [showNotification, setShowNotification] = useState(false);

    useEffect(() => {
        // Poll for network errors every 5 seconds
        const checkError = async () => {
            try {
                const res = await axios.get(`${API_BASE}/api/network/status`);
                if (res.data.error && !error) {
                    // New error detected
                    setError(res.data.error);
                    setShowNotification(true);
                } else if (!res.data.error) {
                    // Error cleared
                    setError(null);
                    setShowNotification(false);
                }
            } catch (e) {
                console.error('Failed to check network error', e);
            }
        };

        checkError();
        const interval = setInterval(checkError, 5000);
        return () => clearInterval(interval);
    }, [error]);

    const handleClearError = async () => {
        try {
            await axios.post(`${API_BASE}/api/network/clear-error`);
            setError(null);
            setShowNotification(false);
        } catch (e) {
            console.error('Failed to clear error', e);
        }
    };

    const handleRetry = async () => {
        // Just clear the error and let the system retry on next health check
        await handleClearError();
    };

    const handleSwitch = () => {
        // Dispatch custom event to open network switcher
        window.dispatchEvent(new CustomEvent('openNetworkSwitcher'));
        handleClearError();
    };

    if (!showNotification || !error) return null;

    const getModeName = (mode: string) => {
        if (mode === 'primary') return 'Local LAN (Primary)';
        if (mode === 'fallback') return 'Local LAN (Fallback)';
        if (mode === 'tailscale') return 'Tailscale (Remote)';
        return mode;
    };

    return (
        <div className="fixed bottom-24 left-4 right-4 sm:left-auto sm:right-4 sm:w-96 z-50 animate-in slide-in-from-bottom-4 duration-300">
            <div className="bg-rose-500/95 backdrop-blur-sm border border-rose-400/50 rounded-xl shadow-2xl shadow-rose-900/50 overflow-hidden">
                {/* Header */}
                <div className="flex items-center gap-3 p-4 border-b border-rose-400/30">
                    <div className="p-2 bg-rose-400/20 rounded-lg">
                        <DynamicIcon name="alert" size={20} className="text-rose-300" />
                    </div>
                    <div className="flex-1">
                        <p className="text-sm font-bold text-white">Network Connection Failed</p>
                        <p className="text-xs text-rose-200">{getModeName(error.mode)}</p>
                    </div>
                    <button
                        onClick={handleClearError}
                        className="p-1.5 hover:bg-rose-400/20 rounded-lg transition-colors"
                    >
                        <DynamicIcon name="x" size={16} className="text-rose-200" />
                    </button>
                </div>

                {/* Body */}
                <div className="p-4">
                    <p className="text-sm text-white/90 mb-4">{error.message}</p>
                    
                    <div className="flex gap-2">
                        <button
                            onClick={handleRetry}
                            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-rose-400/20 hover:bg-rose-400/30 border border-rose-300/30 rounded-lg text-xs font-medium text-white transition-all"
                        >
                            <DynamicIcon name="refresh" size={14} />
                            Retry
                        </button>
                        <button
                            onClick={handleSwitch}
                            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-white text-rose-600 hover:bg-rose-50 rounded-lg text-xs font-bold transition-all"
                        >
                            <DynamicIcon name="wifi" size={14} />
                            Switch Network
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
