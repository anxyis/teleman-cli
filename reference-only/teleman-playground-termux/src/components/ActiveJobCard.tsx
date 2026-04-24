import { DynamicIcon } from './common/DynamicIcon';

interface ActiveJob {
    jobId: string;
    status: string;
    name: string;
    currentFile: string;
    progress: number;
    speed: string;
    eta: string;
    processedSize: string;
    totalSize: string;
}

interface ActiveJobCardProps {
    job: ActiveJob;
    onCancel: (deleteSent: boolean) => void;
    onSkip: () => void;
}

export function ActiveJobCard({ job, onCancel, onSkip }: ActiveJobCardProps) {
    const isUploading = job.status === 'uploading' || job.status === 'processing';

    return (
        <div 
            className="bg-surface border border-primary/30 p-4 shadow-lg shadow-primary/[var(--glow-opacity,0.10)] transition-all overflow-hidden relative"
            style={{ borderRadius: 'var(--radius-card)' }}
        >
            {/* Progress Glow Background */}
            <div 
                className="absolute inset-0 bg-primary/5 transition-all duration-500" 
                style={{ width: `${job.progress}%` }} 
            />

            <div className="relative z-10">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-primary text-on-primary rounded-xl shadow-lg shadow-primary/[var(--glow-opacity,0.30)]">
                            {isUploading ? (
                                <DynamicIcon name="loader" size={20} className="animate-spin" />
                            ) : (
                                <DynamicIcon name="sync" size={20} />
                            )}
                        </div>
                        <div>
                            <h3 className="font-bold text-text-main leading-tight">{job.name}</h3>
                            <p className="text-[10px] text-text-muted font-bold uppercase tracking-widest mt-0.5">
                                {job.status} • {job.speed}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={onSkip}
                            className="p-2 hover:bg-surface-highlight text-text-muted hover:text-text-main rounded-lg transition-colors"
                            title="Skip current file"
                        >
                            <DynamicIcon name="skip" size={20} />
                        </button>
                        <button
                            onClick={() => onCancel(false)}
                            className="p-2 hover:bg-red-500/10 text-text-muted hover:text-red-400 rounded-lg transition-colors"
                            title="Stop sync"
                        >
                            <DynamicIcon name="stop" size={20} />
                        </button>
                    </div>
                </div>

                <div className="space-y-3">
                    <div className="flex justify-between items-end text-xs">
                        <span className="text-text-muted truncate max-w-[70%] font-mono">
                            {job.currentFile}
                        </span>
                        <span className="font-bold text-primary">{Math.round(job.progress)}%</span>
                    </div>

                    <div 
                        className="h-2 w-full bg-surface-highlight overflow-hidden"
                        style={{ borderRadius: 'var(--radius-button)' }}
                    >
                        <div
                            className="h-full bg-primary transition-all duration-500 ease-out"
                            style={{ width: `${job.progress}%` }}
                        />
                    </div>

                    <div className="flex justify-between items-center text-[10px] font-bold text-text-muted uppercase tracking-wider">
                        <span className="flex items-center gap-1">
                            <DynamicIcon name="clock" size={10} /> ETA: {job.eta}
                        </span>
                        <span>{job.processedSize} processed</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
