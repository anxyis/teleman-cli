import React, { useState, useEffect, useMemo, useCallback, memo, useRef } from 'react';
import { api } from '../api/bridge';
import { PageLayout } from '../components/layout/PageLayout';
import { GlassCard } from '../components/common/GlassCard';
import { AnimatedText } from '../components/common/AnimatedText';
import { DynamicIcon } from '../components/common/DynamicIcon';
import type { IconName as IconType } from '../components/common/DynamicIcon';
import { motion, AnimatePresence } from 'framer-motion';

interface RegistryFile {
    file_hash: string;
    folder_id: string;
    file_path: string;
    size_bytes: number;
    synced_at: number;
    folder_name: string;
    download_status: 'pending' | 'downloading' | 'completed' | 'failed' | null;
    downloaded_at: number | null;
    download_path: string | null;
    file_id: string;
    chat_id: string;
}

// --- SMART ICON LOGIC ---
const getFileIcon = (fileName: string): IconType => {
    const ext = fileName.split('.').pop()?.toLowerCase() || '';
    const videoExts = ['mp4', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'webm'];
    const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'];
    const audioExts = ['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a'];
    const fontExts = ['ttf', 'otf', 'woff', 'woff2', 'eot'];
    const archiveExts = ['zip', 'rar', '7z', 'tar', 'gz', 'bz2'];
    if (videoExts.includes(ext)) return 'video';
    if (imageExts.includes(ext)) return 'image';
    if (audioExts.includes(ext)) return 'play-circle';
    if (fontExts.includes(ext)) return 'type';
    if (archiveExts.includes(ext)) return 'archive';
    return 'file-text';
};

// --- ISOLATED COMPONENTS ---

const DownloadQueueCard = memo(() => {
    const [queueData, setQueueData] = useState<any>(null);
    const [showSuccess, setShowSuccess] = useState(false);
    const [lastFinishedName, setLastFinishedName] = useState('');
    const prevActiveRef = useRef<any>(null);
    const successTimerRef = useRef<any>(null);

    useEffect(() => {
        const fetchQueue = async () => {
            try {
                const q = await api.getDownloaderQueue();
                if (prevActiveRef.current && !q.active) {
                    setLastFinishedName(prevActiveRef.current.fileName);
                    setShowSuccess(true);
                    if (successTimerRef.current) clearTimeout(successTimerRef.current);
                    successTimerRef.current = setTimeout(() => setShowSuccess(false), 3000);
                }
                setQueueData(q);
                prevActiveRef.current = q.active;
            } catch (e) {}
        };
        fetchQueue();
        const interval = setInterval(fetchQueue, 2000);
        return () => {
            clearInterval(interval);
            if (successTimerRef.current) clearTimeout(successTimerRef.current);
        };
    }, []);

    if (showSuccess && !queueData?.active) {
        return (
            <GlassCard className="border-emerald-500/30 bg-emerald-500/5 p-5 rounded-2xl shrink-0 mb-6 flex items-center gap-4 transition-all duration-500 animate-in fade-in slide-in-from-top-4">
                <div className="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400">
                    <DynamicIcon name="check-circle" size={28} />
                </div>
                <div>
                    <h3 className="font-black text-emerald-400 text-lg uppercase tracking-tight">Download Complete</h3>
                    <p className="text-sm text-text-muted truncate max-w-[250px]">{lastFinishedName}</p>
                </div>
            </GlassCard>
        );
    }

    if (!queueData?.active) return null;

    return (
        <GlassCard className="border-primary/30 bg-primary/5 p-5 rounded-2xl shrink-0 mb-6">
            <div className="flex items-center gap-4 mb-4">
                <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center animate-pulse">
                    <DynamicIcon name="download" className="text-primary" size={20} />
                </div>
                <div className="flex-1 overflow-hidden">
                    <h3 className="font-semibold text-text-main flex items-center gap-2 truncate">
                        {queueData.active.fileName}
                        {queueData.active.cloud_fallback && (
                            <span className="flex items-center gap-1 text-[9px] bg-amber-500/20 text-amber-500 px-1.5 py-0.5 rounded font-black uppercase tracking-tighter shrink-0">
                                <DynamicIcon name="alert" size={10} /> Cloud Fallback
                            </span>
                        )}
                    </h3>
                    <p className="text-xs text-text-muted/70">{queueData.active.speed} • {queueData.active.progress}% Complete</p>
                </div>
            </div>
            <div className="w-full bg-surface-highlight h-2 rounded-full overflow-hidden">
                <div className="h-full bg-primary transition-all duration-500 ease-out" style={{ width: `${queueData.active.progress}%` }} />
            </div>
        </GlassCard>
    );
});

const ChatAvatar = ({ chatId }: { chatId: string }) => {
    const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
    const [error, setError] = useState(false);

    useEffect(() => {
        const fetchAvatar = async () => {
            try {
                const cleanId = String(chatId).replace('.0', '');
                const res = await fetch(`/api/chat-avatar/${cleanId}`);
                if (res.ok) {
                    const data = await res.json();
                    setAvatarUrl(data.url);
                } else {
                    setError(true);
                }
            } catch (e) {
                setError(true);
            }
        };
        fetchAvatar();
    }, [chatId]);

    if (error || !avatarUrl) {
        return (
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                <DynamicIcon name="folders" size={24} />
            </div>
        );
    }

    return (
        <div className="w-12 h-12 rounded-xl overflow-hidden border border-border/50 group-hover:scale-110 transition-transform bg-surface-highlight">
            <img 
                src={avatarUrl} 
                alt="Chat Avatar" 
                className="w-full h-full object-cover"
                onError={() => setError(true)}
            />
        </div>
    );
};

interface FileCardProps {
    file: RegistryFile;
    isSelected: boolean;
    viewMode: 'list' | 'grid' | 'compact';
    onToggleSelect: (hash: string) => void;
    onDownload: (file: RegistryFile) => void;
    formatSize: (bytes: number) => string;
    formatPathName: (path: string) => string;
}

const FileCard = memo(({ file, isSelected, viewMode, onToggleSelect, onDownload, formatSize, formatPathName }: FileCardProps) => {
    const fileName = file.file_path.split('/').pop() || 'file';
    const iconName = getFileIcon(fileName);

    if (viewMode === 'list') {
        return (
            <GlassCard className={`bg-surface border border-border/50 p-4 group transition-all rounded-2xl flex items-center gap-4 ${isSelected ? 'border-primary/40 bg-primary/5 shadow-md shadow-primary/5' : ''}`}>
                <button onClick={() => onToggleSelect(file.file_hash)} className={`transition-colors active:scale-90 shrink-0 ${isSelected ? 'text-primary' : 'text-text-muted/30 group-hover:text-text-muted/50'}`}>
                    <DynamicIcon name={isSelected ? 'check-square' : 'square'} size={22} />
                </button>
                <div className="w-10 h-10 rounded-xl bg-surface-highlight flex items-center justify-center text-text-muted/40 group-hover:bg-primary/10 group-hover:text-primary transition-colors shrink-0">
                    <DynamicIcon name={iconName} size={20} />
                </div>
                <div className="flex-1 overflow-hidden">
                    <h4 className="font-bold text-text-main truncate text-sm">{fileName}</h4>
                    <div className="flex items-center gap-3 mt-0.5 text-[10px] text-text-muted/60 font-medium uppercase tracking-tighter">
                        <span>{formatSize(file.size_bytes)}</span>
                        <span className="opacity-30">•</span>
                        <span>{new Date(file.synced_at).toLocaleDateString()}</span>
                    </div>
                </div>
                <div className="flex items-center gap-4 shrink-0">
                    {file.download_status === 'completed' ? (
                        <div className="flex items-center gap-1.5 text-emerald-400 bg-emerald-400/10 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider"><DynamicIcon name="check-circle" size={12} /> LOCAL</div>
                    ) : file.download_status === 'downloading' ? (
                        <div className="flex items-center gap-1.5 text-primary bg-primary/10 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider"><DynamicIcon name="loader" size={12} className="animate-spin" /> SYNCING</div>
                    ) : file.download_status === 'failed' ? (
                        <div className="flex items-center gap-1.5 text-rose-400 bg-rose-400/10 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider"><DynamicIcon name="alert" size={12} /> FAILED</div>
                    ) : (
                        <button onClick={() => onDownload(file)} className="p-2.5 hover:bg-surface-highlight rounded-xl text-primary transition-all active:scale-90"><DynamicIcon name="download" size={20} /></button>
                    )}
                </div>
            </GlassCard>
        );
    }

    if (viewMode === 'compact') {
        return (
            <GlassCard className={`bg-surface/50 border border-border/30 px-3 py-2 group transition-all rounded-xl flex items-center gap-3 ${isSelected ? 'border-primary/40 bg-primary/5' : ''}`}>
                <button onClick={() => onToggleSelect(file.file_hash)} className={`transition-colors active:scale-90 shrink-0 ${isSelected ? 'text-primary' : 'text-text-muted/20'}`}>
                    <DynamicIcon name={isSelected ? 'check-square' : 'square'} size={18} />
                </button>
                <DynamicIcon name={iconName} size={16} className="text-text-muted/40 group-hover:text-primary transition-colors" />
                <div className="flex-1 overflow-hidden">
                    <h4 className="font-medium text-text-main truncate text-xs">{fileName}</h4>
                </div>
                <span className="text-[9px] text-text-muted/40 font-bold uppercase shrink-0">{formatSize(file.size_bytes)}</span>
                <div className="flex items-center shrink-0">
                    {file.download_status === 'completed' ? (
                        <div className="text-emerald-400"><DynamicIcon name="check-circle" size={14} /></div>
                    ) : file.download_status === 'downloading' ? (
                        <div className="text-primary animate-spin"><DynamicIcon name="loader" size={14} /></div>
                    ) : (
                        <button onClick={() => onDownload(file)} className="p-1 hover:bg-surface-highlight rounded-lg text-primary transition-all"><DynamicIcon name="download" size={16} /></button>
                    )}
                </div>
            </GlassCard>
        );
    }

    return (
        <GlassCard className={`bg-surface border border-border/50 p-4 group transition-all rounded-2xl flex flex-col items-center text-center gap-3 relative ${isSelected ? 'border-primary/40 bg-primary/5 shadow-md shadow-primary/5' : ''}`}>
            <button onClick={() => onToggleSelect(file.file_hash)} className={`absolute top-3 left-3 transition-colors active:scale-90 ${isSelected ? 'text-primary' : 'text-text-muted/30'}`}><DynamicIcon name={isSelected ? 'check-square' : 'square'} size={20} /></button>
            <div className="w-14 h-14 rounded-2xl bg-surface-highlight flex items-center justify-center text-text-muted/40 group-hover:bg-primary/10 group-hover:text-primary transition-colors"><DynamicIcon name={iconName} size={28} /></div>
            <div className="w-full overflow-hidden">
                <h4 className="font-bold text-text-main text-xs line-clamp-2 leading-tight h-8">{fileName}</h4>
                <div className="flex flex-col items-center gap-0.5 mt-1">
                    <p className="text-[10px] text-text-muted/60 font-medium">{formatSize(file.size_bytes)}</p>
                    <span className="text-[8px] text-text-muted/30 uppercase font-black">{formatPathName(file.file_path)}</span>
                </div>
            </div>
            <div className="mt-auto w-full pt-2">
                {file.download_status === 'completed' ? (
                    <div className="text-emerald-400 bg-emerald-400/10 py-1 rounded-lg text-[9px] font-black uppercase">LOCAL</div>
                ) : file.download_status === 'downloading' ? (
                    <div className="text-primary bg-primary/10 py-1 rounded-lg text-[9px] font-black uppercase">SYNCING</div>
                ) : (
                    <button onClick={() => onDownload(file)} className="w-full py-1.5 bg-primary/10 hover:bg-primary/20 text-primary rounded-lg text-xs font-bold transition-all">Download</button>
                )}
            </div>
        </GlassCard>
    );
});

// --- MAIN PAGE ---

const ReverseSyncer: React.FC = () => {
    const [files, setFiles] = useState<RegistryFile[]>([]);
    const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
    const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
    const [sortKey, setSortKey] = useState<'date' | 'size'>('date');
    const [viewMode, setViewMode] = useState<'list' | 'grid' | 'compact'>(() => (localStorage.getItem('downloader_view_mode') as any) || 'list');
    const [useCloudFallback, setUseCloudFallback] = useState(() => localStorage.getItem('downloader_cloud_fallback') !== 'false');
    const [browserDownload, setBrowserDownload] = useState(() => localStorage.getItem('downloader_browser_mode') === 'true');
    
    // Search States
    const [searchQuery, setSearchQuery] = useState('');
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [searchResults, setSearchResults] = useState<RegistryFile[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const searchInputRef = useRef<HTMLInputElement>(null);

    const loadData = async () => {
        try {
            const allFiles = await api.getDownloaderFiles();
            setFiles(allFiles);
        } catch (e) {}
    };

    useEffect(() => {
        loadData();
        const interval = setInterval(loadData, 10000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        localStorage.setItem('downloader_view_mode', viewMode);
    }, [viewMode]);

    useEffect(() => {
        localStorage.setItem('downloader_browser_mode', String(browserDownload));
    }, [browserDownload]);

    // Debounced FTS Search
    useEffect(() => {
        if (searchQuery.trim().length === 0) {
            setSearchResults([]);
            setIsSearching(false);
            return;
        }
        setIsSearching(true);
        const timeout = setTimeout(async () => {
            try {
                const results = await api.searchDownloaderFiles(searchQuery, selectedFolder || undefined);
                setSearchResults(results);
            } catch (e) {
                console.error("Search failed", e);
            } finally {
                setIsSearching(false);
            }
        }, 300);
        return () => clearTimeout(timeout);
    }, [searchQuery, selectedFolder]);

    useEffect(() => {
        if (isSearchOpen) {
            setTimeout(() => searchInputRef.current?.focus(), 100);
        } else {
            setSearchQuery('');
        }
    }, [isSearchOpen]);

    const formatPathName = useCallback((p: string) => {
        const parts = p.split('/');
        return parts.length > 2 ? `.../${parts[parts.length-2]}` : '';
    }, []);

    const formatSize = useCallback((bytes: number) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }, []);

    const handleDownload = useCallback(async (fileList: RegistryFile[]) => {
        if (browserDownload) {
            // DIRECT BROWSER DOWNLOAD
            fileList.forEach(f => {
                const fileName = f.file_path.split('/').pop() || 'file';
                const url = `${window.location.origin}/api/downloader/browser-download?fileId=${f.file_id}&fileName=${encodeURIComponent(fileName)}`;
                window.open(url, '_blank');
            });
            return;
        }

        // Standard Queue Download
        const payload = fileList.map(f => ({
            fileHash: f.file_hash,
            folderId: f.folder_id,
            fileName: f.file_path.split('/').pop() || 'file',
            fileId: f.file_id,
            size: f.size_bytes,
            subfolder: f.folder_name || 'Uncategorized',
            useCloudFallback
        }));
        await api.enqueueDownload(payload, useCloudFallback);
        loadData();
    }, [useCloudFallback, browserDownload]);

    const toggleFileSelect = useCallback((hash: string) => {
        setSelectedFiles(prev => {
            const next = new Set(prev);
            if (next.has(hash)) next.delete(hash); else next.add(hash);
            return next;
        });
    }, []);

    const folderGroups = useMemo(() => {
        const groups: Record<string, { files: RegistryFile[], chatId: string }> = {};
        files.forEach(f => {
            const name = f.folder_name || 'Uncategorized';
            if (!groups[name]) groups[name] = { files: [], chatId: f.chat_id };
            groups[name].files.push(f);
        });
        return groups;
    }, [files]);

    const currentFiles = useMemo(() => {
        if (!selectedFolder) return [];
        let list = [...(folderGroups[selectedFolder]?.files || [])];
        list.sort((a, b) => sortKey === 'date' ? b.synced_at - a.synced_at : b.size_bytes - a.size_bytes);
        return list;
    }, [selectedFolder, folderGroups, sortKey]);

    return (
        <PageLayout>
            <div className="flex flex-col h-full gap-6 relative">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-text-main tracking-tight"><AnimatedText text="Reverse Syncer" /></h1>
                        <p className="text-text-muted text-sm">Sync Telegram files back to your device</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <button onClick={() => setBrowserDownload(!browserDownload)} className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${browserDownload ? 'bg-blue-500/10 text-blue-400' : 'bg-surface-highlight text-text-muted'}`}>
                            <DynamicIcon name="user" size={14} /> Browser: {browserDownload ? 'ON' : 'OFF'}
                        </button>
                        <button onClick={() => setUseCloudFallback(!useCloudFallback)} className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${useCloudFallback ? 'bg-amber-500/10 text-amber-500' : 'bg-surface-highlight text-text-muted'}`}>
                            <DynamicIcon name="wifi" size={14} /> Cloud: {useCloudFallback ? 'ON' : 'OFF'}
                        </button>
                    </div>
                </div>

                {!browserDownload && <DownloadQueueCard />}

                {!selectedFolder ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {Object.entries(folderGroups).map(([name, group]) => (
                            <button key={name} onClick={() => setSelectedFolder(name)} className="text-left group">
                                <GlassCard className="bg-surface border border-border/50 group-hover:border-primary/50 transition-all p-5 rounded-2xl flex items-center gap-4">
                                    <ChatAvatar chatId={group.chatId} />
                                    <div className="flex-1 overflow-hidden">
                                        <h3 className="font-medium text-lg truncate text-text-main">{name}</h3>
                                        <p className="text-sm text-text-muted">{group.files.length} Synced Files</p>
                                    </div>
                                </GlassCard>
                            </button>
                        ))}
                    </div>
                ) : (
                    <div className="flex-1 flex flex-col min-h-0 space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-4">
                            <div className="flex items-center gap-4">
                                <button onClick={() => { setSelectedFolder(null); setSelectedFiles(new Set()); }} className="flex items-center gap-2 text-text-muted hover:text-text-main transition-colors">
                                    <DynamicIcon name="arrow-left" size={18} /> <span className="font-medium">Back</span>
                                </button>
                                <div className="h-4 w-[1px] bg-border/50" />
                                <h3 className="font-bold text-text-main truncate max-w-[200px]">{selectedFolder}</h3>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="flex bg-surface-highlight p-1 rounded-xl border border-border/50 mr-2">
                                    <button onClick={() => setViewMode('list')} className={`p-1.5 rounded-lg transition-all ${viewMode === 'list' ? 'bg-primary text-on-primary shadow-md' : 'text-text-muted hover:text-text-main'}`} title="List View"><DynamicIcon name="dashboard" size={16} /></button>
                                    <button onClick={() => setViewMode('compact')} className={`p-1.5 rounded-lg transition-all ${viewMode === 'compact' ? 'bg-primary text-on-primary shadow-md' : 'text-text-muted hover:text-text-main'}`} title="Compact View"><DynamicIcon name="grip" size={16} /></button>
                                    <button onClick={() => setViewMode('grid')} className={`p-1.5 rounded-lg transition-all ${viewMode === 'grid' ? 'bg-primary text-on-primary shadow-md' : 'text-text-muted hover:text-text-main'}`} title="Grid View"><DynamicIcon name="folders" size={16} /></button>
                                </div>
                                <button onClick={() => setSortKey('date')} className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs transition-all ${sortKey === 'date' ? 'bg-primary/20 text-primary font-bold' : 'bg-surface-highlight text-text-muted/60'}`}><DynamicIcon name="clock" size={12} /> Date</button>
                                <button onClick={() => setSortKey('size')} className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs transition-all ${sortKey === 'size' ? 'bg-primary/20 text-primary font-bold' : 'bg-surface-highlight text-text-muted/60'}`}><DynamicIcon name="filter" size={12} /> Size</button>
                            </div>
                        </div>
                        <div className={`flex-1 overflow-y-auto pr-1 -mx-1 ${viewMode === 'grid' ? 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 content-start' : viewMode === 'compact' ? 'space-y-1' : 'space-y-3'}`}>
                            {currentFiles.map(file => (
                                <FileCard key={file.file_hash} file={file} isSelected={selectedFiles.has(file.file_hash)} viewMode={viewMode} onToggleSelect={toggleFileSelect} onDownload={(f) => handleDownload([f])} formatSize={formatSize} formatPathName={formatPathName} />
                            ))}
                        </div>
                    </div>
                )}

                {/* --- FULL SCREEN SEARCH PANEL --- */}
                <AnimatePresence>
                    {isSearchOpen && (
                        <motion.div initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 50 }} className="fixed inset-0 z-[100] bg-background/95 backdrop-blur-3xl flex flex-col p-6 lg:p-12 overflow-hidden">
                            <div className="max-w-5xl w-full mx-auto flex flex-col h-full gap-8">
                                <div className="flex items-center justify-between">
                                    <h2 className="text-3xl font-black text-text-main uppercase tracking-tighter flex items-center gap-3"><DynamicIcon name="search" size={28} className="text-primary" /> Search Registry</h2>
                                    <button onClick={() => setIsSearchOpen(false)} className="w-12 h-12 rounded-full bg-surface-highlight flex items-center justify-center text-text-main hover:bg-rose-500 hover:text-white transition-all active:scale-90"><DynamicIcon name="x" size={24} /></button>
                                </div>
                                <div className="relative">
                                    <input ref={searchInputRef} type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder={selectedFolder ? `Searching inside ${selectedFolder}...` : "Type keywords to find files..."} className="w-full bg-surface-highlight/50 border-2 border-border/50 focus:border-primary px-6 py-5 rounded-3xl text-xl font-bold text-text-main outline-none transition-all placeholder:text-text-muted/30" />
                                    <div className="absolute right-6 top-1/2 -translate-y-1/2 flex items-center gap-3">
                                        {isSearching && <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }} className="text-primary"><DynamicIcon name="loader" size={20} /></motion.div>}
                                        {searchQuery && (
                                            <button onClick={() => setSearchQuery('')} className="text-text-muted hover:text-text-main p-2 rounded-full hover:bg-surface-highlight transition-all">
                                                <DynamicIcon name="x-circle" size={24} />
                                            </button>
                                        )}
                                    </div>
                                </div>
                                <div className="flex-1 min-h-0 overflow-y-auto pr-2 custom-scrollbar">
                                    {searchQuery.trim() === '' ? (
                                        <div className="h-full flex flex-col items-center justify-center text-text-muted/20 select-none"><DynamicIcon name="search" size={120} /><p className="text-xl font-bold mt-4">High-Accuracy Search</p></div>
                                    ) : searchResults.length === 0 && !isSearching ? (
                                        <div className="h-full flex flex-col items-center justify-center text-text-muted select-none opacity-50"><DynamicIcon name="alert" size={60} /><p className="text-xl font-bold mt-4 uppercase tracking-tighter">No results found</p></div>
                                    ) : (
                                        <div className="flex flex-col gap-3">
                                            <div className="flex items-center justify-between text-xs font-bold text-text-muted/50 uppercase tracking-widest px-2 pb-2 border-b border-border/30">
                                                <span>Found {searchResults.length} matches</span>
                                                <span>{selectedFolder ? `Scope: ${selectedFolder}` : 'Global Search'}</span>
                                            </div>
                                            <div className={viewMode === 'grid' ? 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4' : viewMode === 'compact' ? 'space-y-1' : 'space-y-3'}>
                                                {searchResults.map(file => (
                                                    <FileCard key={`${file.file_hash}-${file.folder_id}`} file={file} isSelected={selectedFiles.has(file.file_hash)} viewMode={viewMode} onToggleSelect={toggleFileSelect} onDownload={(f) => handleDownload([f])} formatSize={formatSize} formatPathName={formatPathName} />
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                <button onClick={() => setIsSearchOpen(true)} className="fixed bottom-24 right-6 w-16 h-16 rounded-2xl bg-primary text-on-primary shadow-2xl shadow-primary/30 flex items-center justify-center transition-all hover:scale-110 active:scale-90 z-[90]">
                    <DynamicIcon name="search" size={28} strokeWidth={2.5} />
                </button>
            </div>
        </PageLayout>
    );
};

export default ReverseSyncer;
