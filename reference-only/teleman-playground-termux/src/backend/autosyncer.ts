import { fdir } from 'fdir';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { getDb, getFileFingerprint, isFilePacked, registerFile } from './db.js';
import axios from 'axios';
import FormData from 'form-data';
// @ts-ignore
import ffmpeg from 'fluent-ffmpeg';
import { debugLogger } from './debugLogger.js';
import { getActiveToken, readConfig } from './configManager.js';
import { generateFontPreview } from './fontGenerator.js';
import { getScheduler } from './scheduler.js';
import { ZipManager } from './zipManager.js';
import { NetworkMonitor } from './networkMonitor.js';

const MS_PER_SECOND = 1000;
const MS_PER_MINUTE = 60000;
const BYTES_PER_KB = 1024;
const SYNC_LOOP_DELAY_MS = 4000;
const JOB_CLEANUP_DELAY_MS = 10000;
const MAX_TELEGRAM_SIZE = 2097152000; // ~1.95 GB (Safety margin for 2GB limit)

export interface JobSummary {
    jobId: string;
    name: string;
    totalFilesDiscovered: number;
    filesSent: number;
    filesFailed: number;
    filesSkipped: number;
    totalBytesSent: number;
    startTime: Date;
    endTime?: Date;
    fileTypeBreakdown: Record<string, number>;
    status: 'scanning' | 'processing' | 'completed' | 'failed';
    currentFile?: string;
    speed?: string;
    eta?: string;
    startMessageId?: string;
    subfolderMessageId?: string;
}

export interface JobQueueItem {
    id: string;
    name: string;
    job: () => Promise<void>;
    addedAt: number;
    status: 'queued' | 'pending';
}

export class AutoSyncer {
    private tempDir: string;
    private scanRoot: string;
    private processingQueue: Promise<void> = Promise.resolve();
    private activeJob: JobSummary | null = null;
    private jobQueue: JobQueueItem[] = [];

    // Control Flags
    private skipCurrent = false;
    private cancelSignal = false;
    private deleteOnCancel = false;
    private currentSessionFiles: { messageId: string, chatId: string }[] = [];

    // Sync Session Tracking
    private currentSessionId: string | null = null;
    private syncErrors: { file: string, error: string }[] = [];

    // Tag Logic Map
    private readonly CATEGORY_MAP: Record<string, string[]> = {
        '#VIDEO': ['mkv', 'mp4', 'avi', 'mov', 'webm', 'flv', 'wmv'],
        '#AUDIO': ['mp3', 'flac', 'wav', 'aac', 'ogg', 'm4a', 'wma', 'alac'],
        '#IMAGE': ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'heic'],
        '#ARCHIVE': ['zip', 'rar', '7z', 'tar', 'gz', 'iso'],
        '#DOCS': ['pdf', 'doc', 'docx', 'txt', 'xls', 'xlsx', 'ppt', 'pptx'],
        '#FONT': ['ttf', 'otf', 'woff', 'woff2', 'eot', 'ttc', 'pfb', 'pfm']
    };

    constructor(tempDir: string, scanRoot: string) {
        this.tempDir = path.resolve(tempDir);
        this.scanRoot = path.resolve(scanRoot);
        console.log(`[AutoSyncer] Initialized with temp dir: ${this.tempDir} (Scan Root: ${this.scanRoot})`);
    }

    public getActiveJob() {
        return this.activeJob;
    }

    public skipCurrentFile() {
        if (this.activeJob && this.activeJob.status === 'processing') {
            debugLogger.info("AutoSyncer", "Skipping current file via user request.");
            this.skipCurrent = true;
        }
    }

    public async cancelJob(deleteSent: boolean) {
        if (this.activeJob && this.activeJob.status === 'processing') {
            debugLogger.info("AutoSyncer", `Cancelling job (Delete Sent: ${deleteSent})`);
            this.cancelSignal = true;
            this.activeJob.status = 'failed';
            this.deleteOnCancel = deleteSent;
        }
    }

    // --- JOB QUEUE ---

    private enqueueJob(jobName: string, job: () => Promise<void>) {
        const newItem: JobQueueItem = {
            id: crypto.randomUUID(),
            name: jobName,
            job,
            addedAt: Date.now(),
            status: 'queued'
        };

        this.jobQueue.push(newItem);
        debugLogger.info("AutoSyncer", `Job added to queue: ${jobName} (Queue Size: ${this.jobQueue.length})`);

        this.processNextJob();
    }

    private processNextJob() {
        if (this.activeJob && (this.activeJob.status === 'scanning' || this.activeJob.status === 'processing')) {
            return; // Busy
        }

        if (this.jobQueue.length === 0) return;

        // Use processingQueue to ensure sequential execution
        this.processingQueue = this.processingQueue.then(async () => {
            // Check again inside the promise chain
            if (this.activeJob && (this.activeJob.status === 'scanning' || this.activeJob.status === 'processing')) {
                return;
            }
            if (this.jobQueue.length === 0) return;

            const item = this.jobQueue.shift();
            if (!item) return;

            console.log(`[AutoSyncer] Starting Queued Job: ${item.name}`);
            try {
                await item.job();
            } catch (e) {
                console.error(`[AutoSyncer] Job Failed: ${item.name}`, e);
            } finally {
                console.log(`[AutoSyncer] Finished Job: ${item.name}`);

                // Save History
                if (this.activeJob) {
                    this.activeJob.endTime = new Date();
                    try {
                        const db = getDb();
                        await db.run(
                            `INSERT INTO job_history (id, name, status, stats_json, created_at) VALUES (?, ?, ?, ?, ?)`,
                            [
                                this.activeJob.jobId,
                                item.name,
                                this.activeJob.status,
                                JSON.stringify({
                                    sent: this.activeJob.filesSent,
                                    failed: this.activeJob.filesFailed,
                                    skipped: this.activeJob.filesSkipped,
                                    bytes: this.activeJob.totalBytesSent,
                                    speed: this.activeJob.speed,
                                    durationMs: this.activeJob.endTime.getTime() - this.activeJob.startTime.getTime()
                                }),
                                Date.now()
                            ]
                        );
                    } catch (err) {
                        console.error("[AutoSyncer] Failed to save job history", err);
                    }

                    // Cleanup & Next Job
                    const finishedJobId = this.activeJob.jobId;

                    // Short delay if queue has items, long delay if queue empty (for UI visibility)
                    const delay = this.jobQueue.length > 0 ? 1000 : JOB_CLEANUP_DELAY_MS;

                    await new Promise<void>(resolve => setTimeout(() => {
                        if (this.activeJob && this.activeJob.jobId === finishedJobId) {
                            this.activeJob = null;
                        }
                        resolve();
                    }, delay));

                    // Trigger next
                    this.processNextJob();
                } else {
                    this.processNextJob();
                }
            }
        });
    }

    public getQueue() {
        return this.jobQueue.map(item => ({
            id: item.id,
            name: item.name,
            addedAt: item.addedAt,
            status: item.status
        }));
    }

    public removeJob(id: string) {
        this.jobQueue = this.jobQueue.filter(item => item.id !== id);
    }

    public reorderQueue(newOrderIds: string[]) {
        const newQueue: JobQueueItem[] = [];
        newOrderIds.forEach(id => {
            const item = this.jobQueue.find(i => i.id === id);
            if (item) newQueue.push(item);
        });
        // Add any missing items to end (safety)
        this.jobQueue.forEach(item => {
            if (!newQueue.find(i => i.id === item.id)) newQueue.push(item);
        });
        this.jobQueue = newQueue;
    }

    public clearQueue() {
        this.jobQueue = [];
    }

    // --- SMART LOGIC ---

    private getCategoryTags(ext: string): string[] {
        const cleanExt = ext.toLowerCase();
        for (const [category, extensions] of Object.entries(this.CATEGORY_MAP)) {
            if (extensions.includes(cleanExt)) {
                return [category, `#${cleanExt.toUpperCase()}`];
            }
        }
        return ['#FILE', `#${cleanExt.toUpperCase()}`];
    }

    private formatFileSize(bytes: number): string {
        if (bytes === 0) return '0 B';
        if (!isFinite(bytes)) return 'Unlimited';
        const k = BYTES_PER_KB;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + (sizes[i] || 'TB');
    }

    private generateSmartCaption(fileName: string, fileSize: number, presetName: string | undefined, hash: string): string {
        const ext = path.extname(fileName).replace('.', '');
        const [categoryTag, specificTag] = this.getCategoryTags(ext);
        const presetTag = presetName ? `#${presetName.replace(/\s+/g, '_')}` : '';
        const date = new Date().toISOString().replace('T', ' ').substring(0, 19);

        // Full Hash in Code Block for easy copy
        return `📄 File: ${fileName}\n` +
            `📅 Synced: ${date}\n` +
            `📏 Size: ${this.formatFileSize(fileSize)}\n` +
            `🏷️ Type: ${categoryTag} ${specificTag} ${presetTag}\n` +
            `⚙️ Preset: ${presetName || 'None'}\n` +
            `🔒 Hash: <code>${hash}</code>`;
    }

    private getTelegramApiUrl() {
        return NetworkMonitor.getInstance().getActiveApiUrl();
    }

    private async sendTelegramMessage(token: string, chatId: string, topicId: string | undefined, text: string, buttons?: any[][]): Promise<string | undefined> {
        const telegramApiUrl = this.getTelegramApiUrl();
        try {
            const body: any = {
                chat_id: chatId,
                message_thread_id: topicId,
                text: text,
                parse_mode: 'HTML'
            };
            if (buttons) {
                body.reply_markup = { inline_keyboard: buttons };
            }

            const res = await axios.post(`${telegramApiUrl}/bot${token}/sendMessage`, body);
            return res.data?.result?.message_id?.toString();
        } catch (e) {
            console.error(`[AutoSyncer] Failed to send report message`, e);
            return undefined;
        }
    }

    private async deleteTelegramMessage(token: string, chatId: string, messageId: string) {
        const telegramApiUrl = this.getTelegramApiUrl();
        try {
            await axios.post(`${telegramApiUrl}/bot${token}/deleteMessage`, {
                chat_id: chatId,
                message_id: messageId
            });
        } catch (e) { /* ignore */ }
    }

    private async editTelegramMessage(token: string, chatId: string, messageId: string, text: string) {
        const telegramApiUrl = this.getTelegramApiUrl();
        try {
            await axios.post(`${telegramApiUrl}/bot${token}/editMessageText`, {
                chat_id: chatId,
                message_id: messageId,
                text: text,
                parse_mode: 'HTML'
            });
        } catch (e) {
            console.error(`[AutoSyncer] Failed to edit message`, e);
        }
    }

    private getMediaMetadata(filePath: string): Promise<any> {
        return new Promise((resolve) => {
            ffmpeg.ffprobe(filePath, (err: any, metadata: any) => {
                if (err) {
                    debugLogger.warn("AutoSyncer", `ffprobe failed for ${path.basename(filePath)}: ${err.message}`);
                    resolve({});
                } else {
                    debugLogger.debug("AutoSyncer", `Metadata found for ${path.basename(filePath)}`, metadata.format?.tags);
                    resolve(metadata);
                }
            });
        });
    }

    private generateThumbnail(videoPath: string): Promise<string | null> {
        return new Promise((resolve) => {
            const thumbFilename = `thumb_${path.basename(videoPath, path.extname(videoPath))}_${Date.now()}.jpg`;
            const thumbPath = path.join(this.tempDir, thumbFilename);

            ffmpeg(videoPath)
                .inputOptions(['-threads', '2']) // Limit threads for mobile
                .on('end', () => {
                    debugLogger.debug("AutoSyncer", `Video thumbnail generated: ${thumbFilename}`);
                    resolve(thumbPath);
                })
                .on('error', (err: any) => {
                    debugLogger.warn("AutoSyncer", `Thumbnail gen failed for ${path.basename(videoPath)}: ${err.message}`);
                    resolve(null);
                })
                .screenshots({
                    count: 1,
                    timemarks: ['10%'],
                    folder: this.tempDir,
                    filename: thumbFilename,
                    size: '320x?'
                });
        });
    }

    // --- CLEANUP ---
    public async cleanup() {
        const db = getDb();
        await db.run("UPDATE sync_folders SET status = 'idle' WHERE status = 'syncing'");
        debugLogger.info("AutoSyncer", "Cleaned up stuck folder statuses.");
    }

    // --- SYNC SESSION TRACKING ---
    private async startSyncSession(folderId: string): Promise<string> {
        const db = getDb();
        const sessionId = crypto.randomUUID();
        this.currentSessionId = sessionId;
        this.syncErrors = [];

        await db.run(`
            INSERT INTO sync_sessions (id, folder_id, started_at, status)
            VALUES (?, ?, ?, 'running')
        `, [sessionId, folderId, Date.now()]);

        return sessionId;
    }

    private async completeSyncSession(folderId: string, folder: any) {
        const db = getDb();
        if (!this.currentSessionId || !this.activeJob) return;

        const filesUploaded = this.activeJob.filesSent || 0;
        const filesFailed = this.activeJob.filesFailed || 0;
        const filesSkipped = this.activeJob.filesSkipped || 0;
        const filesScanned = this.activeJob.totalFilesDiscovered || 0;
        const bytesUploaded = this.activeJob.totalBytesSent || 0;

        // Determine status based on thresholds
        let status: 'success' | 'partial' | 'failed' = 'success';
        if (filesFailed > 0) {
            const totalAttempted = filesUploaded + filesFailed;
            const failureRate = totalAttempted > 0 ? filesFailed / totalAttempted : 0;
            status = failureRate >= 0.5 ? 'failed' : 'partial';
        }

        // Compute folder fingerprint for change detection
        const { fingerprint, fileCount, totalSize, capped } = await this.computeFolderFingerprint(folder.source_path);

        // Update session record
        await db.run(`
            UPDATE sync_sessions SET
                ended_at = ?,
                status = ?,
                files_scanned = ?,
                files_uploaded = ?,
                files_skipped = ?,
                files_failed = ?,
                bytes_uploaded = ?,
                snapshot_file_count = ?,
                snapshot_total_size = ?,
                snapshot_fingerprint = ?,
                snapshot_capped = ?,
                errors_json = ?
            WHERE id = ?
        `, [
            Date.now(), status, filesScanned, filesUploaded, filesSkipped, filesFailed,
            bytesUploaded, fileCount, totalSize, fingerprint, capped ? 1 : 0,
            JSON.stringify(this.syncErrors), this.currentSessionId
        ]);

        // Update folder with session reference and snapshot
        await db.run(`
            UPDATE sync_folders SET
                last_session_id = ?,
                last_session_status = ?,
                snapshot_fingerprint = ?,
                snapshot_capped = ?
            WHERE id = ?
        `, [this.currentSessionId, status, fingerprint, capped ? 1 : 0, folderId]);

        // Prune old sessions (keep last 10)
        await db.run(`
            DELETE FROM sync_sessions WHERE folder_id = ? AND id NOT IN (
                SELECT id FROM sync_sessions WHERE folder_id = ? ORDER BY started_at DESC LIMIT 10
            )
        `, [folderId, folderId]);

        this.currentSessionId = null;
    }

    private async computeFolderFingerprint(folderPath: string): Promise<{ fingerprint: string, fileCount: number, totalSize: number, capped: boolean }> {
        const MAX_FILES = 5000;
        try {
            const crawler = new fdir().withFullPaths().crawl(folderPath);
            const allFiles = await crawler.withPromise() as string[];

            // Sort for deterministic fingerprint
            allFiles.sort();

            const capped = allFiles.length > MAX_FILES;
            const filesToProcess = allFiles.slice(0, MAX_FILES);

            let data = '';
            let totalSize = 0;

            for (const filePath of filesToProcess) {
                try {
                    const stats = await fs.promises.stat(filePath);
                    if (stats.isFile()) {
                        data += `${filePath}|${stats.size}|${stats.mtimeMs}\n`;
                        totalSize += stats.size;
                    }
                } catch { continue; }
            }

            const fingerprint = crypto.createHash('md5').update(data).digest('hex');

            return { fingerprint, fileCount: filesToProcess.length, totalSize, capped };
        } catch (e) {
            // Folder doesn't exist or access denied
            return { fingerprint: 'error', fileCount: 0, totalSize: 0, capped: false };
        }
    }

    // Public method for on-demand fingerprint check
    public async checkFolderFreshness(folderId: string): Promise<{ status: string, changed: boolean, details?: any }> {
        const db = getDb();
        const folder = await db.get('SELECT * FROM sync_folders WHERE id = ?', [folderId]);
        if (!folder) return { status: 'unknown', changed: false };

        // Compute current fingerprint
        const current = await this.computeFolderFingerprint(folder.source_path);

        // Compare with stored snapshot
        const changed = folder.snapshot_fingerprint ?
            current.fingerprint !== folder.snapshot_fingerprint :
            true; // No snapshot = treat as changed

        return {
            status: changed ? 'changes_pending' : 'up_to_date',
            changed,
            details: {
                currentFingerprint: current.fingerprint,
                storedFingerprint: folder.snapshot_fingerprint,
                fileCount: current.fileCount,
                capped: current.capped
            }
        };
    }


    /**
     * Extract embedded cover art from audio files.
     * Different formats store cover art differently:
     * - MP3: ID3 APIC frame (video stream 0:v)
     * - FLAC: METADATA_BLOCK_PICTURE (attached_pic)
     * - M4A/AAC: iTunes covr atom (video stream)
     * - OGG/Opus: Vorbis comment METADATA_BLOCK_PICTURE
     * - WAV: Usually no cover, but may have ID3 chunk
     */
    private async generateAudioThumbnail(filePath: string): Promise<string | null> {
        const ext = path.extname(filePath).replace('.', '').toLowerCase();
        const fileName = path.basename(filePath);
        const thumbFilename = `cover_${path.basename(filePath, path.extname(filePath))}_${Date.now()}.jpg`;
        const thumbPath = path.join(this.tempDir, thumbFilename);

        debugLogger.debug("CoverExtract", `Attempting cover extraction for ${fileName}`, { ext });

        // Try multiple extraction strategies in order of likelihood
        const strategies = [
            // Strategy 1: Extract attached picture (works for FLAC, OGG, some MP3)
            { name: 'attached_pic', options: ['-an', '-vcodec', 'mjpeg'] },
            // Strategy 2: Map video stream directly (works for MP3 with ID3, M4A)
            { name: 'video_stream', options: ['-map', '0:v:0', '-c:v', 'mjpeg'] },
            // Strategy 3: Extract any video stream (fallback)
            { name: 'any_video', options: ['-map', '0:v?', '-c:v', 'mjpeg'] },
        ];

        for (const strategy of strategies) {
            try {
                const result = await this.tryExtractCover(filePath, thumbPath, strategy.options);
                if (result) {
                    debugLogger.info("CoverExtract", `Cover extracted using ${strategy.name}`, { file: fileName, size: fs.statSync(thumbPath).size });
                    return thumbPath;
                }
            } catch (e) {
                // Strategy failed, try next
            }
        }

        debugLogger.debug("CoverExtract", `No cover art found in ${fileName}`, { ext, triedStrategies: strategies.map(s => s.name) });
        return null;
    }

    private tryExtractCover(filePath: string, outputPath: string, ffmpegOptions: string[]): Promise<boolean> {
        return new Promise((resolve) => {
            // Clean up any previous failed attempt
            if (fs.existsSync(outputPath)) {
                try { fs.unlinkSync(outputPath); } catch { }
            }

            const cmd = ffmpeg(filePath)
                .inputOptions(['-threads', '2']) // Limit threads for mobile
                .outputOptions(ffmpegOptions)
                .outputOptions(['-frames:v', '1'])
                .output(outputPath);

            cmd.on('end', () => {
                // Verify the output file exists and has content
                if (fs.existsSync(outputPath)) {
                    const size = fs.statSync(outputPath).size;
                    if (size > 100) { // Minimum reasonable image size
                        resolve(true);
                    } else {
                        // Too small, probably corrupt
                        try { fs.unlinkSync(outputPath); } catch { }
                        resolve(false);
                    }
                } else {
                    resolve(false);
                }
            });

            cmd.on('error', () => {
                // Clean up on error
                if (fs.existsSync(outputPath)) {
                    try { fs.unlinkSync(outputPath); } catch { }
                }
                resolve(false);
            });

            cmd.run();
        });
    }

    private async uploadIntelligent(token: string, folder: any, filePath: string, caption: string) {
        const telegramApiUrl = this.getTelegramApiUrl();
        const ext = path.extname(filePath).replace('.', '').toLowerCase();
        const fileName = path.basename(filePath);
        const fileSize = fs.statSync(filePath).size;

        let method = 'sendDocument';
        // Check Categories
        let isVideo = this.CATEGORY_MAP['#VIDEO'].includes(ext);
        let isAudio = this.CATEGORY_MAP['#AUDIO'].includes(ext);
        let isImage = this.CATEGORY_MAP['#IMAGE'].includes(ext);
        let isFont = this.CATEGORY_MAP['#FONT'].includes(ext);

        const form = new FormData();
        form.append('chat_id', folder.target_chat_id);
        if (folder.target_topic_id) form.append('message_thread_id', folder.target_topic_id);
        form.append('caption', caption);
        form.append('parse_mode', 'HTML');

        let fileStream = fs.createReadStream(filePath);
        let thumbPath: string | null = null;

        // Collect metadata for logging
        const uploadMeta: Record<string, any> = {
            file: fileName,
            ext,
            method: 'sendDocument',
            chatId: folder.target_chat_id,
            topicId: folder.target_topic_id || null
        };

        try {
            if (isVideo) {
                method = 'sendVideo';
                uploadMeta.method = method;
                form.append('video', fileStream, { filename: fileName, knownLength: fileSize });

                // Metadata
                const meta = await this.getMediaMetadata(filePath);
                uploadMeta.rawMeta = meta?.format?.tags || null;

                if (meta && meta.format && meta.format.duration) {
                    form.append('duration', Math.floor(meta.format.duration));
                    uploadMeta.duration = Math.floor(meta.format.duration);
                }
                if (meta && meta.streams) {
                    const vidStream = meta.streams.find((s: any) => s.width && s.height);
                    if (vidStream) {
                        form.append('width', vidStream.width);
                        form.append('height', vidStream.height);
                        uploadMeta.width = vidStream.width;
                        uploadMeta.height = vidStream.height;
                    }
                }
                form.append('supports_streaming', 'true');

                // Thumbnail
                try {
                    thumbPath = await this.generateThumbnail(filePath);
                    if (thumbPath && fs.existsSync(thumbPath)) {
                        form.append('thumb', fs.createReadStream(thumbPath));
                        uploadMeta.hasThumb = true;
                        debugLogger.debug("TelegramUpload", `Video thumbnail attached`, { file: fileName });
                    }
                } catch (e: any) {
                    debugLogger.warn("TelegramUpload", `Video thumb failed: ${e.message}`, { file: fileName });
                }

            } else if (isAudio) {
                method = 'sendAudio';
                uploadMeta.method = method;
                form.append('audio', fileStream, { filename: fileName, knownLength: fileSize });

                // Metadata
                const meta = await this.getMediaMetadata(filePath);
                uploadMeta.rawMeta = meta?.format?.tags || null;

                debugLogger.info("TelegramUpload", `Audio metadata extracted for ${fileName}`, {
                    hasTags: !!meta?.format?.tags,
                    tagKeys: meta?.format?.tags ? Object.keys(meta.format.tags) : [],
                    duration: meta?.format?.duration
                });

                if (meta && meta.format) {
                    if (meta.format.duration) {
                        form.append('duration', Math.floor(meta.format.duration));
                        uploadMeta.duration = Math.floor(meta.format.duration);
                    }
                    if (meta.format.tags) {
                        const tags = meta.format.tags;
                        const getSafeTag = (keys: string[]) => {
                            for (const k of keys) {
                                // Case insensitive search
                                const match = Object.keys(tags).find(t => t.toLowerCase() === k.toLowerCase());
                                if (match) return tags[match];
                            }
                            return null;
                        };

                        const title = getSafeTag(['title', 'track_name', 'song_name']);
                        if (title) {
                            form.append('title', title);
                            uploadMeta.title = title;
                        }

                        const artist = getSafeTag(['artist', 'performer', 'composer', 'album_artist']);
                        if (artist) {
                            form.append('performer', artist);
                            uploadMeta.performer = artist;
                        }

                        debugLogger.info("TelegramUpload", `Audio tags parsed`, {
                            file: fileName,
                            title: title || '(none)',
                            artist: artist || '(none)'
                        });
                    } else {
                        debugLogger.warn("TelegramUpload", `No audio tags found for ${fileName}`);
                    }
                } else {
                    debugLogger.warn("TelegramUpload", `ffprobe returned no format data for ${fileName}`);
                }

                // Audio Cover Art (Thumbnail)
                try {
                    const coverPath = await this.generateAudioThumbnail(filePath);
                    if (coverPath && fs.existsSync(coverPath)) {
                        thumbPath = coverPath; // Share cleanup logic
                        form.append('thumb', fs.createReadStream(coverPath));
                        uploadMeta.hasCover = true;
                        debugLogger.debug("TelegramUpload", `Audio cover attached`, { file: fileName });
                    } else {
                        debugLogger.debug("TelegramUpload", `No embedded cover art found`, { file: fileName });
                    }
                } catch (e: any) {
                    debugLogger.debug("TelegramUpload", `Audio cover extraction skipped: ${e.message}`, { file: fileName });
                }

            } else if (isImage) {
                method = 'sendPhoto';
                uploadMeta.method = method;
                form.append('photo', fileStream, { filename: fileName, knownLength: fileSize });
            } else if (isFont) {
                // FONT PREVIEW LOGIC
                // We attempt to send as a MediaGroup (Album) if possible, or Fallback to Stacked Messages.

                const config = readConfig();
                const previewOptions = config.font_preview || {
                    text: "ABC",
                    bg_color: "#ffffff",
                    text_color: "#000000",
                    size: "medium",
                    enabled: true
                };

                // Check enabled toggle
                if (previewOptions.enabled === false) {
                    debugLogger.info("AutoSyncer", `Font Preview disabled. Sending as document.`);
                    method = 'sendDocument';
                    uploadMeta.method = method;
                    form.append('document', fileStream, { filename: fileName, knownLength: fileSize });
                } else {
                    // Proceed with preview generation logic...

                    let previewPath = await generateFontPreview(filePath, {
                        ...previewOptions,
                        tempDir: this.tempDir
                    });

                    if (previewPath && fs.existsSync(previewPath)) {
                        // METHOD: Stacked Messages (Photo then Document)
                        // We register BOTH messages for Undo.

                        // 1. Send Preview Image
                        const previewForm = new FormData();
                        previewForm.append('chat_id', folder.target_chat_id);
                        if (folder.target_topic_id) previewForm.append('message_thread_id', folder.target_topic_id);
                        previewForm.append('photo', fs.createReadStream(previewPath));
                        // No caption on preview to keep it clean

                        let previewMsgId: string | undefined;

                        try {
                            const prevRes = await axios.post(`${telegramApiUrl}/bot${token}/sendPhoto`, previewForm, {
                                headers: previewForm.getHeaders(),
                                maxContentLength: Infinity,
                                maxBodyLength: Infinity
                            });
                            if (prevRes.data?.result?.message_id) {
                                previewMsgId = prevRes.data.result.message_id.toString();
                                // Register for Session Undo
                                this.currentSessionFiles.push({ messageId: previewMsgId!, chatId: folder.target_chat_id });
                                // Register for Job Undo (We'll link it to the file hash but maybe as a separate entry?
                                // Or simpler: We don't persist preview IDs in DB for long-term undo yet,
                                // but user specifically asked for "Stop & Undo" to work, which uses currentSessionFiles).
                            }
                            debugLogger.debug("TelegramUpload", `Font preview sent`, { file: fileName, msgId: previewMsgId });
                        } catch (e: any) {
                            debugLogger.warn("TelegramUpload", `Font preview send failed`, { error: e.message });
                        }

                        // Cleanup preview
                        try { fs.unlinkSync(previewPath); } catch (e) { /* ignore */ }

                        // Rate limit buffer
                        await new Promise(r => setTimeout(r, 2000));
                    }

                    // 2. Send Font File (Standard Document)
                    method = 'sendDocument';
                    uploadMeta.method = method;
                    form.append('document', fileStream, { filename: fileName, knownLength: fileSize });

                }
            } else {
                // Default / Fallback
                method = 'sendDocument';
                uploadMeta.method = method;
                form.append('document', fileStream, { filename: fileName, knownLength: fileSize });
            }

            debugLogger.info("TelegramUpload", `Sending ${method} to Telegram API`, uploadMeta);

            const res = await axios.post(`${telegramApiUrl}/bot${token}/${method}`, form, {
                headers: form.getHeaders(),
                maxContentLength: Infinity,
                maxBodyLength: Infinity
            });

            debugLogger.info("TelegramUpload", `API Response OK`, {
                file: fileName,
                messageId: res.data?.result?.message_id,
                ok: res.data?.ok
            });

            // Extract file_id
            let fileId: string | undefined;
            const result = res.data?.result;
            if (result) {
                if (result.document) fileId = result.document.file_id;
                else if (result.video) fileId = result.video.file_id;
                else if (result.audio) fileId = result.audio.file_id;
                else if (result.photo && Array.isArray(result.photo)) {
                    // Get largest photo
                    fileId = result.photo[result.photo.length - 1].file_id;
                }
            }

            return { ...res, fileId };

        } catch (err: any) {
            debugLogger.error("TelegramUpload", `API Error for ${fileName}`, {
                status: err.response?.status,
                error: err.response?.data?.description || err.message,
                uploadMeta
            });
            throw err;
        } finally {
            // Cleanup Thumbnail
            if (thumbPath && fs.existsSync(thumbPath)) {
                try { fs.unlinkSync(thumbPath); } catch (e) { /* ignore */ }
            }
        }
    }

    // --- PUBLIC API ---
    // (Collapsed legacy methods for brevity but fully functional)
    public async getPresets() { const db = getDb(); const rows = await db.all('SELECT * FROM presets'); return rows.map(row => ({ id: row.id, name: row.name, rules: { extensions: JSON.parse(row.extensions_include || '[]'), exclude: JSON.parse(row.extensions_exclude || '[]'), maxSize: (row.max_size_mb || 0) * 1024 * 1024, archiveMode: row.archive_mode, archiveSize: (row.archive_size_mb || 2048) * 1024 * 1024, archivePassword: row.archive_password, smartSplit: row.smart_split_video ? true : false, smartSplitStrategy: row.smart_split_strategy } })); }
    public async createPreset(name: string, rules: any) { const db = getDb(); const id = crypto.randomUUID(); await db.run(`INSERT INTO presets (id, name, extensions_include, extensions_exclude, min_size_mb, max_size_mb, filename_regex, smart_split_video, smart_split_strategy, archive_mode, archive_size_mb, archive_password, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [id, name, JSON.stringify(rules.extensions || []), JSON.stringify(rules.exclude || []), 0, rules.maxSize ? Math.round(rules.maxSize / 1024 / 1024) : 0, rules.regex || '', rules.smartSplit ? 1 : 0, rules.smartSplitStrategy || 're-encode', rules.archiveMode || 'none', rules.archiveSize ? Math.round(rules.archiveSize / 1024 / 1024) : 2048, rules.archivePassword || null, Date.now()]); return id; }
    public async updatePreset(id: string, name: string, rules: any) { const db = getDb(); await db.run(`UPDATE presets SET name=?, extensions_include=?, extensions_exclude=?, min_size_mb=0, max_size_mb=?, filename_regex=?, smart_split_video=?, smart_split_strategy=?, archive_mode=?, archive_size_mb=?, archive_password=? WHERE id=?`, [name, JSON.stringify(rules.extensions || []), JSON.stringify(rules.exclude || []), rules.maxSize ? Math.round(rules.maxSize / 1024 / 1024) : 0, rules.regex || '', rules.smartSplit ? 1 : 0, rules.smartSplitStrategy || 're-encode', rules.archiveMode || 'none', rules.archiveSize ? Math.round(rules.archiveSize / 1024 / 1024) : 2048, rules.archivePassword || null, id]); }
    public async deletePreset(id: string) {
        const db = getDb();
        // Check for usage in sync_folders
        const folders = await db.get('SELECT COUNT(*) as count FROM sync_folders WHERE preset_id = ?', [id]);
        if (folders && folders.count > 0) throw new Error("Preset is currently used by active sync folders.");

        // Check for usage in sync_groups
        const groups = await db.get('SELECT COUNT(*) as count FROM sync_groups WHERE preset_id = ?', [id]);
        if (groups && groups.count > 0) throw new Error("Preset is currently used by sync groups.");

        // Check for usage in sync_tasks
        const tasks = await db.get('SELECT COUNT(*) as count FROM sync_tasks WHERE preset_id = ?', [id]);
        if (tasks && tasks.count > 0) throw new Error("Preset is currently used by sync group tasks.");

        await db.run('DELETE FROM presets WHERE id = ?', [id]);
    }
    public async runSyncGroup(groupId: string) {
        const db = getDb();
        const group = await db.get('SELECT * FROM sync_groups WHERE id = ?', [groupId]);
        if (!group) throw new Error("Group not found");

        // Set Group Status
        await db.run("UPDATE sync_groups SET status = 'syncing', last_run = ? WHERE id = ?", [Date.now(), groupId]);

        this.enqueueJob(`Sync Group: ${group.name}`, async () => {
            try {
                // const token = getActiveToken();
                // Check Token Validity before queuing
                const token = getActiveToken();
                if (!token || token === "" || token.startsWith("123456789:ABC")) {
                    throw new Error("NO_BOT_TOKEN");
                }
                // Get Nodes Sorted
                const nodes = await db.all('SELECT * FROM sync_tasks WHERE group_id = ? ORDER BY order_index ASC', [groupId]);

                // Optional: Group Start Notification
                // if (token && nodes.length > 0) {
                //      const firstNode = nodes[0];
                //      await this.sendTelegramMessage(token, firstNode.target_chat_id, firstNode.target_topic_id, `🚀 <b>GROUP SYNC STARTED:</b> ${group.name}`);
                // }

                for (const node of nodes) {
                    if (!node.enabled) continue;

                    // Create context for the node execution
                    // We map the node (sync_task) to the structure executeFolderSync expects, but mostly we just need paths and targets.
                    // To reuse executeFolderSync, we need to ensuring it handles the node structure.

                    // Allow node to use Group's Preset if explicit one not set? 
                    // Current plan: Node has preset_id. If missing, maybe fallback?
                    // Let's assume Node has preset_id as we added column. If null, use group's? 
                    // Migration didn't enforce non-null.

                    let presetId = node.preset_id;
                    if (!presetId && group.preset_id) presetId = group.preset_id;
                    if (!presetId) {
                        debugLogger.warn("AutoSyncer", `Skipping node ${node.source_path} - No Preset ID`);
                        continue;
                    }

                    const syncContext = {
                        id: node.id,
                        name: node.custom_name || path.basename(node.source_path),
                        source_path: node.source_path,
                        target_chat_id: node.target_chat_id,
                        target_topic_id: node.target_topic_id,
                        preset_id: presetId,
                        // We flag this as a 'node' sync so we don't mess with 'sync_folders' table statuses inside executeFolderSync
                        isGroupNode: true,
                        groupId: group.id
                    };

                    await this.executeFolderSync(syncContext);
                }

            } catch (e: any) {
                console.error(`[AutoSyncer] Group Sync Failed: ${group.name}`, e);
            } finally {
                await db.run("UPDATE sync_groups SET status = 'idle' WHERE id = ?", [groupId]);
                // Update next scheduled sync for group
                try { await getScheduler().updateNextSyncDue(groupId, 'group'); } catch (e) { /* ignore */ }
            }
        });
    }

    public async getSyncGroups() { const db = getDb(); return await db.all(`SELECT * FROM sync_groups ORDER BY last_run DESC, name ASC`); } // Removed join with presets as it is now node-level or mixed

    public async createSyncGroup(n: string, cron: string | null) {
        const db = getDb();
        const id = crypto.randomUUID();
        // We no longer require preset_id at group level, but schema might have it. We can ignore or set null.
        // Assuming schema still has it, we pass null if not needed. 
        // Actually earlier migration didn't remove it.
        await db.run(`INSERT INTO sync_groups (id, name, schedule_cron, is_active, last_run, status) VALUES (?, ?, ?, ?, ?, 'idle')`, [id, n, cron, 1, 0]);
        return id;
    }

    public async updateSyncGroup(id: string, n: string, cron: string | null) {
        const db = getDb();
        await db.run(`UPDATE sync_groups SET name=?, schedule_cron=? WHERE id=?`, [n, cron, id]);
    }

    public async addSyncTask(g: string, s: string, t: string, topic?: string, presetId?: string, order?: number, enabled?: boolean, name?: string) {
        const db = getDb();
        const id = crypto.randomUUID();
        await db.run(
            `INSERT INTO sync_tasks (id, group_id, source_path, target_chat_id, target_topic_id, preset_id, order_index, enabled, custom_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, g, s, t, topic || null, presetId || null, order || 0, enabled === false ? 0 : 1, name || null]
        );
        return id;
    }

    public async clearSyncTasks(g: string) { const db = getDb(); await db.run('DELETE FROM sync_tasks WHERE group_id=?', [g]); }

    public async getSyncTasks(g: string) { const db = getDb(); return await db.all('SELECT * FROM sync_tasks WHERE group_id=? ORDER BY order_index ASC', [g]); }

    // --- SYNC FOLDERS ---
    public async addFolder(name: string, sourcePath: string, targetChatId: string, presetId: string, targetTopicId?: string, scheduleType?: string, scheduleConfig?: any) {
        const db = getDb();
        // Duplicate check removed to allow multiple syncs for same path/target with different presets
        const id = crypto.randomUUID();
        const schedType = scheduleType || 'none';
        const schedConf = scheduleConfig ? JSON.stringify(scheduleConfig) : '{}';
        await db.run(
            `INSERT INTO sync_folders (id, name, source_path, target_chat_id, target_topic_id, preset_id, status, schedule_type, schedule_config) VALUES (?, ?, ?, ?, ?, ?, 'idle', ?, ?)`,
            [id, name, sourcePath, targetChatId, targetTopicId || null, presetId, schedType, schedConf]
        );
        // Calculate initial next_sync_due if schedule set
        if (schedType !== 'none') {
            try { await getScheduler().updateNextSyncDue(id, 'folder'); } catch { /* ignore */ }
        }
        return id;
    }
    public async listFolders() { const db = getDb(); return await db.all(`SELECT f.*, p.name as preset_name FROM sync_folders f LEFT JOIN presets p ON f.preset_id = p.id ORDER BY f.created_at DESC`); }
    public async removeFolder(id: string) { const db = getDb(); await db.run('DELETE FROM sync_folders WHERE id=?', [id]); }
    public async toggleFolder(id: string, e: boolean) { const db = getDb(); await db.run('UPDATE sync_folders SET enabled=? WHERE id=?', [e ? 1 : 0, id]); }
    public async updateFolder(id: string, n: string, s: string, t: string, p: string, top?: string, scheduleType?: string, scheduleConfig?: any) {
        const db = getDb();
        // Duplicate check removed
        const schedType = scheduleType || 'none';
        const schedConf = scheduleConfig ? JSON.stringify(scheduleConfig) : '{}';
        await db.run(`UPDATE sync_folders SET name=?, source_path=?, target_chat_id=?, target_topic_id=?, preset_id=?, schedule_type=?, schedule_config=? WHERE id=?`, [n, s, t, top || null, p, schedType, schedConf, id]);
        // Recalculate next_sync_due immediately on schedule edit
        try { await getScheduler().updateNextSyncDue(id, 'folder'); } catch { /* ignore */ }
    }

    public async runFolder(folderId: string) {
        const token = getActiveToken();
        if (!token || token === "" || token.startsWith("123456789:ABC")) {
            throw new Error("NO_BOT_TOKEN");
        }
        const db = getDb();
        const folder = await db.get('SELECT * FROM sync_folders WHERE id = ?', [folderId]);
        if (!folder || !folder.enabled) throw new Error("Folder invalid or disabled");
        await db.run('UPDATE sync_folders SET status=? WHERE id=?', ['syncing', folderId]);
        this.enqueueJob(`Sync Folder: ${folder.name}`, async () => await this.executeFolderSync(folder));
    }

    private async executeFolderSync(folder: any) {
        const db = getDb();
        const token = getActiveToken();

        try {
            if (!token || token === "" || token.startsWith("123456789:ABC")) {
                throw new Error("NO_BOT_TOKEN");
            }

            // Allow folder context to provide presetId
            const presetId = folder.preset_id;
            const preset = await db.get('SELECT * FROM presets WHERE id=?', [presetId]);
            if (!preset) throw new Error(`Preset not found: ${presetId}`);

            this.activeJob = {
                jobId: crypto.randomUUID(),
                name: folder.name,
                totalFilesDiscovered: 0,
                filesSent: 0,
                filesFailed: 0,
                filesSkipped: 0,
                totalBytesSent: 0,
                startTime: new Date(),
                fileTypeBreakdown: {},
                status: 'scanning',
                currentFile: folder.source_path
            };

            // Start sync session for tracking
            await this.startSyncSession(folder.id);

            const rules = {
                includeExtensions: preset.extensions_include ? JSON.parse(preset.extensions_include) : [],
                excludeExtensions: preset.extensions_exclude ? JSON.parse(preset.extensions_exclude) : [],
                minSize: (Number(preset.min_size_mb) || 0) * 1024 * 1024,
                maxSize: (Number(preset.max_size_mb) > 0) ? Number(preset.max_size_mb) * 1024 * 1024 : Infinity,
                regex: preset.filename_regex || null
            };

            // Registry Context: Isolate history based on mode
            // Standard: [folderId]
            // Zip Combined: [folderId]:zip_folder
            // Zip Indiv: [folderId]:zip_indiv
            const registryContext = this.getRegistryContext(folder.id, preset.archive_mode);
            debugLogger.info("AutoSyncer", `Registry Context: ${registryContext} (Mode: ${preset.archive_mode || 'none'})`);

            const startMsg = await this.sendTelegramMessage(token, folder.target_chat_id, folder.target_topic_id, `📢 <b>SYNC STARTED:</b> [${folder.name}]\n🕒 Time: ${new Date().toLocaleString()}\n📋 Preset: ${preset.name}`);
            if (startMsg) this.activeJob.startMessageId = startMsg;

            let searchPath = folder.source_path;
            if (!path.isAbsolute(searchPath)) searchPath = path.resolve(this.scanRoot, searchPath);
            if (!fs.existsSync(searchPath)) throw new Error(`Path not found: ${searchPath}`);


            const crawler = new fdir().withFullPaths().crawl(searchPath);
            const rawFiles = await crawler.withPromise() as string[];
            debugLogger.info("AutoSyncer", `Found ${rawFiles.length} raw files in ${searchPath}`);

            // Pre-process candidates: Get Stats & Sort by Date (Oldest First)
            const candidates: { path: string; stats: fs.Stats }[] = [];
            for (const filePath of rawFiles) {
                try {
                    const stats = await fs.promises.stat(filePath);
                    if (stats.isFile()) {
                        candidates.push({ path: filePath, stats });
                    }
                } catch { continue; }
            }
            debugLogger.info("AutoSyncer", `${candidates.length} candidates after stat check.`);

            // Sort: Ascending Mtime (Oldest -> Newest)
            candidates.sort((a, b) => a.stats.mtimeMs - b.stats.mtimeMs);

            const filteredFilesWithStats: { path: string, stats: fs.Stats }[] = [];
            const isZipMode = ['zip_folder', 'zip_indiv'].includes(preset.archive_mode);

            debugLogger.info("AutoSyncer", `Applying Rules: MaxSize=${this.formatFileSize(rules.maxSize)}, MinSize=${this.formatFileSize(rules.minSize)}, ExtInclude=${rules.includeExtensions}, ExtExclude=${rules.excludeExtensions}`);

            for (const { path: filePath, stats } of candidates) {
                const baseName = path.basename(filePath);

                const ext = path.extname(filePath).replace('.', '').toLowerCase();
                const isVideo = ['mp4', 'mkv', 'avi', 'mov', 'webm', 'flv', 'wmv', 'm4v', '3gp', 'ts'].includes(ext);

                // Filter Logic
                if (rules.maxSize > 0 && stats.size > rules.maxSize) {
                    // Exception: If Smart Split is ON and it's a video, allow it!
                    if (preset.smart_split_video && isVideo) {
                        debugLogger.debug("AutoSyncer", `Allowed ${baseName} despite size (${this.formatFileSize(stats.size)}) due to Smart Split.`);
                    } else {
                        debugLogger.debug("AutoSyncer", `Skipping ${baseName}: Exceeds Max Size (${this.formatFileSize(stats.size)} > ${this.formatFileSize(rules.maxSize)})`);
                        this.activeJob.filesSkipped++; continue;
                    }
                }
                if (stats.size < rules.minSize) {
                    debugLogger.debug("AutoSyncer", `Skipping ${baseName}: Below Min Size`);
                    this.activeJob.filesSkipped++; continue;
                }

                if (rules.includeExtensions.length > 0 && !rules.includeExtensions.includes(ext)) {
                    debugLogger.debug("AutoSyncer", `Skipping ${baseName}: Extension .${ext} not in include list`);
                    this.activeJob.filesSkipped++; continue;
                }
                if (rules.excludeExtensions.length > 0 && rules.excludeExtensions.includes(ext)) {
                    debugLogger.debug("AutoSyncer", `Skipping ${baseName}: Extension .${ext} is excluded`);
                    this.activeJob.filesSkipped++; continue;
                }
                if (rules.regex && !new RegExp(rules.regex).test(baseName)) {
                    debugLogger.debug("AutoSyncer", `Skipping ${baseName}: Regex mismatch`);
                    this.activeJob.filesSkipped++; continue;
                }

                // Content Hash (Slow but Accurate)
                // In Zip Mode, we skip individual file checks because we sync Chunks.
                if (!isZipMode) {
                    const fingerprint = await getFileFingerprint(filePath, stats.size, stats.mtimeMs);
                    const isPacked = await isFilePacked(fingerprint, registryContext);
                    if (isPacked) {
                        debugLogger.debug("AutoSyncer", `Skipping ${baseName}: Already Synced (Registry Match: ${fingerprint.substring(0, 8)}...)`);
                        this.activeJob.filesSkipped++; continue;
                    }
                }

                filteredFilesWithStats.push({ path: filePath, stats });
            }
            debugLogger.info("AutoSyncer", `Filtered down to ${filteredFilesWithStats.length} files to sync.`);

            this.activeJob.totalFilesDiscovered = filteredFilesWithStats.length;
            this.activeJob.status = 'processing';
            const startTime = Date.now();

            this.skipCurrent = false; this.cancelSignal = false; this.deleteOnCancel = false; this.currentSessionFiles = [];

            if (isZipMode) {
                await this.syncAsArchives(folder, preset, filteredFilesWithStats, registryContext);
            } else {
                let lastDir = '';
                const filteredFiles = filteredFilesWithStats.map(f => f.path);

                for (const filePath of filteredFiles) {
                    if (this.cancelSignal) { // Loop Check
                        throw new Error('CANCELLED_BY_USER');
                    }
                    if (this.skipCurrent) { this.activeJob.filesSkipped++; this.skipCurrent = false; continue; }

                    try {
                        this.activeJob.currentFile = path.basename(filePath);
                        const stats = await fs.promises.stat(filePath);

                        const currentDir = path.dirname(filePath);
                        if (currentDir !== lastDir) {
                            // Delete previous subfolder message
                            if (this.activeJob.subfolderMessageId) {
                                await this.deleteTelegramMessage(token, folder.target_chat_id, this.activeJob.subfolderMessageId);
                                this.activeJob.subfolderMessageId = undefined;
                            }

                            const relativeDir = path.relative(folder.source_path, currentDir);
                            if (relativeDir && relativeDir !== '.') {
                                const subMsg = await this.sendTelegramMessage(token, folder.target_chat_id, folder.target_topic_id, `📂 <b>STARTING SUBFOLDER:</b> [${relativeDir}]`);
                                if (subMsg) this.activeJob.subfolderMessageId = subMsg;
                            }
                            lastDir = currentDir;
                        }

                        const fingerprint = await getFileFingerprint(filePath, stats.size, stats.mtimeMs);

                        // --- SMART SPLIT & OVERSIZED CHECK ---
                        const isVideo = ['.mp4', '.mkv', '.avi', '.mov', '.webm', '.flv', '.wmv'].includes(path.extname(filePath).toLowerCase());

                        if (stats.size > MAX_TELEGRAM_SIZE) {
                            if (preset.smart_split_video && isVideo) {
                                const splitSuccess = await this.processVideoSplit(filePath, token, folder, preset);
                                if (splitSuccess) {
                                    await new Promise(r => setTimeout(r, SYNC_LOOP_DELAY_MS));
                                    continue;
                                }
                            }

                            // GUARDRAIL: Skip oversized files if Smart Split didn't run or apply
                            debugLogger.warn("AutoSyncer", `Skipping oversized file: ${path.basename(filePath)} (${this.formatFileSize(stats.size)}) - Smart Split OFF`);
                            this.activeJob.filesSkipped++;
                            continue;
                        }
                        // -------------------------

                        const caption = this.generateSmartCaption(path.basename(filePath), stats.size, preset.name, fingerprint);
                        const response = await this.uploadIntelligent(token, folder, filePath, caption);

                        const result = response.data?.result;
                        const fileId = response.fileId;

                        if (result?.message_id && result?.chat?.id) this.currentSessionFiles.push({ messageId: result.message_id.toString(), chatId: result.chat.id.toString() });

                        await registerFile(fingerprint, filePath, stats.size, registryContext, folder.name, result?.message_id, result?.chat?.id, fileId, this.activeJob.jobId);

                        this.activeJob.filesSent++;
                        this.activeJob.totalBytesSent += stats.size;
                        const ext = path.extname(filePath).replace('.', '').toLowerCase();
                        this.activeJob.fileTypeBreakdown[ext] = (this.activeJob.fileTypeBreakdown[ext] || 0) + 1;

                        const elapsed = (Date.now() - startTime) / MS_PER_SECOND;
                        this.activeJob.speed = `${(this.activeJob.totalBytesSent / elapsed / BYTES_PER_KB / BYTES_PER_KB).toFixed(2)} MB/s`;

                        await new Promise(r => setTimeout(r, SYNC_LOOP_DELAY_MS));
                    } catch (e: any) {
                        if (this.cancelSignal) throw new Error('CANCELLED_BY_USER'); // Re-throw cancel if caught
                        console.error(`[Sync] Failed ${filePath}`, e);
                        this.activeJob.filesFailed++;
                    }
                }
            } // End Standard Loop

            // Sync Complete Report
            this.activeJob.status = 'completed';
            this.activeJob.endTime = new Date();
            const durationMs = this.activeJob.endTime.getTime() - this.activeJob.startTime.getTime();
            const minutes = Math.floor(durationMs / MS_PER_MINUTE);
            const seconds = ((durationMs % MS_PER_MINUTE) / MS_PER_SECOND).toFixed(0);

            // Cleanup Subfolder Message
            if (this.activeJob.subfolderMessageId) {
                const msgId = this.activeJob.subfolderMessageId;
                if (msgId) await this.deleteTelegramMessage(token, folder.target_chat_id, String(msgId));
            }

            await this.sendTelegramMessage(token, folder.target_chat_id, folder.target_topic_id,
                `✅ <b>SYNC COMPLETE:</b> [${folder.name}]\n` +
                `⏱ Duration: ${minutes}m ${seconds}s\n` +
                `📦 Total Sent: ${this.formatFileSize(this.activeJob.totalBytesSent)}\n` +
                `📄 New: ${this.activeJob.filesSent} | Skipped: ${this.activeJob.filesSkipped}`,
                [
                    [
                        { text: "↩️ Undo", callback_data: `undo:${this.activeJob.jobId}` },
                        { text: "🔄 Sync Again", callback_data: `sync:${folder.id}` }
                    ],
                    [
                        { text: "❌ Dismiss", callback_data: `dismiss:0` }
                    ]
                ]
            );

        } catch (e: any) {
            console.error(`[AutoSyncer] Sync Interrupted`, e);
            if (this.activeJob) this.activeJob.status = 'failed';
            const token = getActiveToken();

            // Cleanup Subfolder Message
            if (this.activeJob && this.activeJob.subfolderMessageId) {
                const msgId = this.activeJob.subfolderMessageId;
                if (token && msgId) await this.deleteTelegramMessage(token, folder.target_chat_id, String(msgId));
            }
            // Check for explicit cancel error string
            if (e.message === 'CANCELLED_BY_USER' || this.cancelSignal) {
                if (token && this.activeJob?.startMessageId) {
                    await this.editTelegramMessage(token, folder.target_chat_id, this.activeJob.startMessageId,
                        `🛑 <b>SYNC CANCELLED:</b> [${folder.name}]\n` +
                        `📦 Sent: ${this.activeJob?.filesSent || 0} files`
                    );
                } else if (token) {
                    await this.sendTelegramMessage(token, folder.target_chat_id, folder.target_topic_id,
                        `🛑 <b>SYNC CANCELLED:</b> [${folder.name}]\n` +
                        `📦 Sent: ${this.activeJob?.filesSent || 0} files`
                    );
                }

                if (this.deleteOnCancel && token) await this.undoSessionFiles(token);
            } else {
                if (token) await this.sendTelegramMessage(token, folder.target_chat_id, folder.target_topic_id, `❌ <b>SYNC FAILED:</b> ${e instanceof Error ? e.message : 'Unknown'}`);
            }

        } finally {
            // Complete sync session with snapshot
            try { await this.completeSyncSession(folder.id, folder); } catch (e) { console.error('[Session] Failed to complete session:', e); }

            // Only update status if it's a standalone folder (not a group node)
            if (!folder.isGroupNode) {
                await db.run('UPDATE sync_folders SET status = ?, last_sync = ? WHERE id = ?', ['idle', Date.now(), folder.id]);
                // Update next scheduled sync
                try { await getScheduler().updateNextSyncDue(folder.id, 'folder'); } catch (e) { /* ignore */ }
            }
            if (this.activeJob && (this.activeJob.status === 'processing' || this.activeJob.status === 'scanning')) this.activeJob.status = 'failed';
        }
    }

    // --- ZIP SYNC MODE ---

    private getRegistryContext(folderId: string, archiveMode: string): string {
        if (!archiveMode || archiveMode === 'none') return folderId;
        return `${folderId}:${archiveMode}`;
    }

    private async processVideoSplit(filePath: string, token: string, folder: any, preset: any): Promise<boolean> {
        // 1. Check Strategy
        const strategy = preset.smart_split_strategy || 're-encode'; // 're-encode' | 'copy'
        // 'copy' mode uses a safer target size (1.7GB) to account for keyframe drift
        const targetSize = strategy === 'copy' ? (MAX_TELEGRAM_SIZE * 0.85) : MAX_TELEGRAM_SIZE;

        debugLogger.info("AutoSyncer", `Starting Smart Split (${strategy}) for: ${path.basename(filePath)}`);
        this.activeJob!.currentFile = `Analyzing Video: ${path.basename(filePath)}...`;

        try {
            // 2. Get Duration via ffprobe
            const metadata = await new Promise<any>((resolve, reject) => {
                ffmpeg.ffprobe(filePath, (err: any, metadata: any) => {
                    if (err) reject(err);
                    else resolve(metadata);
                });
            });

            const duration = metadata.format.duration; // seconds
            const size = metadata.format.size; // bytes
            if (!duration || !size) throw new Error("Could not determine video duration/size");

            // Calculate bitrate and segment time
            const avgBitrate = size / duration; // bytes per second
            const safeSegmentTime = Math.floor(targetSize / avgBitrate); // seconds

            if (safeSegmentTime < 5) throw new Error("Calculated segment time too small (video bitrate too high?)");

            debugLogger.info("AutoSyncer", `Split Calc: Duration=${duration}s, Size=${this.formatFileSize(size)}, SegTime=${safeSegmentTime}s`);

            const baseName = path.parse(filePath).name;
            const outputPattern = path.join(this.tempDir, `${baseName}_part%03d.mp4`);

            // Helper to run split command
            const runSplit = (useHw: boolean) => new Promise<void>((resolve, reject) => {
                let currentPercent = 0;
                let encoderName, statusSuffix;

                if (strategy === 'copy') {
                    encoderName = 'copy';
                    statusSuffix = '(Steam Copy)';
                } else {
                    encoderName = useHw ? 'h264_mediacodec' : 'libx264';
                    statusSuffix = useHw ? '(Hardware)' : '(Software)';
                }

                debugLogger.info("AutoSyncer", `Starting Process with ${encoderName} ${statusSuffix}`);
                this.activeJob!.currentFile = `Splitting ${statusSuffix}: ${baseName} (0%)`;

                let cmd = ffmpeg(filePath)
                    .outputOptions([
                        `-f segment`,
                        `-segment_time ${safeSegmentTime}`,
                        `-reset_timestamps 1`
                    ]);

                if (strategy === 're-encode') {
                    if (useHw) {
                        cmd = cmd
                            .videoCodec('h264_mediacodec')
                            .audioCodec('aac')
                            .outputOptions(['-movflags +faststart']);
                    } else {
                        cmd = cmd
                            .videoCodec('libx264')
                            .audioCodec('aac')
                            .outputOptions([
                                '-preset veryfast',
                                '-crf 23',
                                '-movflags +faststart'
                            ]);
                    }
                } else {
                    cmd = cmd.outputOptions(['-c copy']);
                }

                cmd.output(outputPattern)
                    .on('progress', (progress: any) => {
                        if (progress.percent && progress.percent > currentPercent + 5) {
                            currentPercent = Math.floor(progress.percent);
                            this.activeJob!.currentFile = `Splitting ${statusSuffix}: ${baseName} (${currentPercent}%)`;
                            debugLogger.debug("AutoSyncer", `Split Progress: ${currentPercent}%`);
                        }
                    })
                    .on('end', () => resolve())
                    .on('error', (err: any) => reject(err))
                    .run();
            });

            // 4. Run FFmpeg with Fallback
            if (strategy === 're-encode') {
                try {
                    // Try Hardware First
                    await runSplit(true);
                    debugLogger.info("AutoSyncer", `Smart Split completed using Hardware Acceleration`);
                } catch (hwError: any) {
                    debugLogger.warn("AutoSyncer", `Hardware encoding failed, falling back to Software`, hwError.message);
                    // Fallback to Software
                    await runSplit(false);
                    debugLogger.info("AutoSyncer", `Smart Split completed using Software Encoder`);
                }
            } else {
                // Copy Mode (No HW option logic needed, just run)
                await runSplit(false);
            }

            // 5. Find and Upload Segments
            const files = fs.readdirSync(this.tempDir).filter(f => f.startsWith(`${baseName}_part`) && f.endsWith('.mp4'));
            files.sort(); // Ensure 000, 001 order

            debugLogger.info("AutoSyncer", `Split created ${files.length} parts.`);

            // VALIDATION: Fail early if any part is too big (prevents API 400 errors)
            for (const partFile of files) {
                const pPath = path.join(this.tempDir, partFile);
                const pSize = fs.statSync(pPath).size;
                if (pSize > MAX_TELEGRAM_SIZE) {
                    throw new Error(`Split part ${partFile} (${this.formatFileSize(pSize)}) exceeds Telegram limit. Try 'Re-encode' strategy.`);
                }
            }

            let partIndex = 1;
            const totalParts = files.length;
            const originalFingerprint = await getFileFingerprint(filePath, size, fs.statSync(filePath).mtimeMs);

            for (const partFile of files) {
                if (this.cancelSignal) throw new Error('CANCELLED_BY_USER');

                const partPath = path.join(this.tempDir, partFile);
                const partSize = fs.statSync(partPath).size;
                const partCaption = `🎬 <b>VIDEO PART</b> (${partIndex}/${totalParts})\n📄 File: ${baseName}\n⏱ Type: Smart Split (${strategy})\n⚙️ Preset: ${preset.name || 'None'}`;

                this.activeJob!.currentFile = `Uploading Part ${partIndex}/${totalParts}...`;

                const response = await this.uploadIntelligent(token, folder, partPath, partCaption);

                // Register part? No, we register the ORIGINAL file mostly. 
                // But we should track parts if we want to support resume? 
                // For now, simple: Register original file after ALL parts success.

                if (response.data?.result?.message_id && response.data?.result?.chat?.id) {
                    this.currentSessionFiles.push({ messageId: response.data.result.message_id.toString(), chatId: response.data.result.chat.id.toString() });
                }

                this.activeJob!.filesSent++; // We count parts as sent files or 1 file? 
                // Let's count parts to show activity.
                this.activeJob!.totalBytesSent += partSize;

                // Cleanup part
                fs.unlinkSync(partPath);
                partIndex++;
            }

            // 6. Success: Register Original File
            // We use a dummy message ID for the original file registration since it's split.
            await registerFile(originalFingerprint, filePath, size, folder.id, folder.name, 'SPLIT_VIDEO', undefined, undefined, this.activeJob!.jobId);

            return true;

        } catch (e: any) {
            debugLogger.error("AutoSyncer", `Smart Split Failed`, e);
            // Cleanup on fail
            try {
                const files = fs.readdirSync(this.tempDir).filter(f => f.startsWith(path.parse(filePath).name + '_part'));
                files.forEach(f => fs.unlinkSync(path.join(this.tempDir, f)));
            } catch { }
            throw e;
        }
    }


    private async syncAsArchives(folder: any, preset: any, files: { path: string, stats: fs.Stats }[], registryContext: string) {
        const token = getActiveToken();
        if (!token) throw new Error("NO_BOT_TOKEN");
        if (!this.activeJob) return;

        if (!token) throw new Error("NO_BOT_TOKEN");
        if (!this.activeJob) return;

        // Resolve generic path
        const sourcePath = path.isAbsolute(folder.source_path) ? folder.source_path : path.resolve(this.scanRoot, folder.source_path);

        const archiveSizeLimit = (Number(preset.archive_size_mb) || 2048) * 1024 * 1024;
        const archivePassword = preset.archive_password || undefined;
        const mode = preset.archive_mode || 'zip_folder'; // 'zip_folder' | 'zip_indiv'

        debugLogger.info("AutoSyncer", `Starting ZIP Sync Mode (${mode}). Files: ${files.length}, Limit: ${preset.archive_size_mb}MB`);

        // 1. Organize Files into Groups (Virtual Zips)
        // Group structure: { name: string, files: File[] }
        interface ArchiveGroup {
            name: string; // Base name for the zip (e.g. "MyFolder" or "Root")
            files: { relativePath: string, size: number, mtimeMs: number, fullPath: string }[];
        }

        const groups: ArchiveGroup[] = [];

        if (mode === 'zip_indiv') {
            const folderGroups: Record<string, ArchiveGroup> = {};
            const rootFiles: ArchiveGroup = { name: `${folder.name}_Root`, files: [] };

            for (const file of files) {
                const relativePath = path.relative(sourcePath, file.path);
                const firstDir = relativePath.split(path.sep)[0];

                // If file is in root (no separator or first part is the file itself)
                if (relativePath === firstDir) {
                    rootFiles.files.push({
                        relativePath,
                        size: file.stats.size,
                        mtimeMs: file.stats.mtimeMs,
                        fullPath: file.path
                    });
                } else {
                    // It's in a subfolder
                    if (!folderGroups[firstDir]) {
                        folderGroups[firstDir] = { name: firstDir, files: [] };
                    }
                    folderGroups[firstDir].files.push({
                        relativePath, // We keep full relative path to preserve structure inside the zip
                        size: file.stats.size,
                        mtimeMs: file.stats.mtimeMs,
                        fullPath: file.path
                    });
                }
            }

            if (rootFiles.files.length > 0) groups.push(rootFiles);
            Object.values(folderGroups).forEach(g => groups.push(g));

        } else {
            // 'zip_folder' (Combined) - Default
            groups.push({
                name: folder.name,
                files: files.map(f => ({
                    relativePath: path.relative(sourcePath, f.path),
                    size: f.stats.size,
                    mtimeMs: f.stats.mtimeMs,
                    fullPath: f.path
                }))
            });
        }

        debugLogger.info("AutoSyncer", `Files organized into ${groups.length} archive groups.`);

        // 2. Process Each Group (Chunking -> Zipping -> Uploading)
        for (const group of groups) {
            if (this.cancelSignal) throw new Error('CANCELLED_BY_USER');

            // Chunking Logic (Split group into parts if > limit)
            interface Chunk {
                files: ArchiveGroup['files'];
                totalSize: number;
            }

            const chunks: Chunk[] = [];
            let currentChunk: Chunk = { files: [], totalSize: 0 };

            for (const file of group.files) {
                if (currentChunk.files.length > 0 && (currentChunk.totalSize + file.size) > archiveSizeLimit) {
                    chunks.push(currentChunk);
                    currentChunk = { files: [], totalSize: 0 };
                }
                currentChunk.files.push(file);
                currentChunk.totalSize += file.size;
            }
            if (currentChunk.files.length > 0) chunks.push(currentChunk);

            // Process Chunks
            const totalParts = chunks.length;
            let partIndex = 1;

            for (const chunk of chunks) {
                if (this.cancelSignal) throw new Error('CANCELLED_BY_USER');

                // Deterministic Sort for Hash
                chunk.files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
                const chunkHash = ZipManager.calculateChunkHash(chunk.files);

                // Check Registry
                const isPacked = await isFilePacked(chunkHash, registryContext);
                if (isPacked) {
                    this.activeJob.filesSkipped += chunk.files.length;
                    partIndex++;
                    continue;
                }

                // Construct Zip Name
                // If single part, don't add PartX suffix? Or always add to allow expansion?
                // Logic: Name_PartX_Timestamp.zip
                // If zip_indiv, Name is the folder name.
                const cleanName = group.name.replace(/[^\w\-\.]/g, '_');
                const zipName = `${cleanName}${totalParts > 1 ? `_Part${partIndex}` : ''}_${Date.now()}.zip`;
                const zipPath = path.join(this.tempDir, zipName);

                try {
                    this.activeJob.currentFile = `Creating ${zipName}...`;

                    // Generate list of relative paths
                    const relativePaths = chunk.files.map(f => f.relativePath);

                    await ZipManager.createArchive(sourcePath, relativePaths, zipPath, archivePassword);
                    const zipSize = fs.statSync(zipPath).size;

                    // Upload
                    this.activeJob.currentFile = `Uploading ${zipName}...`;
                    const caption = this.generateZipCaption(zipName, zipSize, chunk.files, partIndex, totalParts, preset.name, chunkHash);

                    const response = await this.uploadIntelligent(token, folder, zipPath, caption);

                    // Register
                    await registerFile(chunkHash, `ZIP: ${zipName}`, zipSize, registryContext, folder.name, response.data?.result?.message_id?.toString(), response.data?.result?.chat?.id?.toString(), response.fileId, this.activeJob.jobId);

                    if (response.data?.result?.message_id && response.data?.result?.chat?.id) {
                        this.currentSessionFiles.push({ messageId: response.data.result.message_id.toString(), chatId: response.data.result.chat.id.toString() });
                    }

                    this.activeJob.filesSent += chunk.files.length;
                    this.activeJob.totalBytesSent += zipSize;

                } catch (e: any) {
                    debugLogger.error("AutoSyncer", `Failed to sync ZIP ${zipName}`, e);
                    this.activeJob.filesFailed += chunk.files.length;
                } finally {
                    try { if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath); } catch { }
                }

                partIndex++;
            }
        }
    }

    private generateAsciiTree(files: { relativePath: string }[], maxLines: number = 20): string {
        const tree: any = {};
        for (const f of files) {
            const parts = f.relativePath.split(path.sep);
            let current = tree;
            for (const part of parts) {
                if (!current[part]) current[part] = {};
                current = current[part];
            }
        }

        let output = '';
        let lines = 0;
        let truncated = false;

        const render = (node: any, prefix: string = '') => {
            if (lines >= maxLines) {
                if (!truncated) {
                    truncated = true;
                    output += `${prefix}...\n`;
                }
                return;
            }

            const keys = Object.keys(node).sort((a, b) => {
                // simple alphabetical sort
                return a.localeCompare(b);
            });

            for (let i = 0; i < keys.length; i++) {
                if (lines >= maxLines) break; // efficiency break

                const key = keys[i];
                const isLast = i === keys.length - 1;
                const children = node[key];
                const hasChildren = Object.keys(children).length > 0;

                const connector = isLast ? '└─' : '├─';
                output += `${prefix}${connector} ${key}${hasChildren ? '/' : ''}\n`;
                lines++;

                if (hasChildren) {
                    const childPrefix = prefix + (isLast ? '   ' : '│  ');
                    render(children, childPrefix);
                }
            }
        };

        render(tree);

        if (truncated || lines >= maxLines) {
            const remaining = files.length - lines; // rough estimate
            if (remaining > 0) output += `\n... and more items`;
        }

        return output.trim();
    }

    private generateZipCaption(zipName: string, zipSize: number, files: any[], partIndex: number, totalParts: number, presetName: string | undefined, hash: string): string {
        // Stats
        const typeCounts: Record<string, number> = {};
        for (const f of files) {
            const ext = path.extname(f.relativePath).replace('.', '').toLowerCase();
            typeCounts[ext] = (typeCounts[ext] || 0) + 1;
        }
        const topTypes = Object.entries(typeCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([ext, count]) => `${count} ${ext.toUpperCase()}`)
            .join(', ');

        // File List (Truncated)
        // Tree View
        const treeView = this.generateAsciiTree(files, 20);

        return `📦 <b>ARCHIVE SYNC</b> (${partIndex}/${totalParts})\n` +
            `📂 Name: ${zipName}\n` +
            `📏 Size: ${this.formatFileSize(zipSize)}\n` +
            `🔢 Files: ${files.length}\n` +
            `📊 Types: ${topTypes}\n` +
            `⚙️ Preset: ${presetName || 'None'}\n` +
            `🔒 Hash: <code>${hash}</code>\n\n` +
            `<b>Contents:</b>\n<pre>${treeView}</pre>`;
    }

    private async undoSessionFiles(token: string) {
        if (!token) return;
        const count = this.currentSessionFiles.length;
        debugLogger.info("AutoSyncer", `Undoing session. Deleting ${count} sent messages.`);

        const telegramApiUrl = this.getTelegramApiUrl();
        let deleted = 0;
        let failed = 0;

        for (const file of this.currentSessionFiles) {
            try {
                await axios.post(`${telegramApiUrl}/bot${token}/deleteMessage`, { chat_id: file.chatId, message_id: file.messageId });
                deleted++;
            } catch (e: any) {
                failed++;
                debugLogger.warn("AutoSyncer", `Failed to delete message ${file.messageId}: ${e.message}`);
            }
        }
        debugLogger.info("AutoSyncer", `Undo complete. Deleted: ${deleted}, Failed: ${failed}`);
    }

    public async undoJob(jobId: string) {
        const db = getDb();
        const token = getActiveToken();
        if (!token) throw new Error("Bot token not available for undo. Please set an active bot in Settings.");

        debugLogger.info("AutoSyncer", `Starting Undo for Job ${jobId}`);
        const files = await db.all('SELECT * FROM registry WHERE job_id = ?', [jobId]);

        if (files.length === 0) {
            debugLogger.warn("AutoSyncer", `No files found for job ${jobId}`);
            return { deleted: 0, failed: 0 };
        }

        const telegramApiUrl = this.getTelegramApiUrl();
        let deleted = 0;
        let failed = 0;

        for (const file of files) {
            if (file.chat_id && file.message_id) {
                try {
                    await axios.post(`${telegramApiUrl}/bot${token}/deleteMessage`, { chat_id: file.chat_id, message_id: file.message_id });
                    deleted++;
                } catch (e: any) {
                    failed++;
                    debugLogger.warn("AutoSyncer", `Failed to delete msg ${file.message_id}: ${e.message}`);
                }
            }

            // Remove from registry regardless of Telegram deletion success (consistency)
            await db.run('DELETE FROM registry WHERE file_hash = ? AND folder_id = ?', [file.file_hash, file.folder_id]);
        }

        // Update Job Status if exists
        try {
            await db.run('UPDATE job_history SET status = ? WHERE id = ?', ['undone', jobId]);
        } catch (e) { /* ignore */ }

        debugLogger.info("AutoSyncer", `Undo Job Complete. Deleted: ${deleted}, Failed: ${failed}`);
        return { deleted, failed };
    }
}
