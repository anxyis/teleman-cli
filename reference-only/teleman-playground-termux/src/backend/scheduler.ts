import { getDb } from './db.js';
import { debugLogger } from './debugLogger.js';

// --- Types ---
interface ScheduleConfig {
    version?: number;
    timezone?: string;
    days_of_week?: number[];  // 0=Sun, 6=Sat
    day_of_month?: number;    // 1-31
    preferred_hour?: number;  // Reserved for future (ignored in v1)
}

interface ScheduledEntity {
    id: string;
    schedule_type: string;
    schedule_config: string;
    next_sync_due: number | null;
    last_checked_at: number | null;
    last_sync: number | null;
    enabled?: number;
    is_active?: number;
    status?: string;
}

// --- Date Helpers ---
function getLocalMidnight(date: Date): number {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
}

function addDays(date: Date, days: number): Date {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
}

// --- SchedulerService Singleton ---
export class SchedulerService {
    private static instance: SchedulerService | null = null;
    private intervalId: NodeJS.Timeout | null = null;
    private autoSyncerRef: any = null; // Will be set via setAutoSyncer
    private isChecking = false;

    private constructor() { }

    static getInstance(): SchedulerService {
        if (!SchedulerService.instance) {
            SchedulerService.instance = new SchedulerService();
        }
        return SchedulerService.instance;
    }

    setAutoSyncer(autoSyncer: any) {
        this.autoSyncerRef = autoSyncer;
    }

    start() {
        this.stop(); // Clear any existing
        debugLogger.info("Scheduler", "Starting scheduler service...");
        this.check(); // Immediate check on start
        // Check every 30 minutes
        this.intervalId = setInterval(() => this.check(), 30 * 60 * 1000);
    }

    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
            debugLogger.info("Scheduler", "Scheduler service stopped.");
        }
    }

    async check() {
        if (this.isChecking) {
            debugLogger.debug("Scheduler", "Check already in progress, skipping...");
            return;
        }
        if (!this.autoSyncerRef) {
            debugLogger.warn("Scheduler", "AutoSyncer reference not set, skipping check.");
            return;
        }

        this.isChecking = true;
        const now = Date.now();

        try {
            const db = getDb();

            // Check Folders
            const folders: ScheduledEntity[] = await db.all(
                `SELECT * FROM sync_folders WHERE schedule_type != 'none' AND enabled = 1`
            );

            for (const folder of folders) {
                await this.processEntity(folder, 'folder', now);
            }

            // Check Groups
            const groups: ScheduledEntity[] = await db.all(
                `SELECT * FROM sync_groups WHERE schedule_type != 'none' AND is_active = 1`
            );

            for (const group of groups) {
                await this.processEntity(group, 'group', now);
            }

        } catch (e: any) {
            debugLogger.error("Scheduler", `Check failed: ${e.message}`);
        } finally {
            this.isChecking = false;
        }
    }

    private async processEntity(entity: ScheduledEntity, type: 'folder' | 'group', now: number) {
        const db = getDb();
        const table = type === 'folder' ? 'sync_folders' : 'sync_groups';

        // Update last_checked_at
        await db.run(`UPDATE ${table} SET last_checked_at = ? WHERE id = ?`, [now, entity.id]);

        // Sanity Check: Clock regression
        if (entity.last_checked_at && now < entity.last_checked_at) {
            debugLogger.warn("Scheduler", `Clock regression detected for ${type} ${entity.id}. Skipping.`);
            return;
        }

        // Sanity Check: now < last_sync (impossible)
        if (entity.last_sync && now < entity.last_sync) {
            debugLogger.warn("Scheduler", `Invalid state: now < last_sync for ${type} ${entity.id}. Recalculating.`);
            const nextDue = this.calculateNextDue(entity);
            await db.run(`UPDATE ${table} SET next_sync_due = ? WHERE id = ?`, [nextDue, entity.id]);
            return;
        }

        // Check if due
        if (entity.next_sync_due && now >= entity.next_sync_due) {
            // Skip if already syncing
            if (entity.status === 'syncing') {
                debugLogger.debug("Scheduler", `${type} ${entity.id} is already syncing, skipping.`);
                return;
            }

            debugLogger.info("Scheduler", `${type} ${entity.id} is DUE. Queuing sync.`);

            if (type === 'folder') {
                await this.autoSyncerRef.runFolder(entity.id);
            } else {
                await this.autoSyncerRef.runSyncGroup(entity.id);
            }
        }
    }

    // --- Next Due Calculation ---
    calculateNextDue(entity: ScheduledEntity): number | null {
        const config: ScheduleConfig = JSON.parse(entity.schedule_config || '{}');
        const now = new Date();
        const todayMidnight = getLocalMidnight(now);

        switch (entity.schedule_type) {
            case 'daily':
                return getLocalMidnight(addDays(now, 1));

            case 'weekly':
                return this.getNextWeekday(config.days_of_week || []);

            case 'monthly':
                return this.getNextMonthlyDate(config.day_of_month);

            case 'custom': {
                const weeklyNext = this.getNextWeekday(config.days_of_week || []);
                const monthlyNext = this.getNextMonthlyDate(config.day_of_month);

                // Filter valid candidates
                const candidates = [weeklyNext, monthlyNext].filter(
                    (v): v is number => typeof v === 'number' && Number.isFinite(v) && v > todayMidnight
                );

                if (candidates.length === 0) return null;
                return Math.min(...candidates);
            }

            default:
                return null;
        }
    }

    private getNextWeekday(days: number[]): number | null {
        if (!days || days.length === 0) return null;

        const now = new Date();
        const today = now.getDay(); // 0-6

        for (let offset = 1; offset <= 7; offset++) {
            const targetDay = (today + offset) % 7;
            if (days.includes(targetDay)) {
                return getLocalMidnight(addDays(now, offset));
            }
        }
        return null;
    }

    private getNextMonthlyDate(dayOfMonth: number | null | undefined): number | null {
        if (dayOfMonth == null || dayOfMonth < 1 || dayOfMonth > 31) return null;

        const now = new Date();
        const currentDay = now.getDate();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();

        // Check if this month's date is still ahead
        if (currentDay < dayOfMonth) {
            const target = new Date(currentYear, currentMonth, dayOfMonth);
            // Handle invalid dates (e.g., Feb 30) - clamp to end of month
            if (target.getMonth() !== currentMonth) {
                target.setDate(0);
            }
            return getLocalMidnight(target);
        }

        // Move to next month
        const target = new Date(currentYear, currentMonth + 1, dayOfMonth);
        if (target.getDate() !== dayOfMonth) {
            target.setDate(0); // Clamp
        }
        return getLocalMidnight(target);
    }

    // --- Public API for Manual Updates ---
    async updateNextSyncDue(entityId: string, type: 'folder' | 'group') {
        const db = getDb();
        const table = type === 'folder' ? 'sync_folders' : 'sync_groups';

        const entity: ScheduledEntity | undefined = await db.get(`SELECT * FROM ${table} WHERE id = ?`, [entityId]);
        if (!entity || entity.schedule_type === 'none') return;

        const nextDue = this.calculateNextDue(entity);
        await db.run(
            `UPDATE ${table} SET next_sync_due = ?, last_sync = ? WHERE id = ?`,
            [nextDue, Date.now(), entityId]
        );
        debugLogger.info("Scheduler", `Updated next_sync_due for ${type} ${entityId} to ${nextDue ? new Date(nextDue).toISOString() : 'null'}`);
    }
}

// Export singleton getter
export const getScheduler = () => SchedulerService.getInstance();
