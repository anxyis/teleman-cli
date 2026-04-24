import { useState, useEffect } from 'react';
import { DynamicIcon } from './common/DynamicIcon';
import { api } from '../api/bridge';

interface Topic {
    chat_id: number;
    thread_id: number;
    name: string;
}

interface TopicSelectorProps {
    currentToken: string;
    selectedChatId?: string | number;
    onSelect: (topic: Topic) => void;
    onBack: () => void;
}

export function TopicSelector({ currentToken, selectedChatId, onSelect, onBack }: TopicSelectorProps) {
    const [topics, setTopics] = useState<Topic[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const fetchTopics = async () => {
            if (!selectedChatId) return;
            setLoading(true);
            try {
                const data = await api.getResources(currentToken);
                const chatTopics = (data.topics || []).filter((t: any) => t.chat_id.toString() === selectedChatId.toString());
                setTopics(chatTopics);
            } catch (e) {
                console.error("Failed to fetch topics", e);
            } finally {
                setLoading(false);
            }
        };
        fetchTopics();
    }, [currentToken, selectedChatId]);

    return (
        <div className="space-y-4 animate-in slide-in-from-right-4 duration-200">
            <button onClick={onBack} className="flex items-center gap-2 text-sm text-text-muted hover:text-text-main transition-colors mb-2">
                <DynamicIcon name="chevron-left" size={16} /> Back to Chats
            </button>

            <div className="bg-canvas/50 border border-border rounded-xl overflow-hidden">
                <div className="p-3 bg-surface border-b border-border">
                    <h4 className="text-xs font-bold text-text-muted uppercase tracking-widest">Select Topic</h4>
                </div>
                <div className="max-h-60 overflow-y-auto divide-y divide-border/50">
                    {loading ? (
                        <div className="p-8 text-center text-text-muted flex flex-col items-center gap-2">
                            <DynamicIcon name="loader" size={24} className="animate-spin" />
                            <p className="text-xs">Loading topics...</p>
                        </div>
                    ) : topics.length === 0 ? (
                        <div className="p-8 text-center text-text-muted italic text-sm">No topics found in this chat.</div>
                    ) : (
                        topics.map(t => (
                            <button
                                key={t.thread_id}
                                onClick={() => onSelect(t)}
                                className="w-full flex items-center gap-3 p-4 hover:bg-surface-highlight text-left transition-colors group"
                            >
                                <div className="p-2 bg-surface-highlight group-hover:bg-primary/10 rounded-lg text-text-muted group-hover:text-primary transition-colors">
                                    <DynamicIcon name="hash" size={16} />
                                </div>
                                <div>
                                    <p className="text-sm font-bold text-text-main">{t.name}</p>
                                    <p className="text-[10px] text-text-muted font-mono uppercase tracking-tighter opacity-60">Thread ID: {t.thread_id}</p>
                                </div>
                            </button>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}
