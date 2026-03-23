'use strict';

const { put, del } = require('@vercel/blob');

/**
 * Add WAV header to raw PCM (ESP32 sends 16kHz 16-bit mono PCM)
 */
function addWavHeader(pcm, sampleRate = 16000, channels = 1, bitsPerSample = 16) {
  const dataSize = pcm.length;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);                                           // PCM
  buf.writeUInt16LE(channels, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * channels * bitsPerSample / 8, 28);
  buf.writeUInt16LE(channels * bitsPerSample / 8, 32);
  buf.writeUInt16LE(bitsPerSample, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dataSize, 40);
  pcm.copy(buf, 44);
  return buf;
}

/**
 * Speech-to-text via DashScope paraformer async API
 * Uploads WAV to Vercel Blob temporarily, submits task, polls for result.
 */
async function transcribeAudio(pcmBuffer) {
  const wavBuffer = addWavHeader(pcmBuffer);

  // 1. Upload to Vercel Blob (public, temporary)
  const blob = await put(`asr-${Date.now()}.wav`, wavBuffer, {
    access: 'public',
    contentType: 'audio/wav',
  });

  try {
    // 2. Submit ASR task
    const submitRes = await fetch('https://dashscope.aliyuncs.com/api/v1/services/audio/asr/transcription', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.DASHSCOPE_API_KEY}`,
        'Content-Type': 'application/json',
        'X-DashScope-Async': 'enable',
      },
      body: JSON.stringify({
        model: 'paraformer-v2',
        input: { file_urls: [blob.url] },
        parameters: { language_hints: ['zh'] },
      }),
    });

    if (!submitRes.ok) throw new Error(`ASR submit ${submitRes.status}: ${await submitRes.text()}`);
    const submitData = await submitRes.json();
    const taskId = submitData.output?.task_id;
    if (!taskId) throw new Error(`ASR no task_id: ${JSON.stringify(submitData)}`);

    // 3. Poll for result (up to 30s)
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 1000));
      const pollRes = await fetch(`https://dashscope.aliyuncs.com/api/v1/tasks/${taskId}`, {
        headers: { Authorization: `Bearer ${process.env.DASHSCOPE_API_KEY}` },
      });
      const pollData = await pollRes.json();
      const status = pollData.output?.task_status;

      if (status === 'SUCCEEDED') {
        const results = pollData.output?.results;
        return results?.[0]?.transcription || '';
      }
      if (status === 'FAILED') {
        throw new Error(`ASR task failed: ${JSON.stringify(pollData.output)}`);
      }
    }
    throw new Error('ASR timeout after 30s');
  } finally {
    // Clean up blob regardless of success/failure
    await del(blob.url).catch(() => {});
  }
}

module.exports = { transcribeAudio };
