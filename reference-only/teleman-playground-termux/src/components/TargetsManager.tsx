import { useState, useEffect } from 'react';
import { DynamicIcon } from './common/DynamicIcon';
import { api } from '../api/bridge';
import { ResponsiveModal } from './common/ResponsiveModal';

interface TargetsManagerProps {
    isOpen: boolean;
    onClose: () => void;
}

interface Resource {
    id: number | string;
    title?: string;
    name?: string;
    first_name?: string;
    last_name?: string;
    username?: string;
    type: string; // 'user', 'chat', 'topic'
    chat_id?: number;
    thread_id?: number;
    botToken: string; // We'll enrich this
    botName?: string;
}

export function TargetsManager({ isOpen, onClose }: TargetsManagerProps) {
    const [resources, setResources] = useState<Resource[]>([]);
    const [loading, setLoading] = useState(false);
    const [filter, setFilter] = useState('all');

    useEffect(() => {
        if (isOpen) fetchAllResources();
    }, [isOpen]);

    const fetchAllResources = async () => {
        setLoading(true);
        try {
            // 1. Get Config for Bots
            const config = await api.getConfig();

            // 2. Fetch Resources for EACH bot
            const allResources: Resource[] = [];

            for (const bot of config.savedBots) {
                try {
                    const resData = await api.getResources(bot.token);
                    // Map Users
                    (resData.users || []).forEach((u: any) => allResources.push({ ...u, type: 'user', botToken: bot.token, botName: bot.name }));
                    // Map Chats
                    (resData.chats || []).forEach((c: any) => allResources.push({ ...c, type: 'chat', botToken: bot.token, botName: bot.name }));
                    // Map Topics
                    (resData.topics || []).forEach((t: any) => allResources.push({ ...t, type: 'topic', botToken: bot.token, botName: bot.name, id: `${t.chat_id}:${t.thread_id}` }));
                } catch (e) {
                    console.warn(`Failed to fetch resources for bot ${bot.name}`);
                }
            }
            setResources(allResources);
        } catch (e) {
            console.error("Failed to fetch targets", e);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (resource: Resource) => {
        if (!confirm(`Delete ${resource.title || resource.first_name || resource.name}?`)) return;

        try {
            // We need to fetch the current list for that bot, remove the item, and save back.
            // This is a bit inefficient but safe given the API structure.
            const currentRes = await api.getResources(resource.botToken);

            if (resource.type === 'user') {
                currentRes.users = currentRes.users.filter((u: any) => u.id !== resource.id);
            } else if (resource.type === 'chat') {
                currentRes.chats = currentRes.chats.filter((c: any) => c.id !== resource.id);
            } else if (resource.type === 'topic') {
                const key = (t: any) => `${t.chat_id}:${t.thread_id}`;
                currentRes.topics = currentRes.topics.filter((t: any) => key(t) !== resource.id);
            }

            await api.saveResources(resource.botToken, currentRes);

            // Update UI
            setResources(prev => prev.filter(r => r !== resource));

        } catch (e) {
            alert("Failed to delete target.");
        }
    };

    const filteredResources = resources.filter(r => filter === 'all' || r.type === filter);

    return (
        <ResponsiveModal
            isOpen={isOpen}
            onClose={onClose}
            title="Targets Manager"
            widthClass="max-w-2xl"
        >
            <div className="flex flex-col h-full md:h-[600px]">
                {/* Toolbar */}
                <div className="flex gap-2 overflow-x-auto no-scrollbar shrink-0 mb-4 pb-2">
                    <button 
                        onClick={fetchAllResources} 
                        className="p-2 bg-surface-highlight hover:bg-surface-highlight/80 text-text-muted shrink-0 transition-all"
                        style={{ borderRadius: 'var(--radius-button)' }}
                    >
                        <DynamicIcon name="refresh" size={16} className={loading ? "animate-spin" : ""} />
                    </button>
                    <div className="h-8 w-px bg-border mx-2 shrink-0"></div>
                    {['all', 'user', 'chat', 'topic'].map(f => (
                        <button
                            key={f}
                            onClick={() => setFilter(f)}
                            className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wide transition-all shrink-0 ${filter === f ? 'bg-primary text-on-primary' : 'bg-surface-highlight text-text-muted hover:bg-surface-highlight/80'}`}
                            style={{ borderRadius: 'var(--radius-button)' }}
                        >
                            {f}
                        </button>
                    ))}
                </div>

                {/* List */}
                <div 
                    className="flex-1 overflow-auto bg-canvas/30 border border-border space-y-2 p-2 transition-all"
                    style={{ borderRadius: 'var(--radius-card)' }}
                >
                    {loading && resources.length === 0 ? (
                        <div className="text-center py-8 text-text-muted">Loading targets...</div>
                    ) : filteredResources.length === 0 ? (
                        <div className="text-center py-8 text-text-muted">No targets found. Use "Scan for Resources" in Playground.</div>
                    ) : (
                        filteredResources.map((res, idx) => (
                            <div 
                                key={`${res.id}-${idx}`} 
                                className="bg-surface border border-border p-3 flex items-center justify-between group hover:border-border/80 transition-all shadow-sm"
                                style={{ borderRadius: 'var(--radius-card)' }}
                            >
                                <div className="flex items-center gap-3 overflow-hidden">
                                    <div 
                                        className={`p-2.5 shrink-0 transition-all ${res.type === 'user' ? 'bg-blue-500/10 text-blue-400' : res.type === 'chat' ? 'bg-purple-500/10 text-purple-400' : 'bg-orange-500/10 text-orange-400'}`}
                                        style={{ borderRadius: 'var(--radius-button)' }}
                                    >
                                        {res.type === 'user' ? <DynamicIcon name="user" size={18} /> : res.type === 'chat' ? <DynamicIcon name="message" size={18} /> : <DynamicIcon name="hash" size={18} />}
                                    </div>
                                    <div className="min-w-0">
                                        <div className="text-sm font-bold text-text-main truncate">
                                            {res.title || res.first_name || res.name} {res.last_name || ''}
                                        </div>
                                        <div className="flex items-center gap-2 text-xs text-text-muted font-mono mt-0.5">
                                            <span className="truncate">{res.id}</span>
                                            <span className="text-text-muted/30">•</span>
                                            <span 
                                                className="bg-surface-highlight px-1.5 py-0.5 rounded text-[10px] text-text-muted truncate max-w-[100px]"
                                                style={{ borderRadius: 'var(--radius-button)' }}
                                            >
                                                {res.botName}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                <button
                                    onClick={() => handleDelete(res)}
                                    className="p-2.5 text-text-muted hover:text-red-400 hover:bg-red-500/10 rounded transition-colors sm:opacity-0 group-hover:opacity-100 focus:opacity-100"
                                    style={{ borderRadius: 'var(--radius-button)' }}
                                >
                                    <DynamicIcon name="trash" size={18} />
                                </button>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </ResponsiveModal>
    );
}
