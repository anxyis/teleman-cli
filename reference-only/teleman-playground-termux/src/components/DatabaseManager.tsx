import { useState, useEffect } from 'react';
import { DynamicIcon } from './common/DynamicIcon';
import axios from 'axios';
import { ResponsiveModal } from './common/ResponsiveModal';

interface DatabaseManagerProps {
    isOpen: boolean;
    onClose: () => void;
}

interface RegistryEntry {
    file_hash: string;
    file_path: string;
    size_bytes: number;
    synced_at: number;
    folder_name?: string;
}

interface HistoryEntry {
    id: string;
    name: string;
    status: string;
    stats_json: string;
    created_at: number;
}

export function DatabaseManager({ isOpen, onClose }: DatabaseManagerProps) {
    const [activeTab, setActiveTab] = useState<'registry' | 'history'>('registry');
    const [registryData, setRegistryData] = useState<RegistryEntry[]>([]);
    const [historyData, setHistoryData] = useState<HistoryEntry[]>([]);
    const [loading, setLoading] = useState(false);
    const [confirmClear, setConfirmClear] = useState(false);

    // Grouping & Filtering
    const [folders, setFolders] = useState<{ name: string, count: number }[]>([]);
    const [selectedFolder, setSelectedFolder] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen) {
            fetchData();
        }
    }, [isOpen, activeTab]);

    // Compute folders from registry data
    useEffect(() => {
        if (registryData.length > 0) {
            const counts: Record<string, number> = {};
            registryData.forEach(item => {
                const name = item.folder_name || 'Uncategorized';
                counts[name] = (counts[name] || 0) + 1;
            });
            setFolders(Object.entries(counts).map(([name, count]) => ({ name, count })));
        } else {
            setFolders([]);
        }
    }, [registryData]);

    const getFilteredRegistry = () => {
        if (!selectedFolder) return registryData;
        return registryData.filter(item => (item.folder_name || 'Uncategorized') === selectedFolder);
    };

    const fetchData = async () => {
        setLoading(true);
        try {
            if (activeTab === 'registry') {
                const res = await axios.get('/api/db/registry');
                setRegistryData(res.data);
            } else {
                const res = await axios.get('/api/db/history');
                setHistoryData(res.data);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id: string) => {
        try {
            if (activeTab === 'registry') {
                await axios.delete(`/api/db/registry/${id}`);
                setRegistryData(prev => prev.filter(item => item.file_hash !== id));
            }
        } catch (err) {
            console.error(err);
        }
    };

    const handleClearAll = async () => {
        try {
            if (activeTab === 'registry') {
                if (selectedFolder) {
                    // Clear specific folder
                    const toDelete = getFilteredRegistry();
                    await Promise.all(toDelete.map(item => axios.delete(`/api/db/registry/${item.file_hash}`)));
                    setRegistryData(prev => prev.filter(item => (item.folder_name || 'Uncategorized') !== selectedFolder));
                } else {
                    // Clear all
                    await axios.delete('/api/db/registry');
                    setRegistryData([]);
                }
            } else {
                await axios.delete('/api/db/history');
                setHistoryData([]);
            }
            setConfirmClear(false);
        } catch (err) {
            console.error(err);
        }
    };

    return (
        <ResponsiveModal
            isOpen={isOpen}
            onClose={onClose}
            title="Database Manager"
            widthClass="max-w-4xl"
        >
            <div className="flex flex-col h-full md:h-[600px]">
                {/* Tabs */}
                <div className="flex border-b border-border bg-canvas shrink-0 -mx-4 -mt-4 mb-4 md:-mx-6 md:-mt-6 transition-all">
                    <button
                        onClick={() => { setActiveTab('registry'); setConfirmClear(false); }}
                        className={`flex-1 py-3 sm:py-4 text-xs sm:text-sm font-medium transition-colors border-b-2 ${activeTab === 'registry' ? 'border-primary text-primary bg-surface-highlight/50' : 'border-transparent text-text-muted hover:text-text-main hover:bg-surface-highlight'}`}
                    >
                        File Registry ({registryData.length})
                    </button>
                    <button
                        onClick={() => { setActiveTab('history'); setConfirmClear(false); }}
                        className={`flex-1 py-3 sm:py-4 text-xs sm:text-sm font-medium transition-colors border-b-2 ${activeTab === 'history' ? 'border-primary text-primary bg-surface-highlight/50' : 'border-transparent text-text-muted hover:text-text-main hover:bg-surface-highlight'}`}
                    >
                        Job History ({historyData.length})
                    </button>
                </div>

                {/* Toolbar */}
                <div className="flex flex-wrap sm:flex-nowrap justify-between items-center gap-2 shrink-0 mb-4 px-1">
                    <button 
                        onClick={fetchData} 
                        className="flex items-center gap-2 px-3 py-1.5 bg-surface-highlight hover:bg-surface-highlight/80 border border-border text-xs sm:text-sm text-text-main transition-all"
                        style={{ borderRadius: 'var(--radius-button)' }}
                    >
                        <DynamicIcon name="refresh" className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                        Refresh
                    </button>

                    {!confirmClear ? (
                        <button
                            onClick={() => setConfirmClear(true)}
                            className="flex items-center gap-2 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 text-sm transition-all"
                            style={{ borderRadius: 'var(--radius-button)' }}
                        >
                            <DynamicIcon name="trash" className="w-4 h-4" />
                            Clear {activeTab === 'registry' ? (selectedFolder ? `"${selectedFolder}"` : 'All') : 'History'}
                        </button>
                    ) : (
                        <div className="flex items-center gap-2 animate-in fade-in slide-in-from-right-4 duration-200">
                            <span className="text-sm text-red-400 font-medium flex items-center gap-2">
                                <DynamicIcon name="alert" className="w-4 h-4" />
                                Are you sure?
                            </span>
                            <button
                                onClick={handleClearAll}
                                className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded text-sm font-medium transition-colors"
                                style={{ borderRadius: 'var(--radius-button)' }}
                            >
                                Yes
                            </button>
                            <button
                                onClick={() => setConfirmClear(false)}
                                className="px-3 py-1.5 bg-surface-highlight hover:bg-surface-highlight/80 text-text-main rounded text-sm transition-colors"
                                style={{ borderRadius: 'var(--radius-button)' }}
                            >
                                Cancel
                            </button>
                        </div>
                    )}
                </div>

                {/* Folder Filter Pills (Only for Registry) */}
                {activeTab === 'registry' && folders.length > 0 && (
                    <div className="flex gap-2 overflow-x-auto no-scrollbar snap-x snap-mandatory shrink-0 mb-4 pb-2 px-1">
                        <button
                            onClick={() => setSelectedFolder(null)}
                            className={`px-3 py-1.5 text-xs sm:text-sm font-medium border transition-all whitespace-nowrap snap-start ${!selectedFolder ? 'bg-primary border-primary text-on-primary' : 'bg-surface-highlight border-border text-text-muted hover:bg-surface-highlight/80'}`}
                            style={{ borderRadius: 'var(--radius-button)' }}
                        >
                            All ({registryData.length})
                        </button>
                        {folders.map(f => (
                            <button
                                key={f.name}
                                onClick={() => setSelectedFolder(f.name)}
                                className={`px-3 py-1.5 text-xs sm:text-sm font-medium border transition-all flex items-center gap-1.5 whitespace-nowrap snap-start ${selectedFolder === f.name ? 'bg-primary border-primary text-on-primary' : 'bg-surface-highlight border-border text-text-muted hover:bg-surface-highlight/80'}`}
                                style={{ borderRadius: 'var(--radius-button)' }}
                            >
                                <span className="truncate max-w-[120px]">{f.name}</span>
                                <span className={`px-1.5 rounded text-xs ${selectedFolder === f.name ? 'bg-black/20' : 'bg-black/40'}`}>{f.count}</span>
                            </button>
                        ))}
                    </div>
                )}

                {/* Content */}
                <div 
                    className="flex-1 overflow-auto bg-canvas/30 border border-border transition-all"
                    style={{ borderRadius: 'var(--radius-card)' }}
                >
                    {loading && registryData.length === 0 && historyData.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-48 text-text-muted">
                            <DynamicIcon name="refresh" className="w-8 h-8 animate-spin mb-2 opacity-50" />
                            <p>Loading data...</p>
                        </div>
                    ) : (
                        <div className="min-w-[600px] sm:min-w-0"> {/* Force table width on mobile to standard size */}
                            <table className="w-full text-left border-collapse">
                                <thead className="bg-surface sticky top-0 z-10 text-xs uppercase text-text-muted font-semibold tracking-wider">
                                    <tr>
                                        {activeTab === 'registry' ? (
                                            <>
                                                <th className="p-4 border-b border-border">File Path</th>
                                                <th className="p-4 border-b border-border w-32">Size</th>
                                                <th className="p-4 border-b border-border w-48">Synced At</th>
                                                <th className="p-4 border-b border-border w-16"></th>
                                            </>
                                        ) : (
                                            <>
                                                <th className="p-4 border-b border-border">Job Name</th>
                                                <th className="p-4 border-b border-border w-32">Status</th>
                                                <th className="p-4 border-b border-border w-32">Files Sent</th>
                                                <th className="p-4 border-b border-border w-48">Time</th>
                                            </>
                                        )}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border">
                                    {activeTab === 'registry' ? (
                                        getFilteredRegistry().map((row) => (
                                            <tr key={row.file_hash} className="hover:bg-surface-highlight/50 transition-colors group">
                                                <td className="p-4 text-sm text-text-main font-mono truncate max-w-lg" title={row.file_path}>
                                                    {row.file_path}
                                                </td>
                                                <td className="p-4 text-sm text-text-muted">
                                                    {(row.size_bytes / 1024 / 1024).toFixed(2)} MB
                                                </td>
                                                <td className="p-4 text-sm text-text-muted">
                                                    {new Date(row.synced_at).toLocaleString()}
                                                </td>
                                                <td className="p-4 text-right">
                                                    <button
                                                        onClick={() => handleDelete(row.file_hash)}
                                                        className="p-1.5 text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors"
                                                        title="Delete Entry"
                                                        style={{ borderRadius: 'var(--radius-button)' }}
                                                    >
                                                        <DynamicIcon name="trash" className="w-4 h-4" />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))
                                    ) : (
                                        historyData.map((row) => (
                                            <tr key={row.id} className="hover:bg-surface-highlight/50 transition-colors">
                                                <td className="p-4 text-sm text-text-main font-medium">
                                                    {row.name}
                                                </td>
                                                <td className="p-4">
                                                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${row.status === 'completed' ? 'bg-green-500/10 text-green-400 border-green-500/20' :
                                                        row.status === 'failed' ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                                                            'bg-blue-500/10 text-blue-400 border-blue-500/20'
                                                        }`}>
                                                        {row.status}
                                                    </span>
                                                </td>
                                                <td className="p-4 text-sm text-text-muted">
                                                    {JSON.parse(row.stats_json).sent || 0}
                                                </td>
                                                <td className="p-4 text-sm text-text-muted">
                                                    {new Date(row.created_at).toLocaleString()}
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* Empty States */}
                    {!loading && ((activeTab === 'registry' && registryData.length === 0) || (activeTab === 'history' && historyData.length === 0)) && (
                        <div className="flex flex-col items-center justify-center p-12 text-text-muted">
                            <DynamicIcon name="database" size={48} className="mb-4 opacity-20" />
                            <p>No records found.</p>
                        </div>
                    )}
                </div>
            </div>
        </ResponsiveModal>
    );
}
