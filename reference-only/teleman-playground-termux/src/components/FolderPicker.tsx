import { useState, useEffect } from 'react';
import { ChevronLeft, Home } from 'lucide-react';
import axios from 'axios';
import { ResponsiveModal } from './common/ResponsiveModal';
import { DynamicIcon } from './common/DynamicIcon';

interface FolderPickerProps {
    initialPath?: string;
    onSelect: (path: string) => void;
    onCancel: () => void;
}

export function FolderPicker({ initialPath, onSelect, onCancel }: FolderPickerProps) {
    const [currentPath, setCurrentPath] = useState(initialPath || '.');
    const [folders, setFolders] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        loadPath(currentPath);
    }, []);

    const loadPath = async (path: string) => {
        setLoading(true);
        setError(null);
        try {
            const res = await axios.post(`${import.meta.env.VITE_API_BASE_URL ?? ''}/api/fs/ls`, { path });
            setCurrentPath(res.data.current);
            setFolders(res.data.folders);
        } catch (e: any) {
            setError(e.response?.data?.error || "Failed to list folder");
        } finally {
            setLoading(false);
        }
    };

    const handleNavigate = (folderName: string) => {
        const separator = currentPath.includes('\\') ? '\\' : '/';
        const newPath = currentPath.endsWith(separator)
            ? `${currentPath}${folderName}`
            : `${currentPath}${separator}${folderName}`;
        loadPath(newPath);
    };

    const handleUp = () => {
        loadPath(currentPath + '/..');
    };

    const headerActions = (
        <button
            onClick={handleUp}
            className="p-1.5 hover:bg-surface-highlight rounded-lg text-text-muted hover:text-text-main transition-colors"
            title="Go Up"
        >
            <ChevronLeft size={20} />
        </button>
    );

    const footerActions = (
        <div className="flex gap-2 w-full">
            <button
                onClick={onCancel}
                className="flex-1 py-3 bg-surface-highlight text-text-muted font-bold rounded-xl hover:text-text-main transition-colors"
            >
                Cancel
            </button>
            <button
                onClick={() => onSelect(currentPath)}
                className="flex-1 py-3 bg-primary text-on-primary font-bold rounded-xl hover:bg-primary-hover shadow-lg shadow-primary/[var(--glow-opacity,0.20)] flex items-center justify-center gap-2 transition-all active:scale-95"
            >
                <DynamicIcon name="check" size={18} /> Select Folder
            </button>
        </div>
    );

    return (
        <ResponsiveModal
            isOpen={true}
            onClose={onCancel}
            title="Browse Folders"
            widthClass="max-w-lg"
            actions={footerActions}
        >
            <div className="flex flex-col h-[400px]">
                {/* Header Extra */}
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-border/50 shrink-0">
                    <div className="flex gap-2">
                        {headerActions}
                        <span className="text-[10px] font-bold text-text-muted uppercase tracking-widest self-center">Explorer</span>
                    </div>
                </div>

                {/* Path Bar */}
                <div className="px-3 py-2 bg-canvas border border-border rounded-xl flex items-center gap-2 font-mono text-xs text-text-muted overflow-x-auto no-scrollbar mb-2 shrink-0">
                    <Home size={12} className="shrink-0" /> {currentPath}
                </div>

                {/* List */}
                <div className="flex-1 overflow-y-auto space-y-1 border border-border rounded-xl p-2 bg-canvas/30 custom-scrollbar">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center h-full text-primary gap-2">
                            <DynamicIcon name="loader" size={24} className="animate-spin" />
                            <span className="text-xs text-text-muted">Scanning...</span>
                        </div>
                    ) : error ? (
                        <div className="flex flex-col items-center justify-center h-full text-red-400 p-4 text-center gap-2">
                            <DynamicIcon name="alert" size={24} />
                            <span className="text-sm">{error}</span>
                        </div>
                    ) : folders.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-text-muted p-8 text-center gap-2">
                            <DynamicIcon name="archive" size={24} />
                            <span className="italic text-sm">Empty folder</span>
                        </div>
                    ) : (
                        folders.map(folder => (
                            <div
                                key={folder}
                                onClick={() => handleNavigate(folder)}
                                className="flex items-center gap-3 p-3 hover:bg-surface-highlight rounded-xl cursor-pointer text-text-main transition-colors group"
                            >
                                <DynamicIcon name="folders" size={18} className="text-text-muted group-hover:text-primary transition-colors" />
                                <span className="truncate text-sm">{folder}</span>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </ResponsiveModal>
    );
}
