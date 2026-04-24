import axios from 'axios';
import { readConfig, saveConfig } from './configManager.js';
import { debugLogger } from './debugLogger.js';

export class NetworkMonitor {
    private static instance: NetworkMonitor;
    private healthCheckInterval: NodeJS.Timeout | null = null;
    private isChecking = false;
    private readonly CHECK_INTERVAL_MS = 30000; // 30 seconds
    private readonly TIMEOUT_MS = 3000;

    private constructor() {}

    public static getInstance(): NetworkMonitor {
        if (!NetworkMonitor.instance) {
            NetworkMonitor.instance = new NetworkMonitor();
        }
        return NetworkMonitor.instance;
    }

    public startHealthCheck() {
        if (this.healthCheckInterval) {
            debugLogger.info('NetworkMonitor', 'Health check already running');
            return;
        }

        debugLogger.info('NetworkMonitor', `Starting health check (interval: ${this.CHECK_INTERVAL_MS}ms)`);
        
        // Run initial check
        this.performHealthCheck();
        
        // Then run periodically
        this.healthCheckInterval = setInterval(() => {
            this.performHealthCheck();
        }, this.CHECK_INTERVAL_MS);
    }

    public stopHealthCheck() {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = null;
            debugLogger.info('NetworkMonitor', 'Health check stopped');
        }
    }

    private async performHealthCheck() {
        if (this.isChecking) {
            debugLogger.debug('NetworkMonitor', 'Health check already in progress, skipping');
            return;
        }

        this.isChecking = true;
        const config = readConfig();
        const currentMode = config.active_network_mode || 'primary';

        try {
            // Get current API URL based on mode
            let currentUrl = '';
            let currentName = '';
            
            if (currentMode === 'primary') {
                currentUrl = config.telegram_api_url || '';
                currentName = 'Primary';
            } else if (currentMode === 'fallback') {
                currentUrl = config.telegram_api_fallback || '';
                currentName = 'Fallback';
            } else if (currentMode === 'tailscale') {
                currentUrl = config.tailscale_api_url || '';
                currentName = 'Tailscale';
            }

            // Only check if current network is configured
            if (!currentUrl) {
                debugLogger.debug('NetworkMonitor', `No ${currentName} URL configured`);
                this.isChecking = false;
                return;
            }

            // Test current network
            const currentHealthy = await this.testConnection(currentUrl);

            if (!currentHealthy) {
                debugLogger.error('NetworkMonitor', `${currentName} API is not reachable`);
                
                // Don't auto-switch - just log the failure
                // Frontend will poll this status and show notification
                this.setNetworkError(currentMode, `${currentName} API is not reachable`);
            } else {
                // Clear any existing error
                this.clearNetworkError();
            }
        } catch (error) {
            debugLogger.error('NetworkMonitor', 'Health check error', error);
            this.setNetworkError(currentMode, 'Health check failed');
        } finally {
            this.isChecking = false;
        }
    }

    private networkError: { mode: string; message: string; timestamp: number } | null = null;

    private setNetworkError(mode: string, message: string) {
        this.networkError = { mode, message, timestamp: Date.now() };
        debugLogger.warn('NetworkMonitor', `Network error set: ${mode} - ${message}`);
    }

    public clearNetworkError() {
        this.networkError = null;
    }

    public getNetworkError() {
        return this.networkError;
    }

    private async testConnection(url: string): Promise<boolean> {
        try {
            // Use a test token to check if API is reachable
            await axios.get(`${url}/bot123456789:test/getMe`, { 
                timeout: this.TIMEOUT_MS,
                validateStatus: () => true // Accept any status code
            });
            return true;
        } catch (error) {
            // Only return false on network errors, not API errors
            if (axios.isAxiosError(error) && (error.code === 'ECONNABORTED' || error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND')) {
                return false;
            }
            // API returned a response (even if error), so connection works
            return true;
        }
    }

    // Note: switchToMode removed - we don't auto-switch anymore, user decides
    // public switchToMode(mode: 'primary' | 'fallback' | 'tailscale') {...}

    public getCurrentMode(): 'primary' | 'fallback' | 'tailscale' {
        const config = readConfig();
        return config.active_network_mode || 'primary';
    }

    public getActiveApiUrl(): string {
        const config = readConfig();
        const mode = config.active_network_mode || 'primary';
        
        if (mode === 'tailscale' && config.tailscale_api_url) {
            return config.tailscale_api_url;
        }
        if (mode === 'fallback' && config.telegram_api_fallback) {
            return config.telegram_api_fallback;
        }
        return config.telegram_api_url || "http://192.168.0.7:8181";
    }

    public async switchMode(mode: 'primary' | 'fallback' | 'tailscale'): Promise<{ success: boolean; error?: string }> {
        const config = readConfig();
        
        // Validate the target URL exists and is reachable
        let targetUrl = '';
        if (mode === 'primary') {
            targetUrl = config.telegram_api_url;
        } else if (mode === 'fallback') {
            targetUrl = config.telegram_api_fallback;
        } else if (mode === 'tailscale') {
            targetUrl = config.tailscale_api_url;
        }

        if (!targetUrl) {
            return { success: false, error: 'No URL configured for this network mode' };
        }

        // Test connection before switching
        const isHealthy = await this.testConnection(targetUrl);
        if (!isHealthy) {
            return { success: false, error: 'Target API is not reachable' };
        }

        // Switch mode
        config.active_network_mode = mode;
        saveConfig(config);
        
        debugLogger.info('NetworkMonitor', `Manually switched to ${mode} network mode`);
        
        return { success: true };
    }

    public getNetworkStatus() {
        const config = readConfig();
        return {
            mode: config.active_network_mode || 'primary',
            primary: {
                url: config.telegram_api_url,
                configured: !!config.telegram_api_url
            },
            fallback: {
                url: config.telegram_api_fallback,
                configured: !!config.telegram_api_fallback
            },
            tailscale: {
                url: config.tailscale_api_url,
                configured: !!config.tailscale_api_url
            }
        };
    }
}
