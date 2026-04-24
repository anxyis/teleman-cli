import { useState, useEffect, useRef } from 'react';
import { api } from '../api/bridge';
import { callTelegramApi } from '../api/telegram';
import { DynamicIcon } from '../components/common/DynamicIcon';
import { AnimatedText } from '../components/common/AnimatedText';
import clsx from 'clsx';
import * as mm from 'music-metadata-browser';
import { motion } from 'framer-motion';

interface Resource {
    id: number | string;
    name: string;
    type: 'user' | 'chat' | 'topic';
    thread_id?: number;
}

interface BatchSenderProps {
    currentToken: string;
}

const cardVariants: any = {
  initial: { scaleY: 0, opacity: 0, transformOrigin: 'center' },
  animate: { 
    scaleY: 1, 
    opacity: 1, 
    transition: { 
      duration: 0.5, 
      ease: [0.22, 1, 0.36, 1] as any,
      when: "beforeChildren",
      staggerChildren: 0.05
    } 
  }
};

const itemVariants: any = {
  initial: { y: 10, opacity: 0 },
  animate: { y: 0, opacity: 1, transition: { duration: 0.3 } }
};

const processThumbnail = async (pictureData: ArrayBuffer): Promise<Blob | null> => {
    try {
        const blob = new Blob([pictureData]);
        const bitmap = await createImageBitmap(blob);
        const canvas = document.createElement('canvas');
        const maxDim = 320;
        let width = bitmap.width;
        let height = bitmap.height;
        if (width > maxDim || height > maxDim) {
            const ratio = Math.min(maxDim / width, maxDim / height);
            width = Math.round(width * ratio);
            height = Math.round(height * ratio);
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        ctx.drawImage(bitmap, 0, 0, width, height);
        return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.75));
    } catch (e) {
        console.warn("Failed to process thumbnail", e);
        return null;
    }
};

const getVideoMetadata = (file: File): Promise<{ duration: number; width: number; height: number }> => {
    return new Promise((resolve, reject) => {
        const video = document.createElement('video');
        video.preload = 'metadata';
        video.onloadedmetadata = () => {
            window.URL.revokeObjectURL(video.src);
            resolve({
                duration: Math.round(video.duration),
                width: video.videoWidth,
                height: video.videoHeight
            });
        };
        video.onerror = () => {
            window.URL.revokeObjectURL(video.src);
            reject("Failed to load video metadata");
        }
        video.src = window.URL.createObjectURL(file);
    });
};

const getImageMetadata = (file: File): Promise<{ width: number; height: number }> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            window.URL.revokeObjectURL(img.src);
            resolve({ width: img.width, height: img.height });
        };
        img.onerror = () => {
            window.URL.revokeObjectURL(img.src);
            reject("Failed to load image metadata");
        };
        img.src = window.URL.createObjectURL(file);
    });
};

export function BatchSender({ currentToken }: BatchSenderProps) {
    const [resources, setResources] = useState<Resource[]>([]);
    const [selectedResourceId, setSelectedResourceId] = useState<string>('');
    const [files, setFiles] = useState<File[]>([]);
    const [uploading, setUploading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [logs, setLogs] = useState<string[]>([]);
    const [loadingResources, setLoadingResources] = useState(false);

    const isRunningRef = useRef(false);
    const abortControllerRef = useRef<AbortController | null>(null);

    const [isFolderMode, setIsFolderMode] = useState(true);
    const [caption, setCaption] = useState('');
    const [useTimestampCaption, setUseTimestampCaption] = useState(false);
    const [sendAsDocument, setSendAsDocument] = useState(false);
    const [hasSpoiler, setHasSpoiler] = useState(false);
    const [smartCaption, setSmartCaption] = useState(false);
    const [delayMs, setDelayMs] = useState(200);

    const fetchResources = async () => {
        if (!currentToken) return;
        setLoadingResources(true);
        try {
            const data = await api.getResources(currentToken);
            const { users = [], chats = [], topics = [] } = data;
            const mapped: Resource[] = [
                ...users.map((u: any) => ({ id: u.id, name: `${u.first_name} ${u.last_name || ''}`.trim(), type: 'user' as const })),
                ...chats.map((c: any) => ({ id: c.id, name: c.title || 'Untitled Chat', type: 'chat' as const })),
                ...topics.map((t: any) => ({ id: `${t.chat_id}:${t.thread_id}`, name: `${t.name} (Topic)`, type: 'topic' as const, thread_id: t.thread_id, real_chat_id: t.chat_id }))
            ];
            setResources(mapped);
        } catch (err: any) {
            console.error(err);
            addToLog(`❌ Error fetching resources: ${err.message}`);
        } finally {
            setLoadingResources(false);
        }
    };

    useEffect(() => {
        fetchResources();
    }, [currentToken]);

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            setFiles(Array.from(e.target.files));
        }
    };

    const addToLog = (msg: string) => setLogs(prev => [msg, ...prev]);

    const handleCancel = () => {
        isRunningRef.current = false;
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            addToLog('🛑 Batch cancelled by user.');
            setUploading(false);
        }
    };

    const handleBatchSend = async () => {
        if (!currentToken || currentToken === "" || currentToken.startsWith("123456789:ABC")) {
            alert("Please add a Bot Token in Settings first.");
            return;
        }
        if (!selectedResourceId || files.length === 0) return;

        isRunningRef.current = true;
        setUploading(true);
        setProgress(0);
        setLogs([]);

        const target = resources.find(r => r.id.toString() === selectedResourceId);
        if (!target) return;

        const MAX_FILE_SIZE = 2000 * 1024 * 1024;
        let filesToSend: File[] = [];

        for (const file of files) {
            if (file.size > MAX_FILE_SIZE) {
                let offset = 0;
                let part = 1;
                const totalParts = Math.ceil(file.size / MAX_FILE_SIZE);
                addToLog(`ℹ️ Large file detected: ${file.name}. Splitting into ${totalParts} parts...`);

                while (offset < file.size) {
                    const chunk = file.slice(offset, offset + MAX_FILE_SIZE);
                    const partName = `${file.name}.part${String(part).padStart(3, '0')}`;
                    const chunkFile = new File([chunk], partName, { type: file.type || 'application/octet-stream' });
                    filesToSend.push(chunkFile);
                    offset += MAX_FILE_SIZE;
                    part++;
                }
            } else {
                filesToSend.push(file);
            }
        }

        let sentCount = 0;
        let index = 0;

        for (const file of filesToSend) {
            if (!isRunningRef.current) break;

            const formData = new FormData();
            let chatId = target.id;
            let threadId = target.thread_id;

            if (target.type === 'topic') {
                // @ts-ignore
                chatId = target.real_chat_id;
            }

            formData.append('chat_id', chatId.toString());
            if (threadId) formData.append('message_thread_id', threadId.toString());

            const isAudio = file.type.startsWith('audio/') || /\.(mp3|m4a|flac|wav|ogg|oga)$/i.test(file.name);
            const isImage = file.type.startsWith('image/');
            const isVideo = file.type.startsWith('video/');
            const forceDoc = sendAsDocument;

            let method = 'sendDocument';
            let fileKey = 'document';
            let finalCaption = caption;

            if (isAudio && !forceDoc) {
                method = 'sendAudio';
                fileKey = 'audio';
                try {
                    const metadata = await mm.parseBlob(file);
                    const { title, artist } = metadata.common;
                    const { duration } = metadata.format;
                    if (title) formData.append('title', title);
                    if (artist) formData.append('performer', artist);
                    if (duration) formData.append('duration', Math.round(duration).toString());
                    const picture = metadata.common.picture?.[0];
                    if (picture) {
                        const thumbBlob = await processThumbnail(new Uint8Array(picture.data).buffer);
                        if (thumbBlob) formData.append('thumb', thumbBlob, 'thumb.jpg');
                    }
                    if (smartCaption) finalCaption = (artist && title) ? `${artist} - ${title}` : file.name.replace(/\.[^/.]+$/, "");
                } catch (e) {
                    if (smartCaption) finalCaption = file.name.replace(/\.[^/.]+$/, "");
                }
            } else if (!forceDoc) {
                if (isImage) {
                    method = 'sendPhoto';
                    fileKey = 'photo';
                    try {
                        const meta = await getImageMetadata(file);
                        if (smartCaption) finalCaption = `${file.name} (${meta.width}x${meta.height})`;
                    } catch (e) { if (smartCaption) finalCaption = file.name; }
                } else if (isVideo) {
                    method = 'sendVideo';
                    fileKey = 'video';
                    formData.append('supports_streaming', 'true');
                    try {
                        const meta = await getVideoMetadata(file);
                        formData.append('duration', meta.duration.toString());
                        formData.append('width', meta.width.toString());
                        formData.append('height', meta.height.toString());
                        if (smartCaption) {
                            const m = Math.floor(meta.duration / 60);
                            const s = meta.duration % 60;
                            finalCaption = `${file.name} (${meta.width}x${meta.height} - ${m}:${s.toString().padStart(2,'0')})`;
                        }
                    } catch (e) { if (smartCaption) finalCaption = file.name; }
                } else if (smartCaption) finalCaption = file.name;
            }

            if (file.name.match(/\.part\d+$/)) {
                const match = file.name.match(/\.part(\d+)$/);
                const partCaption = `Part ${match ? parseInt(match[1]) : 0}`;
                finalCaption = finalCaption ? `${finalCaption}\n(${partCaption})` : `(${partCaption})`;
            }
            if (useTimestampCaption) {
                // @ts-ignore
                const date = file.lastModifiedDate || new Date(file.lastModified);
                finalCaption = finalCaption ? `${finalCaption}\n[${date.toLocaleString()}]` : `[${date.toLocaleString()}]`;
            }

            if (finalCaption) formData.append('caption', finalCaption);
            if (hasSpoiler) formData.append('has_spoiler', 'true');
            formData.append(fileKey, file);

            try {
                addToLog(`Sending ${file.name}...`);
                setProgress(0);
                const res = await callTelegramApi({
                    method, params: formData, token: currentToken,
                    onUploadProgress: (p) => setProgress(Math.min(Math.round((p.loaded * 100) / (p.total || file.size)), 99))
                });
                if (res && res.ok === false) throw new Error(res.description || "Telegram API Error");
                setProgress(100);
                sentCount++;
                addToLog(`✅ Sent ${file.name}`);
            } catch (e: any) { addToLog(`❌ Failed ${file.name}: ${e.message}`); }

            if (index < filesToSend.length - 1 && delayMs > 0) await new Promise(r => setTimeout(r, delayMs));
            index++;
        }
        isRunningRef.current = false;
        setUploading(false);
        addToLog(`🎉 Batch complete! Sent ${sentCount} / ${filesToSend.length} files.`);
    };

    return (
        <div className="max-w-4xl mx-auto p-6 space-y-6">
            <motion.div 
                variants={cardVariants}
                initial="initial"
                animate="animate"
                className="bg-surface border border-border p-6 space-y-6 transition-all"
                style={{ borderRadius: 'var(--radius-card)' }}
            >
                <motion.div variants={itemVariants} className="flex items-center gap-2 mb-6">
                    <DynamicIcon name={"folders" as any} className="text-primary" size={24} />
                    <h2 className="text-xl font-bold text-text-main"><AnimatedText text="Batch File Sender" /></h2>
                </motion.div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* LEFT COL: Inputs */}
                    <div className="space-y-4">
                        <motion.div variants={itemVariants} className="space-y-2">
                            <div className="flex justify-between items-center">
                                <label className="text-xs font-bold text-text-muted uppercase"><AnimatedText text="Select Target" /></label>
                                <button
                                    onClick={fetchResources}
                                    disabled={loadingResources}
                                    className="text-xs flex items-center gap-1 text-primary hover:text-primary-hover disabled:opacity-50"
                                >
                                    <DynamicIcon name={"refresh" as any} size={12} className={loadingResources ? "animate-spin" : ""} /> Refresh List
                                </button>
                            </div>
                            <select
                                className="w-full bg-canvas border border-border rounded-lg p-3 text-sm focus:border-primary outline-none text-text-main transition-all appearance-none"
                                style={{ borderRadius: 'var(--radius-input)' }}
                                value={selectedResourceId}
                                onChange={e => setSelectedResourceId(e.target.value)}
                            >
                                <option value="">-- Choose a recipient --</option>
                                <optgroup label="Users">
                                    {resources.filter(r => r.type === 'user').map(r => (
                                        <option key={r.id} value={r.id}>{r.name} ({r.id})</option>
                                    ))}
                                </optgroup>
                                <optgroup label="Chats/Groups">
                                    {resources.filter(r => r.type === 'chat').map(r => (
                                        <option key={r.id} value={r.id}>{r.name} ({r.id})</option>
                                    ))}
                                </optgroup>
                                {(() => {
                                    const chats = resources.filter(r => r.type === 'chat');
                                    const topics = resources.filter(r => r.type === 'topic');
                                    return chats.map(chat => {
                                        const chatTopics = topics.filter(t => (t as any).real_chat_id === chat.id);
                                        if (chatTopics.length === 0) return null;
                                        return (
                                            <optgroup key={`group-${chat.id}`} label={`Topics in ${chat.name}`}>
                                                {chatTopics.map(t => (
                                                    <option key={t.id} value={t.id}>{t.name.replace(' (Topic)', '')} (Thread {t.thread_id})</option>
                                                ))}
                                            </optgroup>
                                        );
                                    });
                                })()}
                            </select>
                        </motion.div>

                        <motion.div variants={itemVariants} className="space-y-2">
                            <label className="text-xs font-bold text-text-muted uppercase"><AnimatedText text="Caption" /></label>
                            <textarea
                                className="w-full bg-canvas border border-border p-3 text-sm focus:border-primary outline-none h-24 resize-none text-text-main transition-all"
                                style={{ borderRadius: 'var(--radius-input)' }}
                                placeholder="Add a caption for all files..."
                                value={caption}
                                onChange={e => setCaption(e.target.value)}
                            />
                            <label className="flex items-center gap-2 cursor-pointer select-none">
                                <input
                                    type="checkbox"
                                    checked={useTimestampCaption}
                                    onChange={e => setUseTimestampCaption(e.target.checked)}
                                    className="rounded bg-surface-highlight border-border text-primary focus:ring-primary"
                                />
                                <span className="text-xs text-text-muted">Append original file timestamp</span>
                            </label>
                        </motion.div>
                    </div>

                    {/* RIGHT COL: Settings */}
                    <div className="space-y-4">
                        <motion.div 
                            variants={itemVariants}
                            className="bg-canvas/40 p-4 border border-border space-y-3 transition-all"
                            style={{ borderRadius: 'var(--radius-card)' }}
                        >
                            <div className="text-xs font-bold text-text-muted uppercase mb-2"><AnimatedText text="Settings" /></div>
                            <div className="flex items-center justify-between">
                                <span className="text-xs text-text-main">Input Mode</span>
                                <div className="flex bg-surface-highlight rounded p-1" style={{ borderRadius: 'var(--radius-button)' }}>
                                    <button onClick={() => setIsFolderMode(false)} className={clsx("text-xs px-2 py-1 rounded transition-colors", !isFolderMode ? "bg-primary text-on-primary" : "text-text-muted hover:text-text-main")}>Files</button>
                                    <button onClick={() => setIsFolderMode(true)} className={clsx("text-xs px-2 py-1 rounded transition-colors", isFolderMode ? "bg-primary text-on-primary" : "text-text-muted hover:text-text-main")}>Folder</button>
                                </div>
                            </div>
                            <label className="flex items-center justify-between cursor-pointer">
                                <span className="text-xs text-text-main">Send as File</span>
                                <div className={clsx("w-8 h-4 relative transition-colors", sendAsDocument ? "bg-primary" : "bg-surface-highlight")} style={{ borderRadius: '100px' }}>
                                    <input type="checkbox" className="hidden" checked={sendAsDocument} onChange={e => setSendAsDocument(e.target.checked)} />
                                    <div className={clsx("absolute top-0.5 left-0.5 w-3 h-3 bg-white transition-transform", sendAsDocument ? "translate-x-4" : "translate-x-0")} style={{ borderRadius: '100px' }} />
                                </div>
                            </label>
                            <label className="flex items-center justify-between cursor-pointer">
                                <span className="text-xs text-text-main">Spoiler Effect</span>
                                <div className={clsx("w-8 h-4 relative transition-colors", hasSpoiler ? "bg-primary" : "bg-surface-highlight")} style={{ borderRadius: '100px' }}>
                                    <input type="checkbox" className="hidden" checked={hasSpoiler} onChange={e => setHasSpoiler(e.target.checked)} />
                                    <div className={clsx("absolute top-0.5 left-0.5 w-3 h-3 bg-white transition-transform", hasSpoiler ? "translate-x-4" : "translate-x-0")} style={{ borderRadius: '100px' }} />
                                </div>
                            </label>
                            <label className="flex items-center justify-between cursor-pointer">
                                <span className="text-xs text-text-main">Smart Caption</span>
                                <div className={clsx("w-8 h-4 relative transition-colors", smartCaption ? "bg-primary" : "bg-surface-highlight")} style={{ borderRadius: '100px' }}>
                                    <input type="checkbox" className="hidden" checked={smartCaption} onChange={e => setSmartCaption(e.target.checked)} />
                                    <div className={clsx("absolute top-0.5 left-0.5 w-3 h-3 bg-white transition-transform", smartCaption ? "translate-x-4" : "translate-x-0")} style={{ borderRadius: '100px' }} />
                                </div>
                            </label>
                            <div className="space-y-1">
                                <div className="flex justify-between text-xs text-text-main"><span>Delay</span><span className="font-mono text-primary">{delayMs}ms</span></div>
                                <input type="range" min="100" max="5000" step="100" value={delayMs} onChange={e => setDelayMs(Number(e.target.value))} className="w-full h-1 bg-surface-highlight rounded-lg appearance-none cursor-pointer accent-primary" />
                            </div>
                        </motion.div>

                        <motion.div 
                            variants={itemVariants}
                            className="border-2 border-dashed border-border p-6 text-center hover:border-primary/50 transition-all bg-canvas/20 h-40 flex flex-col items-center justify-center relative group"
                            style={{ borderRadius: 'var(--radius-card)' }}
                        >
                            <input 
                                type="file" 
                                multiple 
                                // @ts-ignore
                                webkitdirectory={isFolderMode ? "" : undefined} 
                                onChange={handleFileSelect} 
                                className="hidden" 
                                id="folder-upload" 
                                key={isFolderMode ? "folder" : "file"} 
                            />
                            <label htmlFor="folder-upload" className="cursor-pointer flex flex-col items-center gap-2">
                                <DynamicIcon name={"folders" as any} size={32} className="text-text-muted group-hover:text-primary transition-colors" />
                                <p className="font-medium text-text-main text-sm">Click to upload {isFolderMode ? 'Folder' : 'Files'}</p>
                            </label>
                            {files.length > 0 && <div className="mt-2 text-xs text-green-400 font-mono bg-surface/50 px-2 py-1 border border-green-900/30 rounded-lg">{files.length} ready</div>}
                        </motion.div>
                    </div>
                </div>

                {files.length > 0 && (
                    <motion.div variants={itemVariants} className="space-y-4 pt-4 border-t border-border">
                        {uploading && <div className="w-full bg-surface-highlight h-2 overflow-hidden rounded-full"><div className="bg-primary h-full transition-all duration-300" style={{ width: `${progress}%` }}></div></div>}
                        <button
                            onClick={uploading ? handleCancel : handleBatchSend}
                            disabled={!selectedResourceId && !uploading}
                            className={clsx("w-full py-3 font-bold flex items-center justify-center gap-2 transition-all shadow-lg rounded-xl active:scale-95", uploading ? "bg-red-500/10 text-red-400 border border-red-500/50" : "bg-primary text-on-primary hover:bg-primary-hover shadow-primary/20")}
                        >
                            <DynamicIcon name={uploading ? "x-circle" as any : "play" as any} size={18} />
                            {uploading ? `Cancel Batch (${progress}%)` : "Start Batch Send"}
                        </button>
                    </motion.div>
                )}
            </motion.div>

            <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6 }}
                className="bg-surface border border-border p-4 h-48 overflow-hidden flex flex-col transition-all"
                style={{ borderRadius: 'var(--radius-card)' }}
            >
                <div className="text-xs font-bold text-text-muted uppercase mb-2"><AnimatedText text="Operation Logs" /></div>
                <div className="flex-1 overflow-y-auto font-mono text-[10px] space-y-1 p-2 bg-canvas/50 rounded-lg">
                    {logs.map((log, i) => (
                        <div key={i} className={clsx(log.includes('❌') ? 'text-red-400' : 'text-text-muted', log.includes('🎉') && 'text-green-400 font-bold')}>{log}</div>
                    ))}
                    {logs.length === 0 && <span className="text-text-muted italic opacity-30">Waiting for action...</span>}
                </div>
            </motion.div>
        </div>
    );
}
