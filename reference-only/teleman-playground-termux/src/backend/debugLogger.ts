export interface LogEntry {
    timestamp: Date;
    level: 'info' | 'warn' | 'error' | 'debug';
    category: string;
    message: string;
    metadata?: any;
}

class DebugLogger {
    private logs: LogEntry[] = [];
    private maxLogs = 2000;

    public log(level: LogEntry['level'], category: string, message: string, metadata?: any) {
        const entry: LogEntry = {
            timestamp: new Date(),
            level,
            category,
            message,
            metadata
        };

        this.logs.push(entry);

        if (this.logs.length > this.maxLogs) {
            this.logs.shift(); // Remove oldest
        }

        // Output to Console for Docker Logs
        const metaStr = metadata ? ` ${JSON.stringify(metadata)}` : '';
        const consoleMsg = `[${category}] ${message}${metaStr}`;
        if (level === 'error') console.error(consoleMsg);
        else if (level === 'warn') console.warn(consoleMsg);
        else console.log(consoleMsg);
    }

    public info(category: string, message: string, meta?: any) { this.log('info', category, message, meta); }
    public warn(category: string, message: string, meta?: any) { this.log('warn', category, message, meta); }
    public error(category: string, message: string, meta?: any) { this.log('error', category, message, meta); }
    public debug(category: string, message: string, meta?: any) { this.log('debug', category, message, meta); }

    public getReport(): string {
        let report = `Teleman Debug Report - Generated at ${new Date().toISOString()}\n`;
        report += `Total Logs: ${this.logs.length}\n`;
        report += `=================================================\n\n`;

        this.logs.forEach(l => {
            const metaStr = l.metadata ? ` | Meta: ${JSON.stringify(l.metadata)}` : '';
            report += `[${l.timestamp.toISOString()}] [${l.level.toUpperCase()}] [${l.category}] ${l.message}${metaStr}\n`;
        });

        return report;
    }

    public clear() {
        this.logs = [];
    }
    public getRecentLogs(limit: number = 100): LogEntry[] {
        // Return a copy to avoid mutation, sliced from the end
        return this.logs.slice(-limit).reverse();
    }
}

export const debugLogger = new DebugLogger();
