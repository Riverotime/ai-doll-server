'use strict';

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
  buf.writeUInt16LE(1, 20);
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
 * Speech-to-text via DashScope OpenAI-compatible endpoint
 * Synchronous, direct file upload — no Vercel Blob needed
 */
async function transcribeAudio(pcmBuffer) {
  const wavBuffer = addWavHeader(pcmBuffer);

  const formData = new FormData();
  formData.append('model', 'paraformer-v2');
  formData.append('language', 'zh');
  formData.append('file', new Blob([wavBuffer], { type: 'audio/wav' }), 'audio.wav');

  const res = await fetch('https://dashscope.aliyuncs.com/compatible-mode/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.DASHSCOPE_API_KEY}` },
    body: formData,
  });

  if (!res.ok) throw new Error(`ASR ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.text || '';
}

module.exports = { transcribeAudio };
