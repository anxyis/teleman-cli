import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import multer from 'multer';
import FormData from 'form-data';
import axios from 'axios';
import { fdir } from 'fdir';

import { initDb, getDb } from './src/backend/db.js';
import { NetworkMonitor } from './src/backend/networkMonitor.js';
import { initLogManager, getLogManager } from './src/backend/logManager.js';
import archiver from 'archiver';
import AdmZip from 'adm-zip';
import { telegramRateLimiter } from './src/backend/rateLimiter.js';
import { getScheduler } from './src/backend/scheduler.js';

// Load initial env
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

// Termux / Mobile Friendly Paths
const HOME = process.env.HOME || '.';
const DATA_DIR = process.env.DATA_DIR || './data';

// Try to default scan root to shared storage in Termux, else Home
const TERMUX_STORAGE = path.join(HOME, 'storage/shared');
const SCAN_ROOT = process.env.SCAN_ROOT || (fs.existsSync(TERMUX_STORAGE) ? TERMUX_STORAGE : HOME);

// Global Temp Directory (SSD/fast storage)
const TEMP_WORK_DIR = process.env.TEMP_WORK_DIR || path.join(DATA_DIR, 'temp_work');

// Ensure directories exist
const AVATAR_DIR = path.join(DATA_DIR, 'avatars');
const CHAT_AVATAR_DIR = path.join(AVATAR_DIR, 'chats');
const THEMES_DIR = path.join(DATA_DIR, 'themes');
const FONTS_DIR = path.join(DATA_DIR, 'fonts');
[DATA_DIR, TEMP_WORK_DIR, AVATAR_DIR, CHAT_AVATAR_DIR, THEMES_DIR, FONTS_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Initialize Database
// Initialize Database (moved to start sequence)

// Config Paths
const ENV_PATH = path.resolve(DATA_DIR, '.env');
const CONFIG_PATH = path.resolve(DATA_DIR, 'config.json');
const RESOURCES_PATH = path.resolve(DATA_DIR, 'resources.json');

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Serve Static Frontend (Single Process Mode)
const DIST_DIR = path.join(__dirname, 'dist');
if (fs.existsSync(DIST_DIR)) {
    console.log(`[Server] Serving static frontend from ${DIST_DIR}`);
    app.use(express.static(DIST_DIR));
} else {
    console.warn(`[Server] frontend build not found in ${DIST_DIR}. Make sure to run 'npm run build'.`);
}

// Serve Avatars (Safe)
app.use('/api/avatars', express.static(AVATAR_DIR));
app.use('/api/chat-avatars', express.static(CHAT_AVATAR_DIR));
app.use('/api/fonts', express.static(FONTS_DIR));

// Multer for disk storage (Telegram Proxy) - Safer for Android RAM
const UPLOAD_DIR = path.join(TEMP_WORK_DIR, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => cb(null, UPLOAD_DIR),
        filename: (req, file, cb) => cb(null, `${Date.now()}-${Math.round(Math.random() * 1E9)}-${file.originalname}`)
    })
});

// --- HELPERS ---

import { readConfig, saveConfig } from './src/backend/configManager.js';

const readResources = () => {
    if (!fs.existsSync(RESOURCES_PATH)) return {};
    try {
        return JSON.parse(fs.readFileSync(RESOURCES_PATH, 'utf-8'));
    } catch (e) {
        return {};
    }
};

const writeResources = (data: any) => {
    fs.writeFileSync(RESOURCES_PATH, JSON.stringify(data, null, 2), 'utf-8');
};

const normalizeOpenRouterApiKey = (value: string): string => {
    if (!value || typeof value !== 'string') return "";
    let key = value.trim();
    key = key.replace(/^Bearer\s+/i, '');
    key = key.replace(/^["']+|["']+$/g, '');
    return key.trim();
};

const fetchAndSaveAvatar = async (token: string, botId: string | number): Promise<string | undefined> => {
    try {
        // Always use Telegram Cloud API for avatars to ensure consistent path handling
        const CLOUD_API = "https://api.telegram.org";

        // 1. Get User Profile Photos (Requires user_id!)
        const photosRes = await axios.get(`${CLOUD_API}/bot${token}/getUserProfilePhotos?user_id=${botId}&limit=1`);

        if (!photosRes.data.ok || photosRes.data.result.total_count === 0) return undefined;

        const photos = photosRes.data.result.photos[0];
        const largestPhoto = photos[photos.length - 1]; // Last item is usually largest
        const fileId = largestPhoto.file_id;

        // 2. Get File Path
        const fileRes = await axios.get(`${CLOUD_API}/bot${token}/getFile?file_id=${fileId}`);
        if (!fileRes.data.ok) return undefined;
        const filePath = fileRes.data.result.file_path;

        // 3. Download Image from Cloud API
        const downloadUrl = `${CLOUD_API}/file/bot${token}/${filePath}`;
        console.log(`[Avatar] Downloading from Cloud: ${downloadUrl}`);

        const imageRes = await axios.get(downloadUrl, { responseType: 'stream' });

        // 4. Save to Disk
        const filename = `${botId}.jpg`; // Normalize to jpg for simplicity or detect ext
        const savePath = path.join(AVATAR_DIR, filename);

        const writer = fs.createWriteStream(savePath);
        imageRes.data.pipe(writer);

        return new Promise((resolve, reject) => {
            writer.on('finish', () => resolve(filename));
            writer.on('error', reject);
        });
    } catch (e: any) {
        console.error(`[Avatar] Failed to fetch for ${botId}:`, e.message);
        return undefined;
    }
};

const fetchChatAvatar = async (chatId: string): Promise<string | undefined> => {
    try {
        const config = readConfig();
        const token = config.active_token;
        if (!token) return undefined;

        const cleanId = String(chatId).replace('.0', '');
        const filename = `${cleanId}.jpg`;
        const localPath = path.join(CHAT_AVATAR_DIR, filename);

        if (fs.existsSync(localPath)) {
            const stats = fs.statSync(localPath);
            const ageHours = (Date.now() - stats.mtimeMs) / (1000 * 60 * 60);
            if (ageHours < 24) return filename;
        }

        const CLOUD_API = "https://api.telegram.org";
        const chatRes = await axios.get(`${CLOUD_API}/bot${token}/getChat?chat_id=${cleanId}`);
        const fileId = chatRes.data?.result?.photo?.small_file_id;
        if (!fileId) return undefined;

        const fileRes = await axios.get(`${CLOUD_API}/bot${token}/getFile?file_id=${fileId}`);
        const filePath = fileRes.data?.result?.file_path;
        if (!filePath) return undefined;

        const response = await axios({ url: `${CLOUD_API}/file/bot${token}/${filePath}`, method: 'GET', responseType: 'stream' });
        const writer = fs.createWriteStream(localPath);
        response.data.pipe(writer);

        return new Promise((resolve) => {
            writer.on('finish', () => resolve(filename));
            writer.on('error', () => resolve(undefined));
        });
    } catch (e: any) {
        return undefined;
    }
};

// --- ROUTES: CONFIG & BOTS ---

app.get('/api/config', (req, res) => {
    res.json(readConfig());
});

app.get('/api/chat-avatar/:chatId', async (req, res) => {
    const filename = await fetchChatAvatar(req.params.chatId);
    if (filename) res.json({ url: `/api/chat-avatars/${filename}` });
    else res.status(404).json({ error: "Not found" });
});

app.post('/api/bots', async (req, res) => {
    let { name, token, set_active } = req.body;

    // Validate token format
    if (!token || typeof token !== 'string' || !token.includes(':') || token.length < 20 || token === "123456789:ABC-DEF1234567890") {
        return res.status(400).json({ error: "Invalid bot token format." });
    }

    const config = readConfig();

    // Check if bot already exists
    const existingIndex = config.saved_bots.findIndex((b: any) => b.token === token);

    // Optimization: If bot exists and we are just switching workspace (set_active=true),
    // skip network calls entirely. Instant switch.
    if (existingIndex >= 0) {
        console.log(`[Bot] Token ${token.slice(0, 5)}... already saved.`);
        if (set_active) {
            console.log(`[Bot] Switching active bot to existing entry.`);
            config.active_token = token;
            saveConfig(config);
        }
        return res.json(config);
    }

    // --- NEW BOT ADDITION FLOW ONLY ---
    // We only fetch metadata/avatar if it's a NEW bot.
    // Existing bots must use 'Refresh' endpoint to update data.

    let botId = token.split(':')[0];
    let avatarFilename: string | undefined;
    const CLOUD_API = "https://api.telegram.org";

    console.log(`[Bot] New token detected. Fetching metadata...`);
    try {
        const meRes = await axios.get(`${CLOUD_API}/bot${token}/getMe`, { timeout: 10000 });
        if (meRes.data.ok) {
            const botUser = meRes.data.result;
            botId = botUser.id; // Confirm ID
            if (!name || name.trim() === "") {
                name = botUser.first_name + (botUser.username ? ` (@${botUser.username})` : '') || "Unknown Bot";
            }

            // Fetch Avatar only on add
            avatarFilename = await fetchAndSaveAvatar(token, botId);

        } else {
            return res.status(400).json({ error: meRes.data.description || "Invalid bot token" });
        }
    } catch (e: any) {
        console.error(`[Bot] Error fetching info:`, e.message);
        // Fallback to local
        try {
             const localApiUrl = getTelegramApiUrl();
             if (localApiUrl && localApiUrl !== CLOUD_API) {
                 const localMe = await axios.get(`${localApiUrl}/bot${token}/getMe`, { timeout: 5000 });
                 if (localMe.data.ok) {
                     const botUser = localMe.data.result;
                     botId = botUser.id;
                     if (!name || name.trim() === "") {
                        name = botUser.first_name + (botUser.username ? ` (@${botUser.username})` : '') || "Unknown Bot";
                     }
                 }
             }
        } catch (localErr) {}
        if (!name) name = "Unknown Bot";
    }

    const newBotEntry = {
        name,
        token,
        avatar_filename: avatarFilename
    };

    config.saved_bots.push(newBotEntry);

    if (set_active) {
        config.active_token = token;
    }

    saveConfig(config);
    res.json(config);
});

app.delete('/api/bots/:token', (req, res) => {
    const { token } = req.params;
    const config = readConfig();

    config.saved_bots = config.saved_bots.filter((b: any) => b.token !== token);
    if (config.active_token === token) {
        config.active_token = "";
    }

    saveConfig(config);
    res.json(config);
});

// Refresh Bot Data
app.post('/api/bots/:token/refresh', async (req, res) => {
    const { token } = req.params;
    const config = readConfig();
    const botIndex = config.saved_bots.findIndex((b: any) => b.token === token);

    if (botIndex === -1) {
        return res.status(404).json({ error: "Bot not found" });
    }

    try {
        const CLOUD_API = "https://api.telegram.org";
        const meRes = await axios.get(`${CLOUD_API}/bot${token}/getMe`, { timeout: 10000 });

        if (meRes.data.ok) {
            const botUser = meRes.data.result;
            const newName = botUser.first_name + (botUser.username ? ` (@${botUser.username})` : '');

            // Fetch Avatar (Always uses Cloud API internally)
            const avatarFilename = await fetchAndSaveAvatar(token, botUser.id);

            // Update Config
            config.saved_bots[botIndex].name = newName;
            if (avatarFilename) {
                config.saved_bots[botIndex].avatar_filename = avatarFilename;
            }

            saveConfig(config);
            res.json({ success: true, bot: config.saved_bots[botIndex] });
        } else {
            res.status(400).json({ error: "Telegram API Error: " + meRes.data.description });
        }
    } catch (e: any) {
        res.status(500).json({ error: "Failed to refresh: " + e.message });
    }
});

// Font Preview Settings
app.post('/api/config/font', (req, res) => {
    const config = readConfig();
    config.font_preview = req.body;
    saveConfig(config);
    res.json({ success: true });
});

// Network Settings
app.post('/api/config/network', (req, res) => {
    const { telegram_api_url, telegram_api_fallback, tailscale_api_url, active_network_mode } = req.body;
    const config = readConfig();
    
    if (telegram_api_url) {
        config.telegram_api_url = telegram_api_url;
    }
    if (telegram_api_fallback !== undefined) {
        config.telegram_api_fallback = telegram_api_fallback;
    }
    if (tailscale_api_url !== undefined) {
        config.tailscale_api_url = tailscale_api_url;
    }
    if (active_network_mode && ['primary', 'fallback', 'tailscale'].includes(active_network_mode)) {
        config.active_network_mode = active_network_mode;
    }
    
    saveConfig(config);
    res.json({ success: true });
});

// AI Settings
app.post('/api/config/ai', (req, res) => {
    const { openrouter_enabled, openrouter_api_key, openrouter_model } = req.body || {};
    const config = readConfig();

    if (!config.ai || typeof config.ai !== 'object') {
        config.ai = {};
    }

    config.ai.openrouter_enabled = openrouter_enabled === true;
    if (typeof openrouter_api_key === 'string') {
        config.ai.openrouter_api_key = normalizeOpenRouterApiKey(openrouter_api_key);
    }
    if (typeof openrouter_model === 'string') {
        config.ai.openrouter_model = openrouter_model.trim();
    }

    saveConfig(config);
    res.json({ success: true });
});

// OpenRouter free models
app.get('/api/ai/openrouter/models', async (req, res) => {
    try {
        const config = readConfig();
        const apiKey = normalizeOpenRouterApiKey(config.ai?.openrouter_api_key || "");
        if (!apiKey) {
            return res.status(400).json({ error: "OpenRouter API key is not configured." });
        }

        const response = await axios.get('https://openrouter.ai/api/v1/models', {
            timeout: 20000,
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'HTTP-Referer': req.headers.origin || `http://${req.headers.host}`,
                'X-Title': 'TeleMan Playground'
            }
        });

        const models = Array.isArray(response.data?.data) ? response.data.data : [];
        const freeModels = models
            .filter((m: any) => {
                const id = String(m?.id || '').toLowerCase();
                const promptPrice = String(m?.pricing?.prompt ?? '');
                const completionPrice = String(m?.pricing?.completion ?? '');
                return id.includes(':free') || (promptPrice === '0' && completionPrice === '0');
            })
            .map((m: any) => ({
                id: m.id,
                name: m.name || m.id,
                context_length: m.context_length || 0
            }))
            .sort((a: any, b: any) => a.name.localeCompare(b.name));

        res.json({ models: freeModels });
    } catch (e: any) {
        if (e.response?.status === 401) {
            return res.status(401).json({ error: "OpenRouter authentication failed (401). Re-save your API key in Settings > AI (without 'Bearer ')." });
        }
        const msg = e.response?.data?.error?.message || e.response?.data?.message || e.message;
        res.status(500).json({ error: msg || "Failed to fetch OpenRouter models." });
    }
});

// Generate Telegram JSON params from prompt
app.post('/api/ai/openrouter/generate-json', async (req, res) => {
    try {
        const { method, prompt, token } = req.body || {};
        if (!prompt || typeof prompt !== 'string') {
            return res.status(400).json({ error: "Prompt is required." });
        }
        const methodHint = (typeof method === 'string' && method.trim()) ? method.trim() : '';

        const config = readConfig();
        const ai = config.ai || {};
        if (!ai.openrouter_enabled) {
            return res.status(400).json({ error: "OpenRouter is disabled in settings." });
        }
        const apiKey = normalizeOpenRouterApiKey(ai.openrouter_api_key || "");
        if (!apiKey) {
            return res.status(400).json({ error: "OpenRouter API key is missing." });
        }
        if (!ai.openrouter_model) {
            return res.status(400).json({ error: "OpenRouter model is not selected." });
        }

        const activeToken = (typeof token === 'string' && token.trim()) ? token.trim() : (config.active_token || "");
        const allResources = readResources();
        const tokenResources = allResources[activeToken] || { users: [], chats: [], topics: [] };
        const users = Array.isArray(tokenResources.users) ? tokenResources.users : [];
        const chats = Array.isArray(tokenResources.chats) ? tokenResources.chats : [];
        const topics = Array.isArray(tokenResources.topics) ? tokenResources.topics : [];

        const targetCatalog = [
            ...users.map((u: any) => ({
                type: 'user',
                id: String(u.id),
                name: `${u.first_name || ''} ${u.last_name || ''}`.trim(),
                username: u.username ? `@${u.username}` : ''
            })),
            ...chats.map((c: any) => ({
                type: 'chat',
                id: String(c.id),
                name: String(c.title || c.first_name || c.username || c.id || ''),
                username: c.username ? `@${c.username}` : ''
            })),
            ...topics.map((t: any) => ({
                type: 'topic',
                id: `${t.chat_id}:${t.thread_id}`,
                chat_id: String(t.chat_id),
                thread_id: String(t.thread_id),
                name: String(t.name || `Topic ${t.thread_id}`),
                username: ''
            }))
        ];

        const promptLower = prompt.toLowerCase();
        const matchedTargets = targetCatalog.filter((target: any) => {
            const name = String(target.name || '').toLowerCase();
            const username = String(target.username || '').toLowerCase();
            return (name && promptLower.includes(name)) || (username && promptLower.includes(username));
        });

        const resolvedTarget = matchedTargets.length === 1 ? matchedTargets[0] : null;

        const systemPrompt =
            "You generate Telegram Bot API request plans. " +
            "Return ONLY valid JSON object text with this shape: " +
            "{\"method\":\"telegramMethodName\",\"params\":{...}}. " +
            "No markdown fences, no commentary. " +
            "When a target is provided, map it to Telegram fields accurately: chat_id and message_thread_id for topics.";

        const userPrompt =
            `Method hint (optional): ${methodHint || 'none'}\n` +
            `User intent: ${prompt}\n` +
            `Saved targets for this bot (JSON): ${JSON.stringify(targetCatalog)}\n` +
            `Resolved target from prompt (if any): ${JSON.stringify(resolvedTarget)}\n` +
            "Choose the best Telegram Bot API method for the intent and output strictly JSON with method + params.";

        // Candidate models: selected model first, then other free models as fallback.
        const modelCandidates: string[] = [ai.openrouter_model];
        try {
            const modelsRes = await axios.get('https://openrouter.ai/api/v1/models', {
                timeout: 15000,
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    'HTTP-Referer': req.headers.origin || `http://${req.headers.host}`,
                    'X-Title': 'TeleMan Playground'
                }
            });
            const models = Array.isArray(modelsRes.data?.data) ? modelsRes.data.data : [];
            const freeIds = models
                .filter((m: any) => {
                    const id = String(m?.id || '').toLowerCase();
                    const promptPrice = String(m?.pricing?.prompt ?? '');
                    const completionPrice = String(m?.pricing?.completion ?? '');
                    return id.includes(':free') || (promptPrice === '0' && completionPrice === '0');
                })
                .map((m: any) => String(m.id))
                .filter((id: string) => id && id !== ai.openrouter_model);
            modelCandidates.push(...freeIds.slice(0, 8));
        } catch (e) {
            // Ignore model-list failure and proceed with selected model only.
        }

        const tried: string[] = [];
        let lastError = "Unknown provider error.";

        for (const modelId of modelCandidates) {
            for (let attempt = 1; attempt <= 2; attempt++) {
                tried.push(`${modelId}#${attempt}`);
                try {
                    const aiRes = await axios.post(
                        'https://openrouter.ai/api/v1/chat/completions',
                        {
                            model: modelId,
                            messages: [
                                { role: 'system', content: systemPrompt },
                                { role: 'user', content: userPrompt }
                            ],
                            temperature: 0.1,
                            provider: {
                                allow_fallbacks: true
                            }
                        },
                        {
                            timeout: 30000,
                            headers: {
                                Authorization: `Bearer ${apiKey}`,
                                'Content-Type': 'application/json',
                                'HTTP-Referer': req.headers.origin || `http://${req.headers.host}`,
                                'X-Title': 'TeleMan Playground'
                            }
                        }
                    );

                    const rawText = aiRes.data?.choices?.[0]?.message?.content;
                    if (!rawText || typeof rawText !== 'string') {
                        throw new Error("Model returned empty content.");
                    }

                    let parsed: any;
                    try {
                        parsed = JSON.parse(rawText);
                    } catch {
                        const cleaned = rawText.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/, '').trim();
                        parsed = JSON.parse(cleaned);
                    }

                    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
                        throw new Error("Model response was not a JSON object.");
                    }
                    const inferredMethod = typeof parsed.method === 'string' ? parsed.method.trim() : '';
                    const inferredParams = parsed.params;

                    // Backward compatibility fallback: old format where model returned params only.
                    if (!inferredMethod || !inferredParams || typeof inferredParams !== 'object' || Array.isArray(inferredParams)) {
                        if (!methodHint) {
                            throw new Error("Model response missing method/params shape.");
                        }
                        if (Array.isArray(parsed) || typeof parsed !== 'object') {
                            throw new Error("Model params shape invalid.");
                        }
                        return res.json({ method: methodHint, json: parsed, model_used: modelId });
                    }

                    return res.json({ method: inferredMethod, json: inferredParams, model_used: modelId });
                } catch (err: any) {
                    const status = err.response?.status || 0;
                    const msg = err.response?.data?.error?.message || err.response?.data?.message || err.message || 'Provider error';
                    lastError = msg;

                    const retryable = status === 429 || status >= 500 || /provider returned error|timeout|overloaded/i.test(String(msg).toLowerCase());
                    if (!retryable) break;
                    if (attempt < 2) {
                        await new Promise(r => setTimeout(r, 400 * attempt));
                    }
                }
            }
        }

        return res.status(502).json({
            error: `OpenRouter request failed after retries: ${lastError}`,
            tried_models: tried
        });
    } catch (e: any) {
        const status = e.response?.status;
        const msg = e.response?.data?.error?.message || e.response?.data?.message || e.message;
        if (status === 401) {
            return res.status(401).json({ error: "OpenRouter authentication failed (401). Re-save your API key in Settings > AI (without 'Bearer ')." });
        }
        res.status(500).json({ error: msg || "Failed to generate JSON." });
    }
});

// Get network status
app.get('/api/network/status', (req, res) => {
    const monitor = NetworkMonitor.getInstance();
    const error = monitor.getNetworkError();
    res.json({
        ...monitor.getNetworkStatus(),
        error: error
    });
});

// Clear network error (after user acknowledges)
app.post('/api/network/clear-error', (req, res) => {
    const monitor = NetworkMonitor.getInstance();
    monitor.clearNetworkError();
    res.json({ success: true });
});

// Switch network mode
app.post('/api/network/switch', async (req, res) => {
    try {
        const { mode } = req.body;
        if (!mode || !['primary', 'fallback', 'tailscale'].includes(mode)) {
            return res.status(400).json({ error: 'Invalid network mode' });
        }
        
        const monitor = NetworkMonitor.getInstance();
        const result = await monitor.switchMode(mode as 'primary' | 'fallback' | 'tailscale');
        
        if (result.success) {
            res.json({ success: true, mode });
        } else {
            res.status(400).json({ error: result.error });
        }
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Font Background Upload
app.post('/api/config/font/bg', upload.single('background'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No file provided" });
    try {
        const targetPath = path.join(DATA_DIR, 'font_bg.png');
        fs.copyFileSync(req.file.path, targetPath);
        fs.unlinkSync(req.file.path);
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// --- ROUTES: RESOURCES ---

app.get('/api/resources/:token', (req, res) => {
    const { token } = req.params;
    const allResources = readResources();
    res.json(allResources[token] || { users: [], chats: [], topics: [] });
});

app.post('/api/resources/:token', (req, res) => {
    const { token } = req.params;
    console.log(`[Resources] Saving resources for token: ${token}`);

    const newResources = req.body;
    const allResources = readResources();

    // Get existing resources for this token
    const current = allResources[token] || { users: [], chats: [], topics: [] };

    // --- MERGE USERS ---
    const usersMap = new Map();
    (current.users || []).forEach((u: any) => usersMap.set(u.id, u));
    (newResources.users || []).forEach((u: any) => usersMap.set(u.id, u));
    const mergedUsers = Array.from(usersMap.values());

    // --- MERGE CHATS ---
    const chatsMap = new Map();
    (current.chats || []).forEach((c: any) => chatsMap.set(c.id, c));
    (newResources.chats || []).forEach((c: any) => chatsMap.set(c.id, c));
    const mergedChats = Array.from(chatsMap.values());

    // --- MERGE TOPICS ---
    const topicsMap = new Map();
    const getTopicKey = (t: any) => `${t.chat_id}:${t.thread_id}`;
    (current.topics || []).forEach((t: any) => topicsMap.set(getTopicKey(t), t));
    (newResources.topics || []).forEach((t: any) => topicsMap.set(getTopicKey(t), t));
    const mergedTopics = Array.from(topicsMap.values());

    allResources[token] = {
        users: mergedUsers,
        chats: mergedChats,
        topics: mergedTopics
    };

    try {
        writeResources(allResources);
        console.log(`[Resources] Saved. Counts -> U:${mergedUsers.length}, C:${mergedChats.length}, T:${mergedTopics.length}`);
        res.json({ success: true, counts: { users: mergedUsers.length, chats: mergedChats.length, topics: mergedTopics.length } });
    } catch (e: any) {
        console.error(`[Resources] Error writing file:`, e);
        res.status(500).json({ error: e.message });
    }
});

// Update folder
app.put('/api/folders/:id', async (req, res) => {
    try {
        const { name, sourcePath, targetChatId, presetId, targetTopicId } = req.body;
        await autoSyncer.updateFolder(req.params.id, name, sourcePath, targetChatId, presetId, targetTopicId);
        res.json({ success: true });
    } catch (e: any) {
        if (e.message.includes("Duplicate")) {
            res.status(409).json({ error: e.message }); // 409 Conflict
        } else {
            res.status(500).json({ error: e.message });
        }
    }
});

// --- ROUTES: TELEGRAM PROXY ---

// Local Telegram Support - Uses NetworkMonitor for active API URL
const getTelegramApiUrl = () => {
    return NetworkMonitor.getInstance().getActiveApiUrl();
};

// Initialize network monitor on server start
const networkMonitor = NetworkMonitor.getInstance();

// Handle GET requests (e.g., getMe, getUpdates without body)
app.get('/telegram-api/bot:token/:method', async (req, res) => {
    const { token, method } = req.params;

    if (token === "123456789:ABC-DEF1234567890") {
        return res.status(400).json({ ok: false, description: "NO_BOT_TOKEN", error: "Please configure a valid bot token in Settings." });
    }

    const telegramUrl = `${getTelegramApiUrl()}/bot${token}/${method}`;

    console.log(`[Proxy] GET Forwarding to ${method}`);

    // Auto-pause backend polling when getUpdates is called via proxy (e.g., from Playground)
    const wasPolling = !telegramBot.isPaused;
    if (method.toLowerCase() === 'getupdates' && wasPolling) {
        console.log(`[Proxy] Pausing backend polling for getUpdates request`);
        telegramBot.stopPolling();
    }

    try {
        // Use Rate Limiter
        const response = await telegramRateLimiter.enqueueRequest('GET', telegramUrl, null, {
            params: req.query
        });
        res.json(response.data);
    } catch (error: any) {
        console.error(`[Proxy] GET Error: ${error.message}`);
        if (error.response) {
            res.status(error.response.status).json(error.response.data);
        } else {
            res.status(500).json({ ok: false, description: error.message });
        }
    } finally {
        // Resume polling after getUpdates completes (if it was active before)
        if (method.toLowerCase() === 'getupdates' && wasPolling) {
            console.log(`[Proxy] Resuming backend polling after getUpdates`);
            const activeToken = readConfig().active_token;
            if (activeToken) {
                telegramBot.resumePolling(activeToken);
            }
        }
    }
});

// Handle any Telegram method with POST
// We use 'upload.any()' to accept any files in the form data
app.post('/telegram-api/bot:token/:method', upload.any(), async (req, res) => {
    const { token, method } = req.params;

    if (token === "123456789:ABC-DEF1234567890") {
        return res.status(400).json({ ok: false, description: "NO_BOT_TOKEN", error: "Please configure a valid bot token in Settings." });
    }

    const telegramUrl = `${getTelegramApiUrl()}/bot${token}/${method}`;
    const uploadedFiles = (req.files as Express.Multer.File[]) || [];

    console.log(`[Proxy] Forwarding to ${method}`);
    console.log(`[Proxy] Body Keys:`, req.body ? Object.keys(req.body) : []);
    if (uploadedFiles.length > 0) {
        console.log(`[Proxy] Files:`, uploadedFiles.map(f => f.fieldname));
    } else {
        console.log(`[Proxy] No Files`);
    }

    try {
        let response;

        // Check if we have files
        if (uploadedFiles.length > 0) {
            const form = new FormData();

            // Append regular fields
            for (const key in req.body) {
                form.append(key, req.body[key]);
            }

            // Append files (From Disk)
            uploadedFiles.forEach(file => {
                // Create stream from temp file
                form.append(file.fieldname, fs.createReadStream(file.path), {
                    filename: file.originalname,
                    contentType: file.mimetype,
                });
            });

            // Send via Rate Limiter
            response = await telegramRateLimiter.enqueueRequest('POST', telegramUrl, form, {
                ...form.getHeaders()
            });

        } else {
            // Just JSON/Form body
            // Send via Rate Limiter
            response = await telegramRateLimiter.enqueueRequest('POST', telegramUrl, req.body, {});
        }

        res.json(response.data);

    } catch (error: any) {
        console.error(`[Proxy] Error: ${error.message}`);
        if (error.response) {
            res.status(error.response.status).json(error.response.data);
        } else {
            res.status(500).json({ ok: false, description: error.message });
        }
    } finally {
        // CLEANUP: Delete temp files
        if (uploadedFiles.length > 0) {
            uploadedFiles.forEach(file => {
                fs.unlink(file.path, (err) => {
                    if (err) console.error(`[Proxy] Failed to delete temp file ${file.path}`, err);
                });
            });
        }
    }
});

// --- ROUTES: FILE SCANNING ---

app.post('/api/scan', async (req, res) => {
    const { path: subPath } = req.body; // Optional subpath

    // Determine where to scan. Default to SCAN_ROOT.
    // If user provides a path, we should check if it's safe or just ignore it 
    // and scan SCAN_ROOT for this "Auto-Sync" MVP.
    // The user requirement says "Bind Mounts... backend can see...". 
    // Let's scan SCAN_ROOT recursively.

    const targetPath = SCAN_ROOT;

    console.log(`[Scan] Scanning directory: ${targetPath}`);

    if (!fs.existsSync(targetPath)) {
        console.log(`[Scan] Target path does not exist, creating...`);
        try {
            fs.mkdirSync(targetPath, { recursive: true });
        } catch (e) {
            return res.status(500).json({ error: "Could not create scan directory" });
        }
    }

    try {
        const api = new fdir().withFullPaths().crawl(targetPath);
        const files = await api.withPromise();
        console.log(`[Scan] Found ${files.length} files.`);
        res.json(files);
    } catch (e: any) {
        console.error(`[Scan] Error:`, e);
        res.status(500).json({ error: e.message });
    }
});

// --- AUTO-SYNCER API ---
import { AutoSyncer } from './src/backend/autosyncer.js';
import { TelegramBotService } from './src/backend/telegramBot.js';
import { Downloader } from './src/backend/downloader.js';

const autoSyncer = new AutoSyncer(TEMP_WORK_DIR, SCAN_ROOT);
const telegramBot = new TelegramBotService(autoSyncer);
const downloader = Downloader.getInstance();

// --- REVERSE SYNCER (DOWNLOADER) ---

app.get('/api/downloader/queue', (req, res) => {
    res.json({
        active: downloader.getActiveJob(),
        queue: downloader.getQueue()
    });
});

app.post('/api/downloader/enqueue', async (req, res) => {
    const { files, useCloudFallback } = req.body;
    if (!files || !Array.isArray(files)) return res.status(400).json({ error: "Invalid files list" });
    
    // Inject fallback preference into each file job
    const enrichedFiles = files.map(f => ({
        ...f,
        useCloudFallback: useCloudFallback !== undefined ? useCloudFallback : true
    }));

    await downloader.addToQueue(enrichedFiles);
    res.json({ status: 'queued' });
});

app.get('/api/downloader/status', async (req, res) => {
    const { folderId } = req.query;
    const downloaded = await downloader.getDownloadedFiles(folderId as string);
    res.json(downloaded);
});

app.get('/api/downloader/files', async (req, res) => {
    try {
        const db = getDb();
        // Get all files from registry, joined with download status
        const files = await db.all(`
            SELECT 
                r.*, 
                d.status as download_status, 
                d.downloaded_at,
                d.local_path as download_path
            FROM registry r
            LEFT JOIN download_registry d ON r.file_hash = d.file_hash AND r.folder_id = d.folder_id
            ORDER BY r.synced_at DESC
        `);
        res.json(files);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/downloader/browser-download', async (req, res) => {
    const { fileId, fileName } = req.query;
    if (!fileId) return res.status(400).send("Missing fileId");

    try {
        const token = readConfig().active_token;
        const telegramApiUrl = NetworkMonitor.getInstance().getActiveApiUrl().replace(/\/+$/, '');
        
        // 1. Get file path
        const fileInfoRes = await axios.get(`${telegramApiUrl}/bot${token}/getFile?file_id=${fileId}`);
        const filePath = fileInfoRes.data?.result?.file_path;
        if (!filePath) throw new Error("Could not resolve file path");

        let downloadUrl = '';
        if (filePath.startsWith('/')) {
            // Local Nginx logic
            const urlObj = new URL(telegramApiUrl);
            downloadUrl = `${urlObj.protocol}//${urlObj.hostname}:9000/${filePath.replace('/var/lib/telegram-bot-api/', '').replace(/^\/+/, '')}`;
        } else {
            downloadUrl = `${telegramApiUrl}/file/bot${token}/${filePath}`;
        }

        // 2. Fetch from source
        const response = await axios({
            url: downloadUrl,
            method: 'GET',
            responseType: 'stream'
        });

        // 3. Forward original headers
        const contentType = response.headers['content-type'] || 'application/octet-stream';
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', `attachment; filename="${fileName || 'file'}"`);
        if (response.headers['content-length']) {
            res.setHeader('Content-Length', response.headers['content-length']);
        }
        
        // 4. Stream to browser
        response.data.pipe(res);
    } catch (e: any) {
        console.error("[BrowserDownload] Error:", e.message);
        res.status(500).send("Download failed: " + e.message);
    }
});

app.get('/api/downloader/search', async (req, res) => {
    const { q, folderName } = req.query;
    if (!q || typeof q !== 'string') return res.json([]);

    try {
        const db = getDb();
        const tokens = q.trim().toLowerCase().split(/\s+/).filter(t => t.length > 0);
        if (tokens.length === 0) return res.json([]);

        // System prefix to ignore
        const SYSTEM_PREFIX = '/data/data/com.termux/files/home/';

        // Construct high-accuracy LIKE query
        // We use REPLACE to strip the system prefix before searching
        let sql = `
            SELECT r.*, d.status as download_status, d.downloaded_at, d.local_path as download_path
            FROM registry r
            LEFT JOIN download_registry d ON r.file_hash = d.file_hash AND r.folder_id = d.folder_id
            WHERE 1=1
        `;
        
        const params: any[] = [];

        // Apply folder scope if needed
        if (folderName) {
            sql += ` AND r.folder_name = ? `;
            params.push(folderName);
        }

        // Apply token-based accuracy
        for (const token of tokens) {
            sql += ` AND (
                LOWER(REPLACE(r.file_path, '${SYSTEM_PREFIX}', '')) LIKE ? 
                OR LOWER(r.folder_name) LIKE ?
            ) `;
            params.push(`%${token}%`, `%${token}%`);
        }

        // Rank by filename length (shortest first) and then by date
        sql += ` ORDER BY LENGTH(r.file_path) ASC, r.synced_at DESC LIMIT 250`;

        const results = await db.all(sql, params);
        res.json(results);
    } catch (e: any) {
        console.error("[Search] SQL error:", e.message);
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/downloader/browser-download', async (req, res) => {
    const { fileId, fileName } = req.query;
    if (!fileId) return res.status(400).send("Missing fileId");

    try {
        const token = readConfig().active_token;
        const telegramApiUrl = NetworkMonitor.getInstance().getActiveApiUrl().replace(/\/+$/, '');
        
        // 1. Get file path
        const fileInfoRes = await axios.get(`${telegramApiUrl}/bot${token}/getFile?file_id=${fileId}`);
        const filePath = fileInfoRes.data?.result?.file_path;
        if (!filePath) throw new Error("Could not resolve file path");

        let downloadUrl = '';
        if (filePath.startsWith('/')) {
            // Local Nginx logic
            const urlObj = new URL(telegramApiUrl);
            downloadUrl = `${urlObj.protocol}//${urlObj.hostname}:9000/${filePath.replace('/var/lib/telegram-bot-api/', '').replace(/^\/+/, '')}`;
        } else {
            downloadUrl = `${telegramApiUrl}/file/bot${token}/${filePath}`;
        }

        // 2. Fetch from source
        const response = await axios({
            url: downloadUrl,
            method: 'GET',
            responseType: 'stream'
        });

        // 3. Forward original headers
        const contentType = response.headers['content-type'] || 'application/octet-stream';
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', `attachment; filename="${fileName || 'file'}"`);
        if (response.headers['content-length']) {
            res.setHeader('Content-Length', response.headers['content-length']);
        }
        
        // 4. Stream to browser
        response.data.pipe(res);
    } catch (e: any) {
        console.error("[BrowserDownload] Error:", e.message);
        res.status(500).send("Download failed: " + e.message);
    }
});

// Start Polling if token exists
const startBot = () => {
    const token = readConfig().active_token;
    if (token) {
        telegramBot.startPolling(token);
    } else {
        console.log("[Telegram] No bot token found/active. Polling skipped.");
    }
};

startBot(); // Start on boot

// Initialize Scheduler
const scheduler = getScheduler();
scheduler.setAutoSyncer(autoSyncer);
// Scheduler.start() called in initDb().then() after cleanup

// Polling Control API
app.post('/api/bot/polling', (req, res) => {
    const { paused } = req.body;
    const token = readConfig().active_token;

    if (paused) {
        telegramBot.stopPolling();
        res.json({ status: 'paused' });
    } else {
        if (token) {
            telegramBot.resumePolling(token);
            res.json({ status: 'active' });
        } else {
            res.status(400).json({ error: 'No token available to resume' });
        }
    }
});

app.get('/api/bot/polling', (req, res) => {
    res.json({ paused: telegramBot.isPaused });
});
// Cleaning up stored status moved to startup sequence

app.get('/api/presets', async (req, res) => {
    try {
        const presets = await autoSyncer.getPresets();
        res.json(presets);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/presets', async (req, res) => {
    try {
        const { name, rules } = req.body;
        const id = await autoSyncer.createPreset(name, rules);
        res.json({ id });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.put('/api/presets/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name, rules } = req.body; // rules object matches createPreset
        await autoSyncer.updatePreset(id, name, rules);
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/presets/:id', async (req, res) => {
    try {
        await autoSyncer.deletePreset(req.params.id);
        res.json({ success: true });
    } catch (e: any) {
        if (e.message.includes("currently used")) {
            res.status(409).json({ error: e.message }); // Conflict
        } else {
            res.status(500).json({ error: e.message });
        }
    }
});

// Sync Groups
app.get('/api/groups', async (req, res) => {
    try {
        const groups = await autoSyncer.getSyncGroups();
        // Enrich with tasks for frontend simplicity
        for (const g of groups) {
            g.tasks = await autoSyncer.getSyncTasks(g.id);
        }
        res.json(groups);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/groups', async (req, res) => {
    try {
        const { name, cron, tasks } = req.body;
        const id = await autoSyncer.createSyncGroup(name, cron);

        // Handle initial tasks if provided
        if (tasks && Array.isArray(tasks)) {
            for (const t of tasks) {
                await autoSyncer.addSyncTask(
                    id,
                    t.source_path,
                    t.target_chat_id,
                    t.target_topic_id,
                    t.preset_id,
                    t.order_index,
                    t.enabled,
                    t.custom_name
                );
            }
        }

        res.json({ id });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/groups/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const db = getDb(); // Using db directly or helper. autoSyncer doesn't have deleteGroup yet exposed or we can add it.
        // Let's use direct DB for speed or add to autoSyncer. 
        // Adding to server logic directly since autoSyncer helper methods are thin wrappers mostly.
        // But better to be consistent. Let's see if autoSyncer has it. It doesn't.
        // I will add it here interacting with DB directly for now as I can't easily edit autosyncer class AND server in one go without complexity.
        // Wait, I can just use db helper from imports.

        await db.run('DELETE FROM sync_tasks WHERE group_id = ?', [id]);
        await db.run('DELETE FROM sync_groups WHERE id = ?', [id]);

        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.put('/api/groups/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name, cron, tasks } = req.body;

        await autoSyncer.updateSyncGroup(id, name, cron);

        // Update tasks: Nuclear option for MVP - Delete all and re-add
        // A better approach would be diffing, but for MVP this ensures state matches UI
        if (tasks && Array.isArray(tasks)) {
            await autoSyncer.clearSyncTasks(id);
            for (const t of tasks) {
                await autoSyncer.addSyncTask(
                    id,
                    t.source_path,
                    t.target_chat_id,
                    t.target_topic_id,
                    t.preset_id,
                    t.order_index,
                    t.enabled,
                    t.custom_name
                );
            }
        }

        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/groups/:id/tasks', async (req, res) => {
    try {
        const { sourcePath, targetChatId, targetTopicId } = req.body;
        await autoSyncer.addSyncTask(req.params.id, sourcePath, targetChatId, targetTopicId);
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// --- THEME API ---

app.get('/api/themes', (req, res) => {
    try {
        const files = fs.readdirSync(THEMES_DIR).filter(f => f.endsWith('.json'));
        const themes = files.map(f => {
            const content = fs.readFileSync(path.join(THEMES_DIR, f), 'utf-8');
            const parsed = JSON.parse(content);
            return {
                id: parsed.id,
                name: parsed.name,
                author: parsed.author,
                type: parsed.type
            };
        });
        res.json(themes);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/themes/:id', (req, res) => {
    try {
        const themePath = path.join(THEMES_DIR, `${req.params.id}.json`);
        if (!fs.existsSync(themePath)) return res.status(404).json({ error: "Theme not found" });
        const content = fs.readFileSync(themePath, 'utf-8');
        res.json(JSON.parse(content));
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/themes', (req, res) => {
    try {
        const theme = req.body;
        if (!theme.id) return res.status(400).json({ error: "Theme ID is required" });
        const themePath = path.join(THEMES_DIR, `${theme.id}.json`);
        fs.writeFileSync(themePath, JSON.stringify(theme, null, 2), 'utf-8');
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// --- BACKGROUND IMAGES API ---

const BACKGROUNDS_DIR = path.join(DATA_DIR, 'backgrounds');

// Ensure backgrounds directory exists
if (!fs.existsSync(BACKGROUNDS_DIR)) {
    fs.mkdirSync(BACKGROUNDS_DIR, { recursive: true });
}

// List all background images
app.get('/api/backgrounds', (req, res) => {
    try {
        const files = fs.readdirSync(BACKGROUNDS_DIR).filter(f => /\.(jpg|jpeg|png|gif|webp)$/i.test(f));
        res.json(files);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Serve background image
app.get('/api/backgrounds/:filename', (req, res) => {
    try {
        const filename = req.params.filename;
        const filePath = path.join(BACKGROUNDS_DIR, filename);
        if (!fs.existsSync(filePath)) return res.status(404).json({ error: "Image not found" });
        res.sendFile(filePath);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Upload background image
app.post('/api/backgrounds', upload.single('image'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "No image file provided" });
        }
        
        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
        
        if (!allowedTypes.includes(req.file.mimetype)) {
            // Delete the uploaded file
            fs.unlinkSync(req.file.path);
            return res.status(400).json({ error: "Invalid file type. Allowed: JPG, PNG, GIF, WEBP" });
        }
        
        // Move file from temp upload dir to backgrounds dir
        const ext = path.extname(req.file.originalname);
        const safeName = `${Date.now()}-${Math.random().toString(36).substring(7)}${ext}`;
        const newPath = path.join(BACKGROUNDS_DIR, safeName);
        
        fs.renameSync(req.file.path, newPath);
        res.json({ success: true, filename: safeName });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Delete background image
app.delete('/api/backgrounds/:filename', (req, res) => {
    try {
        const filename = req.params.filename;
        const filePath = path.join(BACKGROUNDS_DIR, filename);
        if (!fs.existsSync(filePath)) return res.status(404).json({ error: "Image not found" });
        fs.unlinkSync(filePath);
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/config/fonts', (req, res) => {
    try {
        console.log(`[Fonts] Scanning directory: ${FONTS_DIR}`);
        const files = fs.readdirSync(FONTS_DIR).filter(f => /\.(ttf|otf|woff2|woff)$/i.test(f));
        console.log(`[Fonts] Found ${files.length} valid font files:`, files);
        res.json(files);
    } catch (e: any) {
        console.error("[Fonts] Error scanning directory:", e.message);
        res.status(500).json({ error: e.message });
    }
});

// --- SYSTEM STATS API ---
import os from 'os';

app.get('/api/stats', async (req, res) => {
    try {
        const db = getDb();
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const usedMem = totalMem - freeMem;
        const memUsage = Math.round((usedMem / totalMem) * 100);

        // CPU Usage (Load Average 1m)
        const cpus = os.cpus();
        const loadAvg = os.loadavg();
        const cpuUsage = cpus.length > 0 ? Math.round((loadAvg[0] / cpus.length) * 100) : 0;

        // Sync Folders & Groups
        const foldersCount = await db.get('SELECT COUNT(*) as count FROM sync_folders') as { count: number };
        const groupsCount = await db.get('SELECT COUNT(*) as count FROM sync_groups') as { count: number };
        const tasksCount = await db.get('SELECT COUNT(*) as count FROM sync_tasks') as { count: number };
        
        // Targets (unique Telegram chat destinations from cached resources)
        let targetsCount = 0;
        try {
            const resourcesPath = path.join(DATA_DIR, 'resources.json');
            if (fs.existsSync(resourcesPath)) {
                const resourcesData = JSON.parse(fs.readFileSync(resourcesPath, 'utf-8'));
                const allChatIds = new Set<string>();
                // Collect all chat IDs from all bot tokens
                for (const tokenKey of Object.keys(resourcesData)) {
                    const tokenData = resourcesData[tokenKey];
                    if (tokenData.chats && Array.isArray(tokenData.chats)) {
                        tokenData.chats.forEach((chat: any) => allChatIds.add(String(chat.id)));
                    }
                    if (tokenData.users && Array.isArray(tokenData.users)) {
                        tokenData.users.forEach((user: any) => allChatIds.add(String(user.id)));
                    }
                }
                targetsCount = allChatIds.size;
            }
        } catch (e) {
            console.log("[Stats] Failed to read resources.json for targets count");
        }
        
        // Presets
        const presets = await db.get('SELECT COUNT(*) as count FROM presets') as { count: number };

        // Registry (fingerprints)
        const registryCount = await db.get('SELECT COUNT(*) as count FROM registry') as { count: number };

        // Database Size
        const dbPath = path.join(DATA_DIR, 'commander.sqlite');
        const dbSizeMB = fs.existsSync(dbPath) ? (fs.statSync(dbPath).size / 1024 / 1024).toFixed(2) : "0.00";

        // Preset Usage (Folders + Tasks)
        const activeFolders = await db.get('SELECT COUNT(DISTINCT preset_id) as count FROM sync_folders WHERE preset_id IS NOT NULL') as { count: number };
        const activeTasks = await db.get('SELECT COUNT(DISTINCT preset_id) as count FROM sync_tasks WHERE preset_id IS NOT NULL') as { count: number };

        // 24h health
        let successCount = 0;
        let failCount = 0;
        try {
            const logs24h = await db.all("SELECT status, COUNT(*) as count FROM sync_logs WHERE timestamp > datetime('now', '-1 day') GROUP BY status") as { status: string, count: number }[];
            successCount = logs24h?.find(l => l.status === 'success')?.count || 0;
            failCount = logs24h?.find(l => l.status === 'failure')?.count || 0;
        } catch (e) {
            // sync_logs table may not exist
            console.log("[Stats] sync_logs table not available");
        }

        // Active Job & Queue
        const activeJob = autoSyncer.getActiveJob();
        const queue = autoSyncer.getQueue();
        const nextInQueue = queue.length > 0 ? queue[0].name : undefined;

        // Disk Usage for TEMP_WORK_DIR
        let diskStats = { free: 0, total: 0, usagePercent: 0 };
        try {
            const stats = await fs.promises.statfs(TEMP_WORK_DIR);
            const total = stats.bsize * stats.blocks;
            const free = stats.bsize * stats.bfree;
            const used = total - free;
            const usagePercent = Math.round((used / total) * 100);
            diskStats = { free, total, usagePercent };
        } catch (e) {
            console.error("[Stats] Failed to get disk stats:", e);
        }

        res.json({
            cpu: cpuUsage,
            ram: memUsage,
            disk: diskStats,
            folders: foldersCount.count,
            targets: {
                total: targetsCount,
                breakdown: [
                    { type: 'channels', count: targetsCount }
                ]
            },
            presets: {
                total: presets.count,
                active: activeFolders.count + activeTasks.count
            },
            queue: {
                total: queue.length,
                next: activeJob ? activeJob.name : (nextInQueue || 'Idle')
            },
            database: {
                sizeMB: dbSizeMB,
                entries: registryCount.count
            },
            logs: {
                recentSuccess: successCount,
                recentFailure: failCount,
                status: failCount > 0 ? 'warning' : 'healthy'
            }
        });

    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Job Control
app.post('/api/job/skip', (req, res) => {
    autoSyncer.skipCurrentFile();
    res.json({ success: true });
});

app.post('/api/job/cancel', async (req, res) => {
    const { deleteSent } = req.body;
    await autoSyncer.cancelJob(deleteSent === true);
    res.json({ success: true });
});

app.get('/api/job/current', async (req, res) => {
    try {
        const job = autoSyncer.getActiveJob();
        // Always return 200, even if null. 404 implies endpoint missing.
        res.json(job || { status: 'idle' });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Queue Management
app.get('/api/queue', (req, res) => {
    try {
        res.json(autoSyncer.getQueue());
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/queue/:id', (req, res) => {
    try {
        const { id } = req.params;
        autoSyncer.removeJob(id);
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/queue/reorder', (req, res) => {
    try {
        const { ids } = req.body;
        if (Array.isArray(ids)) {
            autoSyncer.reorderQueue(ids);
            res.json({ success: true });
        } else {
            res.status(400).json({ error: "Invalid IDs array" });
        }
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/queue/clear', (req, res) => {
    try {
        autoSyncer.clearQueue();
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// ===== FOLDER API (NEW ARCHITECTURE) =====

// Get all folders
app.get('/api/folders', async (req, res) => {
    try {
        const folders = await autoSyncer.listFolders();
        res.json(folders);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Add new folder
app.post('/api/folders', async (req, res) => {
    try {
        const { name, sourcePath, targetChatId, presetId, targetTopicId, scheduleType, scheduleConfig } = req.body;
        console.log('[FOLDERS POST] Received:', JSON.stringify(req.body, null, 2));
        const id = await autoSyncer.addFolder(name, sourcePath, targetChatId, presetId, targetTopicId, scheduleType, scheduleConfig);
        console.log('[FOLDERS POST] Created:', id);
        res.json({ id });
    } catch (e: any) {
        console.error('[FOLDERS POST] Error:', e.message);
        console.error('[FOLDERS POST] Stack:', e.stack);
        res.status(500).json({ error: e.message });
    }
});

// Delete folder
app.delete('/api/folders/:id', async (req, res) => {
    try {
        await autoSyncer.removeFolder(req.params.id);
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Run folder sync
app.post('/api/folders/:id/run', async (req, res) => {
    try {
        await autoSyncer.runFolder(req.params.id);
        res.json({ success: true, message: 'Sync started' });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Run Group Sync
app.post('/api/groups/:id/run', async (req, res) => {
    try {
        await autoSyncer.runSyncGroup(req.params.id);
        res.json({ success: true, message: 'Group Sync started' });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Toggle folder
app.put('/api/folders/:id/toggle', async (req, res) => {
    try {
        const { enabled } = req.body;
        await autoSyncer.toggleFolder(req.params.id, enabled);
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Update folder
app.put('/api/folders/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name, sourcePath, targetChatId, presetId, targetTopicId, scheduleType, scheduleConfig } = req.body;
        await autoSyncer.updateFolder(id, name, sourcePath, targetChatId, presetId, targetTopicId, scheduleType, scheduleConfig);
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Check folder freshness (on-demand fingerprint comparison)
app.get('/api/folders/:id/freshness', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await autoSyncer.checkFolderFreshness(id);
        res.json(result);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Get sync session history for a folder
app.get('/api/folders/:id/sessions', async (req, res) => {
    try {
        const { id } = req.params;
        const db = getDb();
        const sessions = await db.all(
            'SELECT * FROM sync_sessions WHERE folder_id = ? ORDER BY started_at DESC LIMIT 10',
            [id]
        );
        // Parse errors_json for each session
        for (const s of sessions) {
            if (s.errors_json) {
                try { s.errors = JSON.parse(s.errors_json); } catch { s.errors = []; }
            } else {
                s.errors = [];
            }
        }
        res.json(sessions);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Registry statistics (for SystemStatusPanel)
app.get('/api/registry/stats', async (req, res) => {
    try {
        const db = getDb();

        const result = await db.get(`
            SELECT 
                COUNT(*) as totalFilesSeen,
                SUM(size_bytes) as totalBytesSeen
            FROM registry
        `);

        // Calculate dedup savings (approximate based on hash collisions avoided)
        const dedupSavingsBytes = result.totalBytesSeen || 0;

        res.json({
            totalFilesSeen: result.totalFilesSeen || 0,
            totalFilesSynced: result.totalFilesSeen || 0,
            dedupSavingsBytes
        });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// --- DATABASE API ---

// Registry List
app.get('/api/db/registry', async (req, res) => {
    try {
        const db = getDb();
        const rows = await db.all('SELECT * FROM registry ORDER BY synced_at DESC LIMIT 100');
        res.json(rows);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Clear Registry (All)
app.delete('/api/db/registry', async (req, res) => {
    try {
        const db = getDb();
        await db.run('DELETE FROM registry');
        console.log('[DB] Cleared File Registry');
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Delete Registry (Single)
app.delete('/api/db/registry/:hash', async (req, res) => {
    try {
        const db = getDb();
        await db.run('DELETE FROM registry WHERE file_hash = ?', [req.params.hash]);
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// History List
app.get('/api/db/history', async (req, res) => {
    try {
        const db = getDb();
        const rows = await db.all('SELECT * FROM job_history ORDER BY created_at DESC LIMIT 50');
        res.json(rows);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Clear History
app.delete('/api/db/history', async (req, res) => {
    try {
        const db = getDb();
        await db.run('DELETE FROM job_history');
        console.log('[DB] Cleared Job History');
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});


// --- BACKUP & RESTORE ---

app.get('/api/backup', async (req, res) => {
    try {
        const archive = archiver('zip', { zlib: { level: 9 } });

        res.attachment(`teleman_backup_${Date.now()}.zip`);
        archive.pipe(res);

        // Add config files
        if (fs.existsSync(CONFIG_PATH)) archive.file(CONFIG_PATH, { name: 'config.json' });
        if (fs.existsSync(RESOURCES_PATH)) archive.file(RESOURCES_PATH, { name: 'resources.json' });

        const dbPath = path.join(DATA_DIR, 'commander.sqlite');
        if (fs.existsSync(dbPath)) archive.file(dbPath, { name: 'commander.sqlite' });

        await archive.finalize();
    } catch (e: any) {
        console.error("[Backup] Error:", e);
        res.status(500).send("Backup failed");
    }
});

app.post('/api/restore', upload.single('backup'), async (req, res) => {
    try {
        if (!req.file) throw new Error("No backup file provided");

        console.log("[Restore] Restoration started...");
        await closeDb();

        const zip = new AdmZip(req.file.buffer);
        zip.extractAllTo(DATA_DIR, true);

        console.log("[Restore] Files extracted to", DATA_DIR);
        await initDb();
        await autoSyncer.cleanup();

        console.log("[Restore] Restoration complete.");
        res.json({ success: true, message: "Restoration successful. System reloaded." });
    } catch (e: any) {
        console.error("[Restore] Error:", e);
        try { await initDb(); } catch { }
        res.status(500).json({ error: e.message });
    }
});

// Debug Report
import { debugLogger } from './src/backend/debugLogger.js';

app.get('/api/debug/report', (req, res) => {
    const report = debugLogger.getReport();
    res.header('Content-Type', 'text/plain');
    res.header('Content-Disposition', `attachment; filename="debug_report_${Date.now()}.txt"`);
    res.send(report);
});

app.get('/api/debug/logs', (req, res) => {
    const limit = parseInt(req.query.limit as string) || 100;
    const logs = debugLogger.getRecentLogs(limit);
    res.json(logs);
});

// Download current debug log as text file
app.get('/api/debug/logs/download', (req, res) => {
    const report = debugLogger.getReport();
    res.header('Content-Type', 'text/plain');
    res.header('Content-Disposition', `attachment; filename="teleman_logs_${Date.now()}.txt"`);
    res.send(report);
});

// --- Log Management API ---

// Save current logs manually
app.post('/api/logs/save', async (req, res) => {
    try {
        const logManager = getLogManager();
        const filename = await logManager.saveLogs('logs');
        res.json({ success: true, filename });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Get log history
app.get('/api/logs/history', (req, res) => {
    try {
        const logManager = getLogManager();
        res.json(logManager.getLogHistory());
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Delete single log
app.delete('/api/logs/history/:filename', (req, res) => {
    try {
        const logManager = getLogManager();
        const success = logManager.deleteLog(req.params.filename);
        res.json({ success });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Clear all logs
app.post('/api/logs/history/clear-all', (req, res) => {
    try {
        const logManager = getLogManager();
        const deleted = logManager.clearAllLogs();
        res.json({ success: true, deleted });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// View log content with pagination
app.get('/api/logs/view/:filename', (req, res) => {
    try {
        const limit = parseInt(req.query.limit as string) || 100;
        const offset = parseInt(req.query.offset as string) || 0;
        const logManager = getLogManager();
        const content = logManager.getLogContent(req.params.filename, limit, offset);
        
        if (!content) {
            return res.status(404).json({ error: 'Log file not found' });
        }
        
        res.json(content);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Download log file
app.get('/api/logs/download/:filename', (req, res) => {
    try {
        const logManager = getLogManager();
        const filePath = logManager.getLogFilePath(req.params.filename);
        
        if (!filePath) {
            return res.status(404).json({ error: 'Log file not found' });
        }
        
        res.download(filePath);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Get storage stats
app.get('/api/logs/stats', (req, res) => {
    try {
        const logManager = getLogManager();
        res.json(logManager.getStorageStats());
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Auto-save logs (internal use, can be called by shutdown hook)
app.post('/api/logs/auto-save', async (req, res) => {
    try {
        const logManager = getLogManager();
        const filename = await logManager.autoSave();
        if (filename) {
            res.json({ success: true, filename });
        } else {
            res.status(500).json({ error: 'Auto-save failed' });
        }
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Start Server

// Folder listing endpoint for folder picker
app.post('/api/fs/ls', async (req, res) => {
    try {
        const { path: requestedPath } = req.body;

        // Use resolved SCAN_ROOT (works for both Docker and local development)
        const scanRootResolved = path.resolve(SCAN_ROOT);

        // Resolve path relative to SCAN_ROOT
        let targetPath;
        if (!requestedPath || requestedPath === '.') {
            targetPath = scanRootResolved;
        } else if (path.isAbsolute(requestedPath) && requestedPath.startsWith(scanRootResolved)) {
            targetPath = requestedPath;
        } else {
            // Join relative paths to SCAN_ROOT
            targetPath = path.join(scanRootResolved, requestedPath);
        }

        // Security: Ensure path is within SCAN_ROOT
        const normalizedPath = path.normalize(targetPath);
        if (!normalizedPath.startsWith(scanRootResolved)) {
            return res.status(403).json({ error: `Access denied outside ${scanRootResolved}` });
        }

        const items = await fs.promises.readdir(normalizedPath, { withFileTypes: true });
        const folders = items
            .filter(item => item.isDirectory())
            .map(item => item.name)
            .sort();

        res.json({
            current: normalizedPath,
            folders
        });
    } catch (e: any) {
        console.error('[fs/ls] Error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// Catch-All for SPA (Must be last)
// Express 5 requires (.*) instead of * for wildcard
app.get(/(.*)/, (req, res, next) => {
    // Skip API routes that fell through
    if (req.path.startsWith('/api/') || req.path.startsWith('/telegram-api/')) {
        return next();
    }

    if (fs.existsSync(path.join(DIST_DIR, 'index.html'))) {
        res.sendFile(path.join(DIST_DIR, 'index.html'));
    } else {
        res.status(404).send('Frontend not built. Please run npm run build.');
    }
});

// Start Server
initDb().then(async () => {
    try {
        await autoSyncer.cleanup(); // Reset stuck statuses
    } catch (e) {
        console.error("Failed to cleanup AutoSyncer:", e);
    }

    // Start Scheduler Service
    scheduler.start();

    // Start Network Health Monitor
    networkMonitor.startHealthCheck();

    // Initialize Log Manager
    const logManager = initLogManager(DATA_DIR);

    // Graceful shutdown handlers
    const gracefulShutdown = async (signal: string) => {
        console.log(`\n[Server] ${signal} received. Shutting down gracefully...`);
        
        // Auto-save logs
        await logManager.autoSave();
        console.log('[Server] Logs auto-saved');
        
        // Close database
        await closeDb();
        console.log('[Server] Database closed');
        
        process.exit(0);
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    app.listen(PORT, '0.0.0.0', () => {
        console.log(`TeleMan running on http://localhost:${PORT}`);
        console.log(`Data Directory: ${DATA_DIR}`);
        console.log(`Scan Root: ${SCAN_ROOT}`);
        console.log(`Target API: ${process.env.TELEGRAM_API_URL || "Local"}`);
    });
}).catch(err => {
    console.error("❌ Failed to initialize database:", err);
    process.exit(1);
});
