import { useState, useEffect } from 'react';
import { Settings, Key, Save, Zap } from 'lucide-react';

export default function ApiKeySettings({ isOpen, onClose }) {
    const [groqKey, setGroqKey] = useState('');
    const [pexelsKey, setPexelsKey] = useState('');
    const [showKeys, setShowKeys] = useState(false);

    useEffect(() => {
        const storedGroq = localStorage.getItem('groq_key');
        const storedPexels = localStorage.getItem('pexels_key');
        if (storedGroq) setGroqKey(storedGroq);
        if (storedPexels) setPexelsKey(storedPexels);
    }, []);

    const handleSave = () => {
        localStorage.setItem('groq_key', groqKey);
        localStorage.setItem('pexels_key', pexelsKey);
        alert('API Keys saved securely to your browser!');
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-2xl w-full max-w-md border border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-bold flex items-center gap-2 text-gray-800 dark:text-white">
                        <Settings className="w-5 h-5" />
                        API Configuration
                    </h2>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">✕</button>
                </div>

                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 flex items-center gap-2">
                            Groq API Key <span className="text-orange-500 text-xs font-normal border border-orange-200 bg-orange-50 px-1 rounded flex items-center gap-1"><Zap className="w-3 h-3" /> Fast</span>
                        </label>
                        <div className="relative">
                            <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                                type={showKeys ? "text" : "password"}
                                value={groqKey}
                                onChange={(e) => setGroqKey(e.target.value)}
                                className="w-full pl-10 pr-4 py-2 border rounded-lg bg-gray-50 dark:bg-gray-900 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-orange-500 outline-none transition-all"
                                placeholder="gsk_..."
                            />
                        </div>
                        <p className="text-xs text-gray-500 mt-1">Required for fast transcription & analysis (Llama 3).</p>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Pexels API Key
                        </label>
                        <div className="relative">
                            <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                                type={showKeys ? "text" : "password"}
                                value={pexelsKey}
                                onChange={(e) => setPexelsKey(e.target.value)}
                                className="w-full pl-10 pr-4 py-2 border rounded-lg bg-gray-50 dark:bg-gray-900 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                placeholder="Your Pexels API Key"
                            />
                        </div>
                        <p className="text-xs text-gray-500 mt-1">Required for fetching stock footage.</p>
                    </div>

                    <div className="flex items-center gap-2 mt-2">
                        <input
                            type="checkbox"
                            id="showKeys"
                            checked={showKeys}
                            onChange={(e) => setShowKeys(e.target.checked)}
                            className="rounded text-blue-600 focus:ring-blue-500"
                        />
                        <label htmlFor="showKeys" className="text-sm text-gray-600 dark:text-gray-400 select-none cursor-pointer">Show API Keys</label>
                    </div>
                </div>

                <div className="mt-8 flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center gap-2 transition-colors shadow-lg shadow-blue-500/30"
                    >
                        <Save className="w-4 h-4" />
                        Save Configuration
                    </button>
                </div>
            </div>
        </div>
    );
}
