import { useState, useEffect } from 'react';
import { callTelegramApi } from '../api/telegram';
import { DynamicIcon } from '../components/common/DynamicIcon';
import { AnalysisDashboard } from '../components/AnalysisDashboard';
import { PageLayout } from '../components/layout/PageLayout';
import { AnimatedText } from '../components/common/AnimatedText';
import { useTheme } from '../context/ThemeContext';
import { motion } from 'framer-motion';
import axios from 'axios';

interface PlaygroundProps {
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
      staggerChildren: 0.08
    } 
  }
};

const itemVariants: any = {
  initial: { y: 15, opacity: 0 },
  animate: { 
    y: 0, 
    opacity: 1, 
    transition: { duration: 0.4, ease: "easeOut" } 
  }
};

export function Playground({ currentToken }: PlaygroundProps) {
    const [method, setMethod] = useState('getMe');
    const [jsonParams, setJsonParams] = useState('{}');
    const [aiPrompt, setAiPrompt] = useState('');
    const [aiGenerating, setAiGenerating] = useState(false);
    const [aiStatus, setAiStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
    const [fileParams, setFileParams] = useState<{ key: string; file: File | null }[]>([]);
    const [response, setResponse] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [history, setHistory] = useState<string[]>([]);
    const { currentTheme } = useTheme();
    const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';

    useEffect(() => {
        const savedMethod = localStorage.getItem('lastMethod');
        if (savedMethod) setMethod(savedMethod);
    }, []);

    const handleSend = async () => {
        if (!currentToken) {
            setResponse({ ok: false, description: "No bot token active. Please select or add a bot." });
            return;
        }

        setLoading(true);
        setResponse(null);
        localStorage.setItem('lastMethod', method);

        try {
            let payload: any;
            try {
                const parsedJson = JSON.parse(jsonParams);
                if (fileParams.length > 0 && fileParams.some(f => f.file !== null)) {
                    const formData = new FormData();
                    Object.keys(parsedJson).forEach(key => formData.append(key, parsedJson[key]));
                    fileParams.forEach(({ key, file }) => { if (file) formData.append(key, file); });
                    payload = formData;
                } else {
                    payload = parsedJson;
                }
            } catch (e) {
                setResponse({ ok: false, description: "Invalid JSON parameters" });
                setLoading(false);
                return;
            }

            const res = await callTelegramApi({ method, params: payload, token: currentToken });
            setResponse(res);
            if (res.ok) {
                setHistory(prev => [method, ...prev.slice(0, 9)]);
            }
        } catch (err: any) {
            setResponse({ ok: false, description: err.message });
        } finally {
            setLoading(false);
        }
    };

    const handleGenerateJsonWithAi = async () => {
        setAiStatus(null);
        if (!aiPrompt.trim()) {
            setResponse({ ok: false, description: "AI prompt is empty." });
            setAiStatus({ type: 'error', message: "AI prompt is empty." });
            return;
        }

        setAiGenerating(true);
        try {
            const res = await axios.post(`${API_BASE}/api/ai/openrouter/generate-json`, {
                    method,
                    prompt: aiPrompt,
                    token: currentToken
            });

            const generatedMethod = typeof res.data?.method === 'string' ? res.data.method.trim() : '';
            const parsed = res.data?.json;
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
                throw new Error('AI did not return a valid JSON object.');
            }
            if (generatedMethod) {
                setMethod(generatedMethod);
            }

            const generatedJsonText = JSON.stringify(parsed, null, 2);
            const isSameAsCurrent = generatedJsonText === jsonParams;
            setJsonParams(generatedJsonText);
            setResponse({ ok: true, source: 'ai-json-builder', method: generatedMethod || method, result: parsed });
            setAiStatus({
                type: 'success',
                message: isSameAsCurrent
                    ? `AI chose ${generatedMethod || method}; parameters are identical to current JSON.`
                    : `AI chose ${generatedMethod || method} and injected parameters.`
            });
        } catch (e: any) {
            const errorText = e.response?.data?.error || e.message || 'AI generation failed.';
            setResponse({ ok: false, description: errorText });
            setAiStatus({ type: 'error', message: errorText });
        } finally {
            setAiGenerating(false);
        }
    };

    const addFileSlot = () => setFileParams([...fileParams, { key: 'photo', file: null }]);
    const removeFileSlot = (index: number) => setFileParams(fileParams.filter((_, i) => i !== index));
    const updateFileSlot = (index: number, field: keyof typeof fileParams[0], value: any) => {
        const newParams = [...fileParams];
        // @ts-ignore
        newParams[index][field] = value;
        setFileParams(newParams);
    };

    return (
        <PageLayout
            header={
                currentTheme?.id === 'legacy' ? (
                    <motion.h1 initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="text-xl font-bold text-text-main flex items-center gap-2">
                        <AnimatedText text="API Playground" />
                    </motion.h1>
                ) : null
            }
        >
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

                {/* Left Panel */}
                <motion.div 
                    className="lg:col-span-5 space-y-6"
                    variants={cardVariants}
                    initial="initial"
                    animate="animate"
                >
                    <div className="bg-surface border border-border p-6 space-y-6 transition-all" style={{ borderRadius: 'var(--radius-card)' }}>
                        <motion.div variants={itemVariants} className="flex items-center justify-between">
                            <h2 className="text-lg font-semibold flex items-center gap-2">
                                <DynamicIcon name="play" size={18} className="text-primary" /> <AnimatedText text="Request Builder" />
                            </h2>
                            <div className="flex gap-2">
                                {['getMe', 'getUpdates'].map(m => (
                                    <button 
                                        key={m} 
                                        onClick={() => setMethod(m)} 
                                        className="text-xs bg-surface-highlight hover:bg-surface px-2 py-1 border border-border transition-colors transition-all"
                                        style={{ borderRadius: 'var(--radius-button)' }}
                                    >
                                        {m}
                                    </button>
                                ))}
                            </div>
                        </motion.div>

                        <div className="space-y-4">
                            <motion.div variants={itemVariants}>
                                <label className="block text-xs uppercase tracking-wider text-text-muted font-bold mb-2">Method</label>
                                <input
                                    type="text"
                                    value={method}
                                    onChange={(e) => setMethod(e.target.value)}
                                    className="w-full bg-canvas border border-border p-3 font-mono text-primary outline-none transition-all"
                                    style={{ borderRadius: 'var(--radius-input)' }}
                                    placeholder="e.g. sendMessage"
                                />
                            </motion.div>

                            <motion.div variants={itemVariants}>
                                <label className="block text-xs uppercase tracking-wider text-text-muted font-bold mb-2">JSON Parameters</label>
                                <textarea
                                    value={jsonParams}
                                    onChange={(e) => setJsonParams(e.target.value)}
                                    className="w-full h-40 bg-canvas border border-border p-3 font-mono text-xs leading-relaxed outline-none resize-none transition-all"
                                    style={{ borderRadius: 'var(--radius-input)' }}
                                    placeholder='{"chat_id": 12345, "text": "Hello"}'
                                />
                            </motion.div>

                            <motion.div variants={itemVariants} className="space-y-2">
                                <label className="block text-xs uppercase tracking-wider text-text-muted font-bold">AI JSON Builder</label>
                                <textarea
                                    value={aiPrompt}
                                    onChange={(e) => setAiPrompt(e.target.value)}
                                    className="w-full h-24 bg-canvas border border-border p-3 text-xs leading-relaxed outline-none resize-none transition-all"
                                    style={{ borderRadius: 'var(--radius-input)' }}
                                    placeholder='Example: send a hello message to chat_id 123456 with markdown formatting'
                                />
                                <button
                                    onClick={handleGenerateJsonWithAi}
                                    disabled={aiGenerating}
                                    className="w-full py-2 bg-surface-highlight hover:bg-surface text-text-main rounded-lg font-medium transition-colors border border-border text-xs disabled:opacity-50"
                                >
                                    {aiGenerating ? 'Generating JSON...' : 'Generate JSON with AI'}
                                </button>
                                {aiStatus && (
                                    <div
                                        className={`text-xs px-3 py-2 rounded border ${
                                            aiStatus.type === 'success'
                                                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                                                : 'bg-red-500/10 border-red-500/30 text-red-400'
                                        }`}
                                    >
                                        {aiStatus.message}
                                    </div>
                                )}
                            </motion.div>

                            <motion.div variants={itemVariants}>
                                <div className="flex items-center justify-between mb-2">
                                    <label className="block text-xs uppercase tracking-wider text-text-muted font-bold">Files / Attachments</label>
                                    <button onClick={addFileSlot} className="text-xs flex items-center gap-1 text-primary hover:text-primary-hover font-bold">
                                        <DynamicIcon name="plus" size={12} /> Add File
                                    </button>
                                </div>

                                <div className="space-y-2">
                                    {fileParams.map((slot, idx) => (
                                        <div key={idx} className="flex gap-2 items-center bg-canvas/50 p-2 border border-border/50 transition-all" style={{ borderRadius: 'var(--radius-button)' }}>
                                            <input
                                                type="text"
                                                value={slot.key}
                                                onChange={(e) => updateFileSlot(idx, 'key', e.target.value)}
                                                className="bg-transparent border-b border-border text-xs w-20 py-1 focus:outline-none focus:border-primary"
                                                placeholder="key"
                                            />
                                            <input
                                                type="file"
                                                onChange={(e) => updateFileSlot(idx, 'file', e.target.files?.[0] || null)}
                                                className="text-xs text-text-muted file:mr-2 file:py-1 file:px-2 file:rounded-full file:border-0 file:text-xs font-semibold file:bg-surface-highlight file:text-text-main hover:file:bg-surface cursor-pointer"
                                            />
                                            <button onClick={() => removeFileSlot(idx)} className="text-text-muted hover:text-red-400 p-1">
                                                <DynamicIcon name="trash" size={14} />
                                            </button>
                                        </div>
                                    ))}
                                    {fileParams.length === 0 && (
                                        <div className="text-xs text-text-muted italic text-center py-4 border border-dashed border-border rounded-xl">No files attached</div>
                                    )}
                                </div>
                            </motion.div>

                            <motion.button
                                variants={itemVariants}
                                onClick={handleSend}
                                disabled={loading}
                                className="w-full bg-primary hover:bg-primary-hover text-on-primary font-bold py-3 shadow-lg shadow-primary/[var(--glow-opacity,0.20)] active:scale-95 transition-all disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2"
                                style={{ borderRadius: 'var(--radius-button)' }}
                            >
                                {loading ? (
                                    <DynamicIcon name="loader" size={20} className="animate-spin" />
                                ) : (
                                    <> <DynamicIcon name="play" size={16} /> Send Request </>
                                )}
                            </motion.button>
                        </div>
                    </div>
                </motion.div>

                {/* Right Panel */}
                <motion.div 
                    className="lg:col-span-7 space-y-6"
                    variants={cardVariants}
                    initial="initial"
                    animate="animate"
                >
                    <div className="bg-surface border border-border flex flex-col h-[700px] overflow-hidden transition-all" style={{ borderRadius: 'var(--radius-card)' }}>
                        <motion.div variants={itemVariants} className="p-4 border-b border-border bg-canvas/50 flex items-center justify-between">
                            <h2 className="text-sm font-semibold text-text-main"><AnimatedText text="Response Output" /></h2>
                            <div className="flex items-center gap-2">
                                {response?.ok === true && <span className="flex items-center gap-1 text-xs text-emerald-400 font-bold"><DynamicIcon name="check-circle" size={14} /> OK</span>}
                                {response?.ok === false && <span className="flex items-center gap-1 text-xs text-red-400 font-bold"><DynamicIcon name="alert" size={14} /> Failed</span>}
                            </div>
                        </motion.div>

                        <motion.div variants={itemVariants} className="border-b border-border bg-canvas/30 p-2">
                            <AnalysisDashboard jsonResponse={response} currentToken={currentToken} />
                        </motion.div>

                        <motion.div variants={itemVariants} className="flex-1 overflow-auto p-4 bg-black/20">
                            {response ? (
                                <pre className="font-mono text-xs leading-loose text-emerald-400">
                                    {JSON.stringify(response, null, 2)}
                                </pre>
                            ) : (
                                <div className="h-full flex flex-col items-center justify-center text-text-muted gap-3 opacity-30">
                                    <DynamicIcon name="terminal" size={48} />
                                    <p className="text-sm font-medium">Ready to send requests to <span className="font-mono bg-surface-highlight px-1.5 py-0.5 rounded text-text-main">/telegram-api</span></p>
                                </div>
                            )}
                        </motion.div>
                    </div>

                    {history.length > 0 && (
                        <motion.div variants={itemVariants} className="mt-4 px-1">
                            <h3 className="text-xs font-bold text-text-muted uppercase tracking-widest mb-3 flex items-center gap-2">
                                <DynamicIcon name="history" size={12} /> <AnimatedText text="Recent Local Activity" />
                            </h3>
                            <div className="flex flex-wrap gap-2">
                                {history.map((h, i) => (
                                    <span 
                                        key={i} 
                                        className="text-xs px-2 py-1 bg-surface-highlight border border-border text-text-muted font-mono transition-all"
                                        style={{ borderRadius: 'var(--radius-button)' }}
                                    >
                                        {h}
                                    </span>
                                ))}
                            </div>
                        </motion.div>
                    )}
                </motion.div>
            </div>
        </PageLayout>
    );
}
