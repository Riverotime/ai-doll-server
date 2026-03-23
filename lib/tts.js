'use strict';

const WebSocket = require('ws');
const { randomUUID } = require('crypto');

/**
 * Text-to-speech via DashScope CosyVoice WebSocket API
 * Returns 16kHz 16-bit mono PCM (raw, no header) for ESP32 playback
 */
async function synthesizeSpeech(text) {
  const voice   = process.env.TTS_VOICE || 'longxiaochun';
  const taskId  = randomUUID();

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
          model:      'cosyvoice-v1',
          parameters: { text_type: 'PlainText', voice, format: 'pcm', sample_rate: 16000, volume: 50, rate: 1.0 },
          input:      {},
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
        // Send text then signal end
        ws.send(JSON.stringify({
          header:  { action: 'continue-task', task_id: taskId },
          payload: { input: { text } },
        }));
        ws.send(JSON.stringify({
          header:  { action: 'finish-task', task_id: taskId },
          payload: { input: {} },
        }));
      } else if (event === 'task-finished') {
        ws.close();
        resolve(Buffer.concat(chunks));
      } else if (event === 'task-failed') {
        ws.close();
        reject(new Error(`TTS failed: ${JSON.stringify(msg.header)}`));
      }
    });

    ws.on('error', reject);
    ws.on('close', () => {
      if (chunks.length > 0) resolve(Buffer.concat(chunks));
    });
  });
}

module.exports = { synthesizeSpeech };
