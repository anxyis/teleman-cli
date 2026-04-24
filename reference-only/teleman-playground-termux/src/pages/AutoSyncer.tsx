import { useState, useEffect, useRef } from 'react';
import { DynamicIcon } from '../components/common/DynamicIcon';
import { FolderCard } from '../components/FolderCard';
import { SystemStatusPanel } from '../components/SystemStatusPanel';
import { useTheme } from '../context/ThemeContext';
import { AddFolderModal } from '../components/AddFolderModal';
import { ActiveJobCard } from '../components/ActiveJobCard';
import { PresetManager } from '../components/PresetManager';
import { DatabaseManager } from '../components/DatabaseManager';
import { GroupCard } from '../components/GroupCard';
import { GroupEditorModal } from '../components/GroupEditorModal';
import { TargetsManager } from '../components/TargetsManager';
import { QueueManager } from '../components/QueueManager';
import { PageLayout } from '../components/layout/PageLayout';
import { AnimatedText } from '../components/common/AnimatedText';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { useStats } from '../hooks/useStats';

// Dashboard Widget Component - extracted to prevent re-renders
interface DashboardWidgetProps {
    icon: string;
    label: string;
    value: string | number;
    detail: string;
    action: () => void;
    onAdd?: () => void;
    color?: string;
    idx?: number;
}

function DashboardWidget({ icon, label, value, detail, action, onAdd, color = "primary", idx = 0 }: DashboardWidgetProps) {
    return (
        <motion.button
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 + idx * 0.05 }}
            onClick={action}
            className="group relative flex flex-col items-start p-5 bg-surface border border-border/50 hover:border-primary/50 transition-all active:scale-95 snap-start shrink-0 w-[240px] sm:w-auto h-full"
            style={{ borderRadius: 'var(--radius-card)' }}
        >
            <div className={`p-3 rounded-2xl mb-4 bg-${color}/10 text-${color} group-hover:scale-110 transition-transform`}>
                <DynamicIcon name={icon as any} size={24} />
            </div>
            <div className="flex flex-col items-start text-left w-full">
                <span className="text-text-muted text-xs font-bold uppercase tracking-wider mb-1">
                    {label}
                </span>
                <span className="text-2xl font-bold text-text-main mb-1">
                    {value}
                </span>
                <span className="text-[10px] text-text-muted/80 font-medium truncate w-full" title={detail}>
                    {detail}
                </span>
            </div>
            {onAdd && (
                <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={(e) => { e.stopPropagation(); onAdd(); }}
                    className="absolute top-2 right-2 p-3.5 bg-primary text-on-primary rounded-xl shadow-lg hover:shadow-primary/30 transition-all"
                    style={{ borderRadius: 'var(--radius-button)' }}
                >
                    <DynamicIcon name="plus" size={22} />
                </motion.button>
            )}
            {!onAdd && (
                <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="p-1.5 bg-primary/20 rounded-lg text-primary">
                        <DynamicIcon name={"arrow-left" as any} size={14} className="rotate-180" />
                    </div>
                </div>
            )}
        </motion.button>
    );
}

// Carousel Widget Component for Apple TV style cards
interface CarouselWidgetProps {
    icon: string;
    label: string;
    value: string | number;
    detail: string;
    action: () => void;
    onAdd?: () => void;
    color?: string;
    isExpanded: boolean;
    onExpand: () => void;
    widgetIndex: number;
}

function CarouselWidget({ icon, label, value, detail, action, onAdd, color = "primary", isExpanded, onExpand, widgetIndex }: CarouselWidgetProps) {
    return (
        <motion.div
            data-widget-index={widgetIndex}
            animate={{
                scale: isExpanded ? 1 : 0.9,
                opacity: isExpanded ? 1 : 0.7,
            }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            onClick={() => { if (isExpanded) action(); else onExpand(); }}
            className={`relative flex flex-col items-start p-6 bg-surface border transition-all snap-center shrink-0 cursor-pointer ${
                isExpanded 
                    ? 'border-primary/50 shadow-lg shadow-primary/10 w-[85vw]' 
                    : 'border-border/30 w-[85vw]'
            }`}
            style={{ 
                borderRadius: 'var(--radius-card)',
                scrollSnapAlign: 'center',
                scrollSnapStop: 'always'
            }}
        >
            <div className={`p-4 rounded-2xl mb-4 bg-${color}/10 text-${color}`}>
                <DynamicIcon name={icon as any} size={28} />
            </div>
            <div className="flex flex-col items-start text-left w-full">
                <span className="text-text-muted text-xs font-bold uppercase tracking-wider mb-1">
                    {label}
                </span>
                <span className={`font-bold text-text-main mb-1 transition-all ${isExpanded ? 'text-4xl' : 'text-2xl'}`}>
                    {value}
                </span>
                <span className="text-[10px] text-text-muted/80 font-medium truncate w-full" title={detail}>
                    {detail}
                </span>
            </div>
            {onAdd && isExpanded && (
                <motion.button
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={(e) => { e.stopPropagation(); onAdd(); }}
                    className="absolute top-4 right-4 p-3 bg-primary text-on-primary rounded-xl shadow-lg"
                    style={{ borderRadius: 'var(--radius-button)' }}
                >
                    <DynamicIcon name="plus" size={20} />
                </motion.button>
            )}
            {isExpanded && (
                <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="absolute bottom-4 right-4 text-text-muted text-xs flex items-center gap-1"
                >
                    <span>Tap to open</span>
                    <DynamicIcon name="arrow-left" size={12} className="rotate-180" />
                </motion.div>
            )}
        </motion.div>
    );
}

export function AutoSyncer() {
    const { stats } = useStats(2500);
    const [folders, setFolders] = useState<any[]>([]);
    const [queue, setQueue] = useState<any[]>([]);
    const [presets, setPresets] = useState<any[]>([]);
    const [registry, setRegistry] = useState<any>(null);
    const [activeJob, setActiveJob] = useState<any>(null);
    const [showAddModal, setShowAddModal] = useState(false);
    const [editingFolder, setEditingFolder] = useState<any>(null);
    const [showPresetManager, setShowPresetManager] = useState(false);
    const [presetManagerNew, setPresetManagerNew] = useState(false);
    const [showDbManager, setShowDbManager] = useState(false);
    const [showTargetsManager, setShowTargetsManager] = useState(false);
    const [showQueueManager, setShowQueueManager] = useState(false);
    const [groups, setGroups] = useState<any[]>([]);
    const [showGroupEditor, setShowGroupEditor] = useState(false);
    const [editingGroup, setEditingGroup] = useState<any>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [sortBy, setSortBy] = useState<'name' | 'last_run'>('name');
    const [showSearchOverlay, setShowSearchOverlay] = useState(false);
    const [fabExpanded, setFabExpanded] = useState(false);
    const { currentTheme } = useTheme();

    const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';

    useEffect(() => {
        // Fetch registry and active job separately
        const fetchRegistryAndJob = async () => {
            try {
                const [registryRes, jobRes] = await Promise.all([
                    axios.get(`${API_BASE}/api/registry/stats`).catch(() => ({ data: null })),
                    axios.get(`${API_BASE}/api/job/current`).catch(() => ({ data: null }))
                ]);
                if (registryRes.data) setRegistry(registryRes.data);
                
                const jobData = jobRes.data;
                if (jobData && jobData.status !== 'completed' && jobData.status !== 'failed' && jobData.status !== 'idle') {
                    setActiveJob({
                        jobId: jobData.jobId,
                        status: jobData.status,
                        name: jobData.name,
                        currentFile: jobData.currentFile || 'Initializing...',
                        progress: jobData.totalFilesDiscovered > 0
                            ? (jobData.filesSent / jobData.totalFilesDiscovered) * 100
                            : 0,
                        speed: jobData.speed || '--',
                        eta: jobData.eta || '--',
                        processedSize: `${(jobData.totalBytesSent / 1024 / 1024).toFixed(2)} MB`,
                        totalSize: '?'
                    });
                } else {
                    setActiveJob(null);
                }
            } catch (e) {
                console.error('Failed to fetch registry/job', e);
            }
        };

        fetchRegistryAndJob();
        const interval = setInterval(fetchRegistryAndJob, 2500);
        return () => clearInterval(interval);
    }, []);

    const [fabMode, setFabMode] = useState(() => {
        return localStorage.getItem('fabMode') === 'true';
    });
    const [fabGroupMode, setFabGroupMode] = useState(() => {
        return localStorage.getItem('fabGroupMode') === 'true';
    });
    const [fabSortMode, setFabSortMode] = useState(() => {
        return localStorage.getItem('fabSortMode') === 'true';
    });
    const [floatingSearch, setFloatingSearch] = useState(() => {
        return localStorage.getItem('floatingSearch') === 'true';
    });
    const [syncAnimationsEnabled, setSyncAnimationsEnabled] = useState(() => {
        return localStorage.getItem('syncAnimationsEnabled') !== 'false';
    });
    const [widgetCarousel, setWidgetCarousel] = useState(() => {
        return localStorage.getItem('widgetCarousel') === 'true';
    });
    const [expandedWidgetIndex, setExpandedWidgetIndex] = useState(0);
    const carouselRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        // Listen for toggle changes from SettingsModal
        const handleSettingsChange = (e: CustomEvent) => {
            if (e.detail.fabMode !== undefined) setFabMode(e.detail.fabMode);
            if (e.detail.fabGroupMode !== undefined) setFabGroupMode(e.detail.fabGroupMode);
            if (e.detail.fabSortMode !== undefined) setFabSortMode(e.detail.fabSortMode);
            if (e.detail.floatingSearch !== undefined) setFloatingSearch(e.detail.floatingSearch);
            if (e.detail.syncAnimationsEnabled !== undefined) setSyncAnimationsEnabled(e.detail.syncAnimationsEnabled);
            if (e.detail.widgetCarousel !== undefined) setWidgetCarousel(e.detail.widgetCarousel);
        };
        window.addEventListener('settingsChanged', handleSettingsChange as EventListener);
        return () => window.removeEventListener('settingsChanged', handleSettingsChange as EventListener);
    }, []);

    // Auto-detect which widget is in view using IntersectionObserver
    useEffect(() => {
        if (!widgetCarousel || !carouselRef.current) return;

        const widgets = carouselRef.current.querySelectorAll('[data-widget-index]');
        
        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        const index = parseInt(entry.target.getAttribute('data-widget-index') || '0');
                        setExpandedWidgetIndex(index);
                    }
                });
            },
            {
                root: carouselRef.current,
                threshold: 0.6, // Widget is "active" when 60% visible
                rootMargin: '0px -20% 0px -20%' // Ignore side widgets
            }
        );

        widgets.forEach((widget) => observer.observe(widget));

        return () => observer.disconnect();
    }, [widgetCarousel]); // Re-run when carousel mode changes

    useEffect(() => {
        refreshAll();
    }, []);

    const refreshAll = async () => {
        await Promise.all([loadFolders(), loadGroups(), loadPresets()]);
    };

    const loadFolders = async () => {
        try {
            const res = await axios.get(`${API_BASE}/api/folders`);
            setFolders(res.data);
        } catch (e) {
            console.error('Failed to load folders', e);
        }
    };

    const loadGroups = async () => {
        try {
            const res = await axios.get(`${API_BASE}/api/groups`);
            setGroups(res.data);
        } catch (e) {
            console.error('Failed to load groups', e);
        }
    };

    const loadPresets = async () => {
        try {
            const res = await axios.get(`${API_BASE}/api/presets`);
            setPresets(res.data);
        } catch (e) {
            console.error('Failed to load presets', e);
        }
    };

    const handleSaveConfig = async (folder: any) => {
        try {
            if (editingFolder) {
                await axios.put(`${API_BASE}/api/folders/${editingFolder.id}`, folder);
            } else {
                await axios.post(`${API_BASE}/api/folders`, folder);
            }
            setShowAddModal(false);
            setEditingFolder(null); // Reset
            loadFolders();
        } catch (e) {
            alert('Failed to save folder configuration. Check for duplicates or errors.');
        }
    };

    const handleEdit = (folder: any) => {
        setEditingFolder(folder);
        setShowAddModal(true);
    };

    const handleRunFolder = async (folderId: string) => {
        try {
            await axios.post(`${API_BASE}/api/folders/${folderId}/run`);
        } catch (e: any) {
            if (e.response?.data?.error === "NO_BOT_TOKEN") {
                alert("Please add a Bot Token in Settings first.");
            } else {
                alert('Failed to start sync');
            }
        }
    };

    const handleDeleteFolder = async (folderId: string) => {
        if (!confirm('Delete this folder configuration?')) return;
        try {
            await axios.delete(`${API_BASE}/api/folders/${folderId}`);
            loadFolders();
        } catch (e) {
            alert('Failed to delete folder');
        }
    };

    const handleSkipFile = async () => {
        try {
            await axios.post(`${API_BASE}/api/job/skip`);
        } catch (e) {
            console.error(e);
        }
    };

    const handleCancelJob = async (deleteSent: boolean) => {
        try {
            await axios.post(`${API_BASE}/api/job/cancel`, { deleteSent });
        } catch (e) {
            console.error(e);
        }
    };

    const handleSaveGroup = async (groupData: any) => {
        try {
            if (editingGroup) {
                await axios.put(`${API_BASE}/api/groups/${editingGroup.id}`, groupData);
            } else {
                await axios.post(`${API_BASE}/api/groups`, groupData);
            }
            setShowGroupEditor(false);
            setEditingGroup(null);
            refreshAll();
        } catch (e) {
            alert('Failed to save group.');
        }
    };

    const handleDeleteGroup = async (id: string) => {
        if (!confirm('Delete this sync group?')) return;
        try {
            await axios.delete(`${API_BASE}/api/groups/${id}`);
            refreshAll();
        } catch (e) {
            alert('Failed to delete group');
        }
    };

    const handleRunGroup = async (id: string) => {
        try {
            await axios.post(`${API_BASE}/api/groups/${id}/run`);
        } catch (e: any) {
            if (e.response?.data?.error === "NO_BOT_TOKEN") {
                alert("Please add a Bot Token in Settings first.");
            } else {
                alert('Failed to start group sync');
            }
        }
    };

    const handleRemoveFromQueue = async (id: string) => {
        try {
            await axios.delete(`${API_BASE}/api/queue/${id}`);
            const res = await axios.get(`${API_BASE}/api/queue`);
            setQueue(res.data);
        } catch (e) {
            console.error(e);
        }
    };

    const handleReorderQueue = async (newIds: string[]) => {
        // Optimistic update
        const reorderedQueue: any[] = [];
        newIds.forEach(id => {
            const item = queue.find(i => i.id === id);
            if (item) reorderedQueue.push(item);
        });
        queue.forEach(item => { if (!newIds.includes(item.id)) reorderedQueue.push(item); });

        setQueue(reorderedQueue);

        try {
            await axios.post(`${API_BASE}/api/queue/reorder`, { ids: newIds });
        } catch (e) {
            console.error(e);
        }
    };

    const handleClearQueue = async () => {
        if (!confirm("Clear all queued jobs?")) return;
        try {
            await axios.post(`${API_BASE}/api/queue/clear`);
            setQueue([]);
        } catch (e) {
            console.error(e);
        }
    };

    const filteredGroups = groups
        .filter(g => g.name.toLowerCase().includes(searchQuery.toLowerCase()))
        .sort((a, b) => {
            if (sortBy === 'name') return a.name.localeCompare(b.name);
            return (b.last_run || 0) - (a.last_run || 0);
        });

    const filteredFolders = folders
        .filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()))
        .sort((a, b) => {
            if (sortBy === 'name') return a.name.localeCompare(b.name);
            return (b.last_sync || 0) - (a.last_sync || 0);
        });

    return (
        <PageLayout
            sidebar={
                <div className="h-full flex flex-col p-4">
                    <SystemStatusPanel stats={stats} registry={registry} />
                </div>
            }
            header={
                currentTheme?.id === 'legacy' ? (
                    <div className="w-full flex items-center justify-between py-2">
                         <h1 className="text-xl font-bold text-text-main flex items-center gap-2">
                             <AnimatedText text="Auto-Syncer" />
                         </h1>
                    </div>
                ) : null
            }
        >
            <div className="space-y-6">

                {/* Dashboard Widgets Grid */}
                <div className="flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                        <div className="hidden lg:block">
                            <h1 className="text-xl font-bold text-text-main tracking-tight">Dashboard Overview</h1>
                            <p className="text-text-muted text-xs">System health and metrics</p>
                        </div>
                        
                        {!fabMode && (
                            <motion.button
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                onClick={() => setShowAddModal(true)}
                                className="flex items-center gap-2 px-6 py-3.5 bg-primary hover:bg-primary-hover text-on-primary font-bold transition-all shadow-lg shadow-primary/[var(--glow-opacity,0.20)] active:scale-95 ml-auto"
                                style={{ borderRadius: 'var(--radius-button)' }}
                            >
                                <DynamicIcon name="plus" size={20} /> <span>New Sync</span>
                            </motion.button>
                        )}
                    </div>

                    {/* Widget Display: Carousel or Horizontal Scroll */}
                    {widgetCarousel ? (
                        /* Carousel Mode - Apple TV style */
                        <div className="relative">
                            <div 
                                ref={carouselRef}
                                className="flex overflow-x-auto gap-3 snap-x snap-mandatory pb-4 no-scrollbar scroll-smooth px-[7.5vw]"
                                style={{ 
                                    scrollSnapType: 'x mandatory',
                                    WebkitOverflowScrolling: 'touch',
                                }}
                            >
                                <CarouselWidget
                                    icon="layers"
                                    label="Presets"
                                    value={stats?.presets?.total || 0}
                                    detail={`${stats?.presets?.active || 0} in active use`}
                                    action={() => { setPresetManagerNew(false); setShowPresetManager(true); }}
                                    onAdd={() => { setPresetManagerNew(true); setShowPresetManager(true); }}
                                    isExpanded={expandedWidgetIndex === 0}
                                    onExpand={() => setExpandedWidgetIndex(0)}
                                    widgetIndex={0}
                                />
                                <CarouselWidget
                                    icon="database"
                                    label="Database"
                                    value={`${stats?.database?.sizeMB || 0} MB`}
                                    detail={`${stats?.database?.entries || 0} fingerprints`}
                                    action={() => setShowDbManager(true)}
                                    isExpanded={expandedWidgetIndex === 1}
                                    onExpand={() => setExpandedWidgetIndex(1)}
                                    widgetIndex={1}
                                />
                                <CarouselWidget
                                    icon="target"
                                    label="Targets"
                                    value={stats?.targets?.total || 0}
                                    detail={stats?.targets?.breakdown?.map((t: any) => `${t.count} ${t.type}s`).join(' • ') || 'No targets'}
                                    action={() => setShowTargetsManager(true)}
                                    isExpanded={expandedWidgetIndex === 2}
                                    onExpand={() => setExpandedWidgetIndex(2)}
                                    widgetIndex={2}
                                />
                                <CarouselWidget
                                    icon="play-circle"
                                    label="Queue"
                                    value={stats?.queue?.total || 0}
                                    detail={`Next: ${stats?.queue?.next || 'Idle'}`}
                                    action={() => setShowQueueManager(true)}
                                    isExpanded={expandedWidgetIndex === 3}
                                    onExpand={() => setExpandedWidgetIndex(3)}
                                    widgetIndex={3}
                                />
                                <CarouselWidget
                                    icon="file-text"
                                    label="Sync Health"
                                    value={stats?.logs?.status === 'healthy' ? 'Healthy' : 'Issues'}
                                    detail={`${stats?.logs?.recentSuccess || 0} OK • ${stats?.logs?.recentFailure || 0} Errors (24h)`}
                                    color={stats?.logs?.status === 'healthy' ? 'primary' : 'rose-500'}
                                    action={() => window.location.href = '/autosyncer/logs'}
                                    isExpanded={expandedWidgetIndex === 4}
                                    onExpand={() => setExpandedWidgetIndex(4)}
                                    widgetIndex={4}
                                />
                            </div>
                            {/* Navigation Dots */}
                            <div className="flex justify-center gap-2 mt-2">
                                {[0, 1, 2, 3, 4].map((idx) => (
                                    <button
                                        key={idx}
                                        onClick={() => {
                                            setExpandedWidgetIndex(idx);
                                            if (carouselRef.current) {
                                                const cardWidth = carouselRef.current.clientWidth * 0.85;
                                                const gap = 12; // 3 * 4 (tailwind gap-3)
                                                carouselRef.current.scrollTo({
                                                    left: (cardWidth + gap) * idx,
                                                    behavior: 'smooth'
                                                });
                                            }
                                        }}
                                        className={`w-2 h-2 rounded-full transition-all ${
                                            expandedWidgetIndex === idx 
                                                ? 'bg-primary w-6' 
                                                : 'bg-border/50 hover:bg-border'
                                        }`}
                                    />
                                ))}
                            </div>
                        </div>
                    ) : (
                        /* Horizontal Scroll Mode - Default */
                        <div className="flex lg:grid lg:grid-cols-5 gap-4 overflow-x-auto no-scrollbar snap-x snap-mandatory pb-4 lg:pb-0">
                            <DashboardWidget
                                idx={0}
                                icon="layers"
                                label="Presets"
                                value={stats?.presets?.total || 0}
                                detail={`${stats?.presets?.active || 0} in active use`}
                                action={() => { setPresetManagerNew(false); setShowPresetManager(true); }}
                                onAdd={() => { setPresetManagerNew(true); setShowPresetManager(true); }}
                            />
                            <DashboardWidget
                                idx={1}
                                icon="database"
                                label="Database"
                                value={`${stats?.database?.sizeMB || 0} MB`}
                                detail={`${stats?.database?.entries || 0} fingerprints`}
                                action={() => setShowDbManager(true)}
                            />
                            <DashboardWidget
                                idx={2}
                                icon="target"
                                label="Targets"
                                value={stats?.targets?.total || 0}
                                detail={stats?.targets?.breakdown?.map((t: any) => `${t.count} ${t.type}s`).join(' • ') || 'No targets'}
                                action={() => setShowTargetsManager(true)}
                            />
                            <DashboardWidget
                                idx={3}
                                icon="play-circle"
                                label="Queue"
                                value={stats?.queue?.total || 0}
                                detail={`Next: ${stats?.queue?.next || 'Idle'}`}
                                action={() => setShowQueueManager(true)}
                            />
                            <DashboardWidget
                                idx={4}
                                icon="file-text"
                                label="Sync Health"
                                value={stats?.logs?.status === 'healthy' ? 'Healthy' : 'Issues'}
                                detail={`${stats?.logs?.recentSuccess || 0} OK • ${stats?.logs?.recentFailure || 0} Errors (24h)`}
                                color={stats?.logs?.status === 'healthy' ? 'primary' : 'rose-500'}
                                action={() => window.location.href = '/autosyncer/logs'}
                            />
                        </div>
                    )}
                </div>

                {/* Active Job Monitor */}
                {activeJob && (
                    <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
                        <ActiveJobCard
                            job={activeJob}
                            onCancel={handleCancelJob}
                            onSkip={handleSkipFile}
                        />
                    </motion.div>
                )}

                {/* Folders & Groups Content */}
                <div className="space-y-6">

                        {/* Search & Toolbar */}
                        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="flex flex-col sm:flex-row gap-3">
                            {!floatingSearch && (
                                <div className="relative flex-1">
                                    <DynamicIcon name={"search" as any} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={18} />
                                    <input
                                        type="text"
                                        placeholder="Search folders..."
                                        value={searchQuery}
                                        onChange={e => setSearchQuery(e.target.value)}
                                        className="w-full bg-surface-highlight border-none rounded-xl pl-10 pr-4 py-3 text-text-main focus:ring-2 focus:ring-primary/50 outline-none text-base"
                                    />
                                </div>
                            )}
                            
                            <div className={`flex gap-2 ${floatingSearch ? 'w-full' : ''}`}>
                                {!fabSortMode && (
                                    <button
                                        onClick={() => setSortBy(sortBy === 'name' ? 'last_run' : 'name')}
                                        className="flex-1 sm:flex-none justify-center px-4 py-3 bg-surface hover:bg-surface-highlight rounded-xl text-text-muted hover:text-text-main flex items-center gap-2 transition-colors border border-border/50"
                                    >
                                        <DynamicIcon name={"sort" as any} size={18} />
                                        <span className="text-sm">{sortBy === 'name' ? 'Name' : 'Recent'}</span>
                                    </button>
                                )}

                                {!fabGroupMode && (
                                    <button
                                        onClick={() => setShowGroupEditor(true)}
                                        className="flex-1 sm:flex-none justify-center flex items-center gap-2 px-4 py-3 bg-surface hover:bg-surface-highlight border border-emerald-500/30 text-emerald-400 hover:text-emerald-300 font-medium rounded-xl transition-colors whitespace-nowrap"
                                    >
                                        <DynamicIcon name={"plus" as any} size={18} /> <span className="text-sm">Group</span>
                                    </button>
                                )}
                            </div>
                        </motion.div>

                        {/* GROUPS LIST */}
                        <div>
                            {filteredGroups.length > 0 && (
                                <div className="space-y-4 mb-8">
                                    <h2 className="text-lg font-bold text-text-main flex items-center gap-2">
                                        <DynamicIcon name="layers" size={20} className="text-emerald-400" />
                                        <AnimatedText text="Sync Groups" />
                                    </h2>
                                    <div className="grid gap-4">
                                        {filteredGroups.map((group) => (
                                            <motion.div 
                                                key={group.id}
                                                initial={syncAnimationsEnabled ? { opacity: 0, y: 20 } : { opacity: 1, y: 0 }}
                                                whileInView={{ opacity: 1, y: 0 }}
                                                viewport={{ once: false, amount: 0, margin: "0px 0px -50px 0px" }}
                                                transition={{ duration: 0.4, ease: "easeOut" }}
                                                className="w-full min-w-0 flex flex-col"
                                            >
                                                <GroupCard
                                                    group={group}
                                                    onRun={handleRunGroup}
                                                    onEdit={(g) => { setEditingGroup(g); setShowGroupEditor(true); }}
                                                    onDelete={handleDeleteGroup}
                                                />
                                            </motion.div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* FOLDERS LIST (Legacy/Single) */}
                        <div>
                            <div className="flex items-center justify-between mb-4">
                                <h2 className="text-lg font-bold text-text-main"><AnimatedText text="Single Folders" /></h2>
                            </div>

                            {filteredFolders.length === 0 && filteredGroups.length === 0 ? (
                                <motion.div 
                                    initial={{ opacity: 0 }}
                                    whileInView={{ opacity: 1 }}
                                    viewport={{ once: true }}
                                    className="bg-surface rounded-xl p-12 text-center text-text-muted"
                                >
                                    <p>No sync configurations found.</p>
                                    <button onClick={() => setShowAddModal(true)} className="mt-4 text-primary font-medium">Create your first sync</button>
                                </motion.div>
                            ) : (
                                <div className="grid gap-4">
                                    {filteredFolders.map((folder) => (
                                        <motion.div 
                                            key={folder.id}
                                            initial={syncAnimationsEnabled ? { opacity: 0, y: 20 } : { opacity: 1, y: 0 }}
                                            whileInView={{ opacity: 1, y: 0 }}
                                            viewport={{ once: false, amount: 0, margin: "0px 0px -50px 0px" }}
                                            transition={{ duration: 0.4, ease: "easeOut" }}
                                            className="w-full min-w-0 flex flex-col"
                                        >
                                            <FolderCard
                                                folder={folder}
                                                onRun={handleRunFolder}
                                                onDelete={handleDeleteFolder}
                                                onEdit={handleEdit}
                                            />
                                        </motion.div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
            </div>

            {/* Floating Action Buttons Stack */}
            {(fabMode || fabGroupMode || floatingSearch || fabSortMode) && (
                <div className="fixed bottom-24 right-6 z-50 flex flex-col-reverse gap-4 pointer-events-none items-end">
                    {/* Master Toggle Button */}
                    <motion.button
                        layout
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                        onClick={() => setFabExpanded(!fabExpanded)}
                        className="pointer-events-auto w-14 h-14 flex items-center justify-center bg-primary text-on-primary rounded-2xl shadow-2xl shadow-primary/[var(--glow-opacity,0.30)] transition-transform z-10"
                    >
                        <motion.div
                            animate={{ rotate: fabExpanded ? 180 : 0 }}
                            transition={{ duration: 0.3 }}
                        >
                            <DynamicIcon name={"chevron-up" as any} size={24} className="text-on-primary" strokeWidth={2.5} />
                        </motion.div>
                    </motion.button>

                    {/* Collapsible Buttons */}
                    <AnimatePresence>
                        {fabExpanded && (
                            <motion.div 
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: 20 }}
                                className="flex flex-col-reverse gap-4 items-end"
                            >
                                {/* Floating Add Button */}
                                {fabMode && (
                                    <motion.button
                                        initial={{ scale: 0 }}
                                        animate={{ scale: 1 }}
                                        whileHover={{ scale: 1.1 }}
                                        whileTap={{ scale: 0.9 }}
                                        onClick={() => { setShowAddModal(true); setFabExpanded(false); }}
                                        className="pointer-events-auto w-14 h-14 flex items-center justify-center bg-primary text-on-primary rounded-2xl shadow-lg shadow-primary/[var(--glow-opacity,0.20)] transition-transform"
                                    >
                                        <DynamicIcon name={"plus" as any} size={24} />
                                    </motion.button>
                                )}

                                {/* Floating Group Button */}
                                {fabGroupMode && (
                                    <motion.button
                                        initial={{ scale: 0 }}
                                        animate={{ scale: 1 }}
                                        whileHover={{ scale: 1.1 }}
                                        whileTap={{ scale: 0.9 }}
                                        onClick={() => { setShowGroupEditor(true); setFabExpanded(false); }}
                                        className="pointer-events-auto w-14 h-14 flex items-center justify-center bg-primary text-on-primary rounded-2xl shadow-lg shadow-primary/[var(--glow-opacity,0.20)] transition-transform"
                                    >
                                        <DynamicIcon name={"layers" as any} size={24} />
                                    </motion.button>
                                )}

                                {/* Floating Search Button */}
                                {floatingSearch && (
                                    <motion.button
                                        initial={{ scale: 0 }}
                                        animate={{ scale: 1 }}
                                        whileHover={{ scale: 1.1 }}
                                        whileTap={{ scale: 0.9 }}
                                        onClick={() => { setShowSearchOverlay(true); setFabExpanded(false); }}
                                        className="pointer-events-auto w-14 h-14 flex items-center justify-center bg-primary text-on-primary rounded-2xl shadow-lg shadow-primary/[var(--glow-opacity,0.20)] transition-transform"
                                    >
                                        <DynamicIcon name={"search" as any} size={24} />
                                    </motion.button>
                                )}

                                {/* Floating Sort Button */}
                                {fabSortMode && (
                                    <motion.button
                                        initial={{ scale: 0, x: 20 }}
                                        animate={{ scale: 1, x: 0 }}
                                        whileHover={{ scale: 1.1 }}
                                        whileTap={{ scale: 0.95 }}
                                        onClick={() => setSortBy(sortBy === 'name' ? 'last_run' : 'name')}
                                        className="pointer-events-auto h-14 flex items-center gap-3 px-5 bg-primary text-on-primary rounded-2xl shadow-lg shadow-primary/[var(--glow-opacity,0.20)] transition-transform"
                                    >
                                        <DynamicIcon name={"sort" as any} size={20} />
                                        <span className="text-xs font-bold tracking-tight whitespace-nowrap pr-1">
                                            Sorted by: {sortBy === 'name' ? 'Name' : 'Recent'}
                                        </span>
                                    </motion.button>
                                )}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            )}

            {/* Command Palette Search Overlay */}
            <AnimatePresence>
                {showSearchOverlay && (
                    <div className="fixed inset-0 z-[200] flex items-start justify-center p-4 pt-20">
                        <motion.div 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setShowSearchOverlay(false)}
                            className="absolute inset-0 bg-black/60 backdrop-blur-md"
                        />
                        <motion.div
                            initial={{ opacity: 0, y: -50, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -20, scale: 0.95 }}
                            className="relative w-full max-w-xl bg-surface border border-border rounded-[32px] shadow-2xl overflow-hidden p-2"
                        >
                            <div className="relative flex items-center">
                                <DynamicIcon name={"search" as any} className="absolute left-5 text-primary" size={24} />
                                <input
                                    autoFocus
                                    type="text"
                                    placeholder="Search folders or groups..."
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && setShowSearchOverlay(false)}
                                    className="w-full bg-transparent border-none py-6 pl-14 pr-6 text-xl text-text-main outline-none placeholder:text-text-muted/50"
                                />
                                <button 
                                    onClick={() => { setSearchQuery(''); setShowSearchOverlay(false); }}
                                    className="absolute right-4 p-2 hover:bg-surface-highlight rounded-full text-text-muted transition-colors"
                                >
                                    <DynamicIcon name={"x" as any} size={20} />
                                </button>
                            </div>
                            <div className="px-4 pb-4 flex justify-between items-center text-[10px] text-text-muted font-bold uppercase tracking-widest border-t border-border/30 pt-3">
                                <span><AnimatedText text="Command Palette" /></span>
                                <span>Esc to close</span>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Modals handled by ResponsiveModal which already has its own animations */}
            {showAddModal && (
                <AddFolderModal
                    presets={presets}
                    initialData={editingFolder}
                    onSave={handleSaveConfig}
                    onCancel={() => { setShowAddModal(false); setEditingFolder(null); }}
                />
            )}

            {showGroupEditor && (
                <GroupEditorModal
                    presets={presets}
                    initialGroup={editingGroup}
                    onSave={handleSaveGroup}
                    onCancel={() => { setShowGroupEditor(false); setEditingGroup(null); }}
                />
            )}

            {showPresetManager && (
                <PresetManager
                    presets={presets}
                    onClose={() => { setShowPresetManager(false); setPresetManagerNew(false); }}
                    onRefresh={loadPresets}
                    openNew={presetManagerNew}
                />
            )}

            <DatabaseManager
                isOpen={showDbManager}
                onClose={() => setShowDbManager(false)}
            />

            <TargetsManager
                isOpen={showTargetsManager}
                onClose={() => setShowTargetsManager(false)}
            />

            <QueueManager
                isOpen={showQueueManager}
                onClose={() => setShowQueueManager(false)}
                activeJob={activeJob}
                queue={queue}
                onCancelJob={() => handleCancelJob(false)}
                onRemoveFromQueue={handleRemoveFromQueue}
                onReorderQueue={handleReorderQueue}
                onClearQueue={handleClearQueue}
            />

        </PageLayout>
    );
}
