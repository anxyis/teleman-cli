
import axios from 'axios';
import { debugLogger } from './debugLogger.js';

interface QueueItem {
    id: string;
    method: string;
    url: string;
    data: any;
    headers: any;
    priority: number; // Higher is better
    chatId?: string;
    resolve: (value: any) => void;
    reject: (reason?: any) => void;
}

export class RateLimiter {
    private queue: QueueItem[] = [];
    private activeRequests: number = 0;
    private maxConcurrency: number = 3; // Global concurrency limit
    private chatLastRequestTime: Map<string, number> = new Map(); // Last request time per chat
    private minChatInterval: number = 1000; // 1 second per chat
    private minGlobalInterval: number = 100; // 100ms global pacing
    private lastGlobalRequestTime: number = 0;
    private isPaused: boolean = false;
    private pauseUntil: number = 0;

    constructor() {
        // Start processing loop
        this.processQueue();
    }

    public async enqueueRequest(method: string, url: string, data: any, headers: any): Promise<any> {
        return new Promise((resolve, reject) => {
            // Determine priority
            // Uploads (sendVideo, sendAudio, etc) get higher priority?
            // Or maybe heavier tasks should wait while lighter ones go through?
            // User requested "Uploads should be weighted heavier". Does that mean higher priority?
            // "Uploads should be weighted heavier than text/edit actions" usually means they consume more "tokens" or slots.
            // But here let's assume they mean *priority* in queue.
            // Actually, usually you want edits/text to be fast (interactive) and uploads to background.
            // But if the goal is "throughput", avoiding blocking uploads is good.
            // Let's stick to FIFO for now unless specific logic is requested.

            // Extract chat_id for throttling
            let chatId: string | undefined;
            if (data instanceof FormData) {
                // FormData is hard to inspect without stream reading, usually just skip throttling for complex uploads
                // or try to find chat_id field if possible?
                // Using 'form-data' package, we can't easily peek.
                // Assuming uploads are heavy and rate limit usually hits on *number* of messages.
            } else if (data && typeof data === 'object') {
                chatId = data.chat_id;
            }

            const isUpload = url.includes('sendVideo') || url.includes('sendAudio') || url.includes('sendDocument') || url.includes('sendPhoto');
            const priority = isUpload ? 10 : 1; // Prioritize uploads? Or deprioritize? User said "weighted heavier".
            // "Weighted heavier" in throttling context usually means "costs more".
            // "Weighted heavier" in priority context means "more important".
            // I will treat them as High Priority to ensure they start processing.

            const item: QueueItem = {
                id: Math.random().toString(36).substring(7),
                method,
                url,
                data,
                headers,
                priority,
                chatId,
                resolve,
                reject
            };

            this.queue.push(item);
            this.queue.sort((a, b) => b.priority - a.priority); // Sort by priority desc
        });
    }

    private async processQueue() {
        if (this.isPaused) {
            const now = Date.now();
            if (now >= this.pauseUntil) {
                this.isPaused = false;
                debugLogger.info("RateLimiter", "Resuming from 429 pause");
            } else {
                setTimeout(() => this.processQueue(), 100);
                return;
            }
        }

        if (this.activeRequests >= this.maxConcurrency || this.queue.length === 0) {
            setTimeout(() => this.processQueue(), 50);
            return;
        }

        // Find next candidate that obeys chat throttling
        const now = Date.now();

        // Global Pacing
        if (now - this.lastGlobalRequestTime < this.minGlobalInterval) {
             setTimeout(() => this.processQueue(), this.minGlobalInterval - (now - this.lastGlobalRequestTime));
             return;
        }

        let candidateIndex = -1;

        for (let i = 0; i < this.queue.length; i++) {
            const item = this.queue[i];

            // Check Chat Throttling
            if (item.chatId) {
                const lastTime = this.chatLastRequestTime.get(item.chatId) || 0;
                if (now - lastTime < this.minChatInterval) {
                    continue; // Skip this item for now
                }
            }

            candidateIndex = i;
            break;
        }

        if (candidateIndex === -1) {
            // No ready candidates (all throttled)
            setTimeout(() => this.processQueue(), 100);
            return;
        }

        // Process Candidate
        const item = this.queue.splice(candidateIndex, 1)[0];
        this.activeRequests++;
        this.lastGlobalRequestTime = Date.now();
        if (item.chatId) {
            this.chatLastRequestTime.set(item.chatId, this.lastGlobalRequestTime);
        }

        this.executeRequest(item).finally(() => {
            this.activeRequests--;
        });

        // Trigger next loop immediately to fill concurrency slots
        setImmediate(() => this.processQueue());
    }

    private async executeRequest(item: QueueItem) {
        try {
            debugLogger.debug("RateLimiter", `Exec ${item.method} ${item.url.split('/').pop()} (Q: ${this.queue.length})`);

            const response = await axios({
                method: item.method,
                url: item.url,
                data: item.data,
                headers: item.headers,
                // Pass through other axios configs if needed (timeout, etc)
                maxContentLength: Infinity,
                maxBodyLength: Infinity
            });

            item.resolve(response);

        } catch (error: any) {
            if (error.response && error.response.status === 429) {
                const retryAfter = parseInt(error.response.headers['retry-after'] || '5');
                const waitMs = (retryAfter * 1000) + 1000; // Buffer

                debugLogger.warn("RateLimiter", `Hit 429! Pausing queue for ${retryAfter}s`);

                // Re-queue item at the front (or top priority)?
                // Actually, if we hit 429, we should probably pause everything globally.
                this.isPaused = true;
                this.pauseUntil = Date.now() + waitMs;

                // Put back in queue? Or just fail?
                // Ideally retry.
                this.queue.unshift(item); // Put back at front
                // item.resolve/reject not called yet, it will be called on next attempt

            } else {
                item.reject(error);
            }
        }
    }
}

export const telegramRateLimiter = new RateLimiter();
