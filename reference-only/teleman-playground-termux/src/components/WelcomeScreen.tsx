import { DynamicIcon } from './common/DynamicIcon';

interface WelcomeScreenProps {
    onAddBot: () => void;
}

export function WelcomeScreen({ onAddBot }: WelcomeScreenProps) {
    return (
        <div className="flex flex-col items-center justify-center min-h-[80vh] px-6 text-center animate-in fade-in zoom-in-95 duration-500">
            <div className="relative mb-8">
                <div className="absolute inset-0 bg-primary/20 blur-3xl rounded-full" />
                <div className="relative p-8 bg-surface-highlight/50 border border-white/5 rounded-[40px] shadow-2xl">
                    <DynamicIcon name="terminal" size={64} className="text-primary" />
                </div>
            </div>

            <h1 className="text-4xl font-black text-text-main tracking-tight mb-4">Welcome to TeleMan</h1>
            <p className="text-lg text-text-muted max-w-md mb-10 leading-relaxed">
                Connect your first Telegram Bot to start using the API Playground, Batch Sender, and Auto-Syncer.
            </p>

            <div className="grid gap-4 w-full max-w-sm">
                <button
                    onClick={onAddBot}
                    className="flex items-center justify-center gap-3 px-8 py-5 bg-primary hover:bg-primary-hover text-on-primary font-bold rounded-2xl shadow-xl shadow-primary/[var(--glow-opacity,0.20)] transition-all active:scale-95"
                >
                    <DynamicIcon name="plus" size={24} />
                    <span>Get Started</span>
                </button>

                <div className="flex gap-2">
                    <div className="flex-1 p-4 bg-surface rounded-2xl border border-border flex flex-col items-center gap-2">
                        <DynamicIcon name="settings" size={20} className="text-text-muted" />
                        <span className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Settings</span>
                    </div>
                    <div className="flex-1 p-4 bg-surface rounded-2xl border border-border flex flex-col items-center gap-2">
                        <DynamicIcon name="folders" size={20} className="text-text-muted" />
                        <span className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Local Files</span>
                    </div>
                </div>
            </div>

            <div className="mt-12 pt-8 border-t border-white/5 w-full max-w-xs text-text-muted/40 font-mono text-[10px] uppercase tracking-[0.2em]">
                Version 2.0.0 Refactor
            </div>
        </div>
    );
}
