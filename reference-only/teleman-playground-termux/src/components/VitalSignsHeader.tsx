import { DynamicIcon } from './common/DynamicIcon';

interface SystemStats {
    cpu: number;
    ram: number;
    disk: {
        free: number;
        total: number;
        usagePercent: number;
    };
    folders?: number;
    targets?: any;
    presets?: any;
    queue?: any;
    database?: any;
    logs?: any;
}

interface VitalSignsProps {
    stats: SystemStats | null;
}

export function VitalSignsHeader({ stats }: VitalSignsProps) {
    if (!stats) return null;

    const isDiskWarning = stats.disk.usagePercent > 90;
    const isDiskCritical = stats.disk.usagePercent > 95;

    return (
        <div className="w-full px-4 py-3 flex items-center gap-2 overflow-x-auto no-scrollbar snap-x snap-mandatory bg-transparent justify-center lg:justify-end">
            {/* CPU Pill */}
            <div
                className="snap-start shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 border border-primary/30 transition-all hover:border-primary/50 bg-transparent"
                style={{ borderRadius: 'var(--radius-button, 9999px)' }}
            >
                <DynamicIcon name="cpu" size={14} className={stats.cpu > 80 ? "text-orange-400 animate-pulse" : "text-primary"} />
                <span className="text-[10px] font-bold text-text-muted uppercase tracking-wide">CPU</span>
                <span className="text-xs font-semibold text-text-main ml-0.5">{stats.cpu}%</span>
            </div>

            {/* RAM Pill */}
            <div
                className="snap-start shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 border border-primary/30 transition-all hover:border-primary/50 bg-transparent"
                style={{ borderRadius: 'var(--radius-button, 9999px)' }}
            >
                <DynamicIcon name="activity" size={14} className={stats.ram > 80 ? "text-orange-400" : "text-primary"} />
                <span className="text-[10px] font-bold text-text-muted uppercase tracking-wide">RAM</span>
                <span className="text-xs font-semibold text-text-main ml-0.5">{stats.ram}%</span>
            </div>

            {/* DISK Pill */}
            <div
                className={`snap-start shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 border transition-all hover:border-opacity-50 bg-transparent ${
                    isDiskCritical ? 'border-red-500/50' : isDiskWarning ? 'border-yellow-500/50' : 'border-emerald-400/30 hover:border-emerald-400/50'
                }`}
                style={{ borderRadius: 'var(--radius-button, 9999px)' }}
            >
                <DynamicIcon name="hard-drive" size={14} className={isDiskCritical ? "text-red-500 animate-pulse" : isDiskWarning ? "text-yellow-500" : "text-emerald-400"} />
                <span className="text-[10px] font-bold text-text-muted uppercase tracking-wide">DISK</span>
                <span className={`text-xs font-semibold ml-0.5 ${isDiskCritical ? "text-red-400" : isDiskWarning ? "text-yellow-400" : "text-text-main"}`}>{stats.disk.usagePercent}%</span>
                {isDiskCritical && (
                    <span className="flex items-center gap-0.5 text-[9px] bg-red-500/20 text-red-400 px-1 py-0.5 rounded-full ml-0.5">
                        <DynamicIcon name="alert" size={9} />
                    </span>
                )}
            </div>

            {/* Spacer to allow scrolling to end if needed */}
            <div className="w-2 shrink-0"></div>
        </div>
    );
}

