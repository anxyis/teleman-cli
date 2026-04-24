import axios from 'axios';

// Define types
export interface SavedBot {
    name: string;
    token: string;
    avatar_filename?: string;
}

export interface AppConfig {
    activeToken: string;
    savedBots: SavedBot[];
    baseUrl?: string;
    telegramApiUrl?: string;
}

// Set base URL for axios if needed, or rely on proxy in vite.config
// In docker/dev, strictly speaking, vite proxies /api requests.
// Ensure axios calls relative paths.

export const api = {
    getConfig: async (): Promise<AppConfig> => {
        const res = await axios.get('/api/config');
        const data = res.data;
        // Map snake_case from server to camelCase for frontend
        return {
            activeToken: data.active_token || "",
            savedBots: data.saved_bots || [],
            baseUrl: data.base_url,
            telegramApiUrl: data.telegram_api_url
        };
    },

    saveNetworkConfig: async (telegramApiUrl: string): Promise<void> => {
        await axios.post('/api/config/network', { telegram_api_url: telegramApiUrl });
    },

    saveBot: async (name: string, token: string, setActive: boolean): Promise<AppConfig> => {
        const res = await axios.post('/api/bots', {
            name,
            token,
            set_active: setActive
        });
        const data = res.data;
        return {
            activeToken: data.active_token || "",
            savedBots: data.saved_bots || [],
            baseUrl: data.base_url
        };
    },

    deleteBot: async (token: string): Promise<AppConfig> => {
        const res = await axios.delete(`/api/bots/${token}`);
        const data = res.data;
        return {
            activeToken: data.active_token || "",
            savedBots: data.saved_bots || [],
            baseUrl: data.base_url
        };
    },

    refreshBot: async (token: string): Promise<SavedBot> => {
        const res = await axios.post(`/api/bots/${token}/refresh`);
        return res.data.bot;
    },

    getResources: async (token: string): Promise<any> => {
        const res = await axios.get(`/api/resources/${token}`);
        return res.data;
    },

    saveResources: async (token: string, resources: any): Promise<any> => {
        const res = await axios.post(`/api/resources/${token}`, resources);
        return res.data;
    },

    callTelegram: async (params: any): Promise<any> => {
        // params: { method, params: payload, token, onUploadProgress, signal }
        const { method, params: payload, token, onUploadProgress, signal } = params;
        const url = `/telegram-api/bot${token}/${method}`;

        try {
            // Check if payload is FormData or JSON
            const isFormData = payload instanceof FormData;
            const headers = {
                'Content-Type': isFormData ? 'multipart/form-data' : 'application/json',
            };

            const response = await axios.post(url, payload, {
                headers,
                onUploadProgress,
                signal,
            });
            return response.data;
        } catch (error: any) {
            if (axios.isCancel(error)) {
                throw new Error('Cancelled by user');
            }
            if (error.response) return error.response.data;
            return { ok: false, description: error.message || 'Network Error' };
        }
    },

    scanDirectory: async (path?: string): Promise<string[]> => {
        // path argument is optional now, server defaults to configured root
        const res = await axios.post('/api/scan', { path });
        return res.data;
    },

    // --- COMMANDER API ---
    getPresets: async (): Promise<any[]> => {
        const res = await axios.get('/api/presets');
        return res.data;
    },

    createPreset: async (name: string, rules: any): Promise<any> => {
        const res = await axios.post('/api/presets', { name, rules });
        return res.data;
    },

    updatePreset: async (id: string, name: string, rules: any): Promise<any> => {
        const res = await axios.put(`/api/presets/${id}`, { name, rules });
        return res.data;
    },

    // --- SYNC GROUPS ---
    getSyncGroups: async (): Promise<any[]> => {
        const res = await axios.get('/api/groups');
        return res.data;
    },

    createSyncGroup: async (name: string, presetId: string, cron?: string, tasks?: any[]): Promise<any> => {
        const res = await axios.post('/api/groups', { name, presetId, cron: cron || null, tasks });
        return res.data;
    },

    updateSyncGroup: async (id: string, name: string, presetId: string, cron: string | null, tasks: any[]): Promise<any> => {
        const res = await axios.put(`/api/groups/${id}`, { name, presetId, cron, tasks });
        return res.data;
    },

    addSyncTask: async (groupId: string, task: any): Promise<any> => {
        const res = await axios.post(`/api/groups/${groupId}/tasks`, task);
        return res.data;
    },

    runSyncGroup: async (groupId: string): Promise<any> => {
        // Placeholder for triggering run
        const res = await axios.post(`/api/groups/${groupId}/run`);
        return res.data;
    },

    // --- REVERSE SYNCER (DOWNLOADER) ---
    getDownloaderFiles: async (): Promise<any[]> => {
        const res = await axios.get('/api/downloader/files');
        return res.data;
    },

    searchDownloaderFiles: async (query: string, folderName?: string): Promise<any[]> => {
        const res = await axios.get('/api/downloader/search', { params: { q: query, folderName } });
        return res.data;
    },

    getDownloaderQueue: async (): Promise<any> => {
        const res = await axios.get('/api/downloader/queue');
        return res.data;
    },

    enqueueDownload: async (files: any[], useCloudFallback?: boolean): Promise<any> => {
        const res = await axios.post('/api/downloader/enqueue', { files, useCloudFallback });
        return res.data;
    },

    getDownloadedFiles: async (folderId?: string): Promise<any[]> => {
        const res = await axios.get('/api/downloader/status', { params: { folderId } });
        return res.data;
    }
};
