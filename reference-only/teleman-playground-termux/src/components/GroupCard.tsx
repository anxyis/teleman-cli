import { useState } from 'react';
import { DynamicIcon } from './common/DynamicIcon';

interface GroupCardProps {
    group: {
        id: string;
        name: string;
        tasks: any[];
        last_run?: number;
        next_sync_due?: number;
        schedule_type?: string;
        cron?: string;
    };
    onRun: (id: string) => void;
    onEdit: (group: any) => void;
    onDelete: (id: string) => void;
}

export function GroupCard({ group, onRun, onEdit, onDelete }: GroupCardProps) {
    const [isExpanded, setIsExpanded] = useState(false);

    const lastRunText = group.last_run
        ? new Date(group.last_run).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
        : 'Never';

    return (
        <div 
            className="bg-surface border border-border overflow-hidden transition-all hover:border-emerald-500/30"
            style={{ borderRadius: 'var(--radius-card)' }}
        >
            <div className="p-4 flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0 flex items-center gap-3">
                    <div className="p-2.5 bg-emerald-500/10 text-emerald-400 rounded-xl shrink-0">
                        <DynamicIcon name="layers" size={20} />
                    </div>
                    <div className="min-w-0 flex-1">
                        <h3 className="font-bold text-text-main truncate">{group.name}</h3>
                        
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
                            <span className="flex items-center gap-1 text-[10px] text-text-muted font-bold uppercase tracking-tighter">
                                <DynamicIcon name="folders" size={10} /> {group.tasks?.length || 0} Tasks
                            </span>
                            
                            <span className={`flex items-center gap-1 text-[10px] font-bold uppercase tracking-tighter ${group.schedule_type && group.schedule_type !== 'none' ? 'text-emerald-500' : 'text-text-muted'}`}>
                                <DynamicIcon name="clock" size={10} /> {group.schedule_type || 'Manual'}
                            </span>

                            <span className="text-[10px] text-text-muted font-bold uppercase tracking-tighter">
                                Last: {lastRunText}
                            </span>
                        </div>

                        {group.schedule_type && group.schedule_type !== 'none' && group.next_sync_due && (
                            <div className="flex items-center gap-1.5 mt-1.5 pt-1.5 border-t border-border/30">
                                <span className="text-[9px] text-emerald-500 font-bold uppercase tracking-widest">Next Due:</span>
                                <span className="text-[10px] text-emerald-400 font-mono font-bold">
                                    {new Date(group.next_sync_due).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                </span>
                            </div>
                        )}
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={() => onRun(group.id)}
                        className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-white text-xs font-bold rounded-lg transition-all active:scale-95 shadow-lg shadow-emerald-500/20"
                        style={{ borderRadius: 'var(--radius-button)' }}
                    >
                        <DynamicIcon name="play" size={14} /> Run
                    </button>
                    <button
                        onClick={() => setIsExpanded(!isExpanded)}
                        className="p-2 hover:bg-surface-highlight text-text-muted rounded-lg transition-colors"
                        style={{ borderRadius: 'var(--radius-button)' }}
                    >
                        <DynamicIcon name={isExpanded ? "chevron-up" : "chevron-down"} size={18} />
                    </button>
                </div>
            </div>

            {isExpanded && (
                <div className="border-t border-border bg-canvas/30 p-4 space-y-3 animate-in slide-in-from-top-2 duration-200">
                    <div className="space-y-2">
                        {group.tasks?.map((task: any, idx: number) => (
                            <div key={idx} className="flex items-center gap-3 text-xs p-2 bg-surface rounded-lg border border-border/50">
                                <div className="w-6 h-6 flex items-center justify-center bg-surface-highlight rounded text-[10px] font-mono text-text-muted">{idx + 1}</div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-text-main font-medium truncate">{task.source_path.split('/').pop()}</p>
                                    <p className="text-[10px] text-text-muted truncate">Target: {task.target_chat_id}</p>
                                </div>
                                {task.enabled ? (
                                    <DynamicIcon name="check" size={14} className="text-emerald-400" />
                                ) : (
                                    <div className="w-3.5 h-3.5 rounded-full border border-text-muted/30" />
                                )}
                            </div>
                        ))}
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                        <button
                            onClick={() => onEdit(group)}
                            className="flex items-center gap-2 px-3 py-1.5 hover:bg-surface-highlight text-text-muted hover:text-text-main text-xs font-medium transition-colors"
                            style={{ borderRadius: 'var(--radius-button)' }}
                        >
                            <DynamicIcon name="edit" size={14} /> Edit Group
                        </button>
                        <button
                            onClick={() => onDelete(group.id)}
                            className="flex items-center gap-2 px-3 py-1.5 hover:bg-red-500/10 text-text-muted hover:text-red-400 text-xs font-medium transition-colors"
                            style={{ borderRadius: 'var(--radius-button)' }}
                        >
                            <DynamicIcon name="trash" size={14} /> Delete
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
