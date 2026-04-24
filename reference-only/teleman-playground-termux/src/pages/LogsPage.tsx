import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { DynamicIcon } from '../components/common/DynamicIcon';
import { PageLayout } from '../components/layout/PageLayout';
import { LogHistoryModal } from '../components/LogHistoryModal';
import { ResponsiveModal } from '../components/common/ResponsiveModal';

export function LogsPage() {
    const [logs, setLogs] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [showHistory, setShowHistory] = useState(false);
    const [viewingLog, setViewingLog] = useState<string | null>(null);
    const [viewedLogContent, setViewedLogContent] = useState<any[]>([]);
    const bottomRef = useRef<HTMLDivElement>(null);
    const navigate = useNavigate();

    const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';

    const fetchLogs = async () => {
        setLoading(true);
        try {
            const res = await axios.get(`${API_BASE}/api/debug/logs?limit=500`);
            setLogs(res.data);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleSaveLogs = async () => {
        setSaving(true);
        try {
            const res = await axios.post(`${API_BASE}/api/logs/save`);
            alert(`Logs saved successfully!\n\n${res.data.filename}`);
        } catch (e: any) {
            alert(`Failed to save logs: ${e.response?.data?.error || e.message}`);
        } finally {
            setSaving(false);
        }
    };

    const handleViewLog = async (filename: string) => {
        try {
            const res = await axios.get(`${API_BASE}/api/logs/view/${filename}?limit=500&offset=0`);
            setViewedLogContent(res.data.logs || []);
            setViewingLog(filename);
        } catch (e) {
            alert('Failed to load log file');
        }
    };

    useEffect(() => {
        fetchLogs();
        const timer = setInterval(fetchLogs, 5000);
        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        if (bottomRef.current) {
            bottomRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [logs]);

    const getLogColor = (msg: string) => {
        if (msg.includes('ERROR') || msg.includes('FAIL')) return 'text-red-400';
        if (msg.includes('WARN')) return 'text-amber-400';
        if (msg.includes('SUCCESS') || msg.includes('DONE')) return 'text-emerald-400';
        if (msg.includes('UPLOAD') || msg.includes('SEND')) return 'text-primary';
        return 'text-text-muted';
    };

    return (
        <PageLayout
            header={
                <div className="flex items-center gap-4 w-full">
                    <button
                        onClick={() => navigate(-1)}
                        className="p-2 hover:bg-surface-highlight text-text-muted hover:text-text-main transition-all"
                        style={{ borderRadius: 'var(--radius-button)' }}
                    >
                        <DynamicIcon name="arrow-left" size={20} />
                    </button>
                    <h1 className="text-xl font-bold text-text-main">System Logs</h1>
                </div>
            }
        >
            <div className="space-y-4">
                <div className="flex justify-between items-center px-1">
                    <p className="text-sm text-text-muted">Real-time system operations & debug output</p>
                    <div className="flex gap-2">
                        <button
                            onClick={handleSaveLogs}
                            disabled={saving || logs.length === 0}
                            className="p-2 bg-surface hover:bg-surface-highlight text-text-muted hover:text-text-main transition-all border border-border disabled:opacity-50 disabled:cursor-not-allowed"
                            style={{ borderRadius: 'var(--radius-button)' }}
                            title="Save current logs to file"
                        >
                            <DynamicIcon name="save" size={18} />
                        </button>
                        <button
                            onClick={() => setShowHistory(true)}
                            className="p-2 bg-surface hover:bg-surface-highlight text-text-muted hover:text-text-main transition-all border border-border"
                            style={{ borderRadius: 'var(--radius-button)' }}
                            title="View saved log history"
                        >
                            <DynamicIcon name="history" size={18} />
                        </button>
                        <button
                            onClick={fetchLogs}
                            disabled={loading}
                            className="p-2 bg-surface hover:bg-surface-highlight text-text-muted hover:text-text-main transition-all border border-border"
                            style={{ borderRadius: 'var(--radius-button)' }}
                        >
                            <DynamicIcon name="refresh" size={18} className={loading ? "animate-spin" : ""} />
                        </button>
                        <button
                            onClick={() => window.open(`${API_BASE}/api/debug/logs/download`, '_blank')}
                            className="p-2 bg-surface hover:bg-surface-highlight text-text-muted hover:text-text-main transition-all border border-border"
                            style={{ borderRadius: 'var(--radius-button)' }}
                        >
                            <DynamicIcon name="file-text" size={18} />
                        </button>
                    </div>
                </div>

                <div 
                    className="bg-surface border border-border overflow-hidden flex flex-col transition-all"
                    style={{ borderRadius: 'var(--radius-card)', height: 'calc(100vh - 250px)', minHeight: '400px' }}
                >
                    <div className="bg-canvas/50 border-b border-border p-3 flex justify-between items-center">
                        <div className="flex gap-2">
                            <div className="w-3 h-3 rounded-full bg-red-500/20 border border-red-500/40" />
                            <div className="w-3 h-3 rounded-full bg-amber-500/20 border border-amber-500/40" />
                            <div className="w-3 h-3 rounded-full bg-emerald-500/20 border border-emerald-500/40" />
                        </div>
                        <span className="text-[10px] font-bold text-text-muted uppercase tracking-widest">teleman.log</span>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 font-mono text-xs space-y-1.5 scroll-smooth no-scrollbar">
                        {logs.length === 0 ? (
                            <div className="h-full flex items-center justify-center opacity-30 italic">No logs available...</div>
                        ) : (
                            logs.map((log, i) => (
                                <div key={i} className="flex gap-3 group hover:bg-white/5 transition-colors p-0.5 rounded">
                                    <span className="text-[10px] text-text-muted opacity-40 shrink-0 w-16">{new Date(log.timestamp).toLocaleTimeString([], { hour12: false })}</span>
                                    <span className={`break-all leading-relaxed ${getLogColor(log.message)}`}>{log.message}</span>
                                </div>
                            ))
                        )}
                        <div ref={bottomRef} />
                    </div>
                </div>
            </div>

            {/* Log History Modal */}
            <LogHistoryModal
                isOpen={showHistory}
                onClose={() => setShowHistory(false)}
                onViewLog={handleViewLog}
            />

            {/* View Saved Log Modal */}
            <ResponsiveModal
                isOpen={!!viewingLog}
                onClose={() => { setViewingLog(null); setViewedLogContent([]); }}
                title={viewingLog || 'View Log'}
                widthClass="max-w-2xl"
            >
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <p className="text-xs text-text-muted font-mono">{viewingLog}</p>
                        <p className="text-xs text-text-muted">{viewedLogContent.length} entries</p>
                    </div>
                    <div className="bg-canvas/50 border border-border rounded-xl p-4 max-h-[60vh] overflow-y-auto font-mono text-xs space-y-1.5">
                        {viewedLogContent.map((log, i) => (
                            <div key={i} className="flex gap-2">
                                <span className="text-[10px] text-text-muted opacity-40 shrink-0 w-16">
                                    {new Date(log.timestamp).toLocaleTimeString([], { hour12: false })}
                                </span>
                                <span className={`break-all ${getLogColor(log.message)}`}>
                                    [{log.level.toUpperCase()}] {log.message}
                                </span>
                            </div>
                        ))}
                    </div>
                    <div className="flex gap-2 pt-4 border-t border-border">
                        <button
                            onClick={() => viewingLog && window.open(`${API_BASE}/api/logs/download/${viewingLog}`, '_blank')}
                            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-surface-highlight hover:bg-surface text-text-main rounded-xl font-medium text-sm transition-all border border-border"
                        >
                            <DynamicIcon name="download" size={16} />
                            Download
                        </button>
                        <button
                            onClick={() => { setViewingLog(null); setViewedLogContent([]); }}
                            className="flex-1 px-4 py-2.5 bg-primary hover:bg-primary-hover text-on-primary rounded-xl font-bold text-sm transition-all shadow-lg shadow-primary/[var(--glow-opacity,0.20)]"
                        >
                            Close
                        </button>
                    </div>
                </div>
            </ResponsiveModal>
        </PageLayout>
    );
}
