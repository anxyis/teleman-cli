import { DynamicIcon } from './common/DynamicIcon';
import { ResponsiveModal } from './common/ResponsiveModal';

interface SyncErrorModalProps {
    isOpen: boolean;
    onClose: () => void;
    folderId: string;
    errors: any[];
    onRetry: () => void;
}

export function SyncErrorModal({ isOpen, onClose, errors, onRetry }: SyncErrorModalProps) {
    return (
        <ResponsiveModal
            isOpen={isOpen}
            onClose={onClose}
            title="Sync Errors"
            widthClass="max-w-2xl"
            actions={
                <div className="flex gap-2 w-full">
                    <button onClick={onClose} className="flex-1 py-3 bg-surface-highlight text-text-muted font-bold rounded-xl transition-all">Dismiss</button>
                    <button onClick={onRetry} className="flex-1 py-3 bg-primary text-on-primary font-bold rounded-xl hover:bg-primary-hover flex items-center justify-center gap-2 transition-all">
                        <DynamicIcon name="refresh" size={18} />
                        Retry Sync
                    </button>
                </div>
            }
        >
            <div className="space-y-4">
                <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400">
                    <DynamicIcon name="alert" size={24} />
                    <div>
                        <p className="font-bold text-sm">Action Required</p>
                        <p className="text-xs opacity-80">The following errors occurred during the last synchronization attempt.</p>
                    </div>
                </div>

                <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1 no-scrollbar">
                    {errors.length === 0 ? (
                        <div className="py-12 text-center text-text-muted italic text-sm">No error details available.</div>
                    ) : (
                        errors.map((err, idx) => (
                            <div key={idx} className="bg-surface border border-border p-4 rounded-xl space-y-2 group hover:border-red-500/30 transition-all">
                                <div className="flex items-start justify-between gap-4">
                                    <div className="flex items-center gap-2 text-text-main font-bold text-sm">
                                        <DynamicIcon name="file-text" size={14} className="text-text-muted" />
                                        <span className="truncate">{err.file_path.split('/').pop()}</span>
                                    </div>
                                    <span className="text-[10px] bg-canvas px-2 py-0.5 rounded font-mono text-text-muted">{new Date(err.timestamp).toLocaleTimeString()}</span>
                                </div>
                                <p className="text-xs text-red-400 font-mono leading-relaxed bg-black/20 p-2 rounded border border-white/5 break-all">
                                    {err.error_message}
                                </p>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </ResponsiveModal>
    );
}
