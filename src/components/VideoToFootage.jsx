import { useState, useEffect } from 'react';
import FileUploader from '../components/FileUploader';
import ApiKeySettings from '../components/ApiKeySettings';
import { transcribeAudio, transliterateToHinglish, extractKeywords, generateScript } from '../services/groq';
import { searchStockFootage } from '../services/pexels';
import { convertToSRT, downloadFile } from '../utils/srt';
import { removeSilence } from '../utils/audioProcessing';
import { assembleVideo } from '../utils/videoAssembly';
import {
    Loader2, Settings, CheckCircle2, Video, FileText, AlertCircle,
    Zap, Download, PenTool, Copy, Scissors, Film, Music, Clock, ChevronRight
} from 'lucide-react';

// ─── Animated Progress Bar ──────────────────────────────────────────────────
function ProgressBar({ steps, currentStepIndex, elapsedSeconds, etaSeconds }) {
    const pct = steps.length > 0 ? Math.round(((currentStepIndex) / steps.length) * 100) : 0;
    const formatTime = (s) => {
        if (!s || s <= 0) return '—';
        if (s < 60) return `${Math.ceil(s)}s`;
        return `${Math.floor(s / 60)}m ${Math.ceil(s % 60)}s`;
    };

    return (
        <div className="w-full">
            {/* Step chips */}
            <div className="flex items-center justify-between mb-3 gap-1 flex-wrap">
                {steps.map((s, i) => (
                    <div key={i} className="flex items-center gap-1">
                        <div className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full transition-all ${i < currentStepIndex
                            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                            : i === currentStepIndex
                                ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 ring-1 ring-orange-400'
                                : 'bg-gray-100 text-gray-400 dark:bg-gray-700 dark:text-gray-500'
                            }`}>
                            {i < currentStepIndex ? <CheckCircle2 className="w-3 h-3" /> : i === currentStepIndex ? <Loader2 className="w-3 h-3 animate-spin" /> : <div className="w-3 h-3 rounded-full border border-current opacity-40" />}
                            {s.label}
                        </div>
                        {i < steps.length - 1 && <ChevronRight className="w-3 h-3 text-gray-300 dark:text-gray-600" />}
                    </div>
                ))}
            </div>

            {/* Bar */}
            <div className="relative w-full h-2.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                    className="h-full bg-gradient-to-r from-orange-500 to-red-500 rounded-full transition-all duration-700 ease-out relative"
                    style={{ width: `${Math.max(pct, 2)}%` }}
                >
                    <div className="absolute inset-0 bg-white/30 animate-[shimmer_1.5s_infinite]" style={{ backgroundImage: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.4) 50%, transparent 100%)', backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite' }} />
                </div>
            </div>

            {/* Times */}
            <div className="flex justify-between text-xs text-gray-400 dark:text-gray-500 mt-1.5">
                <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {formatTime(elapsedSeconds)} elapsed</span>
                <span>{pct}% — ETA {formatTime(etaSeconds)}</span>
            </div>
        </div>
    );
}

// ─── useProgressTimer hook ────────────────────────────────────────────────────
function useProgressTimer(isRunning) {
    const [elapsed, setElapsed] = useState(0);

    useEffect(() => {
        if (!isRunning) { setElapsed(0); return; }
        setElapsed(0);
        const id = setInterval(() => setElapsed(prev => prev + 1), 1000);
        return () => clearInterval(id);
    }, [isRunning]);

    return elapsed;
}

// ─── Tab config ───────────────────────────────────────────────────────────────
const TABS = [
    { id: 'srt-generator', label: 'SRT', num: 1, color: 'teal' },
    { id: 'silence-remover', label: 'Silence Remover', num: 2, color: 'purple' },
    { id: 'idea-to-script', label: 'Script', num: 3, color: 'blue' },
    { id: 'footage-find', label: 'Footage Find', num: 4, color: 'orange' },
];

const TAB_COLORS = {
    teal: { active: 'bg-teal-100 text-teal-700', ring: 'ring-teal-400' },
    purple: { active: 'bg-purple-100 text-purple-700', ring: 'ring-purple-400' },
    blue: { active: 'bg-blue-100 text-blue-700', ring: 'ring-blue-400' },
    orange: { active: 'bg-orange-100 text-orange-700', ring: 'ring-orange-400' },
};

// ─── Component ────────────────────────────────────────────────────────────────
export default function VideoToFootage() {
    const [activeTab, setActiveTab] = useState('srt-generator');
    const [step, setStep] = useState('idle');
    const [file, setFile] = useState(null);
    const [error, setError] = useState(null);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);

    // Progress
    const [progressSteps, setProgressSteps] = useState([]);
    const [currentStepIndex, setCurrentStepIndex] = useState(0);
    const [etaSeconds, setEtaSeconds] = useState(0);
    const isProcessing = !['idle', 'done', 'srt-done', 'silence-done', 'script-done'].includes(step);
    const elapsed = useProgressTimer(isProcessing);

    // SRT State
    const [srtTranscript, setSrtTranscript] = useState('');
    const [srtSegments, setSrtSegments] = useState([]);
    const [srtFileName, setSrtFileName] = useState('captions');
    const [srtLanguage, setSrtLanguage] = useState('hinglish'); // default hinglish

    // Footage Find State
    const [transcript, setTranscript] = useState('');
    const [segments, setSegments] = useState([]);
    const [keywords, setKeywords] = useState([]);
    const [results, setResults] = useState({});
    const [isAssembling, setIsAssembling] = useState(false);
    const [assemblyProgress, setAssemblyProgress] = useState(0);
    const [finalVideoUrl, setFinalVideoUrl] = useState(null);

    // Script State
    const [topic, setTopic] = useState('');
    const [generatedScript, setGeneratedScript] = useState('');
    const [scriptLanguage, setScriptLanguage] = useState('Hinglish');
    const [scriptTone, setScriptTone] = useState('Viral');
    const [scriptLength, setScriptLength] = useState(150);

    // Silence Remover State
    const [processedAudioUrl, setProcessedAudioUrl] = useState(null);
    const [originalDuration, setOriginalDuration] = useState(0);
    const [newDuration, setNewDuration] = useState(0);

    const getApiKeys = () => {
        const groqKey = localStorage.getItem('groq_key');
        const pexelsKey = localStorage.getItem('pexels_key');
        if (!groqKey) {
            setError('Please configure your Groq API Key in Settings.');
            setStep('idle');
            return null;
        }
        return { groqKey, pexelsKey };
    };

    const startProgress = (steps, totalEta) => {
        setProgressSteps(steps);
        setCurrentStepIndex(0);
        setEtaSeconds(totalEta);
    };

    const advanceProgress = (index, remainingEta) => {
        setCurrentStepIndex(index);
        setEtaSeconds(remainingEta);
    };

    const switchTab = (id) => {
        setActiveTab(id);
        setStep('idle');
        setError(null);
    };

    // ── SRT Generator ──────────────────────────────────────────────────────────
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
        const eta = Math.max(8, fileMB * 4) + (isHinglish ? 6 : 0);
        startProgress(steps, eta);
        setStep('srt-transcribing');

        const keys = getApiKeys(); if (!keys) return;

        try {
            // Step 1: Transcribe
            advanceProgress(0, eta);
            const langParam = isHinglish ? 'hi' : (srtLanguage || null);
            const data = await transcribeAudio(uploadedFile, keys.groqKey, langParam);
            let finalSegments = data.segments || [];

            // Step 2: Hinglish transliteration
            if (isHinglish && finalSegments.length > 0) {
                advanceProgress(1, 6);
                finalSegments = await transliterateToHinglish(finalSegments, keys.groqKey);
            }

            setSrtTranscript(data.text);
            setSrtSegments(finalSegments);
            advanceProgress(steps.length, 0);
            setStep('srt-done');
        } catch (err) {
            console.error(err);
            setError(err.message || 'Failed to generate SRT.');
            setStep('idle');
        }
    };

    const downloadSrtFile = () => {
        if (!srtSegments.length) return alert('No segments available.');
        downloadFile(convertToSRT(srtSegments), `${srtFileName}.srt`);
    };

    const copySrt = () => {
        navigator.clipboard.writeText(convertToSRT(srtSegments));
        alert('SRT copied to clipboard!');
    };

    // ── Silence Remover ────────────────────────────────────────────────────────
    const handleRemoveSilence = async (uploadedFile) => {
        setFile(uploadedFile); setError(null);
        setProcessedAudioUrl(null);
        const fileMB = uploadedFile.size / (1024 * 1024);
        const eta = Math.max(6, fileMB * 3);
        startProgress([{ label: 'Analyzing Waveform' }, { label: 'Removing Silence' }, { label: 'Exporting' }], eta);
        setStep('processing-audio');

        const audio = new Audio(URL.createObjectURL(uploadedFile));
        audio.onloadedmetadata = () => setOriginalDuration(audio.duration);

        try {
            advanceProgress(0, eta);
            await new Promise(r => setTimeout(r, 100));
            advanceProgress(1, eta * 0.6);
            const processedBlob = await removeSilence(uploadedFile);
            advanceProgress(2, 1);
            const url = URL.createObjectURL(processedBlob);
            setProcessedAudioUrl(url);
            const newAudio = new Audio(url);
            newAudio.onloadedmetadata = () => setNewDuration(newAudio.duration);
            setStep('silence-done');
        } catch (err) {
            console.error(err);
            setError('Failed to process audio. Ensure it\'s a valid audio file.');
            setStep('idle');
        }
    };

    // ── Script Generator ───────────────────────────────────────────────────────
    const handleGenerateScript = async () => {
        if (!topic.trim()) return;
        setError(null);
        startProgress([{ label: 'Writing Script' }, { label: 'Polishing' }], 8);
        setStep('generating-script');

        const keys = getApiKeys(); if (!keys) return;
        try {
            advanceProgress(0, 8);
            const script = await generateScript(topic, keys.groqKey, {
                language: scriptLanguage, tone: scriptTone, wordCount: scriptLength
            });
            advanceProgress(1, 1);
            setGeneratedScript(script);
            setStep('script-done');
        } catch (err) {
            console.error(err);
            setError(err.message || 'Failed to generate script.');
            setStep('idle');
        }
    };

    const copyScript = () => { navigator.clipboard.writeText(generatedScript); alert('Script copied!'); };

    // ── Footage Find ───────────────────────────────────────────────────────────
    const handleFootageProcess = async (uploadedFile) => {
        setFile(uploadedFile); setError(null);
        setResults({}); setKeywords([]); setFinalVideoUrl(null);
        const fileMB = uploadedFile.size / (1024 * 1024);
        const eta = Math.max(15, fileMB * 4) + 10;
        startProgress([
            { label: 'Transcribing' },
            { label: 'Extracting Keywords' },
            { label: 'Finding Footage' },
        ], eta);
        setStep('transcribing');

        const keys = getApiKeys(); if (!keys) return;
        try {
            advanceProgress(0, eta);
            const data = await transcribeAudio(uploadedFile, keys.groqKey);
            setTranscript(data.text); setSegments(data.segments);
            advanceProgress(1, eta * 0.5);
            setStep('analyzing');

            const extractedKeywords = await extractKeywords(data.text, keys.groqKey);
            const keywordList = Array.isArray(extractedKeywords) ? extractedKeywords : (extractedKeywords.keywords || []);
            setKeywords(keywordList);
            advanceProgress(2, 5);
            setStep('searching');

            if (keys.pexelsKey) {
                const searchResults = {};
                for (let i = 0; i < keywordList.length; i++) {
                    const kw = keywordList[i];
                    const videos = await searchStockFootage(kw, keys.pexelsKey);
                    searchResults[kw] = videos;
                    setResults({ ...searchResults });
                    advanceProgress(2, Math.max(0, 5 - i));
                }
            }
            advanceProgress(3, 0);
            setStep('done');
        } catch (err) {
            console.error(err);
            setError(err.message || 'An unexpected error occurred.');
            setStep('idle');
        }
    };

    const downloadSRT = () => {
        if (!segments.length) return alert('No timestamps available.');
        downloadFile(convertToSRT(segments), 'captions.srt');
    };

    const handleAssembly = async () => {
        if (!file || !Object.keys(results).length) return;
        setIsAssembling(true); setAssemblyProgress(0); setError(null);
        try {
            const videoUrls = [];
            for (const key in results) {
                if (results[key]?.length > 0) {
                    const video = results[key][0];
                    const hdFile = video.video_files.find(f => f.height >= 720) || video.video_files[0];
                    videoUrls.push(hdFile.link);
                }
            }
            if (!videoUrls.length) throw new Error('No videos found to assemble.');
            const audioUrl = URL.createObjectURL(file);
            const finalBlob = await assembleVideo(videoUrls, audioUrl, (p) => setAssemblyProgress(p));
            setFinalVideoUrl(URL.createObjectURL(finalBlob));
        } catch (err) {
            setError('Failed to assemble video. ' + err.message);
        } finally {
            setIsAssembling(false);
        }
    };

    // ── Render ─────────────────────────────────────────────────────────────────
    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white transition-colors font-sans">

            {/* Header */}
            <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10 backdrop-blur-md bg-white/80 dark:bg-gray-800/80">
                <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Video className="w-6 h-6 text-orange-600" />
                        <h1 className="text-xl font-bold bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent flex items-center gap-2">
                            AutoFootage <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full border border-orange-200 flex items-center gap-1"><Zap className="w-3 h-3" /> V2</span>
                        </h1>
                    </div>
                    <button onClick={() => setIsSettingsOpen(true)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors text-gray-600 dark:text-gray-300" title="API Settings">
                        <Settings className="w-5 h-5" />
                    </button>
                </div>
            </header>

            <main className="max-w-5xl mx-auto px-4 py-8 space-y-8">

                {/* Numbered Tabs */}
                <div className="flex justify-center">
                    <div className="bg-white dark:bg-gray-800 p-1.5 rounded-2xl border border-gray-200 dark:border-gray-700 inline-flex shadow-sm gap-1">
                        {TABS.map(tab => {
                            const isActive = activeTab === tab.id;
                            const c = TAB_COLORS[tab.color];
                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => switchTab(tab.id)}
                                    className={`relative px-5 py-2 rounded-xl font-medium text-sm transition-all flex items-center gap-2 ${isActive ? `${c.active} shadow-sm ring-1 ${c.ring}` : 'text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700'
                                        }`}
                                >
                                    <span className={`w-5 h-5 rounded-full text-xs flex items-center justify-center font-bold ${isActive ? 'bg-current/20 text-current' : 'bg-gray-200 dark:bg-gray-600 text-gray-500 dark:text-gray-300'
                                        }`}>{tab.num}</span>
                                    {tab.label}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Error */}
                {error && (
                    <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-3 text-red-700 dark:text-red-300 animate-in fade-in slide-in-from-top-2">
                        <AlertCircle className="w-5 h-5 flex-shrink-0" />
                        <p>{error}</p>
                    </div>
                )}

                {/* Global Progress Panel — shown whenever processing */}
                {isProcessing && (
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 animate-in fade-in slide-in-from-top-2">
                        <div className="flex items-center gap-3 mb-5">
                            <div className="p-2 bg-orange-100 dark:bg-orange-900/30 text-orange-600 rounded-xl">
                                <Loader2 className="w-6 h-6 animate-spin" />
                            </div>
                            <div>
                                <p className="font-semibold text-base">
                                    {progressSteps[currentStepIndex]?.label ?? 'Processing…'}
                                </p>
                                <p className="text-xs text-gray-400 dark:text-gray-500">AI is working its magic — stay on this tab</p>
                            </div>
                        </div>
                        <ProgressBar
                            steps={progressSteps}
                            currentStepIndex={currentStepIndex}
                            elapsedSeconds={elapsed}
                            etaSeconds={Math.max(0, etaSeconds - elapsed)}
                        />
                    </div>
                )}

                {/* ═══════════════ TAB: SRT GENERATOR ═══════════════ */}
                {activeTab === 'srt-generator' && (
                    <div className="max-w-3xl mx-auto animate-in fade-in">
                        {step === 'idle' && (
                            <>
                                <div className="mb-8 text-center">
                                    <h2 className="text-3xl font-bold mb-3">Audio / Video → SRT</h2>
                                    <p className="text-gray-600 dark:text-gray-400">Upload any audio or video and get a ready-to-use subtitle file with perfect timings.</p>
                                </div>
                                <div className="space-y-4">
                                    <div className="flex items-center justify-center gap-3">
                                        <label className="text-sm font-medium text-gray-600 dark:text-gray-400 whitespace-nowrap">Output Language:</label>
                                        <select
                                            value={srtLanguage}
                                            onChange={(e) => setSrtLanguage(e.target.value)}
                                            className="px-4 py-2 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-teal-500 outline-none text-sm font-medium"
                                        >

                                            <option value="">Auto-detect</option>
                                            <option value="hinglish">Hinglish</option>
                                            <option value="hi">Hindi (हिन्दी Devanagari)</option>
                                            <option value="en">English</option>
                                            <option value="ur">Urdu (اردو)</option>
                                            <option value="es">Spanish</option>
                                            <option value="fr">French</option>
                                            <option value="ar">Arabic</option>
                                            <option value="zh">Chinese</option>
                                        </select>
                                    </div>
                                    {srtLanguage === 'hinglish' && (
                                        <p className="text-center text-xs text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-800 rounded-lg py-2 px-3">
                                            Transcribes Hindi audio → converts to Roman Hinglish using AI
                                        </p>
                                    )}
                                    <FileUploader onFileSelect={handleSrtGenerate} isProcessing={false} accept="audio/*,video/*" />
                                </div>
                            </>
                        )}

                        {step === 'srt-done' && srtSegments.length > 0 && (
                            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
                                <div className="flex flex-wrap gap-4 justify-center">
                                    {[
                                        { label: 'Segments', value: srtSegments.length },
                                        { label: 'Words', value: srtTranscript.split(' ').filter(Boolean).length },
                                        { label: 'Duration', value: srtSegments.length ? `${srtSegments[srtSegments.length - 1].end?.toFixed(1) ?? '—'}s` : '—' },
                                    ].map(stat => (
                                        <div key={stat.label} className="bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-800 rounded-xl px-6 py-3 text-center">
                                            <p className="text-2xl font-bold text-teal-700 dark:text-teal-300">{stat.value}</p>
                                            <p className="text-xs text-teal-600 dark:text-teal-400 uppercase tracking-wide">{stat.label}</p>
                                        </div>
                                    ))}
                                </div>

                                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                                    <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                                        <span className="font-semibold text-sm flex items-center gap-2"><FileText className="w-4 h-4 text-teal-500" /> SRT Preview</span>
                                        <button onClick={copySrt} className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 dark:hover:text-white transition-colors px-2 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700">
                                            <Copy className="w-3.5 h-3.5" /> Copy SRT
                                        </button>
                                    </div>
                                    <pre className="p-5 text-sm font-mono text-gray-700 dark:text-gray-300 whitespace-pre-wrap max-h-72 overflow-y-auto leading-relaxed">{convertToSRT(srtSegments)}</pre>
                                </div>

                                <div className="flex justify-center gap-4 flex-wrap">
                                    <button onClick={() => { setStep('idle'); setSrtTranscript(''); setSrtSegments([]); }} className="px-6 py-3 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-xl font-semibold transition-colors">
                                        Process New File
                                    </button>
                                    <button onClick={downloadSrtFile} className="px-6 py-3 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-semibold shadow-lg flex items-center gap-2 transition-colors">
                                        <Download className="w-5 h-5" /> Download .SRT
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* ═══════════════ TAB: SILENCE REMOVER ═══════════════ */}
                {activeTab === 'silence-remover' && (
                    <div className="max-w-2xl mx-auto animate-in fade-in">
                        {step === 'idle' && (
                            <>
                                <div className="mb-8 text-center">
                                    <h2 className="text-3xl font-bold mb-3">Silence Remover</h2>
                                    <p className="text-gray-600 dark:text-gray-400">Automatically remove silent pauses from your audio recordings.</p>
                                </div>
                                <FileUploader onFileSelect={handleRemoveSilence} isProcessing={false} />
                            </>
                        )}

                        {step === 'silence-done' && processedAudioUrl && (
                            <div className="bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 text-center space-y-6">
                                <div className="flex justify-center">
                                    <div className="bg-green-100 text-green-700 p-4 rounded-full"><CheckCircle2 className="w-10 h-10" /></div>
                                </div>
                                <div>
                                    <h3 className="text-2xl font-bold mb-2">Processing Complete!</h3>
                                    <p className="text-gray-600 dark:text-gray-400">
                                        Your audio has been cleaned up.
                                        {originalDuration > 0 && newDuration > 0 && (
                                            <span className="block mt-2 text-sm bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 inline-block px-3 py-1 rounded-full border border-purple-200 dark:border-purple-800">
                                                {originalDuration.toFixed(1)}s → {newDuration.toFixed(1)}s (saved {(originalDuration - newDuration).toFixed(1)}s)
                                            </span>
                                        )}
                                    </p>
                                </div>
                                <div className="bg-gray-50 dark:bg-gray-900 p-6 rounded-xl grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <p className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Original ({originalDuration.toFixed(1)}s)</p>
                                        <audio controls src={URL.createObjectURL(file)} className="w-full" />
                                    </div>
                                    <div className="space-y-2">
                                        <p className="text-sm font-semibold text-green-600 uppercase tracking-wide">Cleaned ({newDuration.toFixed(1)}s)</p>
                                        <audio controls src={processedAudioUrl} className="w-full" />
                                    </div>
                                </div>
                                <div className="flex justify-center gap-4">
                                    <button onClick={() => { setStep('idle'); setProcessedAudioUrl(null); }} className="px-6 py-3 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-xl font-semibold transition-colors">
                                        Process New File
                                    </button>
                                    <a href={processedAudioUrl} download={`cleaned-${file?.name || 'audio'}.wav`} className="px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-semibold shadow-lg flex items-center gap-2 transition-colors">
                                        <Download className="w-5 h-5" /> Download WAV
                                    </a>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* ═══════════════ TAB: SCRIPT ═══════════════ */}
                {activeTab === 'idea-to-script' && (
                    <div className="max-w-3xl mx-auto animate-in fade-in">
                        <div className="mb-8 text-center">
                            <h2 className="text-3xl font-bold mb-3">AI Script Writer</h2>
                            <p className="text-gray-600 dark:text-gray-400">Generate a viral-ready video script in seconds. Just enter a topic.</p>
                        </div>

                        <div className="flex gap-2 mb-4">
                            <input
                                type="text"
                                value={topic}
                                onChange={(e) => setTopic(e.target.value)}
                                placeholder="Topic (e.g., The future of AI)"
                                className="flex-1 px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 outline-none text-lg"
                                onKeyDown={(e) => e.key === 'Enter' && handleGenerateScript()}
                            />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                            <select value={scriptLanguage} onChange={(e) => setScriptLanguage(e.target.value)} className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 outline-none">
                                <option value="Hinglish">Hinglish</option>
                                <option value="English">English</option>
                                <option value="Hindi">Hindi</option>
                            </select>
                            <select value={scriptTone} onChange={(e) => setScriptTone(e.target.value)} className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 outline-none">
                                <option value="Viral">Viral / Hype</option>
                                <option value="Professional">Professional</option>
                                <option value="Funny">Funny</option>
                                <option value="Educational">Educational</option>
                                <option value="Dramatic">Dramatic</option>
                            </select>
                            <div className="flex items-center gap-2 bg-white dark:bg-gray-800 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600">
                                <span className="text-sm text-gray-500 whitespace-nowrap">Length: {scriptLength}w</span>
                                <input type="range" min="50" max="500" step="10" value={scriptLength} onChange={(e) => setScriptLength(Number(e.target.value))} className="w-full accent-blue-600 cursor-pointer" />
                            </div>
                        </div>

                        <button onClick={handleGenerateScript} disabled={!topic.trim() || step === 'generating-script'} className="w-full px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold shadow-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                            <PenTool className="w-5 h-5" /> Generate Script
                        </button>

                        {step === 'script-done' && (
                            <div className="bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 relative mt-6">
                                <button onClick={copyScript} className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors" title="Copy to Clipboard">
                                    <Copy className="w-5 h-5" />
                                </button>
                                <div className="prose dark:prose-invert max-w-none whitespace-pre-wrap font-serif text-lg leading-relaxed">{generatedScript}</div>
                            </div>
                        )}
                    </div>
                )}

                {/* ═══════════════ TAB: FOOTAGE FIND ═══════════════ */}
                {activeTab === 'footage-find' && (
                    <>
                        {step === 'idle' && (
                            <div className="max-w-2xl mx-auto animate-in fade-in">
                                <div className="mb-8 text-center">
                                    <h2 className="text-3xl font-bold mb-3">Footage Find</h2>
                                    <p className="text-gray-600 dark:text-gray-400">Upload a voiceover. We'll transcribe it and find perfect stock footage for every scene.</p>
                                </div>
                                <FileUploader onFileSelect={handleFootageProcess} isProcessing={false} />
                            </div>
                        )}

                        {step === 'done' && (
                            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
                                {/* Transcript */}
                                <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700">
                                    <div className="flex justify-between items-center mb-4">
                                        <h3 className="text-lg font-semibold flex items-center gap-2"><FileText className="w-5 h-5 text-blue-500" /> Transcript</h3>
                                        <button onClick={downloadSRT} className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-sm font-medium rounded-lg flex items-center gap-2 transition-colors">
                                            <Download className="w-4 h-4" /> Download .SRT
                                        </button>
                                    </div>
                                    <p className="text-gray-700 dark:text-gray-300 leading-relaxed font-serif text-lg max-h-60 overflow-y-auto pr-2">"{transcript}"</p>
                                </div>

                                {/* Footage Grid */}
                                <div className="space-y-6">
                                    <h3 className="text-2xl font-bold">Suggested Footage</h3>
                                    {keywords.map((keyword, index) => (
                                        <div key={index} className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                                            <div className="p-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 flex items-center gap-2">
                                                <CheckCircle2 className="w-4 h-4 text-green-500" />
                                                <span className="font-medium text-gray-700 dark:text-gray-300">Context: </span>
                                                <span className="font-bold text-gray-900 dark:text-white capitalize">{keyword}</span>
                                            </div>
                                            <div className="p-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                                                {results[keyword]?.length > 0 ? (
                                                    results[keyword].map((video) => (
                                                        <div key={video.id} className="group relative rounded-xl overflow-hidden aspect-video bg-gray-200 dark:bg-gray-700 shadow-sm hover:shadow-md transition-shadow">
                                                            <img src={video.image} alt={keyword} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                                                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                                <a href={video.video_files[0]?.link} target="_blank" rel="noreferrer" className="px-4 py-2 bg-white text-gray-900 rounded-full font-medium transform translate-y-2 group-hover:translate-y-0 transition-transform shadow-lg hover:bg-gray-100">
                                                                    Download
                                                                </a>
                                                            </div>
                                                            <div className="absolute bottom-2 right-2 bg-black/60 text-white text-xs px-2 py-1 rounded">{video.duration}s</div>
                                                        </div>
                                                    ))
                                                ) : (
                                                    <p className="text-gray-500 text-sm col-span-full py-4 text-center italic">No footage found.</p>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                <div className="flex justify-center pt-8 gap-4 flex-wrap">
                                    <button onClick={() => { setStep('idle'); setFile(null); setResults({}); setFinalVideoUrl(null); }} className="px-6 py-3 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-full font-semibold shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all">
                                        Process Another File
                                    </button>
                                    {!finalVideoUrl ? (
                                        <button onClick={handleAssembly} disabled={isAssembling} className="px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-full font-semibold shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all disabled:opacity-50 flex items-center gap-2">
                                            {isAssembling ? (
                                                <><Loader2 className="w-5 h-5 animate-spin" /> Assembling ({assemblyProgress}%)</>
                                            ) : (
                                                <><Film className="w-5 h-5" /> Create Video</>
                                            )}
                                        </button>
                                    ) : (
                                        <a href={finalVideoUrl} download="final_video.mp4" className="px-6 py-3 bg-green-600 text-white rounded-full font-semibold shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all flex items-center gap-2">
                                            <Download className="w-5 h-5" /> Download Final Video
                                        </a>
                                    )}
                                </div>

                                {finalVideoUrl && (
                                    <div className="mt-8">
                                        <h3 className="text-2xl font-bold mb-4">Final Video</h3>
                                        <div className="bg-black rounded-2xl overflow-hidden shadow-2xl aspect-video mx-auto max-w-3xl border border-gray-800">
                                            <video controls src={finalVideoUrl} className="w-full h-full" />
                                        </div>
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
