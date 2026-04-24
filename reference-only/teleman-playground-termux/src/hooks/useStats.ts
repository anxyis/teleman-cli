import { useState, useEffect } from 'react';
import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';

export function useStats(refreshInterval = 2500) {
    const [stats, setStats] = useState<any>(null);

    const fetchStats = async () => {
        try {
            const res = await axios.get(`${API_BASE}/api/stats`).catch(() => ({ data: null }));
            if (res.data) {
                setStats(res.data);
            }
        } catch (e) {
            console.error('[useStats] Failed to fetch stats', e);
        }
    };

    useEffect(() => {
        fetchStats();
        const interval = setInterval(fetchStats, refreshInterval);
        return () => clearInterval(interval);
    }, [refreshInterval]);

    return { stats, refreshStats: fetchStats };
}
