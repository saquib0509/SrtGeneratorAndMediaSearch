import { useState, useEffect } from 'react';
import FileUploader from '../components/FileUploader';
import ApiKeySettings from '../components/ApiKeySettings';
import { transcribeAudio, transliterateToHinglish, extractKeywords, generateScript } from '../services/groq';
import { searchStockFootage } from '../services/pexels';
import { convertToSRT, downloadFile } from '../utils/srt';
import { removeSilence } from '../utils/audioProcessing';
import { assembleVideo } from '../utils/videoAssembly';
import {
    Settings, CheckCircle2, Video, FileText, AlertCircle,
    Zap, Download, PenTool, Copy, Scissors, Film, Search
} from 'lucide-react';

// ─── Circular Progress Spinner ─────────────────────────────────────────────────
function CircularProgress({ steps, currentStepIndex, elapsed, eta }) {
    const total = steps.length;
    const pct = total > 0 ? Math.min((currentStepIndex / total) * 100, 99) : 0;
    const radius = 52;
    const circ = 2 * Math.PI * radius;
    const dash = (pct / 100) * circ;

    const fmt = (s) => {
        if (!s || s <= 0) return '—';
        return s < 60 ? `${Math.ceil(s)}s` : `${Math.floor(s / 60)}m ${Math.ceil(s % 60)}s`;
    };

    const currentLabel = steps[currentStepIndex]?.label ?? 'Processing…';

    return (
        <div className="flex flex-col items-center gap-4 py-6">
            <div className="relative w-36 h-36">
                {/* Track */}
                <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
                    <circle cx="60" cy="60" r={radius} fill="none" stroke="currentColor" strokeWidth="8"
                        className="text-gray-200 dark:text-gray-700" />
                    {/* Progress arc */}
                    <circle cx="60" cy="60" r={radius} fill="none"
                        stroke="url(#spinGrad)" strokeWidth="8" strokeLinecap="round"
                        strokeDasharray={`${dash} ${circ}`}
                        style={{ transition: 'stroke-dasharray 0.7s ease' }} />
                    <defs>
                        <linearGradient id="spinGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                            <stop offset="0%" stopColor="#f97316" />
                            <stop offset="100%" stopColor="#ef4444" />
                        </linearGradient>
                    </defs>
                </svg>
                {/* Inner text */}
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                    <span className="text-2xl font-bold text-orange-500">{Math.round(pct)}%</span>
                    <span className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">done</span>
                </div>
            </div>

            {/* Step label */}
            <div className="text-center">
                <p className="font-semibold text-base text-gray-800 dark:text-gray-100 animate-pulse">{currentLabel}</p>
                <div className="flex items-center justify-center gap-3 mt-1.5 text-xs text-gray-400 dark:text-gray-500">
                    <span>⏱ {fmt(elapsed)} elapsed</span>
                    <span className="w-px h-3 bg-gray-300 dark:bg-gray-600" />
                    <span>ETA {fmt(Math.max(0, eta - elapsed))}</span>
                </div>
            </div>

            {/* Step chips */}
            <div className="flex flex-wrap justify-center gap-1.5">
                {steps.map((s, i) => (
                    <span key={i} className={`text-xs px-2.5 py-0.5 rounded-full font-medium transition-all ${i < currentStepIndex
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                        : i === currentStepIndex
                            ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 ring-1 ring-orange-400'
                            : 'bg-gray-100 text-gray-400 dark:bg-gray-700 dark:text-gray-500'
                        }`}>
                        {i < currentStepIndex ? '✓ ' : ''}{s.label}
                    </span>
                ))}
            </div>
        </div>
    );
}

// ─── useElapsed timer ─────────────────────────────────────────────────────────
function useElapsed(isRunning) {
    const [elapsed, setElapsed] = useState(0);
    useEffect(() => {
        if (!isRunning) { setElapsed(0); return; }
        setElapsed(0);
        const id = setInterval(() => setElapsed(e => e + 1), 1000);
        return () => clearInterval(id);
    }, [isRunning]);
    return elapsed;
}

// ─── Tab icons & config ───────────────────────────────────────────────────────
const TABS = [
    { id: 'srt-generator', Icon: FileText, label: 'SRT', color: 'teal' },
    { id: 'silence-remover', Icon: Scissors, label: 'Silence Remover', color: 'purple' },
    { id: 'idea-to-script', Icon: PenTool, label: 'Script', color: 'blue' },
    { id: 'footage-find', Icon: Search, label: 'Footage Find', color: 'orange' },
];

const COLORS = {
    teal: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300 ring-teal-300',
    purple: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 ring-purple-300',
    blue: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 ring-blue-300',
    orange: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300 ring-orange-300',
};

// ─── Main Component ───────────────────────────────────────────────────────────
export default function VideoToFootage() {
    const [activeTab, setActiveTab] = useState('srt-generator');
    const [step, setStep] = useState('idle');
    const [file, setFile] = useState(null);
    const [error, setError] = useState(null);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);

    // Progress
    const [progressSteps, setProgressSteps] = useState([]);
    const [currentStepIndex, setCurrentStepIndex] = useState(0);
    const [eta, setEta] = useState(0);

    const isProcessing = !['idle', 'done', 'srt-done', 'silence-done', 'script-done'].includes(step);
    const elapsed = useElapsed(isProcessing);

    // ── SRT State
    const [srtTranscript, setSrtTranscript] = useState('');
    const [srtSegments, setSrtSegments] = useState([]);
    const [srtFileName, setSrtFileName] = useState('captions');
    const [srtLanguage, setSrtLanguage] = useState('hinglish');

    // ── Silence Remover State
    const [processedAudioUrl, setProcessedAudioUrl] = useState(null);
    const [originalDuration, setOriginalDuration] = useState(0);
    const [newDuration, setNewDuration] = useState(0);
    const [silenceThreshold, setSilenceThreshold] = useState(0.4); // seconds

    // ── Footage Find State
    const [transcript, setTranscript] = useState('');
    const [segments, setSegments] = useState([]);
    const [keywords, setKeywords] = useState([]);
    const [results, setResults] = useState({});
    const [isAssembling, setIsAssembling] = useState(false);
    const [assemblyProgress, setAssemblyProgress] = useState(0);
    const [finalVideoUrl, setFinalVideoUrl] = useState(null);

    // ── Script State
    const [topic, setTopic] = useState('');
    const [generatedScript, setGeneratedScript] = useState('');
    const [scriptLanguage, setScriptLanguage] = useState('Hinglish');
    const [scriptTone, setScriptTone] = useState('Viral');
    const [scriptLength, setScriptLength] = useState(150);

    // ── Helpers ───────────────────────────────────────────────────────────────
    const getApiKeys = () => {
        const groqKey = localStorage.getItem('groq_key');
        const pexelsKey = localStorage.getItem('pexels_key');
        if (!groqKey) { setError('Please configure your Groq API Key in Settings.'); setStep('idle'); return null; }
        return { groqKey, pexelsKey };
    };

    const beginProgress = (steps, totalEta) => {
        setProgressSteps(steps); setCurrentStepIndex(0); setEta(totalEta);
    };
    const advance = (idx) => setCurrentStepIndex(idx);

    const switchTab = (id) => { setActiveTab(id); setStep('idle'); setError(null); };

    // ── SRT Generator ─────────────────────────────────────────────────────────
    const handleSrtGenerate = async (uploadedFile) => {
        setSrtTranscript(''); setSrtSegments([]);
        setSrtFileName(uploadedFile.name.replace(/\.[^.]+$/, ''));
        setFile(uploadedFile); setError(null);

        const isHinglish = srtLanguage === 'hinglish';
        const steps = [
            { label: 'Transcribing' },
            ...(isHinglish ? [{ label: 'Hinglish Convert' }] : []),
            { label: 'Done' },
        ];
        const fileMB = uploadedFile.size / (1024 * 1024);
        beginProgress(steps, Math.max(8, fileMB * 4) + (isHinglish ? 6 : 0));
        setStep('srt-transcribing');

        const keys = getApiKeys(); if (!keys) return;
        try {
            advance(0);
            const data = await transcribeAudio(uploadedFile, keys.groqKey, isHinglish ? 'hi' : (srtLanguage || null));
            let finalSegments = data.segments || [];

            if (isHinglish && finalSegments.length > 0) {
                advance(1);
                finalSegments = await transliterateToHinglish(finalSegments, keys.groqKey);
            }

            setSrtTranscript(data.text);
            setSrtSegments(finalSegments);
            advance(steps.length);
            setStep('srt-done');
        } catch (err) {
            setError(err.message || 'Failed to generate SRT.');
            setStep('idle');
        }
    };

    const downloadSrtFile = () => {
        if (!srtSegments.length) return alert('No segments available.');
        downloadFile(convertToSRT(srtSegments), `${srtFileName}.srt`);
    };
    const copySrt = () => { navigator.clipboard.writeText(convertToSRT(srtSegments)); alert('SRT copied!'); };

    // ── Silence Remover ───────────────────────────────────────────────────────
    const handleRemoveSilence = async (uploadedFile) => {
        setFile(uploadedFile); setError(null); setProcessedAudioUrl(null);
        const fileMB = uploadedFile.size / (1024 * 1024);
        const steps = [{ label: 'Analyzing' }, { label: 'Removing Silence' }, { label: 'Exporting' }];
        beginProgress(steps, Math.max(6, fileMB * 3));
        setStep('processing-audio');

        const audio = new Audio(URL.createObjectURL(uploadedFile));
        audio.onloadedmetadata = () => setOriginalDuration(audio.duration);

        try {
            advance(0);
            await new Promise(r => setTimeout(r, 120));
            advance(1);
            const processedBlob = await removeSilence(uploadedFile, -40, silenceThreshold, 0.05);
            advance(2);
            const url = URL.createObjectURL(processedBlob);
            setProcessedAudioUrl(url);
            const a2 = new Audio(url);
            a2.onloadedmetadata = () => setNewDuration(a2.duration);
            setStep('silence-done');
        } catch (err) {
            console.error('Silence remover error:', err);
            setError('Failed to process audio. Ensure it\'s a valid audio file.');
            setStep('idle');
        }
    };

    // ── Script Generator ──────────────────────────────────────────────────────
    const handleGenerateScript = async () => {
        if (!topic.trim()) return;
        setError(null);
        beginProgress([{ label: 'Writing' }, { label: 'Polishing' }], 8);
        setStep('generating-script');

        const keys = getApiKeys(); if (!keys) return;
        try {
            advance(0);
            const script = await generateScript(topic, keys.groqKey, { language: scriptLanguage, tone: scriptTone, wordCount: scriptLength });
            advance(1);
            setGeneratedScript(script);
            setStep('script-done');
        } catch (err) {
            setError(err.message || 'Failed to generate script.');
            setStep('idle');
        }
    };
    const copyScript = () => { navigator.clipboard.writeText(generatedScript); alert('Script copied!'); };

    // ── Footage Find ──────────────────────────────────────────────────────────
    const handleFootageProcess = async (uploadedFile) => {
        setFile(uploadedFile); setError(null); setResults({}); setKeywords([]); setFinalVideoUrl(null);
        const fileMB = uploadedFile.size / (1024 * 1024);
        const steps = [{ label: 'Transcribing' }, { label: 'Keywords' }, { label: 'Searching' }];
        beginProgress(steps, Math.max(15, fileMB * 4) + 10);
        setStep('transcribing');

        const keys = getApiKeys(); if (!keys) return;
        try {
            advance(0);
            const data = await transcribeAudio(uploadedFile, keys.groqKey);
            setTranscript(data.text); setSegments(data.segments);

            advance(1); setStep('analyzing');
            const extractedKeywords = await extractKeywords(data.text, keys.groqKey);
            const kw = Array.isArray(extractedKeywords) ? extractedKeywords : (extractedKeywords.keywords || []);
            setKeywords(kw);

            advance(2); setStep('searching');
            if (keys.pexelsKey) {
                const res = {};
                for (const k of kw) {
                    res[k] = await searchStockFootage(k, keys.pexelsKey);
                    setResults({ ...res });
                }
            }
            advance(3);
            setStep('done');
        } catch (err) {
            setError(err.message || 'An unexpected error occurred.');
            setStep('idle');
        }
    };

    const downloadSRT = () => { if (!segments.length) return; downloadFile(convertToSRT(segments), 'captions.srt'); };

    const handleAssembly = async () => {
        if (!file || !Object.keys(results).length) return;
        setIsAssembling(true); setAssemblyProgress(0); setError(null);
        try {
            const videoUrls = Object.values(results).flatMap(vids => {
                if (!vids?.length) return [];
                const f = vids[0].video_files.find(f => f.height >= 720) || vids[0].video_files[0];
                return f ? [f.link] : [];
            });
            if (!videoUrls.length) throw new Error('No videos found.');
            const blob = await assembleVideo(videoUrls, URL.createObjectURL(file), p => setAssemblyProgress(p));
            setFinalVideoUrl(URL.createObjectURL(blob));
        } catch (err) { setError('Assembly failed: ' + err.message); }
        finally { setIsAssembling(false); }
    };

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white font-sans">

            {/* Header */}
            <header className="sticky top-0 z-20 bg-white/80 dark:bg-gray-800/80 backdrop-blur border-b border-gray-200 dark:border-gray-700">
                <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Video className="w-5 h-5 text-orange-500" />
                        <span className="font-bold text-lg bg-gradient-to-r from-orange-500 to-red-500 bg-clip-text text-transparent">AutoFootage</span>
                        <span className="hidden sm:flex text-xs bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full border border-orange-200 items-center gap-1">
                            <Zap className="w-2.5 h-2.5" /> V2
                        </span>
                    </div>
                    <button onClick={() => setIsSettingsOpen(true)} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-gray-500">
                        <Settings className="w-5 h-5" />
                    </button>
                </div>
            </header>

            <main className="max-w-5xl mx-auto px-3 sm:px-4 py-6 space-y-6">

                {/* Icon Tabs — mobile scrollable */}
                <div className="flex justify-center">
                    <div className="bg-white dark:bg-gray-800 p-1 rounded-2xl border border-gray-200 dark:border-gray-700 inline-flex gap-1 shadow-sm overflow-x-auto max-w-full">
                        {TABS.map(({ id, Icon, label, color }) => {
                            const active = activeTab === id;
                            return (
                                <button
                                    key={id}
                                    onClick={() => switchTab(id)}
                                    title={label}
                                    className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-xl transition-all whitespace-nowrap text-sm font-medium ${active
                                        ? `${COLORS[color]} ring-1`
                                        : 'text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700'
                                        }`}
                                >
                                    <Icon className="w-4 h-4 flex-shrink-0" />
                                    <span className="hidden sm:inline">{label}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Error banner */}
                {error && (
                    <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl flex items-start gap-3 text-red-700 dark:text-red-300 text-sm">
                        <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                        <p>{error}</p>
                    </div>
                )}

                {/* Circular Progress — shown in place when processing */}
                {isProcessing && (
                    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm">
                        <CircularProgress
                            steps={progressSteps}
                            currentStepIndex={currentStepIndex}
                            elapsed={elapsed}
                            eta={eta}
                        />
                    </div>
                )}

                {/* ══ SRT GENERATOR ══════════════════════════════════════════ */}
                {activeTab === 'srt-generator' && !isProcessing && (
                    <div className="max-w-2xl mx-auto space-y-6">
                        {step === 'idle' && (
                            <>
                                <div className="text-center">
                                    <h2 className="text-2xl sm:text-3xl font-bold mb-2">Audio / Video → SRT</h2>
                                    <p className="text-gray-500 dark:text-gray-400 text-sm sm:text-base">Upload any audio or video and get a subtitle file with perfect timings.</p>
                                </div>
                                <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                                    <label className="text-sm font-medium text-gray-600 dark:text-gray-400 whitespace-nowrap">Output Language:</label>
                                    <select
                                        value={srtLanguage}
                                        onChange={e => setSrtLanguage(e.target.value)}
                                        className="w-full sm:w-auto px-4 py-2 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-teal-500 outline-none text-sm font-medium"
                                    >
                                        <option value="hinglish">Hinglish (Roman Hindi)</option>
                                        <option value="">Auto-detect</option>
                                        <option value="hi">Hindi — हिन्दी</option>
                                        <option value="en">English</option>
                                        <option value="ur">Urdu — اردو</option>
                                        <option value="es">Spanish</option>
                                        <option value="fr">French</option>
                                        <option value="ar">Arabic</option>
                                        <option value="zh">Chinese</option>
                                    </select>
                                </div>
                                {srtLanguage === 'hinglish' && (
                                    <p className="text-center text-xs text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-800 rounded-lg py-2 px-3">
                                        Hindi audio → transcribed → AI converts to Roman Hinglish (e.g. "aaj hum baat karenge…")
                                    </p>
                                )}
                                <FileUploader onFileSelect={handleSrtGenerate} isProcessing={false} accept="audio/*,video/*" />
                            </>
                        )}

                        {step === 'srt-done' && srtSegments.length > 0 && (
                            <div className="space-y-5">
                                <div className="grid grid-cols-3 gap-3">
                                    {[
                                        { label: 'Segments', value: srtSegments.length },
                                        { label: 'Words', value: srtTranscript.split(' ').filter(Boolean).length },
                                        { label: 'Duration', value: `${(srtSegments.at(-1)?.end ?? 0).toFixed(1)}s` },
                                    ].map(s => (
                                        <div key={s.label} className="bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-800 rounded-xl py-3 text-center">
                                            <p className="text-xl sm:text-2xl font-bold text-teal-700 dark:text-teal-300">{s.value}</p>
                                            <p className="text-xs text-teal-500 uppercase tracking-wide">{s.label}</p>
                                        </div>
                                    ))}
                                </div>
                                <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                                    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60">
                                        <span className="font-semibold text-sm flex items-center gap-1.5"><FileText className="w-4 h-4 text-teal-500" /> SRT Preview</span>
                                        <button onClick={copySrt} className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700 dark:hover:text-white px-2 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                                            <Copy className="w-3.5 h-3.5" /> Copy
                                        </button>
                                    </div>
                                    <pre className="p-4 text-xs sm:text-sm font-mono text-gray-700 dark:text-gray-300 whitespace-pre-wrap max-h-64 overflow-y-auto leading-relaxed">{convertToSRT(srtSegments)}</pre>
                                </div>
                                <div className="flex flex-col sm:flex-row justify-center gap-3">
                                    <button onClick={() => { setStep('idle'); setSrtSegments([]); }} className="px-5 py-2.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 rounded-xl font-semibold text-sm transition-colors">
                                        Process New File
                                    </button>
                                    <button onClick={downloadSrtFile} className="px-5 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-semibold text-sm shadow flex items-center justify-center gap-2 transition-colors">
                                        <Download className="w-4 h-4" /> Download .SRT
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* ══ SILENCE REMOVER ════════════════════════════════════════ */}
                {activeTab === 'silence-remover' && !isProcessing && (
                    <div className="max-w-2xl mx-auto space-y-6">
                        {step === 'idle' && (
                            <>
                                <div className="text-center">
                                    <h2 className="text-2xl sm:text-3xl font-bold mb-2">Silence Remover</h2>
                                    <p className="text-gray-500 dark:text-gray-400 text-sm">Remove silent pauses from your recordings automatically.</p>
                                </div>

                                {/* Threshold slider */}
                                <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5 space-y-3">
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Remove gaps longer than</span>
                                        <span className="text-lg font-bold text-purple-600 dark:text-purple-400 tabular-nums min-w-[4rem] text-right">
                                            {silenceThreshold < 1
                                                ? `${Math.round(silenceThreshold * 1000)}ms`
                                                : `${silenceThreshold.toFixed(2)}s`}
                                        </span>
                                    </div>
                                    <input
                                        type="range"
                                        min="0.001"
                                        max="5"
                                        step="0.001"
                                        value={silenceThreshold}
                                        onChange={e => setSilenceThreshold(Number(e.target.value))}
                                        className="w-full h-2 accent-purple-600 cursor-pointer rounded-full"
                                    />
                                    <div className="flex justify-between text-xs text-gray-400">
                                        <span>1ms (very aggressive)</span>
                                        <span>5s (only long pauses)</span>
                                    </div>
                                    {/* Quick preset chips */}
                                    <div className="flex flex-wrap gap-2 pt-1">
                                        {[
                                            { label: 'Strict (100ms)', val: 0.1 },
                                            { label: 'Normal (400ms)', val: 0.4 },
                                            { label: 'Relaxed (1s)', val: 1 },
                                            { label: 'Long (2s)', val: 2 },
                                        ].map(p => (
                                            <button
                                                key={p.val}
                                                onClick={() => setSilenceThreshold(p.val)}
                                                className={`text-xs px-3 py-1 rounded-full border transition-colors ${silenceThreshold === p.val
                                                    ? 'bg-purple-100 text-purple-700 border-purple-300 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-600'
                                                    : 'border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-purple-300 hover:text-purple-600 dark:hover:text-purple-400'
                                                    }`}
                                            >
                                                {p.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <FileUploader onFileSelect={handleRemoveSilence} isProcessing={false} />
                            </>
                        )}

                        {step === 'silence-done' && processedAudioUrl && (
                            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 space-y-6 text-center">
                                <div className="flex justify-center">
                                    <div className="bg-green-100 text-green-600 p-4 rounded-full"><CheckCircle2 className="w-10 h-10" /></div>
                                </div>
                                <div>
                                    <h3 className="text-xl font-bold mb-1">Done!</h3>
                                    <p className="text-gray-500 text-sm">
                                        {originalDuration > 0 && newDuration > 0 &&
                                            `${originalDuration.toFixed(1)}s → ${newDuration.toFixed(1)}s · saved ${(originalDuration - newDuration).toFixed(1)}s`}
                                    </p>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-gray-50 dark:bg-gray-900 rounded-xl p-4">
                                    <div className="space-y-1">
                                        <p className="text-xs font-semibold text-gray-400 uppercase">Original</p>
                                        <audio controls src={URL.createObjectURL(file)} className="w-full" />
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-xs font-semibold text-green-500 uppercase">Cleaned</p>
                                        <audio controls src={processedAudioUrl} className="w-full" />
                                    </div>
                                </div>
                                <div className="flex flex-col sm:flex-row justify-center gap-3">
                                    <button onClick={() => { setStep('idle'); setProcessedAudioUrl(null); }} className="px-5 py-2.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 rounded-xl font-semibold text-sm transition-colors">
                                        Process New File
                                    </button>
                                    <a href={processedAudioUrl} download={`cleaned-${file?.name || 'audio'}.wav`} className="px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-semibold text-sm shadow flex items-center justify-center gap-2 transition-colors">
                                        <Download className="w-4 h-4" /> Download WAV
                                    </a>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* ══ SCRIPT ═════════════════════════════════════════════════ */}
                {activeTab === 'idea-to-script' && !isProcessing && (
                    <div className="max-w-2xl mx-auto space-y-5">
                        <div className="text-center">
                            <h2 className="text-2xl sm:text-3xl font-bold mb-2">AI Script Writer</h2>
                            <p className="text-gray-500 dark:text-gray-400 text-sm">Generate a viral-ready script from any topic.</p>
                        </div>

                        <input
                            type="text" value={topic} onChange={e => setTopic(e.target.value)}
                            placeholder="Topic (e.g. The future of AI)"
                            className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 outline-none text-base"
                            onKeyDown={e => e.key === 'Enter' && handleGenerateScript()}
                        />

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <select value={scriptLanguage} onChange={e => setScriptLanguage(e.target.value)} className="px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 outline-none text-sm">
                                <option value="Hinglish">Hinglish</option>
                                <option value="English">English</option>
                                <option value="Hindi">Hindi</option>
                            </select>
                            <select value={scriptTone} onChange={e => setScriptTone(e.target.value)} className="px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 outline-none text-sm">
                                <option value="Viral">Viral / Hype</option>
                                <option value="Professional">Professional</option>
                                <option value="Funny">Funny</option>
                                <option value="Educational">Educational</option>
                                <option value="Dramatic">Dramatic</option>
                            </select>
                            <div className="flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 rounded-xl">
                                <span className="text-xs text-gray-400 whitespace-nowrap">{scriptLength}w</span>
                                <input type="range" min="50" max="500" step="10" value={scriptLength} onChange={e => setScriptLength(Number(e.target.value))} className="w-full accent-blue-600 cursor-pointer" />
                            </div>
                        </div>

                        <button onClick={handleGenerateScript} disabled={!topic.trim() || step === 'generating-script'} className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold text-sm shadow transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                            <PenTool className="w-4 h-4" /> Generate Script
                        </button>

                        {step === 'script-done' && (
                            <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl border border-gray-200 dark:border-gray-700 relative">
                                <button onClick={copyScript} className="absolute top-3 right-3 p-2 text-gray-400 hover:text-gray-700 dark:hover:text-white rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                                    <Copy className="w-4 h-4" />
                                </button>
                                <div className="prose dark:prose-invert max-w-none whitespace-pre-wrap text-base leading-relaxed">{generatedScript}</div>
                            </div>
                        )}
                    </div>
                )}

                {/* ══ FOOTAGE FIND ═══════════════════════════════════════════ */}
                {activeTab === 'footage-find' && !isProcessing && (
                    <>
                        {step === 'idle' && (
                            <div className="max-w-2xl mx-auto space-y-5">
                                <div className="text-center">
                                    <h2 className="text-2xl sm:text-3xl font-bold mb-2">Footage Find</h2>
                                    <p className="text-gray-500 dark:text-gray-400 text-sm">Upload a voiceover — we'll find perfect stock footage for every scene.</p>
                                </div>
                                <FileUploader onFileSelect={handleFootageProcess} isProcessing={false} />
                            </div>
                        )}

                        {step === 'done' && (
                            <div className="space-y-6">
                                {/* Transcript */}
                                <div className="bg-white dark:bg-gray-800 p-4 sm:p-6 rounded-2xl border border-gray-200 dark:border-gray-700">
                                    <div className="flex items-center justify-between mb-3">
                                        <h3 className="font-semibold flex items-center gap-2 text-sm sm:text-base"><FileText className="w-4 h-4 text-blue-500" /> Transcript</h3>
                                        <button onClick={downloadSRT} className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 text-xs rounded-lg flex items-center gap-1 transition-colors">
                                            <Download className="w-3.5 h-3.5" /> .SRT
                                        </button>
                                    </div>
                                    <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed max-h-40 overflow-y-auto">"{transcript}"</p>
                                </div>

                                {/* Footage Grid */}
                                {keywords.map((kw, i) => (
                                    <div key={i} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                                        <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 flex items-center gap-2 text-sm">
                                            <CheckCircle2 className="w-4 h-4 text-green-500" />
                                            <span className="font-semibold capitalize">{kw}</span>
                                        </div>
                                        <div className="p-3 grid grid-cols-2 sm:grid-cols-3 gap-3">
                                            {results[kw]?.length > 0 ? results[kw].map(v => (
                                                <div key={v.id} className="group relative rounded-xl overflow-hidden aspect-video bg-gray-200 dark:bg-gray-700">
                                                    <img src={v.image} alt={kw} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                        <a href={v.video_files[0]?.link} target="_blank" rel="noreferrer" className="px-3 py-1.5 bg-white text-gray-900 rounded-full text-xs font-medium shadow">Download</a>
                                                    </div>
                                                    <div className="absolute bottom-1.5 right-1.5 bg-black/60 text-white text-xs px-1.5 py-0.5 rounded">{v.duration}s</div>
                                                </div>
                                            )) : <p className="col-span-full text-center text-gray-400 text-sm py-4 italic">No footage found.</p>}
                                        </div>
                                    </div>
                                ))}

                                <div className="flex flex-col sm:flex-row justify-center gap-3 pt-2">
                                    <button onClick={() => { setStep('idle'); setFile(null); setResults({}); setFinalVideoUrl(null); }} className="px-5 py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-full font-semibold text-sm shadow hover:-translate-y-0.5 transition-all">
                                        Process Another
                                    </button>
                                    {!finalVideoUrl ? (
                                        <button onClick={handleAssembly} disabled={isAssembling} className="px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-full font-semibold text-sm shadow flex items-center justify-center gap-2 disabled:opacity-50 hover:-translate-y-0.5 transition-all">
                                            {isAssembling ? <><Film className="w-4 h-4 animate-spin" /> Assembling ({assemblyProgress}%)</> : <><Film className="w-4 h-4" /> Create Video</>}
                                        </button>
                                    ) : (
                                        <a href={finalVideoUrl} download="final_video.mp4" className="px-5 py-2.5 bg-green-600 text-white rounded-full font-semibold text-sm shadow flex items-center justify-center gap-2 hover:-translate-y-0.5 transition-all">
                                            <Download className="w-4 h-4" /> Download Video
                                        </a>
                                    )}
                                </div>

                                {finalVideoUrl && (
                                    <div className="bg-black rounded-2xl overflow-hidden aspect-video max-w-3xl mx-auto border border-gray-800">
                                        <video controls src={finalVideoUrl} className="w-full h-full" />
                                    </div>
                                )}
                            </div>
                        )}
                    </>
                )}

            </main>

            <ApiKeySettings isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
        </div>
    );
}
