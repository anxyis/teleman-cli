import { useState, useEffect } from 'react';
import { Clock, CheckCircle, XCircle, AlertCircle, RefreshCw } from 'lucide-react';
import axios from 'axios';

export function JobHistoryTable() {
    const [jobs, setJobs] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchHistory = async () => {
        try {
            const res = await axios.get(`${import.meta.env.VITE_API_BASE_URL ?? ''}/api/jobs`);
            setJobs(res.data);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchHistory();
        const interval = setInterval(fetchHistory, 10000); // Poll every 10s
        return () => clearInterval(interval);
    }, []);

    const formatDuration = (ms: number) => {
        if (!ms) return '-';
        const sec = Math.floor(ms / 1000);
        const min = Math.floor(sec / 60);
        return min > 0 ? `${min}m ${sec % 60}s` : `${sec}s`;
    };

    const formatBytes = (bytes: number) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const dm = 2;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    };

    if (loading && jobs.length === 0) return <div className="text-center p-4 text-slate-500">Loading history...</div>;
    if (jobs.length === 0) return null; // Don't show if empty

    return (
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden mt-8">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                <h3 className="font-bold text-slate-300 flex items-center gap-2">
                    <Clock size={16} /> Recent Jobs
                </h3>
                <button onClick={fetchHistory} className="text-slate-500 hover:text-slate-300"><RefreshCw size={14} /></button>
            </div>

            <table className="w-full text-sm text-left">
                <thead className="bg-slate-900 text-slate-500 font-medium">
                    <tr>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3">Job Name</th>
                        <th className="px-4 py-3">Files</th>
                        <th className="px-4 py-3">Size</th>
                        <th className="px-4 py-3">Duration</th>
                        <th className="px-4 py-3">When</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                    {jobs.map(job => {
                        const stats = JSON.parse(job.stats_json || '{}');
                        const isSuccess = job.status === 'completed';
                        const isFail = job.status === 'failed';

                        return (
                            <tr key={job.id} className="hover:bg-slate-800/30 transition-colors">
                                <td className="px-4 py-3">
                                    {isSuccess && <CheckCircle className="text-green-500" size={16} />}
                                    {isFail && <XCircle className="text-red-500" size={16} />}
                                    {!isSuccess && !isFail && <AlertCircle className="text-blue-500" size={16} />}
                                </td>
                                <td className="px-4 py-3 text-slate-200 font-medium">{job.name}</td>
                                <td className="px-4 py-3 text-slate-400">
                                    {stats.sent} <span className="text-slate-600">({stats.failed} failed)</span>
                                </td>
                                <td className="px-4 py-3 text-slate-300 font-mono text-xs">{formatBytes(stats.bytes || 0)}</td>
                                <td className="px-4 py-3 text-slate-400">{formatDuration(stats.durationMs)}</td>
                                <td className="px-4 py-3 text-slate-500 text-xs">
                                    {new Date(job.created_at).toLocaleString()}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}
