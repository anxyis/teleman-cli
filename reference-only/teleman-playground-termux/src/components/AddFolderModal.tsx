import { useState, useEffect } from 'react';
import { DynamicIcon } from './common/DynamicIcon';
import { ResponsiveModal } from './common/ResponsiveModal';
import { FolderPicker } from './FolderPicker';
import { api } from '../api/bridge';
import axios from 'axios';

interface AddFolderModalProps {
    presets: any[];
    initialData?: any;
    onSave: (data: any) => void;
    onCancel: () => void;
}

interface Resource {
    id: number | string;
    name: string;
    type: 'user' | 'chat' | 'topic';
    thread_id?: number;
    real_chat_id?: number;
}

export function AddFolderModal({ presets, initialData, onSave, onCancel }: AddFolderModalProps) {
    const [name, setName] = useState(initialData?.name || '');
    const [sourcePath, setSourcePath] = useState(initialData?.source_path || '');
    const [targetChatId, setTargetChatId] = useState(initialData?.target_chat_id || '');
    const [targetTopicId, setTargetTopicId] = useState(initialData?.target_topic_id || '');
    const [presetId, setPresetId] = useState(initialData?.preset_id || (presets[0]?.id || ''));
    const [enabled, setEnabled] = useState(initialData ? initialData.enabled === 1 : true);

    // Scheduling State
    const [activeTab, setActiveTab] = useState<'general' | 'schedule'>('general');
    const [scheduleType, setScheduleType] = useState<'none' | 'daily' | 'weekly' | 'monthly' | 'custom'>(initialData?.schedule_type || 'none');
    const [scheduleConfig, setScheduleConfig] = useState<any>(() => {
        try {
            return JSON.parse(initialData?.schedule_config || '{}');
        } catch {
            return {};
        }
    });

    // Resource Selector State
    const [resources, setResources] = useState<Resource[]>([]);
    const [selectedResourceId, setSelectedResourceId] = useState<string>('');
    const [loadingResources, setLoadingResources] = useState(false);

    // Modal view states
    const [showPicker, setShowPicker] = useState(false);
    const [currentToken, setCurrentToken] = useState('');

    const fetchResources = async (token: string) => {
        if (!token) return;
        setLoadingResources(true);
        try {
            const data = await api.getResources(token);
            const { users = [], chats = [], topics = [] } = data;
            const mapped: Resource[] = [
                ...users.map((u: any) => ({ id: u.id, name: `${u.first_name} ${u.last_name || ''}`.trim(), type: 'user' as const })),
                ...chats.map((c: any) => ({ id: c.id, name: c.title || 'Untitled Chat', type: 'chat' as const })),
                ...topics.map((t: any) => ({ id: `${t.chat_id}:${t.thread_id}`, name: `${t.name} (Topic)`, type: 'topic' as const, thread_id: t.thread_id, real_chat_id: t.chat_id }))
            ];
            setResources(mapped);

            // If we have initial data, try to find matching resource
            if (initialData) {
                const matchId = initialData.target_topic_id 
                    ? `${initialData.target_chat_id}:${initialData.target_topic_id}`
                    : initialData.target_chat_id;
                setSelectedResourceId(matchId.toString());
            }
        } catch (err: any) {
            console.error(err);
        } finally {
            setLoadingResources(false);
        }
    };

    useEffect(() => {
        const fetchToken = async () => {
            try {
                const res = await axios.get(`${import.meta.env.VITE_API_BASE_URL ?? ''}/api/config`);
                const token = res.data.active_token || '';
                setCurrentToken(token);
                fetchResources(token);
            } catch (e) {
                console.error("Failed to fetch token", e);
            }
        };
        fetchToken();
    }, []);

    const handleResourceChange = (id: string) => {
        setSelectedResourceId(id);
        const target = resources.find(r => r.id.toString() === id);
        if (target) {
            if (target.type === 'topic') {
                setTargetChatId(target.real_chat_id?.toString() || '');
                setTargetTopicId(target.thread_id?.toString() || '');
            } else {
                setTargetChatId(target.id.toString());
                setTargetTopicId('');
            }
        }
    };

    const handleSave = () => {
        if (!name || !sourcePath || !targetChatId) {
            alert('Please fill in all required fields.');
            return;
        }
        onSave({
            name,
            sourcePath,
            targetChatId,
            targetTopicId: targetTopicId || undefined,
            presetId,
            enabled: enabled ? 1 : 0,
            scheduleType,
            scheduleConfig: JSON.stringify(scheduleConfig)
        });
    };

    if (showPicker) {
        return (
            <FolderPicker 
                initialPath={sourcePath} 
                onSelect={(path) => { setSourcePath(path); setShowPicker(false); }} 
                onCancel={() => setShowPicker(false)} 
            />
        );
    }

    return (
        <ResponsiveModal
            isOpen={true}
            onClose={onCancel}
            title={initialData ? "Edit Sync Configuration" : "New Sync Configuration"}
            actions={
                <div className="flex gap-2 w-full">
                    <button onClick={onCancel} className="flex-1 py-3 bg-surface-highlight text-text-muted font-bold rounded-xl hover:text-text-main transition-colors">Cancel</button>
                    <button 
                        onClick={handleSave} 
                        className="flex-1 py-3 bg-primary text-on-primary font-bold rounded-xl hover:bg-primary-hover shadow-lg shadow-primary/[var(--glow-opacity,0.20)] flex items-center justify-center gap-2 transition-all active:scale-95"
                    >
                        <DynamicIcon name="save" size={18} />
                        {initialData ? "Save Changes" : "Create Configuration"}
                    </button>
                </div>
            }
        >
            <div className="space-y-5">
                {/* TABS */}
                <div className="flex p-1 bg-canvas/50 rounded-xl border border-border/50">
                    <button 
                        onClick={() => setActiveTab('general')}
                        className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-bold rounded-lg transition-all ${activeTab === 'general' ? 'bg-surface text-primary shadow-sm' : 'text-text-muted hover:text-text-main'}`}
                    >
                        <DynamicIcon name="folders" size={14} /> General
                    </button>
                    <button 
                        onClick={() => setActiveTab('schedule')}
                        className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-bold rounded-lg transition-all ${activeTab === 'schedule' ? 'bg-surface text-primary shadow-sm' : 'text-text-muted hover:text-text-main'}`}
                    >
                        <DynamicIcon name="clock" size={14} /> Schedule
                    </button>
                </div>

                {activeTab === 'general' ? (
                    <div className="space-y-5 animate-in fade-in slide-in-from-left-4 duration-200">
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-text-muted uppercase tracking-widest px-1">Friendly Name</label>
                            <input
                                type="text"
                                placeholder="e.g. My Movies"
                                className="w-full bg-surface border border-border rounded-xl p-4 text-text-main outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                                value={name}
                                onChange={e => setName(e.target.value)}
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-bold text-text-muted uppercase tracking-widest px-1">Source Path (Absolute)</label>
                            <div className="flex gap-2">
                                <div className="relative group flex-1">
                                    <input
                                        type="text"
                                        placeholder="/data/data/com.termux/files/home/downloads"
                                        className="w-full bg-surface border border-border rounded-xl p-4 pl-12 text-text-main outline-none focus:ring-2 focus:ring-primary/50 transition-all font-mono text-sm"
                                        value={sourcePath}
                                        onChange={e => setSourcePath(e.target.value)}
                                    />
                                    <DynamicIcon name="folders" size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted group-focus-within:text-primary transition-colors" />
                                </div>
                                <button
                                    onClick={() => setShowPicker(true)}
                                    className="px-4 bg-surface-highlight hover:bg-surface border border-border rounded-xl text-text-main transition-colors flex items-center justify-center"
                                    title="Browse Folders"
                                >
                                    <DynamicIcon name="folder-open" size={20} />
                                </button>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <div className="flex justify-between items-center px-1">
                                <label className="text-xs font-bold text-text-muted uppercase tracking-widest">Target Destination</label>
                                <button 
                                    onClick={() => fetchResources(currentToken)}
                                    disabled={loadingResources}
                                    className="text-[10px] font-bold text-primary hover:text-primary-hover uppercase tracking-wider flex items-center gap-1 transition-colors disabled:opacity-50"
                                >
                                    <DynamicIcon name="refresh" size={10} className={loadingResources ? "animate-spin" : ""} /> Refresh
                                </button>
                            </div>

                            <div className="relative group">
                                <select
                                    className="w-full bg-surface border border-border rounded-xl p-4 pl-12 text-text-main outline-none focus:ring-2 focus:ring-primary/50 transition-all appearance-none"
                                    value={selectedResourceId}
                                    onChange={e => handleResourceChange(e.target.value)}
                                >
                                    <option value="">Select Target Chat / Topic...</option>
                                    {resources.map(r => (
                                        <option key={r.id} value={r.id}>{r.name} ({r.type})</option>
                                    ))}
                                </select>
                                <DynamicIcon name="message" size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted group-focus-within:text-primary transition-colors" />
                                <DynamicIcon name="chevron-down" size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
                            </div>

                            {/* Advanced / Manual Override */}
                            <div className="grid grid-cols-2 gap-4 mt-2">
                                <div className="relative group">
                                    <input
                                        type="text"
                                        placeholder="Chat ID"
                                        className="w-full bg-canvas/50 border border-border rounded-lg p-2.5 pl-9 text-text-main outline-none focus:ring-1 focus:ring-primary/30 transition-all font-mono text-[10px]"
                                        value={targetChatId}
                                        onChange={e => setTargetChatId(e.target.value)}
                                    />
                                    <DynamicIcon name="hash" size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                                </div>
                                <div className="relative group">
                                    <input
                                        type="text"
                                        placeholder="Topic ID"
                                        className="w-full bg-canvas/50 border border-border rounded-lg p-2.5 pl-9 text-text-main outline-none focus:ring-1 focus:ring-primary/30 transition-all font-mono text-[10px]"
                                        value={targetTopicId}
                                        onChange={e => setTargetTopicId(e.target.value)}
                                    />
                                    <DynamicIcon name="hash" size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                                </div>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-bold text-text-muted uppercase tracking-widest px-1">Sync Preset</label>
                            <div className="relative group">
                                <select
                                    className="w-full bg-surface border border-border rounded-xl p-4 pl-12 text-text-main outline-none focus:ring-2 focus:ring-primary/50 transition-all appearance-none"
                                    value={presetId}
                                    onChange={e => setPresetId(e.target.value)}
                                >
                                    {presets.map(p => (
                                        <option key={p.id} value={p.id}>{p.name}</option>
                                    ))}
                                </select>
                                <DynamicIcon name="layers" size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted group-focus-within:text-primary transition-colors" />
                                <DynamicIcon name="chevron-down" size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
                            </div>
                        </div>

                        <label className="flex items-center gap-3 p-4 bg-surface-highlight/30 border border-border rounded-xl cursor-pointer hover:bg-surface-highlight/50 transition-all group">
                            <input
                                type="checkbox"
                                checked={enabled}
                                onChange={e => setEnabled(e.target.checked)}
                                className="w-5 h-5 rounded border-border bg-canvas text-primary focus:ring-primary"
                            />
                            <div className="flex-1">
                                <p className="text-sm font-bold text-text-main group-hover:text-primary transition-colors">Enabled</p>
                                <p className="text-[10px] text-text-muted uppercase tracking-wider">Sync will run during automated intervals</p>
                            </div>
                        </label>
                    </div>
                ) : (
                    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-200">
                        <div className="space-y-3">
                            <label className="text-xs font-bold text-text-muted uppercase tracking-widest px-1">Frequency</label>
                            <div className="grid grid-cols-2 gap-2">
                                {[
                                    { id: 'none', label: 'Manual Only', icon: 'stop' },
                                    { id: 'daily', label: 'Every Day', icon: 'calendar' },
                                    { id: 'weekly', label: 'Weekly', icon: 'calendar' },
                                    { id: 'monthly', label: 'Monthly', icon: 'calendar' },
                                    { id: 'custom', label: 'Custom', icon: 'wand' }
                                ].map(type => (
                                    <button
                                        key={type.id}
                                        onClick={() => setScheduleType(type.id as any)}
                                        className={`flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${scheduleType === type.id ? 'bg-primary/10 border-primary text-primary' : 'bg-surface border-border hover:border-border/80 text-text-muted'}`}
                                    >
                                        <DynamicIcon name={type.icon as any} size={16} />
                                        <span className="text-xs font-bold">{type.label}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {scheduleType === 'weekly' && (
                            <div className="space-y-3 p-4 bg-surface-highlight/30 rounded-2xl border border-border/50 animate-in zoom-in-95">
                                <label className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Days of Week</label>
                                <div className="flex justify-between">
                                    {['S','M','T','W','T','F','S'].map((day, i) => {
                                        const days = scheduleConfig.days_of_week || [];
                                        const active = days.includes(i);
                                        return (
                                            <button
                                                key={i}
                                                onClick={() => {
                                                    const next = active ? days.filter((d: any) => d !== i) : [...days, i];
                                                    setScheduleConfig({ ...scheduleConfig, days_of_week: next });
                                                }}
                                                className={`w-9 h-9 rounded-full text-xs font-bold transition-all border ${active ? 'bg-primary text-on-primary border-primary shadow-lg shadow-primary/20' : 'bg-surface text-text-muted border-border hover:border-text-muted'}`}
                                            >
                                                {day}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {scheduleType === 'monthly' && (
                            <div className="space-y-3 p-4 bg-surface-highlight/30 rounded-2xl border border-border/50 animate-in zoom-in-95">
                                <label className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Day of Month</label>
                                <div className="flex items-center gap-4">
                                    <input 
                                        type="range" min="1" max="31" 
                                        value={scheduleConfig.day_of_month || 1}
                                        onChange={e => setScheduleConfig({ ...scheduleConfig, day_of_month: parseInt(e.target.value) })}
                                        className="flex-1 h-3 bg-canvas rounded-lg appearance-none cursor-pointer accent-primary theme-slider"
                                    />
                                    <span className="w-12 text-center text-sm font-bold text-primary bg-primary/10 py-1 rounded-lg border border-primary/20">
                                        {scheduleConfig.day_of_month || 1}
                                    </span>
                                </div>
                            </div>
                        )}

                        {scheduleType === 'none' ? (
                            <div className="p-8 text-center text-text-muted bg-surface-highlight/20 rounded-2xl border border-dashed border-border/50">
                                <DynamicIcon name="stop" size={24} className="mx-auto mb-2 opacity-20" />
                                <p className="text-xs italic">Sync will only run when you trigger it manually.</p>
                            </div>
                        ) : (
                            <div className="p-4 bg-primary/5 rounded-2xl border border-primary/10 flex items-start gap-3">
                                <DynamicIcon name="alert" size={16} className="text-primary shrink-0 mt-0.5" />
                                <p className="text-[10px] text-text-muted leading-relaxed">
                                    The scheduler runs every 30 minutes. The next sync will be queued automatically when the selected criteria are met.
                                </p>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </ResponsiveModal>
    );
}
