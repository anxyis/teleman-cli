import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

// Types to match the `sqlite` (wrapper) API
export interface Database {
    run(sql: string, params?: any[]): Promise<any>;
    get(sql: string, params?: any[]): Promise<any>;
    all(sql: string, params?: any[]): Promise<any[]>;
    exec(sql: string): Promise<void>;
    close(): Promise<void>;
}

// Database Instance
let db: Database | null = null;
const DATA_DIR = process.env.DATA_DIR || './data';
const DB_PATH = path.join(DATA_DIR, 'commander.sqlite');

// --- STRATEGY SELECTION ---
let SQL: any = null; // sql.js module

export const initDb = async (): Promise<Database> => {
    if (db) return db;

    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    try {
        console.log(`[DB] Attempting native sqlite3...`);
        // @ts-ignore
        const sqlite3 = (await import('sqlite3')).default;
        // @ts-ignore
        const { open } = await import('sqlite');

        db = await open({
            filename: DB_PATH,
            driver: sqlite3.Database
        });
    } catch (e: any) {
        console.log(`[DB] Falling back to pure JS (sql.js)...`);
        try {
            // @ts-ignore
            const initSqlJs = (await import('sql.js')).default;
            SQL = await initSqlJs();
            let buffer: Buffer | null = null;
            if (fs.existsSync(DB_PATH)) buffer = fs.readFileSync(DB_PATH);
            const rawDb = new SQL.Database(buffer);
            db = new SqlJsAdapter(rawDb, DB_PATH);
        } catch (err2: any) {
            throw err2;
        }
    }

    await migrate(db!);
    return db!;
};

// --- SQL.JS ADAPTER ---
class SqlJsAdapter implements Database {
    private db: any;
    private path: string;
    constructor(dbInstance: any, filePath: string) {
        this.db = dbInstance;
        this.path = filePath;
    }
    private save() {
        const data = this.db.export();
        fs.writeFileSync(this.path, Buffer.from(data));
    }
    async run(sql: string, params: any[] = []): Promise<any> {
        this.db.run(sql, params);
        this.save();
        const res = this.db.exec("SELECT last_insert_rowid() as id");
        return { lastID: res[0]?.values[0][0] || 0, changes: 1 };
    }
    async get(sql: string, params: any[] = []): Promise<any> {
        const stmt = this.db.prepare(sql);
        stmt.bind(params);
        let result = null;
        if (stmt.step()) result = stmt.getAsObject();
        stmt.free();
        return result;
    }
    async all(sql: string, params: any[] = []): Promise<any[]> {
        const stmt = this.db.prepare(sql);
        stmt.bind(params);
        const results = [];
        while (stmt.step()) results.push(stmt.getAsObject());
        stmt.free();
        return results;
    }
    async exec(sql: string): Promise<void> {
        this.db.exec(sql);
        this.save();
    }
    async close(): Promise<void> {
        this.db.close();
    }
}

export const getDb = () => {
    if (!db) throw new Error("Database not initialized!");
    return db;
};

const migrate = async (db: Database) => {
    // Standard tables
    await db.exec(`
        CREATE TABLE IF NOT EXISTS presets (id TEXT PRIMARY KEY, name TEXT NOT NULL, extensions_include TEXT, extensions_exclude TEXT, min_size_mb INTEGER DEFAULT 0, max_size_mb INTEGER DEFAULT 2048, archive_mode TEXT DEFAULT 'none', archive_size_mb INTEGER DEFAULT 2048, archive_password TEXT, smart_split_video BOOLEAN DEFAULT 0, smart_split_strategy TEXT DEFAULT 're-encode', created_at INTEGER);
        CREATE TABLE IF NOT EXISTS sync_folders (id TEXT PRIMARY KEY, name TEXT NOT NULL, source_path TEXT NOT NULL, target_chat_id TEXT NOT NULL, target_topic_id TEXT, preset_id TEXT NOT NULL, enabled BOOLEAN DEFAULT 1, status TEXT DEFAULT 'idle', last_sync INTEGER, created_at INTEGER DEFAULT (strftime('%s', 'now')), schedule_type TEXT DEFAULT 'none', schedule_config TEXT DEFAULT '{}', schedule_version INTEGER DEFAULT 1, next_sync_due INTEGER, last_checked_at INTEGER, last_session_id TEXT, last_session_status TEXT, snapshot_fingerprint TEXT, snapshot_capped INTEGER DEFAULT 0, large_folder_warned INTEGER DEFAULT 0, FOREIGN KEY(preset_id) REFERENCES presets(id));
        CREATE TABLE IF NOT EXISTS job_history (id TEXT PRIMARY KEY, name TEXT, status TEXT, stats_json TEXT, created_at INTEGER);
        CREATE TABLE IF NOT EXISTS download_registry (file_hash TEXT NOT NULL, folder_id TEXT NOT NULL, local_path TEXT NOT NULL, size_bytes INTEGER, downloaded_at INTEGER, status TEXT DEFAULT 'pending', error TEXT, PRIMARY KEY (file_hash, folder_id));
    `);

    // Registry Table with Composite PK
    const tableInfo = await db.all("PRAGMA table_info(registry)");
    if (!tableInfo.some(c => c.name === 'folder_id')) {
        await db.exec(`
            CREATE TABLE IF NOT EXISTS registry_new (file_hash TEXT, folder_id TEXT, file_path TEXT NOT NULL, size_bytes INTEGER, synced_at INTEGER, created_at INTEGER DEFAULT (strftime('%s', 'now')), status TEXT, folder_name TEXT, message_id TEXT, chat_id TEXT, file_id TEXT, job_id TEXT, PRIMARY KEY (file_hash, folder_id));
            INSERT OR IGNORE INTO registry_new SELECT file_hash, 'legacy', file_path, size_bytes, synced_at, (strftime('%s', 'now')), 'success', folder_name, message_id, chat_id, NULL, NULL FROM registry;
            DROP TABLE IF EXISTS registry;
            ALTER TABLE registry_new RENAME TO registry;
        `);
    }

    console.log("[DB] Migrations complete.");
};

export async function getFileFingerprint(filePath: string, _size: number, _mtimeMs: number): Promise<string> {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha256');
        const stream = fs.createReadStream(filePath);
        stream.on('error', err => reject(err));
        stream.on('data', chunk => hash.update(chunk));
        stream.on('end', () => resolve(hash.digest('hex')));
    });
}

export async function isFilePacked(hash: string, folderId: string): Promise<boolean> {
    const result = await getDb().get('SELECT file_hash FROM registry WHERE file_hash = ? AND folder_id = ?', [hash, folderId]);
    return !!result;
}

export async function registerFile(hash: string, path: string, size: number, folderId: string, folderName?: string, messageId?: string, chatId?: string, fileId?: string, jobId?: string) {
    await getDb().run(
        `INSERT OR REPLACE INTO registry (file_hash, folder_id, file_path, size_bytes, synced_at, status, folder_name, message_id, chat_id, file_id, job_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [hash, folderId, path, size, Date.now(), 'success', folderName || null, messageId || null, chatId || null, fileId || null, jobId || null]
    );
}

export async function registerDownload(hash: string, folderId: string, localPath: string, size: number, status: 'pending' | 'downloading' | 'completed' | 'failed', error?: string) {
    await getDb().run(
        `INSERT OR REPLACE INTO download_registry (file_hash, folder_id, local_path, size_bytes, downloaded_at, status, error)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [hash, folderId, localPath, size, Date.now(), status, error || null]
    );
}
