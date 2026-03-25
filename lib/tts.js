'use strict';

const WebSocket = require('ws');
const { randomUUID } = require('crypto');


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
 * Text-to-speech via DashScope CosyVoice WebSocket API
 * Returns 16kHz 16-bit mono PCM for ESP32 playback
 */
async function synthesizeSpeech(text) {
  const model  = process.env.TTS_MODEL || 'cosyvoice-v3-flash';
  const voice  = process.env.TTS_VOICE || 'longanhuan';
  const taskId = randomUUID();

  return new Promise((resolve, reject) => {
    const ws = new WebSocket('wss://dashscope.aliyuncs.com/api-ws/v1/inference', {
      headers: { Authorization: `Bearer ${process.env.DASHSCOPE_API_KEY}` },
    });

    const chunks = [];

    ws.on('open', () => {
      ws.send(JSON.stringify({
        header:  { action: 'run-task', task_id: taskId, streaming: 'duplex' },
        payload: {
          task_group: 'audio',
          task:       'tts',
          function:   'SpeechSynthesizer',
          model,
          parameters: {
            text_type:   'PlainText',
            voice,
            format:      'pcm',
            sample_rate: 22050,
            volume:      50,
            rate:        1,
            pitch:       1,
          },
          input: {},
        },
      }));
    });

    ws.on('message', (data, isBinary) => {
      if (isBinary) {
        chunks.push(Buffer.isBuffer(data) ? data : Buffer.from(data));
        return;
      }

      const msg   = JSON.parse(data.toString());
      const event = msg.header?.event;

      if (event === 'task-started') {
        ws.send(JSON.stringify({
          header:  { action: 'continue-task', task_id: taskId, streaming: 'duplex' },
          payload: { input: { text } },
        }));
        ws.send(JSON.stringify({
          header:  { action: 'finish-task', task_id: taskId, streaming: 'duplex' },
          payload: { input: {} },
        }));
      } else if (event === 'task-finished') {
        ws.close();
        let pcm = Buffer.concat(chunks);
        pcm = resamplePCM(pcm, 22050, 16000);
        resolve(pcm);
      } else if (event === 'task-failed') {
        ws.close();
        reject(new Error(`TTS failed: ${JSON.stringify(msg.header)}`));
      }
    });

    ws.on('error', reject);
  });
}

module.exports = { synthesizeSpeech };
