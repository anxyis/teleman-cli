import fs from 'fs';
import path from 'path';
import { debugLogger } from './debugLogger.js';
import type { LogEntry } from './debugLogger.js';

export interface LogFileInfo {
    filename: string;
    timestamp: number;
    size: number;
    entryCount: number;
    isAuto: boolean;
}

export class LogManager {
    private readonly LOGS_DIR: string;
    private readonly AUTO_DIR: string;
    private readonly MAX_FILES: number = 50;
    private readonly MAX_TOTAL_SIZE_MB: number = 100;
    private readonly MAX_ENTRIES_PER_FILE: number = 10000;

    constructor(dataDir: string) {
        this.LOGS_DIR = path.join(dataDir, 'logs');
        this.AUTO_DIR = path.join(this.LOGS_DIR, 'auto');
        
        // Ensure directories exist
        this.ensureDirectories();
    }

    private ensureDirectories() {
        if (!fs.existsSync(this.LOGS_DIR)) {
            fs.mkdirSync(this.LOGS_DIR, { recursive: true });
        }
        if (!fs.existsSync(this.AUTO_DIR)) {
            fs.mkdirSync(this.AUTO_DIR, { recursive: true });
        }
    }

    /**
     * Save current logs to file
     * @param prefix - Filename prefix ('logs' or 'logs_auto')
     * @returns Filename of saved log
     */
    async saveLogs(prefix: string = 'logs'): Promise<string> {
        const timestamp = new Date();
        const dateStr = timestamp.toISOString().replace(/[:.]/g, '-').split('T')[0];
        const timeStr = timestamp.toTimeString().split(' ')[0].replace(/:/g, '-');
        const filename = `${prefix}_${dateStr}_${timeStr}.json`;
        
        const isAuto = prefix.includes('auto');
        const targetDir = isAuto ? this.AUTO_DIR : this.LOGS_DIR;
        const filePath = path.join(targetDir, filename);

        // Get recent logs (max entries per file)
        const logs = debugLogger.getRecentLogs(this.MAX_ENTRIES_PER_FILE);
        
        // Reverse to get chronological order in file
        const logsChronological = [...logs].reverse();

        const logData = {
            exportedAt: timestamp.toISOString(),
            totalEntries: logsChronological.length,
            logs: logsChronological
        };

        // Write to file
        fs.writeFileSync(filePath, JSON.stringify(logData, null, 2), 'utf-8');

        // Cleanup old logs
        this.cleanup();

        return filename;
    }

    /**
     * Get list of all saved log files
     */
    getLogHistory(): LogFileInfo[] {
        const files: LogFileInfo[] = [];

        // Scan main logs directory
        if (fs.existsSync(this.LOGS_DIR)) {
            const mainLogs = fs.readdirSync(this.LOGS_DIR)
                .filter(f => f.endsWith('.json') && !f.startsWith('.'))
                .map(filename => {
                    const filePath = path.join(this.LOGS_DIR, filename);
                    const stats = fs.statSync(filePath);
                    const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
                    return {
                        filename,
                        timestamp: stats.mtimeMs,
                        size: stats.size,
                        entryCount: content.logs?.length || 0,
                        isAuto: false
                    } as LogFileInfo;
                });
            files.push(...mainLogs);
        }

        // Scan auto directory
        if (fs.existsSync(this.AUTO_DIR)) {
            const autoLogs = fs.readdirSync(this.AUTO_DIR)
                .filter(f => f.endsWith('.json') && !f.startsWith('.'))
                .map(filename => {
                    const filePath = path.join(this.AUTO_DIR, filename);
                    const stats = fs.statSync(filePath);
                    const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
                    return {
                        filename,
                        timestamp: stats.mtimeMs,
                        size: stats.size,
                        entryCount: content.logs?.length || 0,
                        isAuto: true
                    } as LogFileInfo;
                });
            files.push(...autoLogs);
        }

        // Sort by timestamp (newest first)
        return files.sort((a, b) => b.timestamp - a.timestamp);
    }

    /**
     * Delete single log file
     */
    deleteLog(filename: string): boolean {
        try {
            // Determine which directory
            let filePath = path.join(this.LOGS_DIR, filename);
            if (!fs.existsSync(filePath)) {
                filePath = path.join(this.AUTO_DIR, filename);
            }

            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
                return true;
            }
            return false;
        } catch (error) {
            console.error('[LogManager] Failed to delete log:', error);
            return false;
        }
    }

    /**
     * Delete all log files
     * @returns Number of files deleted
     */
    clearAllLogs(): number {
        let deleted = 0;

        // Clear main logs directory
        if (fs.existsSync(this.LOGS_DIR)) {
            const files = fs.readdirSync(this.LOGS_DIR)
                .filter(f => f.endsWith('.json') && !f.startsWith('.'));
            files.forEach(f => {
                try {
                    fs.unlinkSync(path.join(this.LOGS_DIR, f));
                    deleted++;
                } catch (e) {
                    console.error('[LogManager] Failed to delete:', f);
                }
            });
        }

        // Clear auto directory
        if (fs.existsSync(this.AUTO_DIR)) {
            const files = fs.readdirSync(this.AUTO_DIR)
                .filter(f => f.endsWith('.json') && !f.startsWith('.'));
            files.forEach(f => {
                try {
                    fs.unlinkSync(path.join(this.AUTO_DIR, f));
                    deleted++;
                } catch (e) {
                    console.error('[LogManager] Failed to delete:', f);
                }
            });
        }

        return deleted;
    }

    /**
     * Get log file content with pagination
     */
    getLogContent(filename: string, limit: number = 100, offset: number = 0): { 
        logs: LogEntry[]; 
        total: number; 
        hasMore: boolean 
    } | null {
        try {
            // Determine which directory
            let filePath = path.join(this.LOGS_DIR, filename);
            if (!fs.existsSync(filePath)) {
                filePath = path.join(this.AUTO_DIR, filename);
            }

            if (!fs.existsSync(filePath)) {
                return null;
            }

            const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
            const allLogs = content.logs || [];
            const total = allLogs.length;

            // Apply pagination (reverse for newest first display)
            const reversed = [...allLogs].reverse();
            const paginated = reversed.slice(offset, offset + limit);

            return {
                logs: paginated,
                total,
                hasMore: offset + limit < total
            };
        } catch (error) {
            console.error('[LogManager] Failed to read log content:', error);
            return null;
        }
    }

    /**
     * Download log file as attachment
     */
    getLogFilePath(filename: string): string | null {
        let filePath = path.join(this.LOGS_DIR, filename);
        if (!fs.existsSync(filePath)) {
            filePath = path.join(this.AUTO_DIR, filename);
        }

        if (fs.existsSync(filePath)) {
            return filePath;
        }
        return null;
    }

    /**
     * Auto-cleanup old logs based on limits
     */
    private cleanup() {
        const files = this.getLogHistory();

        // Check file count limit
        if (files.length > this.MAX_FILES) {
            const toDelete = files.slice(this.MAX_FILES);
            toDelete.forEach(f => {
                this.deleteLog(f.filename);
                console.log(`[LogManager] Deleted old log: ${f.filename} (max files: ${this.MAX_FILES})`);
            });
        }

        // Check total size limit
        const remainingFiles = this.getLogHistory();
        const totalSizeBytes = remainingFiles.reduce((sum, f) => sum + f.size, 0);
        const maxSizeBytes = this.MAX_TOTAL_SIZE_MB * 1024 * 1024;

        if (totalSizeBytes > maxSizeBytes) {
            // Delete oldest until under limit
            let currentSize = totalSizeBytes;
            for (const file of remainingFiles.reverse()) { // Oldest first
                if (currentSize <= maxSizeBytes) break;
                
                this.deleteLog(file.filename);
                currentSize -= file.size;
                console.log(`[LogManager] Deleted log: ${file.filename} (max size: ${this.MAX_TOTAL_SIZE_MB}MB)`);
            }
        }
    }

    /**
     * Auto-save logs (called on shutdown)
     */
    async autoSave(): Promise<string | null> {
        try {
            const filename = await this.saveLogs('logs_auto');
            console.log(`[LogManager] Auto-saved logs to: ${filename}`);
            return filename;
        } catch (error) {
            console.error('[LogManager] Auto-save failed:', error);
            return null;
        }
    }

    /**
     * Get storage stats
     */
    getStorageStats() {
        const files = this.getLogHistory();
        const totalSize = files.reduce((sum, f) => sum + f.size, 0);
        const autoCount = files.filter(f => f.isAuto).length;
        const manualCount = files.filter(f => !f.isAuto).length;

        return {
            totalFiles: files.length,
            totalSizeMB: (totalSize / 1024 / 1024).toFixed(2),
            maxFiles: this.MAX_FILES,
            maxSizeMB: this.MAX_TOTAL_SIZE_MB,
            autoSavedCount: autoCount,
            manualSavedCount: manualCount,
            usagePercent: ((totalSize / 1024 / 1024) / this.MAX_TOTAL_SIZE_MB * 100).toFixed(1)
        };
    }
}

// Singleton instance (will be initialized in server.ts)
let logManagerInstance: LogManager | null = null;

export function getLogManager(dataDir?: string): LogManager {
    if (!logManagerInstance) {
        if (!dataDir) {
            throw new Error('LogManager must be initialized with dataDir first');
        }
        logManagerInstance = new LogManager(dataDir);
    }
    return logManagerInstance;
}

export function initLogManager(dataDir: string): LogManager {
    logManagerInstance = new LogManager(dataDir);
    return logManagerInstance;
}
