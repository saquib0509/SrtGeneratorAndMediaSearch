export async function removeSilence(file, thresholdDb = -40, minSilenceDuration = 0.4, paddingDuration = 0.2) {
    // 1. Decode Audio
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const arrayBuffer = await file.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    // 2. Analyze Audio (Channel 0)
    const rawData = audioBuffer.getChannelData(0); // Analyze first channel
    const sampleRate = audioBuffer.sampleRate;
    const threshold = Math.pow(10, thresholdDb / 20); // Convert dB to amplitude
    const minSilenceSamples = minSilenceDuration * sampleRate;
    const paddingSamples = paddingDuration * sampleRate;

    // 3. Find Active Intervals
    const keepIntervals = [];
    let isSpeaking = false;
    let currentStart = 0;
    let silenceCounter = 0;

    for (let i = 0; i < rawData.length; i++) {
        const amplitude = Math.abs(rawData[i]);

        if (amplitude > threshold) {
            if (!isSpeaking) {
                // Speech started
                isSpeaking = true;
                currentStart = Math.max(0, i - paddingSamples); // Add padding before
            }
            silenceCounter = 0;
        } else {
            if (isSpeaking) {
                silenceCounter++;
                if (silenceCounter > minSilenceSamples) {
                    // Speech ended
                    isSpeaking = false;
                    const end = Math.min(rawData.length, i - silenceCounter + paddingSamples); // Add padding after
                    keepIntervals.push([currentStart, end]);
                }
            }
        }
    }

    // Capture the final segment if it was still speaking or didn't hit min silence
    if (isSpeaking) {
        keepIntervals.push([currentStart, rawData.length]);
    }

    // Handle case where no silence was found or file is empty
    if (keepIntervals.length === 0) {
        if (rawData.some(s => Math.abs(s) > threshold)) { // If there was sound but logic missed it (unlikely), return all
            return new Blob([await file.arrayBuffer()], { type: "audio/wav" });
        }
        // If truly silent, return empty or original
        return new Blob([await file.arrayBuffer()], { type: "audio/wav" });
    }

    // 4. Create New Buffer
    let newLength = 0;
    // Merge overlaps
    const mergedIntervals = [];
    if (keepIntervals.length > 0) {
        let [currStart, currEnd] = keepIntervals[0];
        for (let i = 1; i < keepIntervals.length; i++) {
            const [nextStart, nextEnd] = keepIntervals[i];
            if (nextStart <= currEnd) {
                currEnd = Math.max(currEnd, nextEnd);
            } else {
                mergedIntervals.push([currStart, currEnd]);
                newLength += (currEnd - currStart);
                [currStart, currEnd] = [nextStart, nextEnd];
            }
        }
        mergedIntervals.push([currStart, currEnd]);
        newLength += (currEnd - currStart);
    }

    if (newLength === 0) return new Blob([await file.arrayBuffer()], { type: "audio/wav" });

    const newAudioBuffer = audioContext.createBuffer(
        audioBuffer.numberOfChannels,
        newLength,
        sampleRate
    );

    // 5. Copy Data
    for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
        const inputData = audioBuffer.getChannelData(channel);
        const outputData = newAudioBuffer.getChannelData(channel);
        let offset = 0;

        for (const [start, end] of mergedIntervals) {
            const chunk = inputData.slice(start, end);
            outputData.set(chunk, offset);
            offset += chunk.length;
        }
    }

    // 6. Encode to WAV
    const wavBuffer = bufferToWav(newAudioBuffer);
    return new Blob([wavBuffer], { type: "audio/wav" });
}

function bufferToWav(abuffer) {
    const numOfChan = abuffer.numberOfChannels;
    const length = abuffer.length * numOfChan * 2 + 44;
    const buffer = new ArrayBuffer(length);
    const view = new DataView(buffer);
    const channels = [];
    let i, sample;
    let offset = 0;
    let pos = 0;

    // Write WAV Header
    setUint32(0x46464952);                         // "RIFF"
    setUint32(36 + abuffer.length * 2 * numOfChan); // file length - 8
    setUint32(0x45564157);                         // "WAVE"
    setUint32(0x20746d66);                         // "fmt " chunk
    setUint32(16);                                 // length = 16
    setUint16(1);                                  // PCM (uncompressed)
    setUint16(numOfChan);
    setUint32(abuffer.sampleRate);
    setUint32(abuffer.sampleRate * 2 * numOfChan); // avg. bytes/sec
    setUint16(numOfChan * 2);                      // block-align
    setUint16(16);                                 // 16-bit (hardcoded in this encoder)
    setUint32(0x61746164);                         // "data" - chunk
    setUint32(abuffer.length * 2 * numOfChan);     // chunk length

    // Interleave channels
    for (i = 0; i < abuffer.numberOfChannels; i++)
        channels.push(abuffer.getChannelData(i));

    while (pos < abuffer.length) {
        for (i = 0; i < numOfChan; i++) {
            sample = Math.max(-1, Math.min(1, channels[i][pos])); // clamp
            sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0; // scale to 16-bit signed int
            view.setInt16(44 + offset, sample, true);
            offset += 2;
        }
        pos++;
    }

    return buffer;

    function setUint16(data) {
        view.setUint16(pos, data, true);
        pos += 2;
    }

    function setUint32(data) {
        view.setUint32(pos, data, true);
        pos += 4;
    }
}
