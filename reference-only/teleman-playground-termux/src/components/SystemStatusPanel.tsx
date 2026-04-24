import { DynamicIcon } from './common/DynamicIcon';

interface SystemStatusPanelProps {
    stats: {
        cpu: number;
        ram: number;
        disk: {
            free: number;
            total: number;
            usagePercent: number;
        };
    } | null;
    registry?: {
        totalFilesSeen: number;
        totalFilesSynced: number;
        dedupSavingsBytes: number;
    };
}

export function SystemStatusPanel({ stats, registry }: SystemStatusPanelProps) {
    if (!stats) {
        return (
            <div 
                className="bg-surface border border-border p-6 text-center text-text-muted transition-all"
                style={{ borderRadius: 'var(--radius-card)' }}
            >
                Loading system stats...
            </div>
        );
    }

    const diskFreeGB = (stats.disk.free / 1024 / 1024 / 1024).toFixed(1);
    const diskTotalGB = (stats.disk.total / 1024 / 1024 / 1024).toFixed(1);
    const isDiskCritical = stats.disk.usagePercent > 95;
    const isDiskWarning = stats.disk.usagePercent > 90;

    const dedupSavingsMB = registry?.dedupSavingsBytes
        ? (registry.dedupSavingsBytes / 1024 / 1024).toFixed(2)
        : '0.00';

    return (
        <div className="space-y-4">
            {/* System Stats */}
            <div 
                className="bg-surface border border-border p-6 transition-all"
                style={{ borderRadius: 'var(--radius-card)' }}
            >
                <h2 className="text-lg font-bold text-text-main mb-4">System Status</h2>

                <div className="flex flex-col gap-4">
                    {/* CPU */}
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <DynamicIcon name="cpu" size={18} className={stats.cpu > 80 ? 'text-orange-400 animate-pulse' : 'text-primary'} />
                            <span className="text-text-muted text-sm">CPU Usage</span>
                        </div>
                        <span className={`text-lg font-bold ${stats.cpu > 80 ? 'text-orange-400' : 'text-text-main'}`}>
                            {stats.cpu}%
                        </span>
                    </div>

                    {/* RAM */}
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <DynamicIcon name="activity" size={18} className={stats.ram > 80 ? 'text-orange-400' : 'text-primary'} />
                            <span className="text-text-muted text-sm">RAM Usage</span>
                        </div>
                        <span className={`text-lg font-bold ${stats.ram > 80 ? 'text-orange-400' : 'text-text-main'}`}>
                            {stats.ram}%
                        </span>
                    </div>

                    {/* Disk */}
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <DynamicIcon name="hard-drive" size={18} className={isDiskCritical ? 'text-red-500 animate-pulse' : isDiskWarning ? 'text-yellow-500' : 'text-emerald-400'} />
                            <span className="text-text-muted text-sm">Temp Disk Free</span>
                        </div>
                        <div className="text-right">
                            <div className={`text-lg font-bold ${isDiskCritical ? 'text-red-400' : isDiskWarning ? 'text-yellow-400' : 'text-text-main'}`}>
                                {diskFreeGB} GB
                            </div>
                            <div className="text-xs text-text-muted">
                                of {diskTotalGB} GB ({stats.disk.usagePercent}% used)
                            </div>
                        </div>
                    </div>

                    {isDiskCritical && (
                        <div 
                            className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 text-red-400 text-sm transition-all"
                            style={{ borderRadius: 'var(--radius-button)' }}
                        >
                            <DynamicIcon name="alert" size={16} />
                            <span className="font-medium">CRITICAL: Sync operations disabled</span>
                        </div>
                    )}
                </div>
            </div>

            {/* Registry Stats */}
            {registry && (
                <div 
                    className="bg-surface border border-border p-6 transition-all"
                    style={{ borderRadius: 'var(--radius-card)' }}
                >
                    <h2 className="text-lg font-bold text-text-main mb-4 flex items-center gap-2">
                        <DynamicIcon name="database" size={18} className="text-primary" />
                        Registry Stats
                    </h2>

                    <div className="space-y-3 text-sm">
                        <div className="flex justify-between">
                            <span className="text-text-muted">Total Files Seen</span>
                            <span className="text-text-main font-mono">{(registry.totalFilesSeen || 0).toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-text-muted">Total Files Synced</span>
                            <span className="text-text-main font-mono">{(registry.totalFilesSynced || 0).toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-text-muted">Deduplication Savings</span>
                            <span className="text-emerald-400 font-bold font-mono">{dedupSavingsMB} MB</span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
