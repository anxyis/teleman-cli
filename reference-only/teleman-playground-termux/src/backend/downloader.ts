import axios from 'axios';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { getDb, registerDownload } from './db.js';
import { getActiveToken } from './configManager.js';
import { debugLogger } from './debugLogger.js';
import { NetworkMonitor } from './networkMonitor.js';

export interface DownloadJob {
    id: string;
    fileHash: string;
    folderId: string;
    fileName: string;
    fileId: string;
    size: number;
    subfolder?: string;
    useCloudFallback?: boolean;
    status: 'queued' | 'downloading' | 'completed' | 'failed';
    progress: number;
    speed: string;
    cloud_fallback?: boolean;
    error?: string;
}

export class Downloader {
    private static instance: Downloader;
    private queue: DownloadJob[] = [];
    private activeJob: DownloadJob | null = null;
    private downloadDir: string;
    private isProcessing: boolean = false;

    private constructor() {
        // Resolve default download directory for Termux/Android
        this.downloadDir = path.resolve(process.env.HOME || '/data/data/com.termux/files/home', 'storage/shared/Download/Teleman-Files');
        this.ensureDownloadDir(this.downloadDir);
    }

    public static getInstance(): Downloader {
        if (!Downloader.instance) {
            Downloader.instance = new Downloader();
        }
        return Downloader.instance;
    }

    private ensureDownloadDir(dirPath: string) {
        if (!fs.existsSync(dirPath)) {
            try {
                fs.mkdirSync(dirPath, { recursive: true });
                debugLogger.info("Downloader", `Created directory: ${dirPath}`);
            } catch (e: any) {
                debugLogger.error("Downloader", `Failed to create directory ${dirPath}: ${e.message}`);
            }
        }
    }

    public getQueue() {
        return this.queue;
    }

    public getActiveJob() {
        return this.activeJob;
    }

    public async addToQueue(files: { fileHash: string, folderId: string, fileName: string, fileId: string, size: number, subfolder?: string, useCloudFallback?: boolean }[]) {
        for (const file of files) {
            const job: DownloadJob = {
                id: crypto.randomUUID(),
                ...file,
                status: 'queued',
                progress: 0,
                speed: '0 B/s'
            };
            this.queue.push(job);
            debugLogger.info("Downloader", `Added to queue: ${file.fileName} (Subfolder: ${file.subfolder || 'Root'})`);
        }
        this.processQueue();
    }

    private async processQueue() {
        if (this.isProcessing || this.queue.length === 0) return;

        this.isProcessing = true;
        while (this.queue.length > 0) {
            this.activeJob = this.queue.shift() || null;
            if (!this.activeJob) break;

            try {
                await this.downloadFile(this.activeJob);
            } catch (e: any) {
                debugLogger.error("Downloader", `Job failed: ${this.activeJob.fileName}`, e.message);
            }
        }
        this.activeJob = null;
        this.isProcessing = false;
    }

    private async sleep(ms: number) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    private async downloadFile(job: DownloadJob) {
        const token = getActiveToken();
        if (!token) throw new Error("No active bot token");

        const monitor = NetworkMonitor.getInstance();
        let telegramApiUrl = monitor.getActiveApiUrl();
        telegramApiUrl = telegramApiUrl.replace(/\/+$/, '');
        
        job.status = 'downloading';

        // 1. Trigger File Indexing via getFile
        debugLogger.info("Downloader", `Requesting file path for: ${job.fileName} (ID: ${job.fileId})`);
        
        let filePath = '';
        try {
            const getFileUrl = `${telegramApiUrl}/bot${token}/getFile?file_id=${job.fileId}`;
            const fileInfoRes = await axios.get(getFileUrl);
            filePath = fileInfoRes.data?.result?.file_path;
        } catch (err: any) {
            const description = err.response?.data?.description || "";
            if (description.includes("file is too big")) {
                debugLogger.error("Downloader", `SERVER LIMIT: ${job.fileName} is too big for your server's current configuration. Please increase --max-download-size on your Telegram Bot API server.`);
                throw new Error("File is too big for server configuration. Increase --max-download-size.");
            }
            debugLogger.error("Downloader", `getFile failed for ${job.fileName}`, err.message);
            throw err;
        }

        if (!filePath) throw new Error("No file path found in API response");

        // 2. Binary Download - Intelligent Routing
        let response;
        let finalDownloadUrl = '';

        if (filePath.startsWith('/')) {
            // LOCAL MODE: Convert absolute disk path to Nginx File Server URL (Port 9000)
            const LOCAL_PREFIX = '/var/lib/telegram-bot-api/';
            let relativePart = filePath;
            
            if (filePath.startsWith(LOCAL_PREFIX)) {
                relativePart = filePath.substring(LOCAL_PREFIX.length);
            }
            
            // Derive Nginx URL: Replace API port (8181) with File Server port (9000)
            // If the URL has no port, we default to host:9000
            const urlObj = new URL(telegramApiUrl);
            const host = urlObj.hostname;
            const protocol = urlObj.protocol;
            finalDownloadUrl = `${protocol}//${host}:9000/${relativePart.replace(/^\/+/, '')}`;
            
            debugLogger.info("Downloader", `Local Mode detected. Routing to Nginx: ${finalDownloadUrl}`);
        } else {
            // STANDARD MODE: Use the /file/bot endpoint
            finalDownloadUrl = `${telegramApiUrl}/file/bot${token}/${filePath.replace(/^\/+/, '')}`;
            debugLogger.info("Downloader", `Standard Mode detected. Using proxy path: ${finalDownloadUrl}`);
        }
        
        const MAX_ATTEMPTS = 10;
        const RETRY_DELAY = 1500;

        debugLogger.info("Downloader", `Starting download probe loop for ${job.fileName}...`);

        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
            try {
                debugLogger.debug("Downloader", `Attempt ${attempt}/${MAX_ATTEMPTS}: GET ${finalDownloadUrl}`);
                const res = await axios({ 
                    url: finalDownloadUrl, 
                    method: 'GET', 
                    responseType: 'stream', 
                    timeout: 15000 
                });
                
                if (res.status === 200 || res.status === 206) {
                    response = res;
                    debugLogger.info("Downloader", `✅ Success! File is reachable at attempt ${attempt}`);
                    break;
                }
            } catch (e: any) {
                if (e.response?.status === 404 && attempt < MAX_ATTEMPTS) {
                    debugLogger.warn("Downloader", `File not ready (404) at attempt ${attempt}. Waiting ${RETRY_DELAY}ms...`);
                    await this.sleep(RETRY_DELAY);
                    continue;
                }
                
                const status = e.response?.status || 'ERR';
                debugLogger.error("Downloader", `Download probe failed at attempt ${attempt} [Status: ${status}]`, e.message);
                throw e;
            }
        }

        if (!response) throw new Error(`Download failed after ${MAX_ATTEMPTS} attempts (Server returned 404)`);

        // 3. Setup Filesystem
        const targetDir = job.subfolder ? path.join(this.downloadDir, job.subfolder) : this.downloadDir;
        this.ensureDownloadDir(targetDir);
        
        const localPath = path.join(targetDir, job.fileName);
        let finalPath = localPath;
        let counter = 1;
        while (fs.existsSync(finalPath)) {
            const ext = path.extname(localPath);
            const base = path.basename(localPath, ext);
            finalPath = path.join(targetDir, `${base}_${counter}${ext}`);
            counter++;
        }

        const writer = fs.createWriteStream(finalPath);
        const totalLength = parseInt(response.headers['content-length'], 10) || job.size;
        let downloadedLength = 0;
        let startTime = Date.now();
        let lastUpdateTime = Date.now();

        return new Promise<void>((resolve, reject) => {
            response.data.on('data', (chunk: Buffer) => {
                downloadedLength += chunk.length;
                const now = Date.now();
                if (now - lastUpdateTime > 500) {
                    const elapsed = (now - startTime) / 1000;
                    job.progress = Math.round((downloadedLength / totalLength) * 100);
                    job.speed = this.formatSpeed(downloadedLength / elapsed);
                    lastUpdateTime = now;
                }
            });

            response.data.pipe(writer);
            writer.on('finish', async () => {
                job.status = 'completed';
                job.progress = 100;
                await registerDownload(job.fileHash, job.folderId, finalPath, job.size, 'completed');
                resolve();
            });
            writer.on('error', async (err) => {
                job.status = 'failed';
                await registerDownload(job.fileHash, job.folderId, finalPath, job.size, 'failed', err.message);
                reject(err);
            });
        });
    }

    private formatSpeed(bytesPerSec: number): string {
        if (bytesPerSec === 0) return '0 B/s';
        const k = 1024;
        const sizes = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
        const i = Math.floor(Math.log(bytesPerSec) / Math.log(k));
        return parseFloat((bytesPerSec / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    public async getDownloadedFiles(folderId?: string) {
        const db = getDb();
        let sql = 'SELECT * FROM download_registry';
        const params = [];
        if (folderId) {
            sql += ' WHERE folder_id = ?';
            params.push(folderId);
        }
        return await db.all(sql, params);
    }
}
