import { useState } from 'react';
import FileUploader from '../components/FileUploader';
import ApiKeySettings from '../components/ApiKeySettings';
import { transcribeAudio, extractKeywords, generateScript } from '../services/groq';
import { searchStockFootage } from '../services/pexels';
import { convertToSRT, downloadFile } from '../utils/srt';
import { removeSilence } from '../utils/audioProcessing';
import { assembleVideo } from '../utils/videoAssembly';
import { Loader2, Settings, CheckCircle2, Video, FileText, AlertCircle, Zap, Download, PenTool, Music, Copy, Scissors, Film } from 'lucide-react';

export default function VideoToFootage() {
    const [activeTab, setActiveTab] = useState('audio-to-video'); // 'audio-to-video' | 'idea-to-script'
    const [step, setStep] = useState('idle');
    const [file, setFile] = useState(null);
    const [transcript, setTranscript] = useState('');
    const [segments, setSegments] = useState([]); // For SRT
    const [keywords, setKeywords] = useState([]);
    const [results, setResults] = useState({});
    const [error, setError] = useState(null);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);

    
    // Script Gen State
    const [topic, setTopic] = useState('');
    const [generatedScript, setGeneratedScript] = useState('');
    const [scriptLanguage, setScriptLanguage] = useState('English');
    const [scriptTone, setScriptTone] = useState('Viral');
    const [scriptLength, setScriptLength] = useState(150);

    // Silence Remover State
    const [processedAudioUrl, setProcessedAudioUrl] = useState(null);
    const [originalDuration, setOriginalDuration] = useState(0);
    const [newDuration, setNewDuration] = useState(0);

    // Assembly State
    const [isAssembling, setIsAssembling] = useState(false);
    const [assemblyProgress, setAssemblyProgress] = useState(0);
    const [finalVideoUrl, setFinalVideoUrl] = useState(null);
    const [orientation, setOrientation] = useState('landscape'); // 'landscape' | 'portrait'

    const getApiKeys = () => {
        const groqKey = localStorage.getItem('groq_key');
        const pexelsKey = localStorage.getItem('pexels_key');
        if (!groqKey) {
            setError("Please configure your Groq API Key in Settings.");
            setStep('idle');
            return null;
        }
        return { groqKey, pexelsKey };
    };

    const processFile = async (uploadedFile) => {
        setFile(uploadedFile);
        setError(null);
        setStep('transcribing');

        const keys = getApiKeys();
        if (!keys) return;

        try {
            // 1. Transcribe
            const data = await transcribeAudio(uploadedFile, keys.groqKey);
            setTranscript(data.text);
            setSegments(data.segments); // Store segments for SRT
            setStep('analyzing');

            // 2. Extract Keywords
            const extractedKeywords = await extractKeywords(data.text, keys.groqKey);
            const keywordList = Array.isArray(extractedKeywords) ? extractedKeywords : (extractedKeywords.keywords || []);
            setKeywords(keywordList);
            setStep('searching');

            // 3. Search Stock Footage
            if (keys.pexelsKey) {
                const searchResults = {};
                for (const keyword of keywordList) {
                    const videos = await searchStockFootage(keyword, keys.pexelsKey);
                    searchResults[keyword] = videos;
                }
                setResults(searchResults);
            }
            setStep('done');

        } catch (err) {
            console.error(err);
            setError(err.message || "An unexpected error occurred.");
            setStep('idle');
        }
    };

    const handleGenerateScript = async () => {
        if (!topic.trim()) return;
        setError(null);
        setStep('generating-script');

        const keys = getApiKeys();
        if (!keys) return;

        try {
            const script = await generateScript(topic, keys.groqKey, {
                language: scriptLanguage,
                tone: scriptTone,
                wordCount: scriptLength
            });
            setGeneratedScript(script);
            setStep('script-done');
        } catch (err) {
            console.error(err);
            setError(err.message || "Failed to generate script.");
            setStep('idle');
        }
    };

    const handleAssembly = async () => {
        if (!file || Object.keys(results).length === 0) return;
        setIsAssembling(true);
        setAssemblyProgress(0);
        setError(null);

        try {
            // Flatten results to get all video URLs
            const videoUrls = [];
            for (const key in results) {
                if (results[key] && results[key].length > 0) {
                    // Prefer HD files if available
                    const video = results[key][0];
                    const hdFile = video.video_files.find(f => f.height >= 720) || video.video_files[0];
                    videoUrls.push(hdFile.link);
                }
            }

            if (videoUrls.length === 0) throw new Error("No videos found to assemble.");

            // Create Audio URL from uploaded file
            const audioUrl = URL.createObjectURL(file);

            const finalBlob = await assembleVideo(videoUrls, audioUrl, (p) => setAssemblyProgress(p));
            const finalUrl = URL.createObjectURL(finalBlob);
            setFinalVideoUrl(finalUrl);
        } catch (err) {
            console.error(err);
            setError("Failed to assemble video. " + err.message);
        } finally {
            setIsAssembling(false);
        }
    };

    const handleRemoveSilence = async (uploadedFile) => {
        setFile(uploadedFile);
        setError(null);
        setProcessedAudioUrl(null);
        setStep('processing-audio');

        // Get duration of original for comparison (approx)
        const audio = new Audio(URL.createObjectURL(uploadedFile));
        audio.onloadedmetadata = () => setOriginalDuration(audio.duration);

        try {
            // Small timeout to allow UI to update to "processing" state
            await new Promise(resolve => setTimeout(resolve, 100));

            const processedBlob = await removeSilence(uploadedFile);
            const url = URL.createObjectURL(processedBlob);
            setProcessedAudioUrl(url);

            const newAudio = new Audio(url);
            newAudio.onloadedmetadata = () => setNewDuration(newAudio.duration);

            setStep('silence-done');
        } catch (err) {
            console.error(err);
            setError("Failed to process audio. Ensure it's a valid audio file.");
            setStep('idle');
        }
    };

    const downloadSRT = () => {
        if (!segments || segments.length === 0) return alert("No timestamps available.");
        const srtContent = convertToSRT(segments);
        downloadFile(srtContent, 'captions.srt');
    };

    const copyScript = () => {
        navigator.clipboard.writeText(generatedScript);
        alert("Script copied to clipboard!");
    };

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
                    <button
                        onClick={() => setIsSettingsOpen(true)}
                        className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors text-gray-600 dark:text-gray-300"
                        title="API Settings"
                    >
                        <Settings className="w-5 h-5" />
                    </button>
                </div>
            </header>

            <main className="max-w-5xl mx-auto px-4 py-8 space-y-8">

                {/* Navigation Tabs */}
                <div className="flex justify-center">
                    <div className="bg-white dark:bg-gray-800 p-1 rounded-xl border border-gray-200 dark:border-gray-700 inline-flex shadow-sm">
                        <button
                            onClick={() => { setActiveTab('audio-to-video'); setStep('idle'); setError(null); }}
                            className={`px-6 py-2 rounded-lg font-medium text-sm transition-all flex items-center gap-2 ${activeTab === 'audio-to-video' ? 'bg-orange-100 text-orange-700 shadow-sm' : 'text-gray-600 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-700'}`}
                        >
                            <Music className="w-4 h-4" /> Audio to Video
                        </button>
                        <button
                            onClick={() => { setActiveTab('idea-to-script'); setStep('idle'); setError(null); }}
                            className={`px-6 py-2 rounded-lg font-medium text-sm transition-all flex items-center gap-2 ${activeTab === 'idea-to-script' ? 'bg-blue-100 text-blue-700 shadow-sm' : 'text-gray-600 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-700'}`}
                        >
                            <PenTool className="w-4 h-4" /> Idea to Script
                        </button>
                        <button
                            onClick={() => { setActiveTab('silence-remover'); setStep('idle'); setError(null); }}
                            className={`px-6 py-2 rounded-lg font-medium text-sm transition-all flex items-center gap-2 ${activeTab === 'silence-remover' ? 'bg-purple-100 text-purple-700 shadow-sm' : 'text-gray-600 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-700'}`}
                        >
                            <Scissors className="w-4 h-4" /> Silence Remover
                        </button>
                    </div>
                </div>

                {/* Error Message */}
                {error && (
                    <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-3 text-red-700 dark:text-red-300 animate-in fade-in slide-in-from-top-2">
                        <AlertCircle className="w-5 h-5 flex-shrink-0" />
                        <p>{error}</p>
                    </div>
                )}

                {/* Loading State */}
                {(step === 'transcribing' || step === 'analyzing' || step === 'searching' || step === 'generating-script' || step === 'processing-audio') && (
                    <div className="bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 text-center py-12">
                        <Loader2 className="w-12 h-12 text-orange-600 animate-spin mx-auto mb-4" />
                        <h2 className="text-xl font-semibold mb-2 capitalize animate-pulse">
                            {step === 'transcribing' && "Transcribing Audio (Groq Whisper)..."}
                            {step === 'analyzing' && "Extracting Visuals (Llama 3)..."}
                            {step === 'searching' && "Curating Stock Footage..."}
                            {step === 'generating-script' && "Writing Viral Script..."}
                            {step === 'processing-audio' && "Removing Silence & Pauses..."}
                        </h2>
                        <p className="text-gray-500 dark:text-gray-400">
                            {step === 'processing-audio' ? "Analyzing audio waveforms..." : "AI is working its magic..."}
                        </p>
                    </div>
                )}

                {/* --- TAB: AUDIO TO VIDEO --- */}
                {activeTab === 'audio-to-video' && (
                    <>
                        {step === 'idle' && (
                            <div className="max-w-2xl mx-auto animate-in fade-in">
                                <div className="mb-8 text-center">
                                    <h2 className="text-3xl font-bold mb-3">Turn Audio into Video</h2>
                                    <p className="text-gray-600 dark:text-gray-400">
                                        Upload a voiceover. We'll transcribe it, generate captions, and find perfect stock footage.
                                    </p>
                                </div>
                                <FileUploader onFileSelect={processFile} isProcessing={step !== 'idle'} />
                            </div>
                        )}

                        {step === 'done' && (
                            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
                                {/* Transcript Card */}
                                <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700">
                                    <div className="flex justify-between items-center mb-4">
                                        <h3 className="text-lg font-semibold flex items-center gap-2">
                                            <FileText className="w-5 h-5 text-blue-500" />
                                            Transcript
                                        </h3>
                                        <button
                                            onClick={downloadSRT}
                                            className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-sm font-medium rounded-lg flex items-center gap-2 transition-colors"
                                            title="Download Subtitles for Premiere/CapCut"
                                        >
                                            <Download className="w-4 h-4" />
                                            Download .SRT
                                        </button>
                                    </div>
                                    <p className="text-gray-700 dark:text-gray-300 leading-relaxed font-serif text-lg max-h-60 overflow-y-auto pr-2">
                                        "{transcript}"
                                    </p>
                                </div>

                                {/* Footage Results */}
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
                                        <button
                                            onClick={handleAssembly}
                                            disabled={isAssembling}
                                            className="px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-full font-semibold shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                        >
                                            {isAssembling ? (
                                                <>
                                                    <Loader2 className="w-5 h-5 animate-spin" />
                                                    Assembling ({assemblyProgress}%)
                                                </>
                                            ) : (
                                                <>
                                                    <Film className="w-5 h-5" />
                                                    Create Video
                                                </>
                                            )}
                                        </button>
                                    ) : (
                                        <a
                                            href={finalVideoUrl}
                                            download="final_video.mp4"
                                            className="px-6 py-3 bg-green-600 text-white rounded-full font-semibold shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all flex items-center gap-2"
                                        >
                                            <Download className="w-5 h-5" />
                                            Download Final Video
                                        </a>
                                    )}
                                </div>

                                {finalVideoUrl && (
                                    <div className="mt-8 animate-in fade-in slide-in-from-bottom-4">
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

                {/* --- TAB: IDEA TO SCRIPT --- */}
                {activeTab === 'idea-to-script' && (
                    <div className="max-w-3xl mx-auto animate-in fade-in">
                        <div className="mb-8 text-center">
                            <h2 className="text-3xl font-bold mb-3">AI Script Writer</h2>
                            <p className="text-gray-600 dark:text-gray-400">
                                Generate a viral-ready video script in seconds. Just enter a topic.
                            </p>
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
                            <select
                                value={scriptLanguage}
                                onChange={(e) => setScriptLanguage(e.target.value)}
                                className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 outline-none"
                            >
                                <option value="English">English</option>
                                <option value="Hinglish">Hinglish</option>
                                <option value="Hindi">Hindi</option>
                            </select>

                            <select
                                value={scriptTone}
                                onChange={(e) => setScriptTone(e.target.value)}
                                className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 outline-none"
                            >
                                <option value="Viral">Viral / Hype</option>
                                <option value="Professional">Professional</option>
                                <option value="Funny">Funny</option>
                                <option value="Educational">Educational</option>
                                <option value="Dramatic">Dramatic</option>
                            </select>

                            <div className="flex items-center gap-2 bg-white dark:bg-gray-800 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600">
                                <span className="text-sm text-gray-500 whitespace-nowrap">Length: {scriptLength}w</span>
                                <input
                                    type="range"
                                    min="50"
                                    max="500"
                                    step="10"
                                    value={scriptLength}
                                    onChange={(e) => setScriptLength(Number(e.target.value))}
                                    className="w-full accent-blue-600 cursor-pointer"
                                />
                            </div>
                        </div>

                        <button
                            onClick={handleGenerateScript}
                            disabled={!topic.trim() || step === 'generating-script'}
                            className="w-full px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold shadow-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            <PenTool className="w-5 h-5" />
                            Generate Script
                        </button>

                        {step === 'script-done' && (
                            <div className="bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 relative">
                                <button
                                    onClick={copyScript}
                                    className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                                    title="Copy to Clipboard"
                                >
                                    <Copy className="w-5 h-5" />
                                </button>
                                <div className="prose dark:prose-invert max-w-none whitespace-pre-wrap font-serif text-lg leading-relaxed">
                                    {generatedScript}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* --- TAB: SILENCE REMOVER --- */}
                {activeTab === 'silence-remover' && (
                    <div className="max-w-2xl mx-auto animate-in fade-in">
                        <div className="mb-8 text-center">
                            <h2 className="text-3xl font-bold mb-3">Silence Remover</h2>
                            <p className="text-gray-600 dark:text-gray-400">
                                Automatically remove silent pauses from your audio recordings.
                            </p>
                        </div>

                        {step === 'idle' && (
                            <FileUploader onFileSelect={handleRemoveSilence} isProcessing={false} />
                        )}

                        {step === 'silence-done' && processedAudioUrl && (
                            <div className="bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 text-center space-y-6">
                                <div className="flex justify-center">
                                    <div className="bg-green-100 text-green-700 p-4 rounded-full">
                                        <CheckCircle2 className="w-10 h-10" />
                                    </div>
                                </div>

                                <div>
                                    <h3 className="text-2xl font-bold mb-2">Processing Complete!</h3>
                                    <p className="text-gray-600 dark:text-gray-400">
                                        Your audio has been cleaned up.
                                        {originalDuration > 0 && newDuration > 0 && (
                                            <span className="block mt-2 text-sm bg-gray-100 dark:bg-gray-700 inline-block px-3 py-1 rounded-full">
                                                Reduced from {originalDuration.toFixed(1)}s to {newDuration.toFixed(1)}s
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
                                    <button
                                        onClick={() => { setStep('idle'); setProcessedAudioUrl(null); }}
                                        className="px-6 py-3 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-xl font-semibold transition-colors"
                                    >
                                        Process New File
                                    </button>
                                    <a
                                        href={processedAudioUrl}
                                        download={`cleaned-${file?.name || 'audio'}.wav`}
                                        className="px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-semibold shadow-lg flex items-center gap-2 transition-colors"
                                    >
                                        <Download className="w-5 h-5" />
                                        Download WAV
                                    </a>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </main>

            <ApiKeySettings isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
        </div>
    );
}
