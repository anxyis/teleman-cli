import { api } from './bridge';

// CONSTANTS removed as they are now handled by the bridge/backend

interface ApiRequestParams {
    method: string;
    params?: Record<string, any> | FormData;
    token?: string;
    onUploadProgress?: (progressEvent: any) => void;
    signal?: AbortSignal;
}

export const callTelegramApi = async ({ method, params, token, onUploadProgress, signal }: ApiRequestParams) => {
    let activeToken = token;

    if (!activeToken) {
        // Fetch active token from backend if not provided
        try {
            const config = await api.getConfig();
            activeToken = config.activeToken;
        } catch (e) {
            console.error("Failed to fetch active token", e);
        }
    }

    if (!activeToken) {
        throw new Error('Bot token is missing (Not in params and no active token configured)');
    }

    // Delegate to bridge
    return await api.callTelegram({
        method,
        params,
        token: activeToken,
        onUploadProgress,
        signal
    });
};
