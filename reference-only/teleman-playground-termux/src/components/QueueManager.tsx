import { DynamicIcon } from './common/DynamicIcon';
import { ResponsiveModal } from './common/ResponsiveModal';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface QueueManagerProps {
    isOpen: boolean;
    onClose: () => void;
    activeJob: any;
    queue: any[];
    onCancelJob: () => void;
    onRemoveFromQueue: (id: string) => void;
    onReorderQueue: (newIds: string[]) => void;
    onClearQueue: () => void;
}

function SortableItem({ id, item, onRemove }: any) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 50 : 0
    };

    return (
        <div 
            ref={setNodeRef} 
            className={`bg-surface border border-border p-3 flex items-center gap-3 transition-all ${isDragging ? 'shadow-2xl ring-2 ring-primary/50 scale-[1.02]' : ''}`}
            style={{ borderRadius: 'var(--radius-card)', ...style }}
        >
            <button {...attributes} {...listeners} className="p-1 text-text-muted hover:text-text-main cursor-grab active:cursor-grabbing">
                <DynamicIcon name="grip" size={18} />
            </button>
            <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-text-main truncate">{item.name}</p>
                <p className="text-[10px] text-text-muted font-mono truncate">{item.source_path}</p>
            </div>
            <button
                onClick={() => onRemove(item.id)}
                className="p-2 text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors"
                style={{ borderRadius: 'var(--radius-button)' }}
            >
                <DynamicIcon name="trash" size={16} />
            </button>
        </div>
    );
}

export function QueueManager({
    isOpen, onClose, activeJob, queue, onCancelJob, onRemoveFromQueue, onReorderQueue, onClearQueue
}: QueueManagerProps) {
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    const handleDragEnd = (event: any) => {
        const { active, over } = event;
        if (active.id !== over.id) {
            const oldIndex = queue.findIndex(i => i.id === active.id);
            const newIndex = queue.findIndex(i => i.id === over.id);
            const newQueue = arrayMove(queue, oldIndex, newIndex);
            onReorderQueue(newQueue.map(i => i.id));
        }
    };

    return (
        <ResponsiveModal
            isOpen={isOpen}
            onClose={onClose}
            title="Job Queue"
            widthClass="max-w-xl"
        >
            <div className="space-y-6">
                {/* Active Job */}
                <div className="space-y-3">
                    <h4 className="text-xs font-bold text-text-muted uppercase tracking-widest px-1">Currently Syncing</h4>
                    {activeJob ? (
                        <div 
                            className="bg-primary/5 border border-primary/20 p-4 transition-all"
                            style={{ borderRadius: 'var(--radius-card)' }}
                        >
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-3">
                                    <DynamicIcon name="play-circle" size={20} className="text-primary" />
                                    <span className="font-bold text-text-main">{activeJob.name}</span>
                                </div>
                                <button
                                    onClick={onCancelJob}
                                    className="px-3 py-1.5 bg-red-500/10 text-red-400 text-xs font-bold transition-all"
                                    style={{ borderRadius: 'var(--radius-button)' }}
                                >
                                    Stop Job
                                </button>
                            </div>
                            <div 
                                className="h-1.5 w-full bg-surface-highlight overflow-hidden"
                                style={{ borderRadius: 'var(--radius-button)' }}
                            >
                                <div className="h-full bg-primary" style={{ width: `${activeJob.progress}%` }} />
                            </div>
                        </div>
                    ) : (
                        <div className="p-4 bg-surface-highlight/30 rounded-xl text-center text-text-muted text-sm border border-dashed border-border">
                            No active job
                        </div>
                    )}
                </div>

                {/* Queue List */}
                <div className="space-y-3">
                    <div className="flex items-center justify-between px-1">
                        <h4 className="text-xs font-bold text-text-muted uppercase tracking-widest">Pending ({queue.length})</h4>
                        {queue.length > 0 && (
                            <button onClick={onClearQueue} className="text-[10px] font-bold text-red-400 hover:text-red-300 uppercase tracking-wider">Clear All</button>
                        )}
                    </div>

                    <div className="space-y-2 min-h-[200px]">
                        {queue.length === 0 ? (
                            <div className="flex flex-col items-center justify-center p-12 text-text-muted border border-dashed border-border rounded-2xl opacity-50">
                                <DynamicIcon name="layers" size={32} className="mb-2" />
                                <p className="text-xs">Queue is empty</p>
                            </div>
                        ) : (
                            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                                <SortableContext items={queue.map(i => i.id)} strategy={verticalListSortingStrategy}>
                                    {queue.map(item => (
                                        <SortableItem key={item.id} id={item.id} item={item} onRemove={onRemoveFromQueue} />
                                    ))}
                                </SortableContext>
                            </DndContext>
                        )}
                    </div>
                </div>
            </div>
        </ResponsiveModal>
    );
}
