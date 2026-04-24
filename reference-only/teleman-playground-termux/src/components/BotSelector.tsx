import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { Bot, Check, Settings, Loader2, ChevronsUpDown, ChevronDown } from 'lucide-react';
import { api } from '../api/bridge';
import { ResponsiveModal } from './common/ResponsiveModal';

interface SavedBot {
    name: string;
    token: string;
    avatar_filename?: string;
}

interface BotSelectorProps {
    currentBotToken: string;
    savedBots: SavedBot[];
    onBotChange: () => void;
    onOpenSettings: () => void;
    isCompact?: boolean;
}

// Helper hook for media query
function useIsMobile() {
    const [isMobile, setIsMobile] = useState(false);
    useEffect(() => {
        const check = () => setIsMobile(window.innerWidth < 1024); // lg breakpoint matches AppLayout switch
        check();
        window.addEventListener('resize', check);
        return () => window.removeEventListener('resize', check);
    }, []);
    return isMobile;
}

export function BotSelector({ currentBotToken, savedBots, onBotChange, onOpenSettings, isCompact = false }: BotSelectorProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [switching, setSwitching] = useState<string | null>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const [coords, setCoords] = useState({ top: 0, left: 0, width: 256, maxHeight: 300 });
    const isMobile = useIsMobile();

    // Get current bot info
    const currentBot = savedBots.find(b => b.token === currentBotToken);
    const displayName = currentBot?.name || (currentBotToken ? 'Unknown Bot' : 'No Bot Selected');

    // Calculate position for Desktop Dropdown
    useLayoutEffect(() => {
        if (isOpen && !isMobile && triggerRef.current) {
            const rect = triggerRef.current.getBoundingClientRect();
            const viewportHeight = window.innerHeight;
            const spaceBelow = viewportHeight - rect.bottom;
            const spaceAbove = rect.top;

            const dropdownHeight = Math.min(300, (savedBots.length * 50) + 100);

            let top = rect.bottom + 8;
            let maxHeight = spaceBelow - 20;

            if (spaceBelow < dropdownHeight && spaceAbove > spaceBelow) {
                top = rect.top - 8;
                maxHeight = spaceAbove - 20;
            }

            setCoords({
                top,
                left: rect.left,
                width: 280,
                maxHeight
            });
        }
    }, [isOpen, savedBots.length, isMobile]);

    // Close on outside click (Desktop)
    useEffect(() => {
        if (!isOpen || isMobile) return;

        const handleClickOutside = (event: MouseEvent) => {
            if (triggerRef.current && triggerRef.current.contains(event.target as Node)) return;
            const dropdownEl = document.getElementById('bot-selector-dropdown');
            if (dropdownEl && !dropdownEl.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        const handleResize = () => setIsOpen(false);
        const handleScroll = () => setIsOpen(false);

        document.addEventListener('mousedown', handleClickOutside);
        window.addEventListener('resize', handleResize);
        window.addEventListener('scroll', handleScroll, true);

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            window.removeEventListener('resize', handleResize);
            window.removeEventListener('scroll', handleScroll, true);
        };
    }, [isOpen, isMobile]);

    const handleSelectBot = async (token: string) => {
        if (token === currentBotToken) {
            setIsOpen(false);
            return;
        }

        setSwitching(token);
        try {
            await api.saveBot("", token, true);
            onBotChange();
            setIsOpen(false);
        } catch (e) {
            console.error('Failed to switch bot:', e);
        } finally {
            setSwitching(null);
        }
    };

    const handleManageBots = () => {
        setIsOpen(false);
        onOpenSettings();
    };

    // Shared List Content
    const renderBotList = () => (
        <div className="space-y-1">
            {savedBots.length === 0 ? (
                <div className="px-3 py-6 text-center">
                    <Bot size={24} className="mx-auto text-text-muted mb-2 opacity-50" />
                    <p className="text-sm text-text-muted">No bots found</p>
                </div>
            ) : (
                savedBots.map((bot) => (
                    <button
                        key={bot.token}
                        onClick={() => handleSelectBot(bot.token)}
                        disabled={switching !== null}
                        className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all text-left ${currentBotToken === bot.token
                                ? 'bg-primary/10 border border-primary/30'
                                : 'hover:bg-surface-highlight border border-transparent'
                            }`}
                    >
                        <div className={`relative w-10 h-10 rounded-full shrink-0 flex items-center justify-center overflow-hidden ${currentBotToken === bot.token
                                ? 'bg-primary text-on-primary'
                                : 'bg-surface-highlight text-text-muted'
                            }`}>
                            {switching === bot.token ? (
                                <Loader2 size={16} className="animate-spin" />
                            ) : bot.avatar_filename ? (
                                <img
                                    src={`/api/avatars/${bot.avatar_filename}`}
                                    alt={bot.name}
                                    className="w-full h-full object-cover"
                                />
                            ) : (
                                <Bot size={16} />
                            )}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className={`text-sm font-medium truncate ${currentBotToken === bot.token ? 'text-primary' : 'text-text-main'
                                }`}>
                                {bot.name}
                            </p>
                            <p className="text-[10px] text-text-muted font-mono truncate opacity-70">
                                {bot.token.substring(0, 8)}...
                            </p>
                        </div>
                        {currentBotToken === bot.token && (
                            <Check size={18} className="text-primary shrink-0" />
                        )}
                    </button>
                ))
            )}
        </div>
    );

    if (isCompact) {
        return (
            <>
                <button
                    ref={triggerRef}
                    onClick={() => setIsOpen(!isOpen)}
                    className="relative w-10 h-10 rounded-full bg-surface-highlight flex items-center justify-center overflow-hidden border border-border/50 active:scale-95 transition-transform"
                >
                    {currentBot?.avatar_filename ? (
                        <img
                            src={`/api/avatars/${currentBot.avatar_filename}`}
                            alt={displayName}
                            className="w-full h-full object-cover"
                        />
                    ) : (
                        <div className="w-full h-full bg-primary text-on-primary flex items-center justify-center font-bold text-sm">
                            {displayName.charAt(0).toUpperCase()}
                        </div>
                    )}
                </button>
                {isMobile && (
                    <ResponsiveModal
                        isOpen={isOpen}
                        onClose={() => setIsOpen(false)}
                        title="Switch Workspace"
                        actions={
                            <button
                                onClick={handleManageBots}
                                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-surface-highlight hover:bg-surface border border-border rounded-xl font-bold text-text-muted hover:text-text-main transition-colors"
                            >
                                <Settings size={16} /> Manage Bots
                            </button>
                        }
                    >
                        <div className="py-2">
                            {renderBotList()}
                        </div>
                    </ResponsiveModal>
                )}
            </>
        );
    }

    return (
        <>
            {/* Trigger Button */}
            <button
                ref={triggerRef}
                onClick={() => setIsOpen(!isOpen)}
                className={`w-full flex items-center gap-3 p-2 text-left transition-colors border group relative overflow-hidden
                    ${isMobile
                        ? 'rounded-2xl bg-surface-highlight/80 border-border/50 px-3 py-2.5 active:scale-95'
                        : 'rounded-xl hover:bg-surface-highlight border-transparent hover:border-border/50'
                    }
                `}
            >
                {/* Avatar Display */}
                {currentBot?.avatar_filename ? (
                    <div className={`rounded-full overflow-hidden shrink-0 shadow-sm ${isMobile ? 'w-8 h-8' : 'w-10 h-10'}`}>
                        <img
                            src={`/api/avatars/${currentBot.avatar_filename}`}
                            alt={displayName}
                            className="w-full h-full object-cover"
                        />
                    </div>
                ) : isMobile ? (
                    <div className="w-8 h-8 rounded-2xl bg-primary text-on-primary flex items-center justify-center font-bold text-xs shrink-0 shadow-sm">
                        {displayName.charAt(0).toUpperCase()}
                    </div>
                ) : (
                    <div className={`p-2 rounded-lg shrink-0 ${currentBotToken ? 'bg-primary/20 text-primary' : 'bg-surface-highlight text-text-muted'}`}>
                        <Bot size={20} />
                    </div>
                )}

                <div className="flex-1 min-w-0 flex items-center gap-2">
                    <span className="text-sm font-bold text-text-main truncate">{displayName}</span>
                    {!isMobile && (
                        <span className="text-xs text-text-muted truncate ml-auto hidden xl:block">
                            {currentBotToken ? 'Active' : 'Select'}
                        </span>
                    )}
                </div>

                {isMobile ? (
                    <ChevronDown size={14} className="text-text-muted" />
                ) : (
                    <ChevronsUpDown size={16} className="text-text-muted group-hover:text-text-main" />
                )}
            </button>

            {/* MOBILE: Modal Interaction */}
            {isMobile && (
                <ResponsiveModal
                    isOpen={isOpen}
                    onClose={() => setIsOpen(false)}
                    title="Switch Workspace"
                    actions={
                        <button
                            onClick={handleManageBots}
                            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-surface-highlight hover:bg-surface border border-border rounded-xl font-bold text-text-muted hover:text-text-main transition-colors"
                        >
                            <Settings size={16} /> Manage Bots
                        </button>
                    }
                >
                    <div className="py-2">
                        {renderBotList()}
                    </div>
                </ResponsiveModal>
            )}

            {/* DESKTOP: Portal Dropdown */}
            {!isMobile && isOpen && createPortal(
                <div
                    id="bot-selector-dropdown"
                    className="fixed z-[9999] bg-surface border border-border rounded-xl shadow-2xl overflow-hidden flex flex-col"
                    style={{
                        top: coords.top,
                        left: coords.left,
                        width: coords.width,
                        maxHeight: coords.maxHeight,
                        transform: coords.top > window.innerHeight / 2 ? 'translateY(-100%)' : 'none',
                    }}
                >
                    <div className="px-4 py-3 bg-surface-highlight/30 border-b border-border shrink-0">
                        <p className="text-xs font-bold text-text-muted uppercase tracking-wider">Switch Workspace</p>
                    </div>

                    <div className="p-2 overflow-y-auto custom-scrollbar">
                        {renderBotList()}
                    </div>

                    <div className="border-t border-border p-2 bg-surface-highlight/10 shrink-0">
                        <button
                            onClick={handleManageBots}
                            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-bold text-text-muted hover:text-text-main hover:bg-surface-highlight transition-colors"
                        >
                            <Settings size={14} />
                            Manage Bots
                        </button>
                    </div>
                </div>,
                document.body
            )}
        </>
    );
}
