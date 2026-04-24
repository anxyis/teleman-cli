import { useState, useEffect } from 'react';
import {
    Download, Upload, AlertTriangle, CheckCircle, Loader2, FileText,
    ToggleLeft, ToggleRight, Bot, Trash2, Plus, Palette, Type,
    ChevronRight, ChevronLeft, Database, Network, Save, RefreshCw, Zap, Brain
} from 'lucide-react';
import axios from 'axios';
import { useTheme, type Theme } from '../context/ThemeContext';
import { ResponsiveModal } from './common/ResponsiveModal';
import { BetterColorPicker } from './common/BetterColorPicker';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

// Added 'fonts' as a top-level view
type SettingsView = 'root' | 'appearance' | 'fonts' | 'bot' | 'data' | 'network' | 'ai' | 'studio' | 'animations';

const FONT_OPTIONS = [
    { name: 'JetBrains Mono', value: 'JetBrains Mono' },
    { name: 'Inter', value: 'Inter' },
    { name: 'System Sans', value: 'system-ui' }
];

const EASING_OPTIONS = [
    { label: 'Ease In (Default)', value: 'easeIn' },
    { label: 'Ease Out', value: 'easeOut' },
    { label: 'Ease In Out', value: 'easeInOut' },
    { label: 'Linear', value: 'linear' },
    { label: 'Circ Out', value: 'circOut' },
    { label: 'Expo Out', value: 'expoOut' },
    { label: 'Back Out', value: 'backOut' },
    { label: 'Anticipate', value: 'anticipate' },
    { label: 'Bounce', value: 'bounce' }
];

const TEXT_EFFECT_OPTIONS = [
    { label: 'Glitch Reveal', value: 'glitch' },
    { label: 'Typewriter', value: 'typewriter' },
    { label: 'Gaussian Blur', value: 'blur' },
    { label: 'Staggered Fade', value: 'fade' }
];

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
    const { currentTheme, availableThemes, availableFonts, loadTheme, refreshThemes } = useTheme();
    const [view, setView] = useState<SettingsView>('root');
    const [editingTheme, setEditingTheme] = useState<Theme | null>(null);
    const [restoring, setRestoring] = useState(false);
    const [successMsg, setSuccessMsg] = useState<string | null>(null);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);

    // Merge static fonts with dynamically found fonts
    const dynamicFontOptions = [
        ...FONT_OPTIONS,
        ...availableFonts.map(f => ({ name: f.split('.')[0], value: f.split('.')[0] }))
    ];

    // System Preferences
    const [showLogsButton, setShowLogsButton] = useState(() => localStorage.getItem('showLogsButton') !== 'false');
    const [fabMode, setFabMode] = useState(() => localStorage.getItem('fabMode') === 'true');
    const [fabGroupMode, setFabGroupMode] = useState(() => localStorage.getItem('fabGroupMode') === 'true');
    const [fabSortMode, setFabSortMode] = useState(() => localStorage.getItem('fabSortMode') === 'true');
    const [floatingSearch, setFloatingSearch] = useState(() => localStorage.getItem('floatingSearch') === 'true');
    const [invertedLayout, setInvertedLayout] = useState(() => localStorage.getItem('invertedLayout') === 'true');
    const [hideNavLabels, setHideNavLabels] = useState(() => localStorage.getItem('hideNavLabels') === 'true');
    const [syncAnimationsEnabled, setSyncAnimationsEnabled] = useState(() => localStorage.getItem('syncAnimationsEnabled') !== 'false');
    const [widgetCarousel, setWidgetCarousel] = useState(() => localStorage.getItem('widgetCarousel') === 'true');
    
    // Modal Animation Specifics
    const [modalAnimEnabled, setModalAnimEnabled] = useState(() => localStorage.getItem('modalAnimEnabled') !== 'false');
    const [modalAnimStyle, setModalAnimStyle] = useState(() => localStorage.getItem('modalAnimStyle') || 'slide-left');
    const [modalAnimSpeed, setModalAnimSpeed] = useState(() => parseFloat(localStorage.getItem('modalAnimSpeed') || '0.3'));
    const [modalAnimBouncy, setModalAnimBouncy] = useState(() => localStorage.getItem('modalAnimBouncy') === 'true');
    const [modalAnimStiffness, setModalAnimStiffness] = useState(() => parseInt(localStorage.getItem('modalAnimStiffness') || '300'));
    const [modalAnimEasing, setModalAnimEasing] = useState(() => localStorage.getItem('modalAnimEasing') || 'easeIn');

    // Text Effects
    const [textEffectEnabled, setTextEffectEnabled] = useState(() => localStorage.getItem('textEffectEnabled') !== 'false');
    const [textEffectType, setTextEffectType] = useState(() => localStorage.getItem('textEffectType') || 'glitch');

    // Bot Manager State
    const [savedBots, setSavedBots] = useState<any[]>([]);
    const [activeToken, setActiveToken] = useState("");
    const [newBotToken, setNewBotToken] = useState("");
    const [loadingBots, setLoadingBots] = useState(false);
    const [savingBot, setSavingBot] = useState(false);

    // Network Settings
    const [telegramApiUrl, setTelegramApiUrl] = useState("http://192.168.0.7:8181");
    const [fallbackApiUrl, setFallbackApiUrl] = useState("");
    const [tailscaleApiUrl, setTailscaleApiUrl] = useState("");
    const [activeNetworkMode, setActiveNetworkMode] = useState<'primary' | 'fallback' | 'tailscale'>('primary');
    const [networkStatus, setNetworkStatus] = useState<any>(null);
    
    // AI Settings
    const [openRouterEnabled, setOpenRouterEnabled] = useState(false);
    const [openRouterApiKey, setOpenRouterApiKey] = useState("");
    const [openRouterModel, setOpenRouterModel] = useState("");
    const [openRouterModels, setOpenRouterModels] = useState<any[]>([]);
    const [loadingOpenRouterModels, setLoadingOpenRouterModels] = useState(false);

    // Font Preview Settings
    const [fontPreview, setFontPreview] = useState({
        text: "ABCDEFGHIJKLM\nNOPQRSTUVWXYZ\n0123456789",
        use_font_sheet: false,
        bg_color: "#ffffff",
        text_color: "#000000",
        size: "medium",
        enabled: true
    });

    // Background Images Settings
    const [backgrounds, setBackgrounds] = useState<string[]>([]);
    const [showBackgroundSheet, setShowBackgroundSheet] = useState(false);
    const [uploadingBackground, setUploadingBackground] = useState(false);

    const API_BASE = '';

    // --- Effects ---
    useEffect(() => {
        localStorage.setItem('showLogsButton', String(showLogsButton));
        localStorage.setItem('fabMode', String(fabMode));
        localStorage.setItem('fabGroupMode', String(fabGroupMode));
        localStorage.setItem('fabSortMode', String(fabSortMode));
        localStorage.setItem('floatingSearch', String(floatingSearch));
        localStorage.setItem('invertedLayout', String(invertedLayout));
        localStorage.setItem('hideNavLabels', String(hideNavLabels));
        localStorage.setItem('syncAnimationsEnabled', String(syncAnimationsEnabled));
        localStorage.setItem('widgetCarousel', String(widgetCarousel));
        localStorage.setItem('modalAnimEnabled', String(modalAnimEnabled));
        localStorage.setItem('modalAnimStyle', modalAnimStyle);
        localStorage.setItem('modalAnimSpeed', String(modalAnimSpeed));
        localStorage.setItem('modalAnimBouncy', String(modalAnimBouncy));
        localStorage.setItem('modalAnimStiffness', String(modalAnimStiffness));
        localStorage.setItem('modalAnimEasing', modalAnimEasing);
        localStorage.setItem('textEffectEnabled', String(textEffectEnabled));
        localStorage.setItem('textEffectType', textEffectType);

        window.dispatchEvent(new CustomEvent('settingsChanged', {
            detail: {
                showLogsButton, fabMode, fabGroupMode, fabSortMode, floatingSearch, invertedLayout, hideNavLabels, syncAnimationsEnabled, widgetCarousel,
                modalAnimEnabled, modalAnimStyle, modalAnimSpeed, modalAnimBouncy, modalAnimStiffness, modalAnimEasing,
                textEffectEnabled, textEffectType
            }
        }));
    }, [showLogsButton, fabMode, fabGroupMode, fabSortMode, floatingSearch, invertedLayout, hideNavLabels, syncAnimationsEnabled, widgetCarousel, modalAnimEnabled, modalAnimStyle, modalAnimSpeed, modalAnimBouncy, modalAnimStiffness, modalAnimEasing, textEffectEnabled, textEffectType]);

    useEffect(() => {
        if (isOpen) {
            setView('root'); // Reset to root on open
            fetchBots();
        }
    }, [isOpen]);

    useEffect(() => {
        if (isOpen && currentTheme) {
            setEditingTheme(JSON.parse(JSON.stringify(currentTheme)));
        }
    }, [isOpen, currentTheme]);

    useEffect(() => {
        if (isOpen && view === 'ai' && openRouterEnabled && openRouterApiKey.trim()) {
            fetchOpenRouterModels();
        }
    }, [isOpen, view, openRouterEnabled, openRouterApiKey]);

    // --- API & Actions ---
    const fetchBots = async () => {
        setLoadingBots(true);
        try {
            const [configRes, networkRes] = await Promise.all([
                axios.get(`${API_BASE}/api/config`),
                axios.get(`${API_BASE}/api/network/status`).catch(() => ({ data: null }))
            ]);
            
            setSavedBots(configRes.data.saved_bots || []);
            setActiveToken(configRes.data.active_token || "");
            if (configRes.data.font_preview) setFontPreview(configRes.data.font_preview);
            if (configRes.data.telegram_api_url) setTelegramApiUrl(configRes.data.telegram_api_url);
            if (configRes.data.telegram_api_fallback) setFallbackApiUrl(configRes.data.telegram_api_fallback);
            if (configRes.data.tailscale_api_url) setTailscaleApiUrl(configRes.data.tailscale_api_url);
            if (configRes.data.active_network_mode) setActiveNetworkMode(configRes.data.active_network_mode);
            setOpenRouterEnabled(configRes.data.ai?.openrouter_enabled === true);
            setOpenRouterApiKey(configRes.data.ai?.openrouter_api_key || "");
            setOpenRouterModel(configRes.data.ai?.openrouter_model || "");
            if (networkRes.data) setNetworkStatus(networkRes.data);
        } catch (e) { console.error("Failed to fetch config", e); }
        finally { setLoadingBots(false); }
    };

    const fetchOpenRouterModels = async () => {
        setLoadingOpenRouterModels(true);
        setErrorMsg(null);
        try {
            const res = await axios.get(`${API_BASE}/api/ai/openrouter/models`);
            const models = res.data?.models || [];
            setOpenRouterModels(models);

            if (models.length > 0 && !models.find((m: any) => m.id === openRouterModel)) {
                setOpenRouterModel(models[0].id);
            }
        } catch (e: any) {
            setErrorMsg(e.response?.data?.error || "Failed to load OpenRouter free models.");
            setOpenRouterModels([]);
        } finally {
            setLoadingOpenRouterModels(false);
        }
    };

    const saveAiSettings = async () => {
        try {
            await axios.post(`${API_BASE}/api/config/ai`, {
                openrouter_enabled: openRouterEnabled,
                openrouter_api_key: openRouterApiKey,
                openrouter_model: openRouterModel
            });
            setSuccessMsg("AI settings saved.");
        } catch (e: any) {
            setErrorMsg(e.response?.data?.error || "Failed to save AI settings.");
        }
    };

    const handleSaveBot = async () => {
        if (!newBotToken) return;
        setSavingBot(true); setErrorMsg(null);
        try {
            const res = await axios.post(`${API_BASE}/api/bots`, { token: newBotToken, set_active: true });
            setSavedBots(res.data.saved_bots || []);
            setActiveToken(res.data.active_token || "");
            setNewBotToken("");
            setSuccessMsg(`Bot added and activated!`);
        } catch (e: any) {
            setErrorMsg(e.response?.data?.description || "Failed to save bot");
        } finally { setSavingBot(false); }
    };

    const handleDeleteBot = async (token: string) => {
        if (!confirm("Are you sure? This will remove the bot from saved list.")) return;
        try {
            const res = await axios.delete(`${API_BASE}/api/bots/${encodeURIComponent(token)}`);
            setSavedBots(res.data.saved_bots || []);
            setActiveToken(res.data.active_token || "");
        } catch { setErrorMsg("Failed to remove bot"); }
    };

    const handleActivateBot = async (token: string) => {
        const bot = savedBots.find(b => b.token === token);
        if (!bot) return;
        try {
            const res = await axios.post(`${API_BASE}/api/bots`, { name: bot.name, token: bot.token, set_active: true });
            setActiveToken(res.data.active_token || "");
            setSuccessMsg(`Switched to ${bot.name}`);
        } catch { setErrorMsg("Failed to switch bot"); }
    };

    const saveFontSettings = async () => {
        try {
            await axios.post(`${API_BASE}/api/config/font`, fontPreview);
            setSuccessMsg("Font settings saved!");
        } catch { setErrorMsg("Failed to save font settings."); }
    };

    const saveNetworkSettings = async () => {
        try {
            await axios.post(`${API_BASE}/api/config/network`, {
                telegram_api_url: telegramApiUrl,
                telegram_api_fallback: fallbackApiUrl,
                tailscale_api_url: tailscaleApiUrl,
                active_network_mode: activeNetworkMode
            });
            setSuccessMsg("Network settings saved! The app will use these APIs for all Telegram operations.");
        } catch { setErrorMsg("Failed to save network settings."); }
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setSelectedFile(e.target.files[0]);
            setErrorMsg(null);
        }
    };

    const handleRestore = async () => {
        if (!selectedFile) return;
        if (!confirm("⚠️ WARNING: This will OVERWRITE your current configuration, database, and presets.\n\nThe system is cleaner if you restart the container manually after this operation.\n\nAre you sure?")) return;
        setRestoring(true); setErrorMsg(null); setSuccessMsg(null);
        const formData = new FormData(); formData.append('backup', selectedFile);
        try {
            const res = await axios.post(`${API_BASE}/api/restore`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
            if (res.data.success) {
                setSuccessMsg("Restore successful! Please RESTART your container to apply changes.");
                setSelectedFile(null);
            }
        } catch (e: any) { setErrorMsg(e.response?.data?.error || "Restore failed. Check server logs."); }
        finally { setRestoring(false); }
    };

    const handleDownloadBackup = () => {
        window.open(`${API_BASE}/api/backup`, '_blank');
    };

    const handleDownloadDebug = () => {
        window.open(`${API_BASE}/api/debug/report`, '_blank');
    };

    const handleSaveTheme = async (isReset = false) => {
        if (!editingTheme) return;
        setSuccessMsg(null);
        setErrorMsg(null);

        try {
            const themeToSave = isReset ? availableThemes.find((t: any) => t.id === editingTheme.id) : editingTheme;
            if (!themeToSave) return;

            await axios.post(`${import.meta.env.VITE_API_BASE_URL ?? ''}/api/themes`, themeToSave);
            await refreshThemes();
            await loadTheme(themeToSave.id);
            setSuccessMsg(`Theme "${themeToSave.name}" saved!`);
        } catch (e) {
            console.error("Theme Save Error:", e);
            setErrorMsg("Failed to save theme");
        }
    };

    const updateToken = (path: string, value: string | boolean) => {
        if (!editingTheme) return;
        const newTheme = { ...editingTheme };
        const parts = path.split('.');
        let current: any = newTheme.tokens;
        for (let i = 0; i < parts.length - 1; i++) {
            current = current[parts[i]];
        }
        current[parts[parts.length - 1]] = value;
        setEditingTheme(newTheme);
        
        const category = parts[0]; 
        const tokenName = parts[parts.length - 1];
        const cssKey = tokenName.replace(/[A-Z]/g, m => "-" + m.toLowerCase());
        
        if (category === 'colors') {
             document.documentElement.style.setProperty(`--${cssKey}`, value as string);
        } else if (category === 'radii') {
             document.documentElement.style.setProperty(`--radius-${cssKey}`, value as string);
        } else if (category === 'typography') {
             if (tokenName === 'fontFamily') document.documentElement.style.setProperty('--font-family', value as string);
             if (tokenName === 'baseSize') document.documentElement.style.setProperty('--font-size-base', value as string);
             if (tokenName === 'headingWeight') document.documentElement.style.setProperty('--heading-weight', value as string);
        } else if (category === 'icons') {
             if (tokenName === 'strokeWidth') document.documentElement.style.setProperty('--icon-stroke', value as string);
        } else if (category === 'effects') {
             if (tokenName === 'glassOpacity') document.documentElement.style.setProperty('--glass-opacity', value as string);
             if (tokenName === 'shadowCard') document.documentElement.style.setProperty('--shadow-card', value as string);
             if (tokenName === 'glow') document.documentElement.style.setProperty('--glow-opacity', value ? '0.2' : '0');
        }
    };

    const updateBackground = (key: string, value: string | boolean | number) => {
        if (!editingTheme) return;
        const newTheme = { ...editingTheme };
        if (!newTheme.background) {
            newTheme.background = { enabled: false, imagePath: '', opacity: 0.5 };
        }
        (newTheme.background as any)[key] = value;
        setEditingTheme(newTheme);

        console.log('[Background] Updated theme:', key, value, newTheme.background);

        // Apply background in real-time
        if (key === 'enabled' || key === 'imagePath' || key === 'opacity') {
            const bgElement = document.getElementById('theme-background');
            console.log('[Background] Found element:', bgElement);
            if (bgElement) {
                if (newTheme.background.enabled && newTheme.background.imagePath) {
                    bgElement.style.backgroundImage = `url(${API_BASE}/api/backgrounds/${newTheme.background.imagePath})`;
                    bgElement.style.opacity = String(newTheme.background.opacity);
                    bgElement.style.display = 'block';
                    console.log('[Background] Applied:', newTheme.background);
                } else {
                    bgElement.style.display = 'none';
                    console.log('[Background] Disabled');
                }
            }
        }
    };

    const fetchBackgrounds = async () => {
        try {
            const res = await axios.get(`${API_BASE}/api/backgrounds`);
            setBackgrounds(res.data);
        } catch (e) {
            console.error("Failed to fetch backgrounds", e);
        }
    };

    const handleUploadBackground = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || !e.target.files[0]) return;
        
        setUploadingBackground(true);
        const formData = new FormData();
        formData.append('image', e.target.files[0]);

        try {
            await axios.post(`${API_BASE}/api/backgrounds`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            fetchBackgrounds();
            setSuccessMsg("Background uploaded!");
        } catch (err: any) {
            setErrorMsg(err.response?.data?.error || "Failed to upload background");
        } finally {
            setUploadingBackground(false);
        }
    };

    // --- Render Components ---

    const MenuTile = ({ icon: Icon, title, desc, onClick, colorClass = "text-primary" }: any) => (
        <button onClick={onClick} className="w-full flex items-center gap-4 p-4 hover:bg-surface-highlight/50 transition-colors border-b border-border/50 first:rounded-t-lg last:border-0 text-left group">
            <div className={`p-2.5 rounded-xl bg-surface-highlight group-hover:bg-surface transition-colors ${colorClass.replace('text-', 'bg-').replace('400', '500/10')} ${colorClass}`}>
                <Icon size={22} />
            </div>
            <div className="flex-1">
                <h3 className="text-base font-medium text-text-main">{title}</h3>
                <p className="text-xs text-text-muted mt-0.5">{desc}</p>
            </div>
            <ChevronRight size={18} className="text-text-muted group-hover:text-text-main transition-colors" />
        </button>
    );

    const renderRoot = () => (
        <div className="bg-surface rounded-xl border border-border overflow-hidden">
            <MenuTile icon={Palette} title="Appearance" desc="Theme, Fonts, UI Mode" onClick={() => setView('appearance')} colorClass="text-purple-400" />
            <MenuTile icon={Type} title="Font Previews" desc="Generator Settings, Backgrounds" onClick={() => setView('fonts')} colorClass="text-pink-400" />
            <MenuTile icon={Bot} title="Bot Manager" desc="Tokens, Active Bot" onClick={() => setView('bot')} colorClass="text-blue-400" />
            <MenuTile icon={Network} title="Network" desc="API Endpoints, Connection" onClick={() => setView('network')} colorClass="text-green-400" />
            <MenuTile icon={Brain} title="AI" desc="OpenRouter, Model Selection" onClick={() => setView('ai')} colorClass="text-cyan-400" />
            <MenuTile icon={Database} title="Data & Storage" desc="Backup, Restore, Logs" onClick={() => setView('data')} colorClass="text-orange-400" />
        </div>
    );

    const renderAppearance = () => (
        <div className="space-y-6">
            <div className="bg-canvas/50 p-4 rounded-xl border border-border space-y-4">
                <div>
                    <p className="text-text-main font-bold text-xs uppercase tracking-widest mb-3">Active Theme</p>
                    <div className="grid grid-cols-2 gap-2">
                        {availableThemes.map((t: any) => (
                            <button
                                key={t.id}
                                onClick={() => loadTheme(t.id)}
                                className={`p-3 rounded-lg border text-sm font-medium transition-all text-left flex flex-col gap-1 ${currentTheme?.id === t.id ? 'bg-primary/10 border-primary text-primary' : 'bg-surface border-border text-text-muted hover:border-border/80'}`}
                            >
                                <span>{t.name}</span>
                                <span className="text-[10px] opacity-60 uppercase">{t.type}</span>
                            </button>
                        ))}
                    </div>
                </div>

                <div className="pt-2 space-y-2">
                    <button 
                        onClick={() => setView('studio')}
                        className="w-full flex items-center justify-between p-4 bg-primary/10 hover:bg-primary/20 border border-primary/20 rounded-xl transition-all group"
                    >
                        <div className="flex items-center gap-3 text-primary">
                            <Palette size={20} />
                            <div className="text-left">
                                <p className="text-sm font-bold">Theme Studio</p>
                                <p className="text-[10px] opacity-80">Customize colors, shapes and fonts</p>
                            </div>
                        </div>
                        <ChevronRight size={18} className="text-primary group-hover:translate-x-1 transition-transform" />
                    </button>

                    <button 
                        onClick={() => setView('animations')}
                        className="w-full flex items-center justify-between p-4 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 rounded-xl transition-all group"
                    >
                        <div className="flex items-center gap-3 text-blue-400">
                            <Zap size={20} />
                            <div className="text-left">
                                <p className="text-sm font-bold">Animations Studio</p>
                                <p className="text-[10px] opacity-80">Control UI motion and effects</p>
                            </div>
                        </div>
                        <ChevronRight size={18} className="text-blue-400 group-hover:translate-x-1 transition-transform" />
                    </button>
                </div>

                <hr className="border-border/50" />

                <div className="flex items-center justify-between">
                    <div><p className="text-text-main font-medium">Show Logs Button</p><p className="text-xs text-text-muted">Display debug logs button on dashboard</p></div>
                    <button onClick={() => setShowLogsButton(!showLogsButton)} className={`p-1 rounded-lg transition-colors ${showLogsButton ? 'text-green-400' : 'text-text-muted'}`}>{showLogsButton ? <ToggleRight size={32} /> : <ToggleLeft size={32} />}</button>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-border/50">
                    <div><p className="text-text-main font-medium">Floating Add Button</p><p className="text-xs text-text-muted">Move "New Sync" button to bottom right</p></div>
                    <button onClick={() => setFabMode(!fabMode)} className={`p-1 rounded-lg transition-colors ${fabMode ? 'text-primary' : 'text-text-muted'}`}>{fabMode ? <ToggleRight size={32} /> : <ToggleLeft size={32} />}</button>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-border/50">
                    <div><p className="text-text-main font-medium">Floating Group Button</p><p className="text-xs text-text-muted">Move "New Group" button to bottom right</p></div>
                    <button onClick={() => setFabGroupMode(!fabGroupMode)} className={`p-1 rounded-lg transition-colors ${fabGroupMode ? 'text-primary' : 'text-text-muted'}`}>{fabGroupMode ? <ToggleRight size={32} /> : <ToggleLeft size={32} />}</button>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-border/50">
                    <div><p className="text-text-main font-medium">Floating Sort Button</p><p className="text-xs text-text-muted">Move Sort control to bottom right as a pill</p></div>
                    <button onClick={() => setFabSortMode(!fabSortMode)} className={`p-1 rounded-lg transition-colors ${fabSortMode ? 'text-primary' : 'text-text-muted'}`}>{fabSortMode ? <ToggleRight size={32} /> : <ToggleLeft size={32} />}</button>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-border/50">
                    <div><p className="text-text-main font-medium">Floating Search Button</p><p className="text-xs text-text-muted">Turn search bar into a floating button</p></div>
                    <button onClick={() => setFloatingSearch(!floatingSearch)} className={`p-1 rounded-lg transition-colors ${floatingSearch ? 'text-primary' : 'text-text-muted'}`}>{floatingSearch ? <ToggleRight size={32} /> : <ToggleLeft size={32} />}</button>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-border/50">
                    <div><p className="text-text-main font-medium">Inverted Layout</p><p className="text-xs text-text-muted">Navigation at top, Header at bottom</p></div>
                    <button onClick={() => setInvertedLayout(!invertedLayout)} className={`p-1 rounded-lg transition-colors ${invertedLayout ? 'text-primary' : 'text-text-muted'}`}>{invertedLayout ? <ToggleRight size={32} /> : <ToggleLeft size={32} />}</button>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-border/50">
                    <div><p className="text-text-main font-medium">Hide Nav Labels</p><p className="text-xs text-text-muted">Hide text labels in bottom navigation bar</p></div>
                    <button onClick={() => setHideNavLabels(!hideNavLabels)} className={`p-1 rounded-lg transition-colors ${hideNavLabels ? 'text-primary' : 'text-text-muted'}`}>{hideNavLabels ? <ToggleRight size={32} /> : <ToggleLeft size={32} />}</button>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-border/50">
                    <div><p className="text-text-main font-medium">Widget Carousel</p><p className="text-xs text-text-muted">Swipe to expand one widget at a time</p></div>
                    <button onClick={() => setWidgetCarousel(!widgetCarousel)} className={`p-1 rounded-lg transition-colors ${widgetCarousel ? 'text-primary' : 'text-text-muted'}`}>{widgetCarousel ? <ToggleRight size={32} /> : <ToggleLeft size={32} />}</button>
                </div>
            </div>
        </div>
    );

    const renderAnimations = () => (
        <div className="space-y-6">
            <div className="bg-canvas/50 p-4 rounded-xl border border-border space-y-6">
                <div className="flex items-center justify-between pb-4 border-b border-border/50">
                    <div>
                        <p className="text-text-main font-bold">Modal Entry Animations</p>
                        <p className="text-xs text-text-muted">Master control for global transitions</p>
                    </div>
                    <button 
                        onClick={() => setModalAnimEnabled(!modalAnimEnabled)} 
                        className={`p-1 rounded-lg transition-colors ${modalAnimEnabled ? 'text-primary' : 'text-text-muted'}`}
                    >
                        {modalAnimEnabled ? <ToggleRight size={32} /> : <ToggleLeft size={32} />}
                    </button>
                </div>

                {modalAnimEnabled && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-top-2 duration-300">
                        {/* STYLE SELECTOR */}
                        <div className="space-y-2">
                            <label className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Entry Style</label>
                            <div className="grid grid-cols-2 gap-2">
                                {[
                                    { id: 'slide-left', label: 'Slide Left' },
                                    { id: 'slide-right', label: 'Slide Right' },
                                    { id: 'slide-up', label: 'Slide Up' },
                                    { id: 'scale', label: 'Scale Up' }
                                ].map(s => (
                                    <button 
                                        key={s.id} 
                                        onClick={() => setModalAnimStyle(s.id)}
                                        className={`px-3 py-2 text-xs font-medium border rounded-lg transition-all ${modalAnimStyle === s.id ? 'bg-primary/10 border-primary text-primary' : 'bg-surface border-border text-text-muted hover:border-border/80'}`}
                                    >
                                        {s.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* EASING SELECTOR */}
                        <div className="space-y-2 opacity-transition">
                            <div className="flex justify-between items-center">
                                <label className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Easing Curve</label>
                                {modalAnimBouncy && <span className="text-[9px] text-orange-400 font-bold animate-pulse">OVERRIDDEN BY BOUNCY</span>}
                            </div>
                            <select 
                                value={modalAnimEasing} 
                                onChange={e => setModalAnimEasing(e.target.value)}
                                disabled={modalAnimBouncy}
                                className={`w-full bg-surface border border-border rounded-lg p-3 text-sm focus:border-primary outline-none text-text-main transition-all appearance-none ${modalAnimBouncy ? 'opacity-50 grayscale' : ''}`}
                            >
                                {EASING_OPTIONS.map(opt => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                            </select>
                        </div>

                        {/* SPEED CONTROL */}
                        <div className="space-y-3">
                            <div className="flex justify-between items-center">
                                <label className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Speed</label>
                                <span className="text-[10px] font-mono text-primary bg-primary/10 px-1.5 py-0.5 rounded">{modalAnimSpeed}s</span>
                            </div>
                            <input 
                                type="range" min="0.1" max="1.0" step="0.05" 
                                value={modalAnimSpeed} onChange={e => setModalAnimSpeed(parseFloat(e.target.value))}
                                className="w-full h-2 bg-surface-highlight rounded-lg appearance-none cursor-pointer accent-primary"
                            />
                        </div>

                        {/* BOUNCY TOGGLE */}
                        <div className="flex items-center justify-between bg-surface-highlight/30 p-3 rounded-xl border border-border/50">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-primary/10 text-primary">
                                    <RefreshCw size={16} className={modalAnimBouncy ? "animate-spin-slow" : ""} />
                                </div>
                                <div><p className="text-xs font-bold text-text-main">Bouncy Physics</p></div>
                            </div>
                            <button 
                                onClick={() => setModalAnimBouncy(!modalAnimBouncy)} 
                                className={`transition-colors ${modalAnimBouncy ? 'text-primary' : 'text-text-muted'}`}
                            >
                                {modalAnimBouncy ? <ToggleRight size={32} /> : <ToggleLeft size={32} />}
                            </button>
                        </div>

                        {modalAnimBouncy && (
                            <div className="space-y-3 px-1 animate-in fade-in zoom-in-95 duration-200">
                                <div className="flex justify-between items-center">
                                    <label className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Bouncy Intensity</label>
                                    <span className="text-[10px] font-mono text-primary bg-primary/10 px-1.5 py-0.5 rounded">{modalAnimStiffness}</span>
                                </div>
                                <input 
                                    type="range" min="100" max="800" step="50" 
                                    value={modalAnimStiffness} onChange={e => setModalAnimStiffness(parseInt(e.target.value))}
                                    className="w-full h-2 bg-surface-highlight rounded-lg appearance-none cursor-pointer accent-primary"
                                />
                            </div>
                        )}
                    </div>
                )}

                <hr className="border-border/50" />

                {/* TEXT EFFECTS */}
                <div className="space-y-4 pt-2">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-text-main font-bold">Heading Text Effects</p>
                            <p className="text-xs text-text-muted">Animations for page and card titles</p>
                        </div>
                        <button 
                            onClick={() => setTextEffectEnabled(!textEffectEnabled)} 
                            className={`p-1 rounded-lg transition-colors ${textEffectEnabled ? 'text-primary' : 'text-text-muted'}`}
                        >
                            {textEffectEnabled ? <ToggleRight size={32} /> : <ToggleLeft size={32} />}
                        </button>
                    </div>

                    {textEffectEnabled && (
                        <div className="space-y-2 animate-in fade-in zoom-in-95 duration-200">
                            <label className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Effect Style</label>
                            <select 
                                value={textEffectType} 
                                onChange={e => setTextEffectType(e.target.value)}
                                className="w-full bg-surface border border-border rounded-lg p-3 text-sm focus:border-primary outline-none text-text-main transition-all appearance-none"
                            >
                                {TEXT_EFFECT_OPTIONS.map(opt => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                            </select>
                        </div>
                    )}
                </div>

                <hr className="border-border/50" />

                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-text-main font-medium">Sync Card Animations</p>
                        <p className="text-xs text-text-muted">Cards fade and slide up when scrolled into view</p>
                    </div>
                    <button 
                        onClick={() => setSyncAnimationsEnabled(!syncAnimationsEnabled)} 
                        className={`p-1 rounded-lg transition-colors ${syncAnimationsEnabled ? 'text-primary' : 'text-text-muted'}`}
                    >
                        {syncAnimationsEnabled ? <ToggleRight size={32} /> : <ToggleLeft size={32} />}
                    </button>
                </div>

                <div className="pt-4 border-t border-border/50">
                    <button 
                        onClick={() => window.location.reload()}
                        className="w-full flex items-center justify-center gap-2 py-3 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 rounded-xl font-bold text-sm transition-all active:scale-95"
                    >
                        <RefreshCw size={16} /> Apply & Preview Changes
                    </button>
                    <p className="text-[10px] text-text-muted text-center mt-2 italic">Refreshes the app to load new global animation curves</p>
                </div>
            </div>
        </div>
    );

    const renderStudio = () => {
        if (!editingTheme) return null;
        return (
            <div className="space-y-6">
                <div className="space-y-8 max-h-[500px] overflow-y-auto overscroll-contain pr-2 custom-scrollbar">
                    <section className="space-y-4">
                        <div className="flex items-center gap-2">
                            <Palette size={14} className="text-primary" />
                            <h5 className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Colors & Branding</h5>
                        </div>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                            {Object.entries(editingTheme.tokens.colors).map(([key, value]) => (
                                <BetterColorPicker key={key} label={key} color={value} onChange={(newColor) => updateToken(`colors.${key}`, newColor)} />
                            ))}
                        </div>
                    </section>

                    <section className="space-y-4">
                        <div className="flex items-center gap-2">
                            <Database size={14} className="text-blue-400" />
                            <h5 className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Shape & Layout</h5>
                        </div>
                        <div className="space-y-4 px-1">
                            <div className="flex items-center justify-between bg-surface-highlight/50 p-3 rounded-xl border border-border/50">
                                <div className="flex items-center gap-2">
                                    <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                                        <RefreshCw size={14} className={editingTheme.tokens.effects.glow ? "animate-pulse" : ""} />
                                    </div>
                                    <div><p className="text-xs font-bold text-text-main">Glow FX</p><p className="text-[10px] text-text-muted">Toggle UI shadows and glows</p></div>
                                </div>
                                <button onClick={() => updateToken('effects.glow', !editingTheme.tokens.effects.glow)} className={`transition-colors ${editingTheme.tokens.effects.glow ? 'text-primary' : 'text-text-muted'}`}>{editingTheme.tokens.effects.glow ? <ToggleRight size={32} /> : <ToggleLeft size={32} />}</button>
                            </div>
                            {Object.entries(editingTheme.tokens.radii).map(([key, value]) => {
                                const numValue = parseInt(value) || 0;
                                return (
                                    <div key={key} className="space-y-2">
                                        <div className="flex justify-between items-center px-1">
                                            <span className="text-[10px] text-text-muted font-bold uppercase tracking-wider">{key} Radius</span>
                                            <span className="text-[10px] font-mono text-primary bg-primary/10 px-1.5 py-0.5 rounded">{value}</span>
                                        </div>
                                        <input 
                                            type="range" min="0" max="40" 
                                            value={numValue} 
                                            onChange={(e) => updateToken(`radii.${key}`, `${e.target.value}px`)} 
                                            className="w-full h-3 bg-surface-highlight rounded-lg appearance-none cursor-pointer accent-primary theme-slider" 
                                        />
                                    </div>
                                );
                            })}
                        </div>
                    </section>

                    <section className="space-y-4">
                        <div className="flex items-center gap-2">
                            <Type size={14} className="text-pink-400" />
                            <h5 className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Typography & Icons</h5>
                        </div>
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <div className="flex justify-between items-center"><span className="text-[10px] text-text-muted uppercase tracking-wider font-bold">UI Text Size</span><span className="text-[10px] font-mono text-primary">{editingTheme.tokens.typography.baseSize}</span></div>
                                <input type="range" min="12" max="20" step="1" value={parseInt(editingTheme.tokens.typography.baseSize)} onChange={(e) => updateToken('typography.baseSize', `${e.target.value}px`)} className="w-full h-3 bg-surface-highlight rounded-lg appearance-none cursor-pointer accent-primary theme-slider" />
                            </div>
                            <div className="flex flex-col gap-2">
                                <span className="text-[10px] text-text-muted uppercase tracking-wider font-bold">Main Font Family</span>
                                <select value={dynamicFontOptions.find(f => f.value === editingTheme.tokens.typography.fontFamily)?.value || dynamicFontOptions[0].value} onChange={(e) => updateToken('typography.fontFamily', e.target.value)} className="w-full bg-surface-highlight border-none rounded-xl px-4 py-3 text-sm text-text-main outline-none focus:ring-1 focus:ring-primary/50">
                                    {dynamicFontOptions.map(font => (<option key={font.name} value={font.value}>{font.name}</option>))}
                                </select>
                            </div>
                            <div className="space-y-2">
                                <div className="flex justify-between items-center"><span className="text-[10px] text-text-muted uppercase tracking-wider font-bold">Icon Stroke Weight</span><span className="text-[10px] font-mono text-primary">{editingTheme.tokens.icons.strokeWidth}</span></div>
                                <input type="range" min="1" max="3" step="0.1" value={editingTheme.tokens.icons.strokeWidth} onChange={(e) => updateToken('icons.strokeWidth', e.target.value)} className="w-full h-3 bg-surface-highlight rounded-lg appearance-none cursor-pointer accent-primary theme-slider" />
                            </div>
                            <div className="flex flex-col gap-2">
                                <span className="text-[10px] text-text-muted uppercase tracking-wider font-bold">Main Icon Pack</span>
                                <select
                                    value={editingTheme.tokens.icons.pack}
                                    onChange={(e) => updateToken('icons.pack', e.target.value)}
                                    className="w-full bg-surface-highlight border-none rounded-xl px-4 py-3 text-sm text-text-main outline-none focus:ring-1 focus:ring-primary/50"
                                >
                                    <option value="lucide">Lucide (Default)</option>
                                    <option value="ph">Phosphor</option>
                                    <option value="tabler">Tabler Icons</option>
                                    <option value="heroicons">Heroicons (Bold)</option>
                                    <option value="ri">Remix Icon</option>
                                </select>
                            </div>
                        </div>
                    </section>

                    <section className="space-y-4">
                        <div className="flex items-center gap-2">
                            <Upload size={14} className="text-purple-400" />
                            <h5 className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Background Image</h5>
                        </div>
                        <div className="space-y-4 px-1">
                            <div className="flex items-center justify-between bg-surface-highlight/50 p-3 rounded-xl border border-border/50">
                                <div className="flex items-center gap-2">
                                    <div className="p-1.5 rounded-lg bg-purple-500/10 text-purple-400">
                                        <Upload size={14} className={editingTheme.background?.enabled ? "animate-pulse" : ""} />
                                    </div>
                                    <div><p className="text-xs font-bold text-text-main">Enable Background</p><p className="text-[10px] text-text-muted">Show image behind entire UI</p></div>
                                </div>
                                <button
                                    onClick={() => updateBackground('enabled', !editingTheme.background?.enabled)}
                                    className={`transition-colors ${editingTheme.background?.enabled ? 'text-primary' : 'text-text-muted'}`}
                                >
                                    {editingTheme.background?.enabled ? <ToggleRight size={32} /> : <ToggleLeft size={32} />}
                                </button>
                            </div>

                            {editingTheme.background?.enabled && (
                                <>
                                    <div className="space-y-2">
                                        <div className="flex justify-between items-center">
                                            <span className="text-[10px] text-text-muted uppercase tracking-wider font-bold">Background Opacity</span>
                                            <span className="text-[10px] font-mono text-primary bg-primary/10 px-1.5 py-0.5 rounded">{Math.round((editingTheme.background.opacity || 0.5) * 100)}%</span>
                                        </div>
                                        <input
                                            type="range" min="0.1" max="1" step="0.05"
                                            value={editingTheme.background.opacity || 0.5}
                                            onChange={(e) => updateBackground('opacity', parseFloat(e.target.value))}
                                            className="w-full h-3 bg-surface-highlight rounded-lg appearance-none cursor-pointer accent-primary theme-slider"
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <div className="flex justify-between items-center">
                                            <span className="text-[10px] text-text-muted uppercase tracking-wider font-bold">Card Transparency</span>
                                            <span className="text-[10px] font-mono text-primary bg-primary/10 px-1.5 py-0.5 rounded">{Math.round((editingTheme.background.cardTransparency ?? 0.85) * 100)}%</span>
                                        </div>
                                        <input
                                            type="range" min="0" max="1" step="0.05"
                                            value={editingTheme.background.cardTransparency ?? 0.85}
                                            onChange={(e) => updateBackground('cardTransparency', parseFloat(e.target.value))}
                                            className="w-full h-3 bg-surface-highlight rounded-lg appearance-none cursor-pointer accent-primary theme-slider"
                                        />
                                        <p className="text-[10px] text-text-muted">Controls how transparent cards, modals and panels are</p>
                                    </div>

                                    <div className="flex items-center justify-between bg-surface-highlight/50 p-3 rounded-xl border border-border/50">
                                        <div className="flex items-center gap-2">
                                            <div className="p-1.5 rounded-lg bg-purple-500/10 text-purple-400">
                                                <RefreshCw size={14} className={editingTheme.background?.glassBlur ? "animate-pulse" : ""} />
                                            </div>
                                            <div><p className="text-xs font-bold text-text-main">Glass Blur Effect</p><p className="text-[10px] text-text-muted">Add frosted glass blur to cards</p></div>
                                        </div>
                                        <button
                                            onClick={() => updateBackground('glassBlur', !editingTheme.background?.glassBlur)}
                                            className={`transition-colors ${editingTheme.background?.glassBlur ? 'text-primary' : 'text-text-muted'}`}
                                        >
                                            {editingTheme.background?.glassBlur ? <ToggleRight size={32} /> : <ToggleLeft size={32} />}
                                        </button>
                                    </div>

                                    {editingTheme.background?.glassBlur && (
                                        <div className="space-y-2">
                                            <div className="flex justify-between items-center">
                                                <span className="text-[10px] text-text-muted uppercase tracking-wider font-bold">Blur Intensity</span>
                                                <span className="text-[10px] font-mono text-primary bg-primary/10 px-1.5 py-0.5 rounded">{editingTheme.background.blurIntensity ?? 10}px</span>
                                            </div>
                                            <input
                                                type="range" min="0" max="30" step="1"
                                                value={editingTheme.background.blurIntensity ?? 10}
                                                onChange={(e) => updateBackground('blurIntensity', parseInt(e.target.value))}
                                                className="w-full h-3 bg-surface-highlight rounded-lg appearance-none cursor-pointer accent-primary theme-slider"
                                            />
                                        </div>
                                    )}

                                    <div className="space-y-2">
                                        <div className="flex justify-between items-center">
                                            <span className="text-[10px] text-text-muted uppercase tracking-wider font-bold">Select Image</span>
                                        </div>
                                        <button
                                            onClick={() => { fetchBackgrounds(); setShowBackgroundSheet(true); }}
                                            className="w-full py-3 bg-surface-highlight hover:bg-surface border border-border rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2"
                                        >
                                            <Upload size={16} />
                                            {editingTheme.background?.imagePath ? 'Change Image' : 'Select Image'}
                                        </button>
                                        {editingTheme.background?.imagePath && (
                                            <div className="mt-2 rounded-lg overflow-hidden border border-border/50">
                                                <img
                                                    src={`${API_BASE}/api/backgrounds/${editingTheme.background.imagePath}`}
                                                    alt="Selected background"
                                                    className="w-full h-32 object-cover"
                                                />
                                            </div>
                                        )}
                                    </div>

                                    <div className="space-y-2 pt-2 border-t border-border/50">
                                        <label className="text-[10px] text-text-muted uppercase tracking-wider font-bold">Upload New Image</label>
                                        <p className="text-[10px] text-text-muted">JPG, PNG, GIF, WEBP</p>
                                        <input
                                            type="file"
                                            accept="image/*"
                                            onChange={handleUploadBackground}
                                            disabled={uploadingBackground}
                                            className="w-full text-xs text-text-muted file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-surface-highlight file:text-text-main hover:file:bg-surface cursor-pointer disabled:opacity-50"
                                        />
                                    </div>
                                </>
                            )}
                        </div>
                    </section>
                </div>
                <div className="flex gap-2 pt-4 border-t border-border">
                    <button onClick={() => handleSaveTheme(true)} className="px-4 py-2.5 bg-surface-highlight hover:bg-surface text-text-muted hover:text-text-main rounded-xl font-bold text-sm transition-all">Reset to Default</button>
                    <button onClick={() => handleSaveTheme(false)} className="flex-1 flex items-center justify-center gap-2 bg-primary hover:bg-primary-hover text-on-primary py-2.5 rounded-xl font-bold text-sm shadow-lg shadow-primary/[var(--glow-opacity,0.20)] transition-all active:scale-95"><Save size={16} /> Save Changes</button>
                </div>
            </div>
        );
    };

    const renderFonts = () => (
        <div className="space-y-6">
            <div className="bg-canvas/50 p-4 rounded-lg border border-border space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-border/50">
                    <div><p className="text-text-main font-medium text-sm">Enable Font Previews</p><p className="text-[10px] text-text-muted">Generate preview images for font files</p></div>
                    <button onClick={() => setFontPreview({ ...fontPreview, enabled: !fontPreview.enabled })} className={`p-1 rounded-lg transition-colors ${fontPreview.enabled ? 'text-primary' : 'text-text-muted'}`}>{fontPreview.enabled ? <ToggleRight size={32} /> : <ToggleLeft size={32} />}</button>
                </div>
                {fontPreview.enabled && (
                    <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                        <div className="flex items-center justify-between">
                            <div><p className="text-text-main font-medium text-sm">Font Sheet Mode</p><p className="text-[10px] text-text-muted">Show all characters instead of custom text</p></div>
                            <button onClick={() => setFontPreview({ ...fontPreview, use_font_sheet: !fontPreview.use_font_sheet })} className={`p-1 rounded-lg transition-colors ${fontPreview.use_font_sheet ? 'text-primary' : 'text-text-muted'}`}>{fontPreview.use_font_sheet ? <ToggleRight size={28} /> : <ToggleLeft size={28} />}</button>
                        </div>
                        {!fontPreview.use_font_sheet && (
                            <div className="animate-in fade-in slide-in-from-top-1 duration-200">
                                <label className="text-xs text-text-muted font-bold uppercase mb-1 block">Preview Text</label>
                                <textarea className="w-full bg-surface border border-border rounded-lg p-3 text-sm font-mono h-20 focus:border-primary outline-none resize-none" value={fontPreview.text} onChange={e => setFontPreview({ ...fontPreview, text: e.target.value })} />
                            </div>
                        )}
                        <div className="grid grid-cols-2 gap-4">
                            <BetterColorPicker label="Background Color" color={fontPreview.bg_color} onChange={(c) => setFontPreview({ ...fontPreview, bg_color: c })} />
                            <BetterColorPicker label="Text Color" color={fontPreview.text_color} onChange={(c) => setFontPreview({ ...fontPreview, text_color: c })} />
                        </div>
                        <div className="flex gap-2">
                            <button onClick={() => setFontPreview({ ...fontPreview, bg_color: "#ffffff", text_color: "#000000" })} className="px-3 py-1 bg-white text-black text-xs font-bold rounded border border-gray-300">B&W</button>
                            <button onClick={() => setFontPreview({ ...fontPreview, bg_color: "#000000", text_color: "#ffffff" })} className="px-3 py-1 bg-black text-white text-xs font-bold rounded border border-gray-700">W&B</button>
                        </div>
                        <div className="space-y-2 pt-2 border-t border-border/50">
                            <label className="text-xs text-text-muted font-bold uppercase block">Custom Background (Optional)</label>
                            <p className="text-xs text-text-muted">Upload a PNG/JPG to use as the base canvas instead of a solid color.</p>
                            <div className="flex gap-2 items-center">
                                <input type="file" accept="image/png, image/jpeg" className="text-xs text-text-muted file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-surface-highlight file:text-text-main hover:file:bg-surface cursor-pointer"
                                    onChange={async (e) => {
                                        if (e.target.files && e.target.files[0]) {
                                            const formData = new FormData(); formData.append('background', e.target.files[0]);
                                            try { await axios.post(`${API_BASE}/api/config/font/bg`, formData); setSuccessMsg("Background uploaded!"); } catch { setErrorMsg("Failed to upload background."); }
                                        }
                                    }} />
                            </div>
                        </div>
                        <div>
                            <label className="text-xs text-text-muted font-bold uppercase mb-1 block">Image Size</label>
                            <div className="grid grid-cols-3 gap-2">
                                {['small', 'medium', 'large'].map(s => (<button key={s} onClick={() => setFontPreview({ ...fontPreview, size: s })} className={`py-2 px-3 text-xs font-medium rounded border transition-colors capitalize ${fontPreview.size === s ? 'bg-primary/20 border-primary text-primary' : 'bg-surface border-border text-text-muted hover:bg-surface-highlight'}`}>{s}</button>))}
                            </div>
                        </div>
                        <button onClick={saveFontSettings} className="w-full py-2 bg-surface-highlight hover:bg-surface text-text-main rounded-lg font-medium transition-colors border border-border text-sm">Save Preview Settings</button>
                    </div>
                )}
            </div>
        </div>
    );

    const renderBot = () => (
        <div className="space-y-6">
            <div className="bg-canvas/50 p-4 rounded-lg border border-border space-y-4">
                <div className="space-y-2">
                    <h4 className="text-xs font-bold text-text-muted uppercase">Saved Bots</h4>
                    {loadingBots ? (
                        <div className="flex items-center gap-2 text-text-muted text-sm"><Loader2 className="animate-spin" size={14} /> Loading...</div>
                    ) : savedBots.length === 0 ? (
                        <p className="text-sm text-text-muted italic">No bots saved yet.</p>
                    ) : (
                        <div className="space-y-2">
                            {savedBots.map((bot, idx) => (
                                <div key={idx} className={`flex items-center justify-between p-3 rounded-lg border transition-all ${activeToken === bot.token ? 'bg-primary/10 border-primary/50' : 'bg-surface border-border'}`}>
                                    <div className="flex items-center gap-3">
                                        <div className={`w-8 h-8 rounded-full overflow-hidden shrink-0 flex items-center justify-center ${activeToken === bot.token ? 'bg-primary text-on-primary' : 'bg-surface-highlight text-text-muted'}`}>
                                            {bot.avatar_filename ? (<img src={`/api/avatars/${bot.avatar_filename}`} alt={bot.name} className="w-full h-full object-cover" />) : (<Bot size={16} />)}
                                        </div>
                                        <div><p className={`text-sm font-medium ${activeToken === bot.token ? 'text-primary' : 'text-text-main'}`}>{bot.name}</p><p className="text-[10px] text-text-muted font-mono">{bot.token.substring(0, 10)}...</p></div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {activeToken !== bot.token && <button onClick={() => handleActivateBot(bot.token)} className="text-xs bg-surface-highlight hover:bg-surface text-text-main px-2 py-1 rounded border border-border transition-colors">Select</button>}
                                        <button onClick={() => handleDeleteBot(bot.token)} className="text-text-muted hover:text-red-400 transition-colors p-1"><Trash2 size={14} /></button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                <div className="border-t border-border pt-4 space-y-3">
                    <h4 className="text-xs font-bold text-text-muted uppercase flex items-center gap-2"><Plus size={12} /> Add New Bot</h4>
                    <div className="flex flex-col sm:flex-row gap-2">
                        <input type="text" placeholder="Paste Bot Token from @BotFather" className="w-full sm:flex-1 bg-surface border border-border rounded px-3 py-2 text-sm text-text-main focus:border-primary outline-none font-mono" value={newBotToken} onChange={e => setNewBotToken(e.target.value)} />
                        <button onClick={handleSaveBot} disabled={!newBotToken || savingBot} className="w-full sm:w-auto px-4 py-2 bg-primary hover:bg-primary-hover text-on-primary text-sm font-medium rounded flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                            {savingBot ? <Loader2 className="animate-spin" size={14} /> : <CheckCircle size={14} />} Add
                        </button>
                    </div>
                    <p className="text-[10px] text-text-muted">Bot name will be fetched automatically from Telegram.</p>
                </div>
            </div>
        </div>
    );

    const renderNetwork = () => (
        <div className="space-y-6">
            <div className="bg-canvas/50 p-4 rounded-lg border border-border space-y-4">
                <div className="space-y-4">
                    <div>
                        <label className="text-xs text-text-muted font-bold uppercase mb-1 block flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                            Primary API URL
                        </label>
                        <input 
                            type="text" 
                            className="w-full bg-surface border border-border rounded px-3 py-2 text-sm text-text-main focus:border-primary outline-none font-mono" 
                            value={telegramApiUrl} 
                            onChange={e => setTelegramApiUrl(e.target.value)} 
                            placeholder="http://192.168.0.7:8181" 
                        />
                        <p className="text-[10px] text-text-muted mt-1">Your main local network API endpoint. Always tried first.</p>
                    </div>

                    <div>
                        <label className="text-xs text-text-muted font-bold uppercase mb-1 block flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                            Fallback API URL (Optional)
                        </label>
                        <input 
                            type="text" 
                            className="w-full bg-surface border border-border rounded px-3 py-2 text-sm text-text-main focus:border-primary outline-none font-mono" 
                            value={fallbackApiUrl} 
                            onChange={e => setFallbackApiUrl(e.target.value)} 
                            placeholder="http://192.168.0.8:8181" 
                        />
                        <p className="text-[10px] text-text-muted mt-1">Automatically used when Primary is unavailable. Auto-failover enabled.</p>
                    </div>

                    <div>
                        <label className="text-xs text-text-muted font-bold uppercase mb-1 block flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-blue-400"></span>
                            Tailscale API URL (Optional)
                        </label>
                        <input 
                            type="text" 
                            className="w-full bg-surface border border-border rounded px-3 py-2 text-sm text-text-main focus:border-primary outline-none font-mono" 
                            value={tailscaleApiUrl} 
                            onChange={e => setTailscaleApiUrl(e.target.value)} 
                            placeholder="http://100.87.45.123:8181" 
                        />
                        <p className="text-[10px] text-text-muted mt-1">Remote access via Tailscale private network. Manual switch via header button.</p>
                    </div>
                </div>

                {networkStatus && (
                    <div className="bg-surface-highlight/30 p-3 rounded-lg border border-border/50">
                        <p className="text-[10px] font-bold text-text-muted uppercase mb-2">Current Status</p>
                        <div className="flex items-center gap-2 text-sm">
                            {networkStatus.mode === 'primary' && <span className="text-emerald-400">🟢</span>}
                            {networkStatus.mode === 'fallback' && <span className="text-amber-400">🟡</span>}
                            {networkStatus.mode === 'tailscale' && <span className="text-blue-400">🔵</span>}
                            <span className="text-text-main font-medium">
                                {networkStatus.mode === 'primary' ? 'Connected to Primary' : 
                                 networkStatus.mode === 'fallback' ? 'Connected to Fallback' : 
                                 'Connected to Tailscale'}
                            </span>
                        </div>
                    </div>
                )}

                <button onClick={saveNetworkSettings} className="w-full py-2 bg-surface-highlight hover:bg-surface text-text-main rounded-lg font-medium transition-colors border border-border text-sm">Save Network Settings</button>
            </div>
        </div>
    );

    const renderAi = () => (
        <div className="space-y-6">
            <div className="bg-canvas/50 p-4 rounded-lg border border-border space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-border/50">
                    <div>
                        <p className="text-text-main font-medium text-sm">Enable OpenRouter</p>
                        <p className="text-[10px] text-text-muted">Turn on AI integrations in the app</p>
                    </div>
                    <button
                        onClick={() => setOpenRouterEnabled(!openRouterEnabled)}
                        className={`p-1 rounded-lg transition-colors ${openRouterEnabled ? 'text-primary' : 'text-text-muted'}`}
                    >
                        {openRouterEnabled ? <ToggleRight size={32} /> : <ToggleLeft size={32} />}
                    </button>
                </div>

                {openRouterEnabled && (
                    <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                        <div>
                            <label className="text-xs text-text-muted font-bold uppercase mb-1 block">OpenRouter API Key</label>
                            <input
                                type="password"
                                className="w-full bg-surface border border-border rounded px-3 py-2 text-sm text-text-main focus:border-primary outline-none font-mono"
                                value={openRouterApiKey}
                                onChange={(e) => setOpenRouterApiKey(e.target.value)}
                                placeholder="sk-or-v1-..."
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs text-text-muted font-bold uppercase block">Free Models</label>
                            <div className="flex gap-2">
                                <button
                                    onClick={fetchOpenRouterModels}
                                    className="px-3 py-2 bg-surface-highlight hover:bg-surface text-text-main rounded-lg border border-border text-xs font-medium transition-colors"
                                >
                                    {loadingOpenRouterModels ? 'Loading...' : 'Refresh Free Models'}
                                </button>
                            </div>

                            <select
                                value={openRouterModel}
                                onChange={(e) => setOpenRouterModel(e.target.value)}
                                className="w-full bg-surface border border-border rounded px-3 py-2 text-sm text-text-main focus:border-primary outline-none"
                            >
                                <option value="">Select a free model</option>
                                {openRouterModels.map((model) => (
                                    <option key={model.id} value={model.id}>
                                        {model.name} ({model.id})
                                    </option>
                                ))}
                            </select>
                            <p className="text-[10px] text-text-muted">Only free OpenRouter models are listed.</p>
                        </div>

                        <button
                            onClick={saveAiSettings}
                            className="w-full py-2 bg-surface-highlight hover:bg-surface text-text-main rounded-lg font-medium transition-colors border border-border text-sm"
                        >
                            Save AI Settings
                        </button>
                    </div>
                )}
            </div>
        </div>
    );

    const renderData = () => (
        <div className="space-y-6">
            <div className="space-y-4">
                <div className="bg-canvas/50 p-4 rounded-lg border border-border">
                    <div className="flex items-center gap-2 mb-4 text-text-main font-semibold"><Download size={20} className="text-green-400" /> Backup System</div>
                    <ul className="text-sm text-text-muted space-y-1 mb-4 list-disc list-inside">
                        <li>Bot Tokens & Chat targets</li>
                        <li>Preset filters & rules</li>
                        <li>Sync Registry & History</li>
                        <li>Folder Configurations</li>
                    </ul>
                    <button onClick={handleDownloadBackup} className="w-full py-2 bg-surface-highlight hover:bg-surface text-text-main rounded-lg font-medium transition-colors flex items-center justify-center gap-2 border border-border"><Download size={16} /> Download Full Backup (.zip)</button>
                    <button onClick={handleDownloadDebug} className="w-full mt-2 py-2 bg-surface-highlight hover:bg-surface text-text-main rounded-lg font-medium transition-colors flex items-center justify-center gap-2 border border-border"><FileText size={16} /> Download System Report (.txt)</button>
                </div>
            </div>
            <hr className="border-border" />
            <div className="space-y-4">
                <div className="bg-canvas/50 p-4 rounded-lg border border-border">
                    <div className="flex items-center gap-2 mb-4 text-text-main font-semibold"><Upload size={20} className="text-red-400" /> Restore Backup</div>
                    <div className="bg-red-500/5 border border-red-500/10 p-4 rounded-lg">
                        <div className="flex gap-3 mb-4"><AlertTriangle className="text-red-500 shrink-0" size={20} /><p className="text-xs text-red-400 leading-relaxed"><strong className="block mb-1">Warning: Irreversible Action</strong>Restoring will completely REPLACE your current database and configuration. Any folders or presets created since the backup will be lost.</p></div>
                        <div className="space-y-3">
                            <input type="file" accept=".zip" onChange={handleFileSelect} className="block w-full text-sm text-text-muted file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-surface-highlight file:text-text-main hover:file:bg-surface cursor-pointer" />
                            <button onClick={handleRestore} disabled={!selectedFile || restoring} className={`w-full py-2 rounded-lg font-bold flex items-center justify-center gap-2 transition-all ${!selectedFile ? 'bg-surface-highlight text-text-muted cursor-not-allowed' : 'bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-900/20'}`}>{restoring ? <><Loader2 className="animate-spin" size={18} /> Restoring...</> : <><Upload size={18} /> Restore Backup</>}</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );

    const getTitle = () => {
        if (view === 'root') return 'Settings';
        if (view === 'appearance') return 'Appearance';
        if (view === 'studio') return 'Theme Studio';
        if (view === 'animations') return 'Animations Studio';
        if (view === 'fonts') return 'Font Generator';
        if (view === 'bot') return 'Bot Manager';
        if (view === 'ai') return 'AI';
        if (view === 'data') return 'Data & Storage';
        if (view === 'network') return 'Network';
        return 'Settings';
    };

    return (
        <ResponsiveModal isOpen={isOpen} onClose={onClose} title={getTitle()} widthClass="max-w-lg" actions={null}>
            <div className="space-y-4">
                {view !== 'root' && (
                    <button onClick={() => { if (view === 'studio' || view === 'animations') setView('appearance'); else setView('root'); }} className="mb-4 flex items-center gap-2 text-sm text-text-muted hover:text-text-main transition-colors w-fit">
                        <ChevronLeft size={16} /> Back to { (view === 'studio' || view === 'animations') ? 'Appearance' : 'Settings'}
                    </button>
                )}

                {/* Background Selection Sheet */}
                {showBackgroundSheet && (
                    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowBackgroundSheet(false)}>
                        <div className="bg-surface w-full max-w-lg max-h-[70vh] rounded-t-2xl sm:rounded-2xl border border-border overflow-hidden" onClick={(e) => e.stopPropagation()}>
                            <div className="p-4 border-b border-border flex items-center justify-between">
                                <h3 className="text-sm font-bold text-text-main">Select Background Image</h3>
                                <button onClick={() => setShowBackgroundSheet(false)} className="p-2 hover:bg-surface-highlight rounded-lg transition-colors">
                                    <ChevronLeft size={20} className="rotate-180" />
                                </button>
                            </div>
                            <div className="p-4 overflow-y-auto max-h-[50vh]">
                                {backgrounds.length === 0 ? (
                                    <div className="text-center py-8 text-text-muted">
                                        <Upload size={48} className="mx-auto mb-3 opacity-50" />
                                        <p className="text-sm">No backgrounds yet</p>
                                        <p className="text-xs mt-1">Upload an image to get started</p>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-3 gap-2">
                                        {backgrounds.map((bg) => (
                                            <button
                                                key={bg}
                                                onClick={() => {
                                                    updateBackground('imagePath', bg);
                                                    updateBackground('enabled', true);
                                                    setShowBackgroundSheet(false);
                                                }}
                                                className={`aspect-square rounded-lg overflow-hidden border-2 transition-all hover:border-primary ${
                                                    editingTheme?.background?.imagePath === bg ? 'border-primary' : 'border-border/50'
                                                }`}
                                            >
                                                <img
                                                    src={`${API_BASE}/api/backgrounds/${bg}`}
                                                    alt={bg}
                                                    className="w-full h-full object-cover"
                                                />
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <div className="p-4 border-t border-border">
                                <label className="text-[10px] text-text-muted uppercase tracking-wider font-bold block mb-2">Upload New Image</label>
                                <input
                                    type="file"
                                    accept="image/*"
                                    onChange={handleUploadBackground}
                                    disabled={uploadingBackground}
                                    className="w-full text-xs text-text-muted file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-surface-highlight file:text-text-main hover:file:bg-surface cursor-pointer disabled:opacity-50"
                                />
                                {uploadingBackground && (
                                    <div className="flex items-center gap-2 text-xs text-text-muted mt-2">
                                        <Loader2 className="animate-spin" size={14} />
                                        Uploading...
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
                <div className="flex-1 min-h-[300px]">
                    {view === 'root' && renderRoot()}
                    {view === 'appearance' && renderAppearance()}
                    {view === 'studio' && renderStudio()}
                    {view === 'animations' && renderAnimations()}
                    {view === 'fonts' && renderFonts()}
                    {view === 'bot' && renderBot()}
                    {view === 'network' && renderNetwork()}
                    {view === 'ai' && renderAi()}
                    {view === 'data' && renderData()}
                    {(successMsg || errorMsg) && (<div className={`mt-4 p-4 rounded-lg flex items-start gap-3 border animate-in slide-in-from-bottom-2 ${successMsg ? 'bg-green-500/10 border-green-500/30 text-green-400' : 'bg-red-500/10 border-red-500/30 text-red-400'}`}>{successMsg ? <CheckCircle size={20} className="mt-0.5" /> : <AlertTriangle size={20} className="mt-0.5" />}<p className="text-sm font-bold">{successMsg || errorMsg}</p></div>)}
                </div>
            </div>
        </ResponsiveModal>
    );
}
