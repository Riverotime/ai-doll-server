'use strict';

/**
 * Linear resampler for 16-bit signed little-endian PCM
 * (no anti-aliasing filter, good enough for voice)
 */
function resamplePCM(buf, fromRate, toRate) {
  if (fromRate === toRate) return buf;
  const inSamples  = buf.length / 2;
  const outSamples = Math.floor(inSamples * toRate / fromRate);
  const out = Buffer.alloc(outSamples * 2);
  for (let i = 0; i < outSamples; i++) {
    const src = Math.min(Math.floor(i * fromRate / toRate), inSamples - 1);
    out.writeInt16LE(buf.readInt16LE(src * 2), i * 2);
  }
  return out;
}

/**
 * Strip WAV header if present — some APIs return WAV even when PCM is requested
 */
function stripWavHeader(buf) {
  if (buf.length > 44 && buf.toString('ascii', 0, 4) === 'RIFF') {
    const dataIdx = buf.indexOf(Buffer.from('data'));
    if (dataIdx !== -1) return buf.slice(dataIdx + 8);
  }
  return buf;
}

/**
 * Text-to-speech via DashScope CosyVoice (OpenAI-compatible endpoint)
 * Returns 16kHz 16-bit mono PCM ready for ESP32 playback
 */
async function synthesizeSpeech(text) {
  const voice = process.env.TTS_VOICE || 'longxiaochun';

  const res = await fetch('https://dashscope.aliyuncs.com/compatible-mode/v1/audio/speech', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.DASHSCOPE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'cosyvoice-v1',
      input: text,
      voice,
      response_format: 'pcm',
      speed: 1.0,
    }),
  });

  if (!res.ok) throw new Error(`TTS ${res.status}: ${await res.text()}`);

  let pcm = Buffer.from(await res.arrayBuffer());
  pcm = stripWavHeader(pcm);

  // CosyVoice PCM is typically 24kHz; resample to 16kHz for ESP32
  // Set TTS_SAMPLE_RATE=16000 in env if DashScope returns 16kHz natively
  const ttsRate = parseInt(process.env.TTS_SAMPLE_RATE || '24000', 10);
  return resamplePCM(pcm, ttsRate, 16000);
}

module.exports = { synthesizeSpeech };
