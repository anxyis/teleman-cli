import { useState, useEffect } from 'react';
import { DynamicIcon } from './common/DynamicIcon';
import { ResponsiveModal } from './common/ResponsiveModal';
import { FolderPicker } from './FolderPicker';
import { api } from '../api/bridge';
import axios from 'axios';

interface GroupEditorModalProps {
    presets: any[];
    initialGroup?: any;
    onSave: (group: any) => void;
    onCancel: () => void;
}

interface Resource {
    id: number | string;
    name: string;
    type: 'user' | 'chat' | 'topic';
    thread_id?: number;
    real_chat_id?: number;
}

export function GroupEditorModal({ presets, initialGroup, onSave, onCancel }: GroupEditorModalProps) {
    const [name, setName] = useState(initialGroup?.name || '');
    const [tasks, setTasks] = useState<any[]>(initialGroup?.tasks || []);
    
    // Tabs & Scheduling
    const [activeTab, setActiveTab] = useState<'general' | 'schedule'>('general');
    const [scheduleType, setScheduleType] = useState<'none' | 'daily' | 'weekly' | 'monthly' | 'custom'>(initialGroup?.schedule_type || 'none');
    const [scheduleConfig, setScheduleConfig] = useState<any>(() => {
        try {
            return JSON.parse(initialGroup?.schedule_config || '{}');
        } catch {
            return {};
        }
    });

    // Resource Selector State
    const [resources, setResources] = useState<Resource[]>([]);

    // Picker state for tasks
    const [pickingTaskIdx, setPickingTaskIdx] = useState<number | null>(null);

    const fetchResources = async (token: string) => {
        if (!token) return;
        try {
            const data = await api.getResources(token);
            const { users = [], chats = [], topics = [] } = data;
            const mapped: Resource[] = [
                ...users.map((u: any) => ({ id: u.id, name: `${u.first_name} ${u.last_name || ''}`.trim(), type: 'user' as const })),
                ...chats.map((c: any) => ({ id: c.id, name: c.title || 'Untitled Chat', type: 'chat' as const })),
                ...topics.map((t: any) => ({ id: `${t.chat_id}:${t.thread_id}`, name: `${t.name} (Topic)`, type: 'topic' as const, thread_id: t.thread_id, real_chat_id: t.chat_id }))
            ];
            setResources(mapped);
        } catch (err: any) {
            console.error(err);
        }
    };

    useEffect(() => {
        const fetchToken = async () => {
            try {
                const res = await axios.get(`${import.meta.env.VITE_API_BASE_URL ?? ''}/api/config`);
                const token = res.data.active_token || '';
                fetchResources(token);
            } catch (e) {
                console.error("Failed to fetch token", e);
            }
        };
        fetchToken();
    }, []);

    const addTask = () => {
        setTasks([...tasks, { 
            source_path: '', 
            target_chat_id: '', 
            target_topic_id: '',
            preset_id: presets[0]?.id || '', 
            order_index: tasks.length,
            enabled: true,
            custom_name: ''
        }]);
    };

    const removeTask = (idx: number) => {
        setTasks(tasks.filter((_, i) => i !== idx));
    };

    const updateTask = (idx: number, data: any) => {
        const newTasks = [...tasks];
        newTasks[idx] = { ...newTasks[idx], ...data };
        setTasks(newTasks);
    };

    const handleTaskResourceChange = (idx: number, resourceId: string) => {
        const target = resources.find(r => r.id.toString() === resourceId);
        if (target) {
            if (target.type === 'topic') {
                updateTask(idx, { 
                    target_chat_id: target.real_chat_id?.toString(),
                    target_topic_id: target.thread_id?.toString()
                });
            } else {
                updateTask(idx, { 
                    target_chat_id: target.id.toString(),
                    target_topic_id: ''
                });
            }
        }
    };

    const handleSave = () => {
        if (!name || tasks.length === 0) {
            alert('Please provide a group name and at least one task.');
            return;
        }
        onSave({ 
            name, 
            tasks,
            schedule_type: scheduleType,
            schedule_config: JSON.stringify(scheduleConfig)
        });
    };

    if (pickingTaskIdx !== null) {
        return (
            <FolderPicker 
                initialPath={tasks[pickingTaskIdx].source_path}
                onSelect={(path) => {
                    updateTask(pickingTaskIdx, { source_path: path });
                    setPickingTaskIdx(null);
                }}
                onCancel={() => setPickingTaskIdx(null)}
            />
        );
    }

    return (
        <ResponsiveModal
            isOpen={true}
            onClose={onCancel}
            title={initialGroup ? "Edit Sync Group" : "Create Sync Group"}
            actions={
                <div className="flex gap-2 w-full">
                    <button onClick={onCancel} className="flex-1 py-3 bg-surface-highlight text-text-muted font-bold rounded-xl hover:text-text-main transition-colors">Cancel</button>
                    <button onClick={handleSave} className="flex-1 py-3 bg-emerald-500 text-white font-bold rounded-xl hover:bg-emerald-400 shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 transition-all active:scale-95">
                        <DynamicIcon name="save" size={18} />
                        Save Group
                    </button>
                </div>
            }
        >
            <div className="space-y-5">
                {/* TABS */}
                <div className="flex p-1 bg-canvas/50 rounded-xl border border-border/50">
                    <button 
                        onClick={() => setActiveTab('general')}
                        className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-bold rounded-lg transition-all ${activeTab === 'general' ? 'bg-surface text-emerald-400 shadow-sm' : 'text-text-muted hover:text-text-main'}`}
                    >
                        <DynamicIcon name="layers" size={14} /> Group Details
                    </button>
                    <button 
                        onClick={() => setActiveTab('schedule')}
                        className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-bold rounded-lg transition-all ${activeTab === 'schedule' ? 'bg-surface text-emerald-400 shadow-sm' : 'text-text-muted hover:text-text-main'}`}
                    >
                        <DynamicIcon name="clock" size={14} /> Schedule
                    </button>
                </div>

                {activeTab === 'general' ? (
                    <div className="space-y-6 animate-in fade-in slide-in-from-left-4 duration-200">
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-text-muted uppercase tracking-widest px-1">Group Name</label>
                            <input className="w-full bg-surface border border-border rounded-xl p-4 text-text-main outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. My Media Backup" />
                        </div>

                        <div className="space-y-4">
                            <div className="flex items-center justify-between px-1">
                                <h3 className="text-xs font-bold text-text-muted uppercase tracking-widest">Tasks ({tasks.length})</h3>
                                <button onClick={addTask} className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all">
                                    <DynamicIcon name="plus" size={12} /> Add Task
                                </button>
                            </div>

                            <div className="space-y-3">
                                {tasks.map((task, idx) => (
                                    <div key={idx} className="bg-canvas/50 border border-border p-4 rounded-2xl space-y-4 relative group transition-all">
                                        <button onClick={() => removeTask(idx)} className="absolute top-2 right-2 p-1.5 text-text-muted hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all">
                                            <DynamicIcon name="trash" size={16} />
                                        </button>

                                        <div className="space-y-3">
                                            {/* Task Path */}
                                            <div className="space-y-1.5">
                                                <label className="text-[10px] font-bold text-text-muted uppercase tracking-wider px-1">Source Path</label>
                                                <div className="flex gap-2">
                                                    <div className="relative flex-1">
                                                        <input className="w-full bg-surface border border-border rounded-xl p-3 pl-10 text-xs text-text-main outline-none focus:border-emerald-500 font-mono transition-all" value={task.source_path} onChange={e => updateTask(idx, { source_path: e.target.value })} placeholder="/path/to/folder" />
                                                        <DynamicIcon name="folder-open" size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted" />
                                                    </div>
                                                    <button onClick={() => setPickingTaskIdx(idx)} className="p-3 bg-surface border border-border rounded-xl text-text-muted hover:text-emerald-400 transition-colors">
                                                        <DynamicIcon name="search" size={18} />
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Task Target */}
                                            <div className="space-y-1.5">
                                                <label className="text-[10px] font-bold text-text-muted uppercase tracking-wider px-1">Target Destination</label>
                                                <div className="relative">
                                                    <select
                                                        className="w-full bg-surface border border-border rounded-xl p-3 pl-10 text-xs text-text-main outline-none focus:border-emerald-500 appearance-none transition-all"
                                                        value={task.target_topic_id ? `${task.target_chat_id}:${task.target_topic_id}` : task.target_chat_id}
                                                        onChange={e => handleTaskResourceChange(idx, e.target.value)}
                                                    >
                                                        <option value="">Select Target...</option>
                                                        {resources.map(r => (
                                                            <option key={r.id} value={r.id}>{r.name} ({r.type})</option>
                                                        ))}
                                                    </select>
                                                    <DynamicIcon name="message" size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted" />
                                                    <DynamicIcon name="chevron-down" size={14} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
                                                </div>
                                            </div>

                                            {/* Task Preset */}
                                            <div className="space-y-1.5">
                                                <label className="text-[10px] font-bold text-text-muted uppercase tracking-wider px-1">Sync Preset</label>
                                                <div className="relative">
                                                    <select
                                                        className="w-full bg-surface border border-border rounded-xl p-3 pl-10 text-xs text-text-main outline-none focus:border-emerald-500 appearance-none transition-all"
                                                        value={task.preset_id}
                                                        onChange={e => updateTask(idx, { preset_id: e.target.value })}
                                                    >
                                                        {presets.map(p => (
                                                            <option key={p.id} value={p.id}>{p.name}</option>
                                                        ))}
                                                    </select>
                                                    <DynamicIcon name="layers" size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted" />
                                                    <DynamicIcon name="chevron-down" size={14} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}

                                {tasks.length === 0 && (
                                    <div className="py-12 border border-dashed border-border rounded-2xl text-center text-text-muted italic text-xs flex flex-col items-center gap-2 bg-surface-highlight/10">
                                        <DynamicIcon name="layers" size={32} className="opacity-10" />
                                        <p>No tasks added to this group yet.</p>
                                    </div>
                                )}
                            </div>
                        </div>
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
                                    { id: 'monthly', label: 'Monthly', icon: 'calendar' }
                                ].map(type => (
                                    <button
                                        key={type.id}
                                        onClick={() => setScheduleType(type.id as any)}
                                        className={`flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${scheduleType === type.id ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-400' : 'bg-surface border-border hover:border-border/80 text-text-muted'}`}
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
                                                className={`w-9 h-9 rounded-full text-xs font-bold transition-all border ${active ? 'bg-emerald-500 text-white border-emerald-500 shadow-lg shadow-emerald-500/20' : 'bg-surface text-text-muted border-border hover:border-text-muted'}`}
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
                                        className="flex-1 h-3 bg-canvas rounded-lg appearance-none cursor-pointer accent-emerald-500 theme-slider"
                                    />
                                    <span className="w-12 text-center text-sm font-bold text-emerald-400 bg-emerald-500/10 py-1 rounded-lg border border-emerald-500/20">
                                        {scheduleConfig.day_of_month || 1}
                                    </span>
                                </div>
                            </div>
                        )}

                        {scheduleType === 'none' ? (
                            <div className="p-8 text-center text-text-muted bg-surface-highlight/20 rounded-2xl border border-dashed border-border/50">
                                <DynamicIcon name="stop" size={24} className="mx-auto mb-2 opacity-20" />
                                <p className="text-xs italic">Group will only run when you trigger it manually.</p>
                            </div>
                        ) : (
                            <div className="p-4 bg-emerald-500/5 rounded-2xl border border-emerald-500/10 flex items-start gap-3">
                                <DynamicIcon name="alert" size={16} className="text-emerald-400 shrink-0 mt-0.5" />
                                <p className="text-[10px] text-text-muted leading-relaxed">
                                    The group scheduler runs every 30 minutes. All tasks in this group will be executed sequentially when the schedule is met.
                                </p>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </ResponsiveModal>
    );
}
