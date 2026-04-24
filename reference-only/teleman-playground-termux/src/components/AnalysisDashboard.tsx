import { useState } from 'react';
import { Scan, Database, User, MessageSquare, Hash, Save, Check } from 'lucide-react';
import { api } from '../api/bridge';

interface AnalysisDashboardProps {
    jsonResponse: any;
    currentToken: string;
}

// Helper types for extracted data
interface ExtractedUser { id: number; username?: string; first_name: string; last_name?: string; is_bot: boolean; }
interface ExtractedChat { id: number; title?: string; type: string; username?: string; }
interface ExtractedTopic { chat_id: number; thread_id: number; name: string; }

export function AnalysisDashboard({ jsonResponse, currentToken }: AnalysisDashboardProps) {
    const [users, setUsers] = useState<ExtractedUser[]>([]);
    const [chats, setChats] = useState<ExtractedChat[]>([]);
    const [topics, setTopics] = useState<ExtractedTopic[]>([]);
    const [scanning, setScanning] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [saveStatus, setSaveStatus] = useState<'idle' | 'success'>('idle');

    const handleSave = async () => {
        if (!currentToken) {
            alert('No active bot token');
            return;
        }
        setIsSaving(true);
        try {
            await api.saveResources(currentToken, { users, chats, topics });
            setSaveStatus('success');
            setTimeout(() => setSaveStatus('idle'), 3000);
        } catch (e) {
            console.error(e);
            alert('Failed to save resources');
        } finally {
            setIsSaving(false);
        }
    };

    const scanJson = () => {
        setScanning(true);
        const uniqueUsers = new Map<number, ExtractedUser>();
        const uniqueChats = new Map<number, ExtractedChat>();
        const topicMap = new Map<string, ExtractedTopic>(); // Key: chat_id:thread_id

        // Recursive scanner
        const traverse = (obj: any) => {
            if (!obj || typeof obj !== 'object') return;

            // Detect User
            if (obj.id && obj.first_name !== undefined && obj.is_bot !== undefined) {
                uniqueUsers.set(obj.id, {
                    id: obj.id,
                    first_name: obj.first_name,
                    last_name: obj.last_name,
                    username: obj.username,
                    is_bot: obj.is_bot
                });
            }

            // Detect Chat
            if (obj.id && obj.type && (obj.title || obj.username || obj.first_name)) {
                const title = obj.title || obj.username || obj.first_name;
                uniqueChats.set(obj.id, {
                    id: obj.id,
                    title,
                    type: obj.type,
                    username: obj.username
                });
            }

            // Detect Topic
            // If the message has 'is_topic_message' OR 'message_thread_id'
            if (obj.message_thread_id && obj.chat && obj.chat.id) {
                const chatId = obj.chat.id;
                const threadId = obj.message_thread_id;
                const key = `${chatId}:${threadId}`;

                // Check for explicit topic creation info (highest priority name)
                const creationInfo = obj.forum_topic_created;
                const replyCreationInfo = obj.reply_to_message?.forum_topic_created;

                let detectedName = creationInfo?.name || replyCreationInfo?.name;

                // Check if we already have this topic
                const existing = topicMap.get(key);

                if (detectedName) {
                    // If we found a *real* name, overwrite whatever we had or create new
                    topicMap.set(key, {
                        chat_id: chatId,
                        thread_id: threadId,
                        name: detectedName
                    });
                } else if (!existing) {
                    // If no real name found yet, and no entry exists, create a placeholder
                    topicMap.set(key, {
                        chat_id: chatId,
                        thread_id: threadId,
                        name: `Topic ${threadId}`
                    });
                }
            }

            // Recurse
            Object.values(obj).forEach(traverse);
        };

        traverse(jsonResponse);

        setUsers(Array.from(uniqueUsers.values()));
        setChats(Array.from(uniqueChats.values()));
        setTopics(Array.from(topicMap.values()));
        setScanning(false);
    };

    if (!jsonResponse) return null;

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between bg-slate-900/50 p-3 rounded-lg border border-slate-800">
                <div className="flex items-center gap-2 text-slate-300">
                    <Database size={18} className="text-purple-400" />
                    <span className="font-semibold text-sm">Review & Analyze Updates</span>
                </div>
                <div className="flex gap-2">
                    {(users.length > 0 || chats.length > 0 || topics.length > 0) && (
                        <button
                            onClick={handleSave}
                            disabled={isSaving}
                            className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-600 text-white text-xs px-3 py-1.5 rounded transition-colors shadow-lg shadow-emerald-900/20"
                        >
                            {saveStatus === 'success' ? <Check size={14} /> : <Save size={14} />}
                            {saveStatus === 'success' ? 'Saved' : isSaving ? 'Saving...' : 'Save to Profile'}
                        </button>
                    )}
                    <button
                        onClick={scanJson}
                        disabled={scanning}
                        className="flex items-center gap-2 bg-purple-600 hover:bg-purple-500 text-white text-xs px-3 py-1.5 rounded transition-colors shadow-lg shadow-purple-900/20"
                    >
                        <Scan size={14} /> {scanning ? 'Scanning...' : 'Scan for Resources'}
                    </button>
                </div>
            </div>

            {(users.length > 0 || chats.length > 0 || topics.length > 0) && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 animate-in slide-in-from-bottom-2 duration-300">
                    {/* Users Card */}
                    <div className="bg-slate-900/40 p-3 rounded-lg border border-slate-800/50">
                        <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                            <User size={14} /> New Users ({users.length})
                        </h4>
                        <div className="space-y-2 max-h-40 overflow-y-auto pr-1 custom-scrollbar">
                            {users.map(u => (
                                <div key={u.id} className="flex justify-between items-center bg-slate-800/30 p-2 rounded border border-white/5">
                                    <div className="overflow-hidden">
                                        <div className="text-xs text-slate-200 font-medium truncate">{u.first_name} {u.last_name}</div>
                                        <div className="text-[10px] text-slate-500 font-mono">ID: {u.id}</div>
                                    </div>
                                    {u.is_bot && <span className="text-[9px] bg-blue-900/50 text-blue-400 px-1 rounded">BOT</span>}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Chats Card */}
                    <div className="bg-slate-900/40 p-3 rounded-lg border border-slate-800/50">
                        <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                            <MessageSquare size={14} /> Chats / Groups ({chats.length})
                        </h4>
                        <div className="space-y-2 max-h-40 overflow-y-auto pr-1 custom-scrollbar">
                            {chats.map(c => (
                                <div key={c.id} className="bg-slate-800/30 p-2 rounded border border-white/5">
                                    <div className="flex justify-between items-start">
                                        <div className="text-xs text-slate-200 font-medium truncate max-w-[120px]">{c.title || 'Untitled'}</div>
                                        <span className="text-[9px] text-slate-400 uppercase border border-slate-700 px-1 rounded">{c.type}</span>
                                    </div>
                                    <div className="text-[10px] text-slate-500 font-mono mt-1 select-all">{c.id}</div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Topics Card */}
                    <div className="bg-slate-900/40 p-3 rounded-lg border border-slate-800/50">
                        <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                            <Hash size={14} /> Topics ({topics.length})
                        </h4>
                        <div className="space-y-2 max-h-40 overflow-y-auto pr-1 custom-scrollbar">
                            {topics.map((t, i) => (
                                <div key={i} className="bg-slate-800/30 p-2 rounded border border-white/5">
                                    <div className="text-xs text-slate-200 font-medium truncate">"{t.name}"</div>
                                    <div className="flex gap-2 mt-1">
                                        <span className="text-[9px] text-slate-500 bg-slate-950 px-1 rounded border border-slate-800">Thread: {t.thread_id}</span>
                                        <span className="text-[9px] text-slate-600 truncate max-w-[60px]">Chat: {t.chat_id}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
