import React, { createContext, useContext, useEffect, useState } from 'react';
import axios from 'axios';

export interface ThemeTokens {
    colors: {
        canvas: string;
        surface: string;
        surfaceHighlight: string;
        border: string;
        primary: string;
        primaryHover: string;
        onPrimary: string;
        textMain: string;
        textMuted: string;
    };
    radii: {
        button: string;
        card: string;
        input: string;
        modal: string;
        navbar: string;
    };
    typography: {
        fontFamily: string;
        baseSize: string;
        headingWeight: string;
    };
    effects: {
        glassOpacity: string;
        shadowCard: string;
        buttonTransform: string;
        glow: boolean;
    };
    icons: {
        strokeWidth: string;
        pack: 'lucide' | 'ph' | 'tabler' | 'heroicons' | 'ri';
    };
}

export interface Theme {
    id: string;
    name: string;
    author: string;
    type: 'dark' | 'light';
    background?: {
        enabled: boolean;
        imagePath: string;
        opacity: number;
        cardTransparency?: number;
        glassBlur?: boolean;
        blurIntensity?: number;
    };
    tokens: ThemeTokens;
}

const DEFAULT_AMOLED: Theme = {
    id: "amoled",
    name: "AMOLED Dark",
    author: "TeleMan",
    type: "dark",
    tokens: {
        colors: {
            canvas: "#000000",
            surface: "#121212",
            surfaceHighlight: "#1E1E1E",
            border: "#2D2D2D",
            primary: "#BB86FC",
            primaryHover: "#D0BCFF",
            onPrimary: "#000000",
            textMain: "#FFFFFF",
            textMuted: "#B0B0B0"
        },
        radii: {
            button: "12px",
            card: "24px",
            input: "12px",
            modal: "24px",
            navbar: "100px"
        },
        typography: {
            fontFamily: "'Gilroy', system-ui, sans-serif",
            baseSize: "16px",
            headingWeight: "700"
        },
        effects: {
            glassOpacity: "0.8",
            shadowCard: "none",
            buttonTransform: "scale(0.95)",
            glow: true
        },
        icons: {
            strokeWidth: "2",
            pack: "lucide"
        }
    }
};

interface ThemeContextType {
    currentTheme: Theme | null;
    availableThemes: { id: string; name: string; type: string }[];
    availableFonts: string[];
    loadTheme: (id: string) => Promise<void>;
    refreshThemes: () => Promise<void>;
    refreshFonts: () => Promise<void>;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    const [currentTheme, setCurrentTheme] = useState<Theme | null>(null);
    const [availableThemes, setAvailableThemes] = useState<{ id: string; name: string; type: string }[]>([]);
    const [availableFonts, setAvailableFonts] = useState<string[]>([]);

    const refreshThemes = async () => {
        try {
            const res = await axios.get(`${API_BASE}/api/themes`);
            setAvailableThemes(res.data);
        } catch (e) {
            console.error("[ThemeContext] Failed to load themes list", e);
        }
    };

    const refreshFonts = async () => {
        try {
            console.log("[ThemeContext] Fetching fonts from /api/config/fonts...");
            const res = await axios.get(`${API_BASE}/api/config/fonts`);
            const fonts = res.data;
            console.log("[ThemeContext] Received fonts:", fonts);
            setAvailableFonts(fonts);
            
            // Inject @font-face rules for all custom fonts
            const styleId = 'dynamic-fonts-css';
            let styleEl = document.getElementById(styleId) as HTMLStyleElement;
            if (!styleEl) {
                styleEl = document.createElement('style');
                styleEl.id = styleId;
                document.head.appendChild(styleEl);
            }

            let css = '';
            fonts.forEach((fontFile: string) => {
                const fontName = fontFile.split('.')[0];
                css += `
                    @font-face {
                        font-family: '${fontName}';
                        src: url('${API_BASE}/api/fonts/${fontFile}');
                        font-display: swap;
                    }
                `;
            });
            console.log("[ThemeContext] Injected CSS for custom fonts:", css);
            styleEl.textContent = css;
        } catch (e) {
            console.error("[ThemeContext] Failed to load custom fonts", e);
        }
    };

    const applyTheme = (theme: Theme) => {
        const root = document.documentElement;
        const t = theme.tokens;

        // Check if background image is enabled
        const hasBackground = theme.background?.enabled && theme.background?.imagePath;
        const cardTransparency = theme.background?.cardTransparency ?? 0.85;
        const glassBlur = theme.background?.glassBlur ?? false;

        // Apply Colors (with transparency if background enabled)
        Object.entries(t.colors).forEach(([key, value]) => {
            const cssKey = key.replace(/[A-Z]/g, m => "-" + m.toLowerCase());
            
            // If background is enabled, make canvas and surface semi-transparent
            if (hasBackground && (key === 'canvas' || key === 'surface' || key === 'surfaceHighlight')) {
                // Convert hex to rgba with configurable transparency
                const hex = value.replace('#', '');
                const r = parseInt(hex.substring(0, 2), 16);
                const g = parseInt(hex.substring(2, 4), 16);
                const b = parseInt(hex.substring(4, 6), 16);
                root.style.setProperty(`--${cssKey}`, `rgba(${r}, ${g}, ${b}, ${cardTransparency})`);
            } else {
                root.style.setProperty(`--${cssKey}`, value);
            }
        });

        // Apply glass blur effect
        if (hasBackground && glassBlur) {
            const blurPx = theme.background?.blurIntensity ?? 10;
            root.style.setProperty('--glass-blur', `blur(${blurPx}px)`);
            root.style.setProperty('--glass-backdrop', `blur(${blurPx}px)`);
            
            // Inject global CSS for glass effect
            let styleEl = document.getElementById('glass-effect-css') as HTMLStyleElement;
            if (!styleEl) {
                styleEl = document.createElement('style');
                styleEl.id = 'glass-effect-css';
                document.head.appendChild(styleEl);
            }
            styleEl.textContent = `
                .bg-surface, .bg-surface-highlight, [class*="bg-surface/"] {
                    backdrop-filter: blur(${blurPx}px) !important;
                    -webkit-backdrop-filter: blur(${blurPx}px) !important;
                }
            `;
        } else {
            root.style.setProperty('--glass-blur', 'none');
            root.style.setProperty('--glass-backdrop', 'none');
            
            // Remove glass effect CSS
            const styleEl = document.getElementById('glass-effect-css');
            if (styleEl) {
                styleEl.textContent = '';
            }
        }

        // Apply Radii
        Object.entries(t.radii).forEach(([key, value]) => {
            root.style.setProperty(`--radius-${key}`, value);
        });

        // Apply Typography
        root.style.setProperty('--font-family', t.typography.fontFamily);
        root.style.setProperty('--font-size-base', t.typography.baseSize);
        root.style.setProperty('--heading-weight', t.typography.headingWeight);

        // Apply Effects
        root.style.setProperty('--glass-opacity', t.effects.glassOpacity);
        root.style.setProperty('--shadow-card', t.effects.shadowCard);
        root.style.setProperty('--button-transform-active', t.effects.buttonTransform);
        root.style.setProperty('--glow-opacity', t.effects.glow ? '0.2' : '0');

        // Apply Icons
        root.style.setProperty('--icon-stroke', t.icons.strokeWidth);

        setCurrentTheme(theme);
        localStorage.setItem('app-theme-id', theme.id);
    };

    const loadTheme = async (id: string) => {
        try {
            const res = await axios.get(`${API_BASE}/api/themes/${id}`);
            applyTheme(res.data);
        } catch (e) {
            console.error(`[ThemeContext] Failed to load theme "${id}", using fallback.`, e);
            applyTheme(DEFAULT_AMOLED);
        }
    };

    useEffect(() => {
        refreshThemes();
        refreshFonts();
        const savedThemeId = localStorage.getItem('app-theme-id') || 'amoled';
        loadTheme(savedThemeId);
    }, []);

    return (
        <ThemeContext.Provider value={{ currentTheme, availableThemes, availableFonts, loadTheme, refreshThemes, refreshFonts }}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme() {
    const context = useContext(ThemeContext);
    if (context === undefined) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    return context;
}
