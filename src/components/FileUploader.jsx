import { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { UploadCloud, FileAudio, FileVideo } from 'lucide-react';

export default function FileUploader({ onFileSelect, isProcessing }) {
    const onDrop = useCallback(acceptedFiles => {
        if (acceptedFiles?.length > 0) {
            onFileSelect(acceptedFiles[0]);
        }
    }, [onFileSelect]);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: {
            'audio/*': ['.mp3', '.wav', '.m4a'],
            'video/*': ['.mp4', '.mov', '.webm']
        },
        maxFiles: 1,
        disabled: isProcessing
    });

    return (
        <div
            {...getRootProps()}
            className={`
        relative overflow-hidden rounded-2xl border-2 border-dashed p-12 text-center transition-all duration-300 cursor-pointer group
        ${isDragActive
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-gray-300 dark:border-gray-600 hover:border-blue-400 hover:bg-gray-50 dark:hover:bg-gray-800/50'
                }
        ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}
      `}
        >
            <input {...getInputProps()} />

            <div className="flex flex-col items-center justify-center gap-4 relative z-10">
                <div className={`p-4 rounded-full bg-white dark:bg-gray-800 shadow-xl ring-1 ring-gray-200 dark:ring-gray-700 transition-transform duration-300 ${isDragActive ? 'scale-110' : 'group-hover:scale-105'}`}>
                    <UploadCloud className={`w-10 h-10 ${isDragActive ? 'text-blue-600' : 'text-gray-400 group-hover:text-blue-500'}`} />
                </div>

                <div className="space-y-2">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                        {isDragActive ? "Drop your file here" : "Upload Audio or Video"}
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 max-w-xs mx-auto">
                        Drag & drop or click to browse. Supports MP3, WAV, MP4, MOV.
                    </p>
                </div>

                <div className="flex gap-3 mt-2 text-xs text-gray-400">
                    <span className="flex items-center gap-1"><FileAudio className="w-3 h-3" /> Audio</span>
                    <span className="flex items-center gap-1"><FileVideo className="w-3 h-3" /> Video</span>
                </div>
            </div>

            {/* Background decoration */}
            <div className="absolute inset-0 bg-gradient-to-br from-transparent to-gray-50/50 dark:to-white/5 pointer-events-none" />
        </div>
    );
}
