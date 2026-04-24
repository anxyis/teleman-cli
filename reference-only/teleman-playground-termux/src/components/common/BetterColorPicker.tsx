import { useState, useRef, useEffect } from 'react';
import { HexColorPicker, HexColorInput } from 'react-colorful';
import { Palette, X } from 'lucide-react';

interface BetterColorPickerProps {
    color: string;
    onChange: (color: string) => void;
    label?: string;
    presets?: string[];
}

const DEFAULT_PRESETS = [
    '#BB86FC', // Primary (Amoled)
    '#2563eb', // Primary (Classic)
    '#ffffff', 
    '#000000',
    '#121212',
    '#ef4444', // Red
    '#22c55e', // Green
    '#f59e0b', // Amber
    '#3b82f6', // Blue
    '#8b5cf6', // Violet
    '#ec4899', // Pink
];

export function BetterColorPicker({ color, onChange, label, presets = DEFAULT_PRESETS }: BetterColorPickerProps) {
    const [isOpen, setIsOpen] = useState(false);
    const popoverRef = useRef<HTMLDivElement>(null);

    const toggle = () => setIsOpen(!isOpen);
    const close = () => setIsOpen(false);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
                close();
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        } else {
            document.removeEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isOpen]);

    return (
        <div className="relative w-full">
            {label && (
                <span className="text-[10px] text-text-muted truncate capitalize block mb-1">
                    {label.replace(/([A-Z])/g, ' $1')}
                </span>
            )}
            
            <div className="flex items-center gap-2 bg-surface-highlight p-1.5 rounded-xl border border-white/5 hover:border-white/10 transition-colors">
                <button
                    onClick={toggle}
                    className="w-8 h-8 rounded-lg shadow-inner border border-white/10 flex-shrink-0 transition-transform active:scale-90"
                    style={{ backgroundColor: color }}
                    title="Open color picker"
                />
                
                <div className="flex-1 flex items-center gap-2 px-1">
                    <HexColorInput
                        color={color}
                        onChange={onChange}
                        className="bg-transparent text-[10px] font-mono uppercase text-text-main outline-none w-full"
                    />
                </div>

                <button 
                    onClick={toggle}
                    className="p-1.5 text-text-muted hover:text-text-main transition-colors"
                >
                    <Palette size={14} />
                </button>
            </div>

            {isOpen && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm md:absolute md:inset-auto md:bg-transparent md:backdrop-blur-none md:z-50 md:p-0 md:mt-2 md:block">
                    {/* Background overlay for mobile touch-to-close */}
                    <div className="absolute inset-0 md:hidden" onClick={close} />

                    <div 
                        ref={popoverRef}
                        className="relative w-full max-w-[320px] md:max-w-none md:w-auto bg-surface border border-border rounded-3xl md:rounded-2xl shadow-2xl p-6 md:p-3 animate-in fade-in zoom-in-95 duration-200 origin-center md:origin-top-left"
                        style={{ minWidth: '220px' }}
                    >
                        <div className="flex items-center justify-between mb-4 md:mb-3 border-b border-border/50 pb-2">
                            <span className="text-xs md:text-[10px] font-bold text-text-muted uppercase tracking-wider">
                                {label ? `Pick ${label}` : 'Color Picker'}
                            </span>
                            <button onClick={close} className="p-1.5 text-text-muted hover:text-text-main transition-colors">
                                <X size={20} className="md:w-3.5 md:h-3.5" />
                            </button>
                        </div>

                        <div className="space-y-5 md:space-y-4">
                            <div className="better-picker-wrapper">
                                <HexColorPicker color={color} onChange={onChange} />
                            </div>

                            <div className="space-y-3 md:space-y-2">
                                <div className="flex items-center gap-2 bg-surface-highlight p-3 md:p-2 rounded-xl md:rounded-lg border border-border/50">
                                    <div 
                                        className="w-5 h-5 md:w-4 md:h-4 rounded shadow-sm border border-white/10" 
                                        style={{ backgroundColor: color }} 
                                    />
                                    <HexColorInput
                                        color={color}
                                        onChange={onChange}
                                        className="bg-transparent text-sm md:text-xs font-mono uppercase text-text-main outline-none flex-1"
                                        prefixed
                                    />
                                </div>

                                <div className="grid grid-cols-6 gap-2.5 md:gap-1.5">
                                    {presets.map((p) => (
                                        <button
                                            key={p}
                                            className={`w-full aspect-square rounded-full md:rounded-md border border-white/10 transition-transform hover:scale-110 active:scale-90 ${color.toLowerCase() === p.toLowerCase() ? 'ring-2 ring-primary ring-offset-2 ring-offset-surface' : ''}`}
                                            style={{ backgroundColor: p }}
                                            onClick={() => onChange(p)}
                                        />
                                    ))}
                                </div>
                            </div>

                            {/* Mobile Done Button */}
                            <div className="md:hidden pt-2">
                                <button 
                                    onClick={close}
                                    className="w-full py-3.5 bg-primary hover:bg-primary-hover text-on-primary font-bold rounded-2xl shadow-lg shadow-primary/20 active:scale-95 transition-all"
                                >
                                    Done
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <style>{`
                .better-picker-wrapper .react-colorful {
                    width: 100%;
                    height: 220px;
                    border-radius: 16px;
                }
                @media (min-width: 768px) {
                    .better-picker-wrapper .react-colorful {
                        height: 160px;
                        border-radius: 12px;
                    }
                }
                .better-picker-wrapper .react-colorful__saturation {
                    border-bottom: none;
                    border-radius: 16px 16px 0 0;
                }
                @media (min-width: 768px) {
                    .better-picker-wrapper .react-colorful__saturation {
                        border-radius: 12px 12px 0 0;
                    }
                }
                .better-picker-wrapper .react-colorful__hue {
                    height: 16px;
                    border-radius: 0 0 16px 16px;
                }
                @media (min-width: 768px) {
                    .better-picker-wrapper .react-colorful__hue {
                        height: 12px;
                        border-radius: 0 0 12px 12px;
                    }
                }
                .better-picker-wrapper .react-colorful__pointer {
                    width: 24px;
                    height: 24px;
                }
                @media (min-width: 768px) {
                    .better-picker-wrapper .react-colorful__pointer {
                        width: 18px;
                        height: 18px;
                    }
                }
            `}</style>
        </div>
    );
}
