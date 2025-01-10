var HEADER_LENGTH = 44;
var MAX_AMPLITUDE = 0x7FFF;

async function resampleAudio(file, targetSampleRate) {
    const audioContext = new AudioContext();
    
    // Read the file as an ArrayBuffer
    const arrayBuffer = await file.arrayBuffer();

    // Decode the audio data
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    // Create an OfflineAudioContext with the target sample rate
    const offlineContext = new OfflineAudioContext(
        audioBuffer.numberOfChannels,
        audioBuffer.duration * targetSampleRate,
        targetSampleRate
    );

    // Create a buffer source and connect it to the offline context
    const bufferSource = offlineContext.createBufferSource();
    bufferSource.buffer = audioBuffer;
    bufferSource.connect(offlineContext.destination);

    // Start playback in the offline context
    bufferSource.start(0);

    // Render the audio
    const renderedBuffer = await offlineContext.startRendering();

    // Convert the rendered buffer to a WAV file
    return audioBufferToWav(renderedBuffer);
}

// Function to convert AudioBuffer to WAV format
function audioBufferToWav(audioBuffer) {
    var nChannels = audioBuffer.numberOfChannels;

    if (nChannels !== 1 && nChannels !== 2) {
        throw new Error('Expecting mono or stereo audioBuffer');
    }

    var bufferLength = audioBuffer.length;

    // Creating the array buffers (2 bytes per samples * 1 channel)
    var arrayBuffer = new ArrayBuffer(HEADER_LENGTH + 2 * bufferLength * nChannels);

    // Creatiing views on the array buffer
    var int16 = new Int16Array(arrayBuffer);
    var uint8 = new Uint8Array(arrayBuffer);


    // WAV header
    // http://soundfile.sapp.org/doc/WaveFormat/
    // 52 49 46 46     R I F F
    // 24 08 00 00     chunk size
    // 57 41 56 45     W A V E

    // 66 6d 74 20     F T M █
    // 10 00 00 00     subchunk size
    // 01 00           audio format
    // 02 00           number of channels
    // 44 AC 00 00     sample rate
    // 88 58 01 00     bitrate
    // 04 00           block align
    // 10 00           bit per sample
    // 64 61 74 61     d a t a
    // 00 08 00 00     subchunk2 size

    var sr = audioBuffer.sampleRate;
    var l2 = bufferLength * nChannels * 2; // subchunk2 = numSamples * numChannels * BitsPerSample / 8
    var l1 = l2 + 36; // chunkSize = subchunk + 36
    var br = sr * nChannels * 2 // bitrate = SampleRate * NumChannels * BitsPerSample / 8

    uint8.set([
        // "RIFF" chunk descriptor
        0x52, 0x49, 0x46, 0x46, // R I F F
        l1 & 255, (l1 >> 8) & 255, (l1 >> 16) & 255, (l1 >> 24) & 255, // chunk size
        0x57, 0x41, 0x56, 0x45, // W A V E

        // "ftm" sub-chunk
        0x66, 0x6D, 0x74, 0x20, // F T M █
        0x10, 0x00, 0x00, 0x00, // sub chunk size = 16
        0x01, 0x00, // audio format = 1 (PCM, linear quantization)
        nChannels, 0x00, // number of channels
        sr & 255, (sr >> 8) & 255, (sr >> 16) & 255, (sr >> 24) & 255, // sample rate
        br & 255, (br >> 8) & 255, (br >> 16) & 255, (br >> 24) & 255, // byte rate
        0x04, 0x00, // block align = 4
        0x10, 0x00, // bit per sample = 16

        // data sub-chuk
        0x64, 0x61, 0x74, 0x61, // d a t a
        l2 & 255, (l2 >> 8) & 255, (l2 >> 16) & 255, (l2 >> 24) & 255 // sub chunk 2 size
    ]);

    // Append sample data
    var buffers = [];

    for (var channel = 0; channel < nChannels; channel++) {
        buffers.push(audioBuffer.getChannelData(channel));
    }

    for (var i = 0, index = HEADER_LENGTH / 2; i < bufferLength; i++) {
        for (var channel = 0; channel < nChannels; channel++) {
            var sample = buffers[channel][i];

            // clamp and convert to 16bit number
            sample = Math.min(1, Math.max(-1, sample));
            sample = Math.round(sample * MAX_AMPLITUDE);

            int16[index++] = sample;
        }
    }

    return new Blob([uint8], { type: 'audio/x-wav' });
}

