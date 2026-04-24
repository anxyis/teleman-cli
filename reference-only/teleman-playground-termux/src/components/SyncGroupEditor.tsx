import { useState } from 'react';
import { DynamicIcon } from './common/DynamicIcon';

interface SyncGroupEditorProps {
    initialGroup?: any;
    presets: any[];
    onSave: (group: any) => void;
    onCancel: () => void;
}

export function SyncGroupEditor({ initialGroup, presets, onSave, onCancel }: SyncGroupEditorProps) {
    const [name, setName] = useState(initialGroup?.name || '');
    const [cron, setCron] = useState(initialGroup?.cron || '');
    const [tasks, setTasks] = useState<any[]>(initialGroup?.tasks || []);

    const addTask = () => {
        setTasks([...tasks, { source_path: '', target_chat_id: '', preset_name: presets[0]?.name || 'default', enabled: true }]);
    };

    const removeTask = (idx: number) => {
        setTasks(tasks.filter((_, i) => i !== idx));
    };

    const updateTask = (idx: number, data: any) => {
        const newTasks = [...tasks];
        newTasks[idx] = { ...newTasks[idx], ...data };
        setTasks(newTasks);
    };

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                    <label className="text-xs font-bold text-text-muted uppercase tracking-widest px-1">Group Name</label>
                    <input
                        className="w-full bg-surface border border-border rounded-xl p-4 text-text-main outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                        value={name}
                        onChange={e => setName(e.target.value)}
                        placeholder="e.g. Daily Backups"
                    />
                </div>
                <div className="space-y-2">
                    <label className="text-xs font-bold text-text-muted uppercase tracking-widest px-1">Cron Schedule (Optional)</label>
                    <input
                        className="w-full bg-surface border border-border rounded-xl p-4 text-text-main outline-none focus:ring-2 focus:ring-primary/50 transition-all font-mono"
                        value={cron}
                        onChange={e => setCron(e.target.value)}
                        placeholder="0 0 * * *"
                    />
                </div>
            </div>

            <div className="space-y-4">
                <div className="flex items-center justify-between px-1">
                    <h3 className="text-sm font-bold text-text-main uppercase tracking-widest">Tasks in Group</h3>
                    <button 
                        onClick={addTask} 
                        className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 rounded-lg text-xs font-bold transition-all"
                        style={{ borderRadius: 'var(--radius-button)' }}
                    >
                        <DynamicIcon name="plus" size={14} /> Add Task
                    </button>
                </div>

                <div className="space-y-3">
                    {tasks.map((task, idx) => (
                        <div key={idx} className="bg-canvas/50 border border-border p-4 rounded-xl space-y-4 relative group">
                            <button 
                                onClick={() => removeTask(idx)} 
                                className="absolute top-2 right-2 p-1.5 text-text-muted hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                            >
                                <DynamicIcon name="trash" size={16} />
                            </button>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-text-muted uppercase">Source Path</label>
                                    <div className="relative">
                                        <input
                                            className="w-full bg-surface border border-border rounded-lg p-2.5 pl-9 text-xs text-text-main outline-none focus:border-primary font-mono transition-all"
                                            value={task.source_path}
                                            onChange={e => updateTask(idx, { source_path: e.target.value })}
                                        />
                                        <DynamicIcon name="folder-open" size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-text-muted uppercase">Target Chat ID</label>
                                    <div className="relative">
                                        <input
                                            className="w-full bg-surface border border-border rounded-lg p-2.5 pl-9 text-xs text-text-main outline-none focus:border-primary font-mono transition-all"
                                            value={task.target_chat_id}
                                            onChange={e => updateTask(idx, { target_chat_id: e.target.value })}
                                        />
                                        <DynamicIcon name="hash" size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}

                    {tasks.length === 0 && (
                        <div className="py-12 border-2 border-dashed border-border rounded-xl text-center text-text-muted italic text-sm">
                            No tasks added yet.
                        </div>
                    )}
                </div>
            </div>

            <div className="flex gap-3 pt-4 border-t border-border">
                <button onClick={onCancel} className="flex-1 py-3 bg-surface-highlight text-text-muted font-bold rounded-xl hover:text-text-main transition-colors">Cancel</button>
                <button 
                    onClick={() => onSave({ name, cron, tasks })} 
                    className="flex-1 py-3 bg-primary text-on-primary font-bold rounded-xl hover:bg-primary-hover shadow-lg shadow-primary/[var(--glow-opacity,0.20)] flex items-center justify-center gap-2 transition-all"
                >
                    <DynamicIcon name="save" size={18} />
                    Save Group
                </button>
            </div>
        </div>
    );
}
