import { useState, useEffect } from 'react';
import { DynamicIcon } from './common/DynamicIcon';
import { ResponsiveModal } from './common/ResponsiveModal';
import axios from 'axios';

const API_BASE = '';

interface LogFileInfo {
    filename: string;
    timestamp: number;
    size: number;
    entryCount: number;
    isAuto: boolean;
}

interface LogHistoryModalProps {
    isOpen: boolean;
    onClose: () => void;
    onViewLog?: (filename: string) => void;
}

export function LogHistoryModal({ isOpen, onClose, onViewLog }: LogHistoryModalProps) {
    const [logs, setLogs] = useState<LogFileInfo[]>([]);
    const [loading, setLoading] = useState(false);
    const [deleting, setDeleting] = useState<string | null>(null);
    const [stats, setStats] = useState<any>(null);

    const fetchLogs = async () => {
        setLoading(true);
        try {
            const [historyRes, statsRes] = await Promise.all([
                axios.get(`${API_BASE}/api/logs/history`),
                axios.get(`${API_BASE}/api/logs/stats`).catch(() => ({ data: null }))
            ]);
            setLogs(historyRes.data);
            if (statsRes.data) setStats(statsRes.data);
        } catch (e) {
            console.error('Failed to fetch log history', e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (isOpen) {
            fetchLogs();
        }
    }, [isOpen]);

    const handleDelete = async (filename: string) => {
        if (!confirm(`Delete this log file?\n\n${filename}`)) return;
        
        setDeleting(filename);
        try {
            await axios.delete(`${API_BASE}/api/logs/history/${filename}`);
            fetchLogs();
        } catch (e) {
            alert('Failed to delete log file');
        } finally {
            setDeleting(null);
        }
    };

    const handleClearAll = async () => {
        if (!confirm('⚠️ WARNING: This will delete ALL saved log files.\n\nThis action cannot be undone.\n\nAre you sure?')) return;
        
        try {
            const res = await axios.post(`${API_BASE}/api/logs/history/clear-all`);
            alert(`Deleted ${res.data.deleted} log files`);
            fetchLogs();
        } catch (e) {
            alert('Failed to clear logs');
        }
    };

    const handleDownload = (filename: string) => {
        window.open(`${API_BASE}/api/logs/download/${filename}`, '_blank');
    };

    const formatFileSize = (bytes: number) => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
    };

    const getTimeAgo = (timestamp: number) => {
        const seconds = Math.floor((Date.now() - timestamp) / 1000);
        
        if (seconds < 60) return 'Just now';
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
        if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
        return `${Math.floor(seconds / 86400)}d ago`;
    };

    return (
        <ResponsiveModal
            isOpen={isOpen}
            onClose={onClose}
            title="Log History"
            actions={
                <div className="flex gap-2 w-full">
                    <button
                        onClick={handleClearAll}
                        disabled={logs.length === 0 || loading}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded-xl font-bold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed border border-rose-500/30"
                    >
                        <DynamicIcon name="trash" size={16} />
                        Clear All
                    </button>
                    <button
                        onClick={fetchLogs}
                        disabled={loading}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-surface-highlight hover:bg-surface text-text-muted hover:text-text-main rounded-xl font-medium text-sm transition-all disabled:opacity-50 border border-border"
                    >
                        <DynamicIcon name="refresh" size={16} className={loading ? "animate-spin" : ""} />
                        Refresh
                    </button>
                </div>
            }
        >
            <div className="space-y-4">
                {/* Storage Stats */}
                {stats && (
                    <div className="bg-surface-highlight/30 p-3 rounded-xl border border-border/50">
                        <div className="flex items-center justify-between mb-2">
                            <p className="text-xs font-bold text-text-muted uppercase">Storage Usage</p>
                            <p className="text-xs font-mono text-primary">{stats.usagePercent}%</p>
                        </div>
                        <div className="w-full h-2 bg-surface-highlight rounded-full overflow-hidden">
                            <div 
                                className="h-full bg-gradient-to-r from-primary to-primary/50 transition-all duration-300"
                                style={{ width: `${Math.min(parseFloat(stats.usagePercent), 100)}%` }}
                            />
                        </div>
                        <div className="flex justify-between mt-2 text-[10px] text-text-muted">
                            <span>{stats.totalSizeMB} MB used</span>
                            <span>{stats.totalFiles} / {stats.maxFiles} files</span>
                        </div>
                    </div>
                )}

                {/* Log List */}
                <div className="space-y-2 max-h-[50vh] overflow-y-auto">
                    {loading ? (
                        <div className="flex items-center justify-center py-12 text-text-muted">
                            <DynamicIcon name="loader" size={24} className="animate-spin mr-2" />
                            <span>Loading logs...</span>
                        </div>
                    ) : logs.length === 0 ? (
                        <div className="text-center py-12 text-text-muted">
                            <DynamicIcon name="file-text" size={48} className="mx-auto mb-3 opacity-30" />
                            <p className="text-sm">No saved logs yet</p>
                            <p className="text-xs mt-1 opacity-70">Save logs manually or they'll be auto-saved on shutdown</p>
                        </div>
                    ) : (
                        logs.map((log) => (
                            <div
                                key={log.filename}
                                className="bg-surface border border-border/50 rounded-xl p-3 hover:border-border transition-all"
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex items-center gap-2 flex-1 min-w-0">
                                        <div className={`p-2 rounded-lg shrink-0 ${
                                            log.isAuto ? 'bg-blue-500/10 text-blue-400' : 'bg-primary/10 text-primary'
                                        }`}>
                                            <DynamicIcon name="file-text" size={16} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium text-text-main truncate">{log.filename}</p>
                                            <div className="flex items-center gap-2 text-[10px] text-text-muted mt-0.5">
                                                <span>{formatFileSize(log.size)}</span>
                                                <span>•</span>
                                                <span>{log.entryCount.toLocaleString()} entries</span>
                                                <span>•</span>
                                                <span>{getTimeAgo(log.timestamp)}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                        {onViewLog && (
                                            <button
                                                onClick={() => { onViewLog(log.filename); onClose(); }}
                                                className="p-1.5 text-text-muted hover:text-text-main hover:bg-surface-highlight rounded-lg transition-all"
                                                title="View"
                                            >
                                                <DynamicIcon name="eye" size={14} />
                                            </button>
                                        )}
                                        <button
                                            onClick={() => handleDownload(log.filename)}
                                            className="p-1.5 text-text-muted hover:text-primary hover:bg-primary/10 rounded-lg transition-all"
                                            title="Download"
                                        >
                                            <DynamicIcon name="download" size={14} />
                                        </button>
                                        <button
                                            onClick={() => handleDelete(log.filename)}
                                            disabled={deleting === log.filename}
                                            className="p-1.5 text-text-muted hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-all disabled:opacity-50"
                                            title="Delete"
                                        >
                                            {deleting === log.filename ? (
                                                <DynamicIcon name="loader" size={14} className="animate-spin" />
                                            ) : (
                                                <DynamicIcon name="trash" size={14} />
                                            )}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </ResponsiveModal>
    );
}
