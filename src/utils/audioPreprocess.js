/**
 * Compress any audio/video file to a 16 kHz mono WAV before uploading to Whisper.
 * Whisper internally resamples to 16 kHz anyway — sending the raw video file
 * just wastes upload bandwidth and time.
 *
 * Returns a File object with the compressed audio.
 */
export async function compressForWhisper(file) {
    const TARGET_SAMPLE_RATE = 16000;

    // Decode the source file using the browser's audio engine
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: TARGET_SAMPLE_RATE,
    });

    const arrayBuffer = await file.arrayBuffer();
    let audioBuffer;
    try {
        audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    } catch {
        // If decode fails (e.g. unsupported container), return original file unchanged
        await audioCtx.close();
        return file;
    }

    // Mix down to mono by averaging all channels
    const numChannels = audioBuffer.numberOfChannels;
    const length = audioBuffer.length;
    const monoData = new Float32Array(length);

    for (let ch = 0; ch < numChannels; ch++) {
        const channelData = audioBuffer.getChannelData(ch);
        for (let i = 0; i < length; i++) {
            monoData[i] += channelData[i] / numChannels;
        }
    }

    await audioCtx.close();

    // Encode to 16-bit PCM WAV
    const wavBuffer = encodeWav(monoData, TARGET_SAMPLE_RATE);
    return new File([wavBuffer], file.name.replace(/\.[^.]+$/, '') + '_compressed.wav', {
        type: 'audio/wav',
    });
}

function encodeWav(samples, sampleRate) {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);

    const writeStr = (offset, str) => {
        for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
    };

    writeStr(0, 'RIFF');
    view.setUint32(4, 36 + samples.length * 2, true);
    writeStr(8, 'WAVE');
    writeStr(12, 'fmt ');
    view.setUint32(16, 16, true);       // chunk size
    view.setUint16(20, 1, true);        // PCM
    view.setUint16(22, 1, true);        // mono
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true); // byte rate
    view.setUint16(32, 2, true);        // block align
    view.setUint16(34, 16, true);       // bits per sample
    writeStr(36, 'data');
    view.setUint32(40, samples.length * 2, true);

    let offset = 44;
    for (let i = 0; i < samples.length; i++) {
        const s = Math.max(-1, Math.min(1, samples[i]));
        view.setInt16(offset, s < 0 ? s * 32768 : s * 32767, true);
        offset += 2;
    }

    return buffer;
}
