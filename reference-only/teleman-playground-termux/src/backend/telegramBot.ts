
import axios from 'axios';
import { getDb } from './db.js';
import { AutoSyncer } from './autosyncer.js';
import { debugLogger } from './debugLogger.js';
import { NetworkMonitor } from './networkMonitor.js';

export class TelegramBotService {
    private token: string | null = null;
    private autoSyncer: AutoSyncer;
    private offset: number = 0;
    private pollingActive: boolean = false;

    public isPaused: boolean = false;

    constructor(autoSyncer: AutoSyncer) {
        this.autoSyncer = autoSyncer;
        this.isPaused = process.env.DISABLE_BOT_POLLING === 'true';
    }

    private get telegramApiUrl(): string {
        return NetworkMonitor.getInstance().getActiveApiUrl();
    }

    public stopPolling() {
        this.pollingActive = false;
        this.isPaused = true;
        console.log("[Telegram] Polling stopped by request.");
    }

    public resumePolling(token: string) {
        this.isPaused = false;
        this.startPolling(token);
    }

    public startPolling(token: string) {
        if (this.isPaused) {
            console.log("[Telegram] Polling skipped (paused).");
            return;
        }

        if (this.pollingActive) {
            console.log("[Telegram] Polling already active, restarting with new token if changed.");
            this.pollingActive = false; // Stop current loop
            setTimeout(() => this.startPolling(token), 1000);
            return;
        }

        this.token = token;
        this.pollingActive = true;
        this.offset = 0;
        console.log(`[Telegram] Starting Polling for bot: ${token.substring(0, 5)}...`);

        this.pollLoop();
    }

    private async pollLoop() {
        if (!this.token || !this.pollingActive) return;

        try {
            const url = `${this.telegramApiUrl}/bot${this.token}/getUpdates?offset=${this.offset}&timeout=30`;
            const res = await axios.get(url, { timeout: 35000 }); // 35s timeout for long polling

            if (res.data && res.data.ok) {
                const updates = res.data.result;
                if (updates.length > 0) {
                    for (const update of updates) {
                        this.offset = update.update_id + 1;
                        await this.handleUpdate(update);
                    }
                }
            }
        } catch (e: any) {
            if (e.code !== 'ECONNABORTED') {
                console.error("[Telegram] Polling Error:", e.message);
                await new Promise(r => setTimeout(r, 5000)); // Backoff on error
            }
        }

        if (this.pollingActive) {
            setImmediate(() => this.pollLoop());
        }
    }

    private async handleUpdate(update: any) {
        try {
            if (update.callback_query) {
                await this.handleCallbackQuery(update.callback_query);
            } else if (update.inline_query) {
                await this.handleInlineQuery(update.inline_query);
            }
        } catch (e: any) {
            console.error("[Telegram] Update Handler Error:", e.message);
        }
    }

    private async handleCallbackQuery(query: any) {
        const { id, data, message } = query;
        if (!data) return;

        debugLogger.info("TelegramBot", `Callback: ${data}`);

        // Format: action:param
        const [action, param] = data.split(':');
        let responseText = "";
        let showAlert = false;

        try {
            switch (action) {
                case 'undo':
                    if (param) {
                        // Show "processing" notification immediately?
                        await this.answerCallbackQuery(id, "⏳ Undoing...");
                        const result = await this.autoSyncer.undoJob(param);
                        responseText = `Undo Complete: ${result.deleted} deleted, ${result.failed} failed.`;
                        showAlert = true;

                        // Update the message trigger button to show "Undone"
                        // Or maybe delete the message itself if it was the summary?
                        // The user clicked "Undo" on the "Sync Complete" message. That message is useful to keep as a "Undone" record?
                        // Let's Edit the message to say "UNDONE".
                        if (message) {
                            await axios.post(`${this.telegramApiUrl}/bot${this.token}/editMessageText`, {
                                chat_id: message.chat.id,
                                message_id: message.message_id,
                                text: message.text + `\n\n🗑️ <b>SESSION UNDONE</b>`,
                                parse_mode: 'HTML',
                                reply_markup: { inline_keyboard: [] } // Remove buttons
                            });
                        }
                    }
                    break;
                case 'sync':
                    if (param) {
                        await this.answerCallbackQuery(id, "⏳ Starting Sync...");
                        // Trigger sync in background (async)
                        this.autoSyncer.runFolder(param).then(() => {
                            debugLogger.info("TelegramBot", `Sync triggered via Telegram for folder ${param}`);
                        }).catch(e => {
                            debugLogger.error("TelegramBot", `Failed to trigger sync: ${e.message}`);
                        });
                        responseText = "Sync Started!";
                    }
                    break;
                case 'dismiss':
                    if (message) {
                        await axios.post(`${this.telegramApiUrl}/bot${this.token}/deleteMessage`, {
                            chat_id: message.chat.id,
                            message_id: message.message_id
                        });
                        responseText = "Message deleted"; // Won't be seen effectively
                    }
                    break;
                default:
                    responseText = "Unknown Action";
            }
        } catch (e: any) {
            responseText = `Error: ${e.message}`;
            showAlert = true;
        }

        // Only answer if we haven't answered already (undo does early answer)
        if (action !== 'undo' && action !== 'sync') {
            await this.answerCallbackQuery(id, responseText, showAlert);
        }
    }

    private async handleInlineQuery(query: any) {
        const { id, query: searchText } = query;

        // if (!searchText || searchText.trim().length < 2) return; // Optional min length

        debugLogger.info("TelegramBot", `Inline Query: ${searchText}`);

        const db = getDb();
        // Search registry
        // We only want files that have a file_id (can be sent via cache)
        const sql = `
            SELECT file_path, file_id, size_bytes, folder_name 
            FROM registry 
            WHERE file_id IS NOT NULL 
            AND file_path LIKE ? 
            ORDER BY created_at DESC 
            LIMIT 50
        `;

        const results = await db.all(sql, [`%${searchText}%`]);
        const telegramResults = results.map((row: any, index: number) => {
            // Determine type based on file_id or extension? 
            // cached_document requires file_id. 
            // We can treat everything as a document for safety, or try to be smart if we stored type.
            // But 'document' usually works for everything. 
            // However, photos/videos have specific cached types. 
            // Let's assume everything is a document for MVP simplicity unless we stored type.
            // Actually autosyncer stores ext in path.

            return {
                type: 'document',
                id: `${id}_${index}`,
                title: row.file_path.split(/[\\/]/).pop(), // Basename
                document_file_id: row.file_id,
                description: `Size: ${Math.round(row.size_bytes / 1024)} KB • Folder: ${row.folder_name || '?'}`
            };
        });

        await axios.post(`${this.telegramApiUrl}/bot${this.token}/answerInlineQuery`, {
            inline_query_id: id,
            results: telegramResults,
            cache_time: 10, // Short cache
            is_personal: true // Results might depend on user context if we added auth later
        });
    }

    private async answerCallbackQuery(id: string, text: string, showAlert: boolean = false) {
        try {
            await axios.post(`${this.telegramApiUrl}/bot${this.token}/answerCallbackQuery`, {
                callback_query_id: id,
                text: text,
                show_alert: showAlert
            });
        } catch (e) {
            console.error("Failed to answer callback query", e);
        }
    }
}
