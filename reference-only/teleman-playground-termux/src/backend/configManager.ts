import fs from 'fs';
import path from 'path';

// Lazy resolve to ensure environment variables are loaded (e.g. by dotenv in server.ts)
const getConfigPath = () => {
    const DATA_DIR = process.env.DATA_DIR || './data';
    if (!fs.existsSync(DATA_DIR)) {
        try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch (e) {}
    }
    return path.resolve(DATA_DIR, 'config.json');
};

export const readConfig = () => {
    const configPath = getConfigPath();
    const defaults = {
        active_token: "",
        saved_bots: [],
        base_url: null,
        telegram_api_url: "http://192.168.0.7:8181",
        telegram_api_fallback: "",
        tailscale_api_url: "",
        active_network_mode: "primary" as 'primary' | 'fallback' | 'tailscale',
        font_preview: {
            text: "ABCDEFGHIJKLM\nNOPQRSTUVWXYZ\n0123456789",
            use_font_sheet: false,
            bg_color: "#ffffff",
            text_color: "#000000",
            size: "medium", // small, medium, large
            enabled: true
        },
        ai: {
            openrouter_enabled: false,
            openrouter_api_key: "",
            openrouter_model: ""
        }
    };

    if (!fs.existsSync(configPath)) {
        return defaults;
    }
    try {
        const current = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        // Deep merge for font_preview to ensure new keys exist
        return {
            ...defaults,
            ...current,
            font_preview: {
                ...defaults.font_preview,
                ...(current.font_preview || {})
            },
            ai: {
                ...defaults.ai,
                ...(current.ai || {})
            }
        };
    } catch (e) {
        return defaults;
    }
};

export const saveConfig = (config: any) => {
    const configPath = getConfigPath();
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
};

export const getActiveToken = (): string => {
    return readConfig().active_token || "";
};
