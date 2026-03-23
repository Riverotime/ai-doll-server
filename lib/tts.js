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

  // DashScope native CosyVoice REST API (non-streaming)
  const res = await fetch('https://dashscope.aliyuncs.com/api/v1/services/aigc/text2audiores/generation', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.DASHSCOPE_API_KEY}`,
      'Content-Type': 'application/json',
      'X-DashScope-SSE': 'disable',
    },
    body: JSON.stringify({
      model: 'cosyvoice-v1',
      input: { text },
      parameters: { voice, format: 'wav', sample_rate: 16000 },
    }),
  });

  if (!res.ok) throw new Error(`TTS ${res.status}: ${await res.text()}`);

  const data = await res.json();
  const audioBase64 = data.output?.audio;
  if (!audioBase64) throw new Error(`TTS: no audio field. body=${JSON.stringify(data)}`);

  // Decode base64 WAV → strip header → raw 16kHz 16-bit PCM
  let buf = Buffer.from(audioBase64, 'base64');
  buf = stripWavHeader(buf);
  return buf;
}

module.exports = { synthesizeSpeech };
