import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

let ffmpeg = null;

export const loadFFmpeg = async () => {
    if (ffmpeg) return ffmpeg;

    ffmpeg = new FFmpeg();

    // Load ffmpeg-core from CDN
    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
    await ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
    });

    return ffmpeg;
};

export const assembleVideo = async (videoUrls, audioUrl, onProgress) => {
    const ffmpeg = await loadFFmpeg();

    ffmpeg.on('log', ({ message }) => console.log(message));
    ffmpeg.on('progress', ({ progress }) => onProgress && onProgress(Math.round(progress * 100)));

    // 1. Write Audio
    const audioData = await fetchFile(audioUrl);
    await ffmpeg.writeFile('audio.mp3', audioData);

    // 2. Write Videos
    const videoFiles = [];
    for (let i = 0; i < videoUrls.length; i++) {
        const filename = `input${i}.mp4`;
        const data = await fetchFile(videoUrls[i]);
        await ffmpeg.writeFile(filename, data);
        videoFiles.push(filename);
    }

    // 3. Create Concat List
    // We need to scale videos to same resolution (e.g. 1920x1080) to avoid errors
    // And ensure same framerate.
    // For simplicity, we'll re-encode each to a standard temp format first.

    const scaledFiles = [];
    for (let i = 0; i < videoFiles.length; i++) {
        const input = videoFiles[i];
        const output = `temp${i}.mp4`;
        // Scale to 1080p, force 30fps, preset ultrafast
        await ffmpeg.exec([
            '-i', input,
            '-vf', 'scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080',
            '-r', '30',
            '-c:v', 'libx264',
            '-preset', 'ultrafast',
            output
        ]);
        scaledFiles.push(output);
    }

    // Create file list for concatenation
    let fileList = '';
    scaledFiles.forEach(f => {
        fileList += `file '${f}'\n`;
    });
    await ffmpeg.writeFile('concat_list.txt', fileList);

    // 4. Concat and Mix Audio
    // Concatenate videos first
    await ffmpeg.exec([
        '-f', 'concat',
        '-safe', '0',
        '-i', 'concat_list.txt',
        '-c', 'copy',
        'visual.mp4'
    ]);

    // Mix with Audio (trimming or looping audio to match video length? Or trim video to match audio?)
    // User probably wants video to match audio length.
    // We'll trim video to audio length or loop it? 
    // Usually "Automatic Video" means we fit visuals to the audio duration.
    // If video is shorter than audio, we might need more clips or loop. 
    // If longer, we cut.
    // Let's standardly map audio and shortest (or longest?) 
    // Safest: Cut video stream to match audio duration.

    await ffmpeg.exec([
        '-i', 'visual.mp4',
        '-i', 'audio.mp3',
        '-map', '0:v',
        '-map', '1:a',
        '-c:v', 'copy',
        '-shortest',
        'final_output.mp4'
    ]);

    // 5. Read Result
    const data = await ffmpeg.readFile('final_output.mp4');
    return new Blob([data.buffer], { type: 'video/mp4' });
};
