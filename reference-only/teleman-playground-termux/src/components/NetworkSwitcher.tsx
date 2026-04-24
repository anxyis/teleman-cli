import { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { DynamicIcon } from './common/DynamicIcon';
import type { IconName } from './common/DynamicIcon';
import { ResponsiveModal } from './common/ResponsiveModal';
import axios from 'axios';

const API_BASE = '';

interface NetworkSwitcherProps {
    onNetworkChange?: (mode: 'primary' | 'fallback' | 'tailscale') => void;
}

// Helper hook for media query
function useIsMobile() {
    const [isMobile, setIsMobile] = useState(false);
    useEffect(() => {
        const check = () => setIsMobile(window.innerWidth < 1024); // lg breakpoint
        check();
        window.addEventListener('resize', check);
        return () => window.removeEventListener('resize', check);
    }, []);
    return isMobile;
}

export function NetworkSwitcher({ onNetworkChange }: NetworkSwitcherProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [currentMode, setCurrentMode] = useState<'primary' | 'fallback' | 'tailscale'>('primary');
    const [networkConfig, setNetworkConfig] = useState<any>(null);
    const [isSwitching, setIsSwitching] = useState(false);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const [coords, setCoords] = useState({ top: 0, left: 0, width: 256, maxHeight: 300 });
    const isMobile = useIsMobile();

    const fetchNetworkStatus = async () => {
        try {
            const res = await axios.get(`${API_BASE}/api/network/status`);
            setNetworkConfig(res.data);
            setCurrentMode(res.data.mode);
        } catch (e) {
            console.error('Failed to fetch network status', e);
        }
    };

    useEffect(() => {
        fetchNetworkStatus();

        // Listen for network mode changes from backend
        const handleNetworkChange = (e: CustomEvent) => {
            if (e.detail?.mode) {
                setCurrentMode(e.detail.mode);
                fetchNetworkStatus();
            }
        };
        window.addEventListener('networkModeChanged', handleNetworkChange as EventListener);

        // Listen for open event from error notification
        const handleOpenSwitcher = () => setIsOpen(true);
        window.addEventListener('openNetworkSwitcher', handleOpenSwitcher as EventListener);

        return () => {
            window.removeEventListener('networkModeChanged', handleNetworkChange as EventListener);
            window.removeEventListener('openNetworkSwitcher', handleOpenSwitcher as EventListener);
        };
    }, []);

    // Calculate position for Desktop Dropdown
    useLayoutEffect(() => {
        if (isOpen && !isMobile && triggerRef.current) {
            const rect = triggerRef.current.getBoundingClientRect();
            const viewportHeight = window.innerHeight;
            const spaceBelow = viewportHeight - rect.bottom;
            const spaceAbove = rect.top;
            
            setCoords({
                top: spaceBelow > spaceAbove ? rect.bottom + 8 : rect.top - 320,
                left: rect.left,
                width: rect.width,
                maxHeight: Math.max(spaceBelow, spaceAbove) - 16
            });
        }
    }, [isOpen, isMobile]);

    const handleSwitch = async (mode: 'primary' | 'fallback' | 'tailscale') => {
        setIsSwitching(true);
        try {
            const res = await axios.post(`${API_BASE}/api/network/switch`, { mode });
            if (res.data.success) {
                setCurrentMode(mode);
                onNetworkChange?.(mode);
                fetchNetworkStatus();
            }
        } catch (e: any) {
            alert(`Failed to switch network: ${e.response?.data?.error || 'Unknown error'}`);
        } finally {
            setIsSwitching(false);
            setIsOpen(false);
        }
    };

    const getModeLabel = (mode: string) => {
        if (mode === 'primary') return 'Local LAN (Primary)';
        if (mode === 'fallback') return 'Local LAN (Fallback)';
        if (mode === 'tailscale') return 'Tailscale (Remote)';
        return mode;
    };

    const getModeColor = (mode: string) => {
        if (mode === 'primary') return 'text-emerald-400';
        if (mode === 'fallback') return 'text-amber-400';
        if (mode === 'tailscale') return 'text-blue-400';
        return 'text-text-muted';
    };

    const getNetworkIcon = (mode: string): IconName => {
        if (mode === 'tailscale') return 'tailscale';
        if (mode === 'fallback') return 'refresh';
        return 'wifi';
    };

    // Network List Content
    const renderNetworkList = () => (
        <div className="space-y-1">
            {/* Primary */}
            <button
                onClick={() => handleSwitch('primary')}
                disabled={isSwitching || !networkConfig?.primary?.configured}
                className={`w-full flex items-center justify-between p-2.5 rounded-xl transition-all ${
                    currentMode === 'primary'
                        ? 'bg-primary/10 border border-primary/30'
                        : 'hover:bg-surface-highlight border border-transparent'
                } ${!networkConfig?.primary?.configured ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
                <div className="flex items-center gap-2">
                    <DynamicIcon name={getNetworkIcon('primary')} size={18} className="text-emerald-400" />
                    <div className="text-left">
                        <p className="text-xs font-medium text-text-main">Local LAN (Primary)</p>
                        <p className="text-[10px] text-text-muted truncate max-w-[150px]">
                            {networkConfig?.primary?.url || 'Not configured'}
                        </p>
                    </div>
                </div>
                {currentMode === 'primary' && (
                    <DynamicIcon name="check" size={14} className="text-primary" />
                )}
            </button>

            {/* Fallback */}
            <button
                onClick={() => handleSwitch('fallback')}
                disabled={isSwitching || !networkConfig?.fallback?.configured}
                className={`w-full flex items-center justify-between p-2.5 rounded-xl transition-all ${
                    currentMode === 'fallback'
                        ? 'bg-amber-500/10 border border-amber-500/30'
                        : 'hover:bg-surface-highlight border border-transparent'
                } ${!networkConfig?.fallback?.configured ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
                <div className="flex items-center gap-2">
                    <DynamicIcon name={getNetworkIcon('fallback')} size={18} className="text-amber-400" />
                    <div className="text-left">
                        <p className="text-xs font-medium text-text-main">Local LAN (Fallback)</p>
                        <p className="text-[10px] text-text-muted truncate max-w-[150px]">
                            {networkConfig?.fallback?.url || 'Not configured'}
                        </p>
                    </div>
                </div>
                {currentMode === 'fallback' && (
                    <DynamicIcon name="check" size={14} className="text-amber-400" />
                )}
            </button>

            {/* Tailscale */}
            <button
                onClick={() => handleSwitch('tailscale')}
                disabled={isSwitching || !networkConfig?.tailscale?.configured}
                className={`w-full flex items-center justify-between p-2.5 rounded-xl transition-all ${
                    currentMode === 'tailscale'
                        ? 'bg-blue-500/10 border border-blue-500/30'
                        : 'hover:bg-surface-highlight border border-transparent'
                } ${!networkConfig?.tailscale?.configured ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
                <div className="flex items-center gap-2">
                    <DynamicIcon name={getNetworkIcon('tailscale')} size={18} className="text-blue-400" />
                    <div className="text-left">
                        <p className="text-xs font-medium text-text-main">Tailscale (Remote)</p>
                        <p className="text-[10px] text-text-muted truncate max-w-[150px]">
                            {networkConfig?.tailscale?.url || 'Not configured'}
                        </p>
                    </div>
                </div>
                {currentMode === 'tailscale' && (
                    <DynamicIcon name="check" size={14} className="text-blue-400" />
                )}
            </button>
        </div>
    );

    return (
        <>
            <button
                ref={triggerRef}
                onClick={() => setIsOpen(!isOpen)}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl border transition-all group relative overflow-hidden
                    bg-surface-highlight/80 border-border/50 hover:bg-surface-highlight hover:border-border/50 active:scale-95
                `}
            >
                {currentMode === 'tailscale' ? (
                    <DynamicIcon name="tailscale" size={18} className={getModeColor(currentMode)} />
                ) : (
                    <DynamicIcon name="wifi" size={18} className={getModeColor(currentMode)} />
                )}
                <span className="text-sm font-bold text-text-main hidden sm:inline">{getModeLabel(currentMode)}</span>
            </button>

            {/* Mobile - Responsive Modal */}
            {isMobile && (
                <ResponsiveModal
                    isOpen={isOpen}
                    onClose={() => setIsOpen(false)}
                    title="Switch Network"
                >
                    {renderNetworkList()}
                </ResponsiveModal>
            )}

            {/* Desktop - Dropdown Popup */}
            {!isMobile && isOpen && (
                <>
                    <div
                        className="fixed inset-0 z-40"
                        onClick={() => setIsOpen(false)}
                    />
                    <div
                        className="fixed z-50 bg-surface border border-border rounded-xl shadow-xl overflow-hidden"
                        style={{
                            top: coords.top,
                            left: coords.left,
                            width: coords.width,
                            maxHeight: coords.maxHeight
                        }}
                    >
                        <div className="p-3 border-b border-border/50">
                            <p className="text-xs font-bold text-text-muted uppercase">Switch Network</p>
                        </div>
                        <div className="p-2">
                            {renderNetworkList()}
                        </div>
                        {isSwitching && (
                            <div className="p-3 border-t border-border/50 bg-surface-highlight/30">
                                <div className="flex items-center gap-2 text-xs text-text-muted">
                                    <DynamicIcon name="loader" size={12} className="animate-spin" />
                                    <span>Switching network...</span>
                                </div>
                            </div>
                        )}
                    </div>
                </>
            )}
        </>
    );
}
