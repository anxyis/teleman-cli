import { useState, useMemo } from 'react';
import { Plus, Save, FileJson, Trash2, Beaker, Check, ArrowLeft, Video, Archive, Wand2, Copy, X } from 'lucide-react';
import axios from 'axios';
import { ResponsiveModal } from './common/ResponsiveModal';

interface PresetRule {
    extensions?: string[];
    exclude?: string[];
    minSize?: number;
    maxSize?: number;
    regex?: string;
    smartSplit?: boolean;
    smartSplitStrategy?: 're-encode' | 'copy';
    archiveMode?: 'zip_folder' | 'zip_indiv' | 'none';
    archiveSize?: number;
    archivePassword?: string;
}

interface Preset {
    id: string;
    name: string;
    rules: PresetRule;
}

interface PresetManagerProps {
    presets: Preset[];
    onClose: () => void;
    onRefresh: () => void;
    openNew?: boolean;
}

export function PresetManager({ presets, onClose, onRefresh, openNew = false }: PresetManagerProps) {
    const [editingId, setEditingId] = useState<string | null>(openNew ? 'new' : null);

    // Form State
    const [name, setName] = useState('');
    const [extInc, setExtInc] = useState('');
    const [extExc, setExtExc] = useState('');
    const [minSize, setMinSize] = useState(0);
    const [maxSize, setMaxSize] = useState(2048);
    const [regex, setRegex] = useState('');

    // Sync Strategy State
    const [smartSplit, setSmartSplit] = useState(false);
    const [splitStrategy, setSplitStrategy] = useState<'re-encode' | 'copy'>('re-encode');
    const [archiveMode, setArchiveMode] = useState<'none' | 'zip_folder' | 'zip_indiv'>('none');

    // ZIP Mode Specifics
    const [archiveSize, setArchiveSize] = useState(2048);
    const [archivePassword, setArchivePassword] = useState('');

    // Regex Tester State
    const [testString, setTestString] = useState('');

    // Derived Regex Match State
    const regexMatch = useMemo(() => {
        if (!regex || !testString) return null;
        try {
            const re = new RegExp(regex);
            return re.test(testString);
        } catch {
            return null;
        }
    }, [regex, testString]);

    // Load preset into editor
    const handleEdit = (p: Preset) => {
        setEditingId(p.id);
        setName(p.name);
        setExtInc(p.rules.extensions?.join(', ') || '');
        setExtExc(p.rules.exclude?.join(', ') || '');

        // Sizes in DB/API are Bytes. Convert to MB for UI.
        setMinSize(p.rules.minSize ? Math.round(p.rules.minSize / 1024 / 1024) : 0);
        setMaxSize(p.rules.maxSize ? Math.round(p.rules.maxSize / 1024 / 1024) : 2048);

        setRegex(p.rules.regex || '');

        // Logic
        setSmartSplit(!!p.rules.smartSplit);
        setSplitStrategy(p.rules.smartSplitStrategy || 're-encode');
        setArchiveMode(p.rules.archiveMode || 'none');

        // Archive Config (Bytes -> MB)
        setArchiveSize(p.rules.archiveSize ? Math.round(p.rules.archiveSize / 1024 / 1024) : 2048);
        setArchivePassword(p.rules.archivePassword || '');
    };

    const handleNew = () => {
        setEditingId('new');
        setName('New Preset');
        setExtInc('jpg, png, mp4');
        setExtExc('node_modules, .git');
        setMinSize(0);
        setMaxSize(2048);
        setRegex('');

        setSmartSplit(false);
        setSplitStrategy('re-encode');
        setArchiveMode('none');

        setArchiveSize(2048);
        setArchivePassword('');
    };

    const handleSave = async () => {
        const rules: PresetRule = {
            extensions: extInc.split(',').map(s => s.trim()).filter(Boolean),
            exclude: extExc.split(',').map(s => s.trim()).filter(Boolean),
            minSize: minSize * 1024 * 1024,
            maxSize: maxSize * 1024 * 1024,
            regex: regex,

            smartSplit: smartSplit,
            smartSplitStrategy: splitStrategy,

            archiveMode: archiveMode,
            archiveSize: archiveSize * 1024 * 1024,
            archivePassword: archivePassword || undefined
        };

        const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001';

        try {
            if (editingId === 'new') {
                await axios.post(`${API_BASE}/api/presets`, { name, rules });
            } else {
                await axios.put(`${API_BASE}/api/presets/${editingId}`, { name, rules });
            }
            onRefresh();
            setEditingId(null);
        } catch {
            alert('Failed to save preset');
        }
    };

    const handleDelete = async (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        if (!confirm("Are you sure you want to delete this preset?")) return;

        const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001';
        try {
            await axios.delete(`${API_BASE}/api/presets/${id}`);
            onRefresh();
            if (editingId === id) setEditingId(null);
        } catch (error) {
            if (axios.isAxiosError(error) && error.response?.status === 409) {
                alert("Cannot delete: This preset is currently used by active folders or groups.");
            } else {
                alert("Failed to delete preset.");
            }
        }
    };

    return (
        <ResponsiveModal
            isOpen={true} // Controlled by parent
            onClose={onClose}
            title={editingId && window.innerWidth < 768 ? (editingId === 'new' ? 'New Preset' : name) : "Preset Manager"}
            widthClass="max-w-5xl"
        >
            <div className="flex flex-col md:flex-row h-full md:h-[75vh] -m-4 md:-m-6">

                {/* ==================== LIST PANE ==================== */}
                <div className={`
                    w-full md:w-1/3 border-r border-border flex flex-col bg-surface
                    ${editingId ? 'hidden md:flex' : 'flex'}
                `}>

                    {/* Header (Desktop Only, since Modal handles mobile header) */}
                    <div className="p-4 border-b border-border flex justify-between items-center bg-surface shrink-0 hidden md:flex">
                        <div className="text-sm font-bold text-text-muted uppercase tracking-wider flex items-center gap-2">
                            <FileJson size={16} /> Saved Presets
                        </div>
                    </div>

                    {/* List Content */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-2 no-scrollbar">
                        <button
                            onClick={handleNew}
                            className="w-full flex items-center justify-center gap-2 p-4 rounded-xl border-2 border-dashed border-border text-text-muted hover:border-text-muted hover:text-text-main transition-all mb-4 hover:bg-surface-highlight/50"
                        >
                            <Plus size={18} /> <span className="font-medium">New Preset</span>
                        </button>

                        {presets.length === 0 && (
                            <div className="text-center text-text-muted text-sm py-8 opacity-60">
                                No presets found.
                            </div>
                        )}

                        {presets.map(p => (
                            <div
                                key={p.id}
                                onClick={() => handleEdit(p)}
                                className={`group p-4 rounded-xl cursor-pointer transition-all border border-transparent ${editingId === p.id ? 'bg-primary/10 border-primary/50' : 'bg-surface-highlight hover:bg-surface-highlight/80'}`}
                            >
                                <div className="flex justify-between items-start">
                                    <div>
                                        <div className={`font-bold ${editingId === p.id ? 'text-primary' : 'text-text-main'}`}>{p.name}</div>
                                        <div className="text-xs text-text-muted mt-1 flex items-center gap-1.5">
                                            {p.rules.archiveMode && p.rules.archiveMode !== 'none' ? (
                                                <><Archive size={12} className="text-blue-400" /> Archive</>
                                            ) : p.rules.smartSplit ? (
                                                <><Video size={12} className="text-purple-400" /> Smart Split</>
                                            ) : (
                                                <><Check size={12} className="text-emerald-400" /> Standard</>
                                            )}
                                        </div>
                                    </div>

                                    <button
                                        onClick={(e) => handleDelete(e, p.id)}
                                        className={`p-2 rounded-lg text-text-muted hover:bg-red-500/10 hover:text-red-400 transition-colors md:opacity-0 md:group-hover:opacity-100`}
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* ==================== EDITOR PANE ==================== */}
                <div className={`
                    flex-1 flex flex-col bg-surface relative w-full
                    ${!editingId ? 'hidden md:flex' : 'flex'}
                `}>

                    {editingId ? (
                        <>
                            {/* Mobile Header: Back Button injected into top */}
                            <div className="md:hidden p-4 border-b border-border flex items-center gap-3 bg-surface z-10">
                                <button onClick={() => setEditingId(null)} className="text-text-muted hover:text-text-main">
                                    <ArrowLeft size={24} />
                                </button>
                                <span className="font-bold text-lg">Back to List</span>
                            </div>

                            {/* Scrollable Editor Content */}
                            <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-8 no-scrollbar pb-32">

                                    {/* --- GENERAL CONFIG --- */}
                                    <div className="space-y-4">
                                        <h3 className="text-xs font-bold text-primary uppercase tracking-wider">General Configuration</h3>

                                        <div className="space-y-5">
                                            <div>
                                                <label className="text-sm text-text-muted mb-1.5 block font-medium">Preset Name</label>
                                                <input
                                                    type="text"
                                                    value={name}
                                                    onChange={e => setName(e.target.value)}
                                                    className="w-full bg-surface-highlight/50 border border-border rounded-xl px-4 py-3 text-text-main focus:outline-none focus:ring-2 focus:ring-primary/50 text-lg font-medium"
                                                    placeholder="My Backup Preset"
                                                />
                                            </div>

                                            <div className="grid grid-cols-2 gap-4">
                                                <div>
                                                    <label className="text-xs text-text-muted mb-1.5 block uppercase font-bold">Min Size (MB)</label>
                                                    <input type="number" value={minSize} onChange={e => setMinSize(Number(e.target.value))} className="w-full bg-surface-highlight/50 border border-border rounded-xl px-3 py-2.5 text-text-main focus:outline-none focus:ring-2 focus:ring-primary/50" />
                                                </div>
                                                <div>
                                                    <label className="text-xs text-text-muted mb-1.5 block uppercase font-bold">Max Size (MB)</label>
                                                    <input type="number" value={maxSize} onChange={e => setMaxSize(Number(e.target.value))} className="w-full bg-surface-highlight/50 border border-border rounded-xl px-3 py-2.5 text-text-main focus:outline-none focus:ring-2 focus:ring-primary/50" />
                                                </div>
                                            </div>

                                            <div className="space-y-4">
                                                <div>
                                                    <label className="text-sm text-text-muted mb-1.5 block font-medium">Included Extensions</label>
                                                    <input type="text" value={extInc} onChange={e => setExtInc(e.target.value)} placeholder="jpg, png, mp4" className="w-full bg-surface-highlight/50 border border-border rounded-xl px-4 py-3 text-text-main font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                                                </div>
                                                <div>
                                                    <label className="text-sm text-text-muted mb-1.5 block font-medium">Excluded Extensions</label>
                                                    <input type="text" value={extExc} onChange={e => setExtExc(e.target.value)} placeholder="txt, tmp, git" className="w-full bg-surface-highlight/50 border border-border rounded-xl px-4 py-3 text-text-main font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* --- SYNC STRATEGY: Archive Mode --- */}
                                    <div className="space-y-4">
                                        <h3 className="text-xs font-bold text-blue-400 uppercase tracking-wider flex items-center gap-2">
                                            <Archive size={14} /> Archive Mode
                                        </h3>

                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                            <button
                                                onClick={() => setArchiveMode('none')}
                                                className={`p-4 rounded-xl border text-left transition-all ${archiveMode === 'none' ? 'bg-blue-500/10 border-blue-500 ring-1 ring-blue-500/20' : 'bg-surface-highlight border-transparent hover:border-border'}`}
                                            >
                                                <div className="font-bold text-text-main text-sm">Disabled</div>
                                                <div className="text-[10px] text-text-muted mt-1 leading-tight">Sync files individually.</div>
                                            </button>
                                            <button
                                                onClick={() => setArchiveMode('zip_folder')}
                                                className={`p-4 rounded-xl border text-left transition-all ${archiveMode === 'zip_folder' ? 'bg-blue-500/10 border-blue-500 ring-1 ring-blue-500/20' : 'bg-surface-highlight border-transparent hover:border-border'}`}
                                            >
                                                <div className="font-bold text-text-main text-sm">Combined Zip</div>
                                                <div className="text-[10px] text-text-muted mt-1 leading-tight">All files into chunked zips.</div>
                                            </button>
                                            <button
                                                onClick={() => setArchiveMode('zip_indiv')}
                                                className={`p-4 rounded-xl border text-left transition-all ${archiveMode === 'zip_indiv' ? 'bg-blue-500/10 border-blue-500 ring-1 ring-blue-500/20' : 'bg-surface-highlight border-transparent hover:border-border'}`}
                                            >
                                                <div className="font-bold text-text-main text-sm">Folder Zips</div>
                                                <div className="text-[10px] text-text-muted mt-1 leading-tight">One zip per top-level folder.</div>
                                            </button>
                                        </div>

                                        {/* Archive Options */}
                                        {archiveMode !== 'none' && (
                                            <div className="animate-in fade-in slide-in-from-top-2 duration-300 bg-surface-highlight/30 border border-border rounded-xl p-5 space-y-4">
                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                    <div>
                                                        <label className="text-xs text-text-muted mb-1.5 block uppercase font-bold">Split Size (MB)</label>
                                                        <input type="number" value={archiveSize} onChange={e => setArchiveSize(Number(e.target.value))} className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-text-main focus:outline-none focus:border-blue-500" />
                                                    </div>
                                                    <div>
                                                        <label className="text-xs text-text-muted mb-1.5 block uppercase font-bold">Password (Optional)</label>
                                                        <input type="text" value={archivePassword} onChange={e => setArchivePassword(e.target.value)} className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-text-main focus:outline-none focus:border-blue-500" placeholder="Secret..." />
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* --- SYNC STRATEGY: Smart Split --- */}
                                    {archiveMode === 'none' && (
                                        <div className="space-y-4 animate-in fade-in duration-300">
                                            <div className="flex items-center justify-between">
                                                <h3 className="text-xs font-bold text-purple-400 uppercase tracking-wider flex items-center gap-2">
                                                    <Video size={14} /> Smart Video Split
                                                </h3>
                                                <label className="relative inline-flex items-center cursor-pointer">
                                                    <input type="checkbox" className="sr-only peer" checked={smartSplit} onChange={e => setSmartSplit(e.target.checked)} />
                                                    <div className="w-11 h-6 bg-surface-highlight peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-500"></div>
                                                </label>
                                            </div>

                                            {smartSplit && (
                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-2 duration-300">
                                                    <div onClick={() => setSplitStrategy('re-encode')} className={`cursor-pointer p-4 rounded-xl border transition-all ${splitStrategy === 're-encode' ? 'bg-purple-500/10 border-purple-500 ring-1 ring-purple-500/20' : 'bg-surface-highlight border-transparent hover:border-border'}`}>
                                                        <div className="flex items-center gap-2 mb-2">
                                                            <Wand2 size={18} className="text-purple-400" />
                                                            <span className="font-bold text-text-main">Re-encode</span>
                                                        </div>
                                                        <p className="text-xs text-text-muted leading-relaxed">
                                                            Best compatibility. Re-encodes videos to efficient H.264 if they exceed limits. Slower but reliable.
                                                        </p>
                                                    </div>

                                                    <div onClick={() => setSplitStrategy('copy')} className={`cursor-pointer p-4 rounded-xl border transition-all ${splitStrategy === 'copy' ? 'bg-purple-500/10 border-purple-500 ring-1 ring-purple-500/20' : 'bg-surface-highlight border-transparent hover:border-border'}`}>
                                                        <div className="flex items-center gap-2 mb-2">
                                                            <Copy size={18} className="text-purple-400" />
                                                            <span className="font-bold text-text-main">Copy Stream</span>
                                                        </div>
                                                        <p className="text-xs text-text-muted leading-relaxed">
                                                            Fastest. Splits stream without re-encoding. May cause playback issues on some clients.
                                                        </p>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* --- REGEX TESTER --- */}
                                    <div className="space-y-4 pt-4 border-t border-border">
                                        <h3 className="text-xs font-bold text-text-muted uppercase tracking-wider">Advanced Filters</h3>
                                        <div>
                                            <input type="text" value={regex} onChange={e => setRegex(e.target.value)} className="w-full bg-surface-highlight/50 border border-border rounded-xl px-4 py-3 text-text-main font-mono text-sm focus:outline-none focus:border-blue-500 transition-colors" placeholder="Regex Pattern (Optional)" />
                                        </div>

                                        <div className="bg-surface-highlight/30 p-4 rounded-xl border border-border">
                                            <div className="flex items-center gap-2 mb-3">
                                                <Beaker size={14} className="text-text-muted" />
                                                <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Regex Tester</span>
                                            </div>
                                            <div className="flex flex-col sm:flex-row gap-3">
                                                <input
                                                    type="text"
                                                    value={testString}
                                                    onChange={e => setTestString(e.target.value)}
                                                    className="flex-1 min-w-0 bg-surface border border-border rounded-lg px-3 py-2 text-text-main text-sm focus:outline-none"
                                                    placeholder="Test filename..."
                                                />
                                                <div className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 shrink-0 ${!regex ? 'bg-surface-highlight text-text-muted' :
                                                    regexMatch ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/50' :
                                                        'bg-red-500/20 text-red-400 border border-red-500/50'
                                                    }`}>
                                                    {!regex ? 'NO REGEX' : regexMatch ? <><Check size={14} className="shrink-0" /> MATCH</> : <><X size={14} className="shrink-0" /> NO MATCH</>}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                            </div>

                            {/* FIXED SAVE BAR */}
                            <div className="absolute bottom-0 left-0 right-0 p-4 bg-surface border-t border-border z-20">
                                <button
                                    onClick={handleSave}
                                    disabled={!name}
                                    className="w-full py-3.5 bg-primary hover:bg-primary-hover text-on-primary rounded-xl font-bold text-base shadow-lg shadow-primary/[var(--glow-opacity,0.20)] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-transform active:scale-95"
                                >
                                    <Save size={20} /> Save Configuration
                                </button>
                            </div>
                        </>
                    ) : (
                        /* Desktop Placeholder */
                        <div className="h-full flex flex-col items-center justify-center text-text-muted p-6 text-center">
                            <div className="w-20 h-20 bg-surface-highlight rounded-full flex items-center justify-center mb-6">
                                <FileJson size={40} className="opacity-40" />
                            </div>
                            <h3 className="text-xl font-bold mb-2">Select a Preset</h3>
                            <p className="max-w-xs opacity-60">
                                Choose a preset from the left to edit, or create a new one to get started.
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </ResponsiveModal>
    );
}
