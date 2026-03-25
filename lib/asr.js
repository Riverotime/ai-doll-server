'use strict';

const WebSocket = require('ws');
const { randomUUID } = require('crypto');

/**
 * Real-time ASR via DashScope paraformer-realtime-v2 WebSocket API.
 * Replaces the old batch async + polling approach (~10s) with ~1-2s.
 */
async function transcribeAudio(pcmBuffer) {
  const taskId = randomUUID();
  const model = process.env.ASR_MODEL || 'paraformer-realtime-v2';

  return new Promise((resolve, reject) => {
    const ws = new WebSocket('wss://dashscope.aliyuncs.com/api-ws/v1/inference', {
      headers: { Authorization: `Bearer ${process.env.DASHSCOPE_API_KEY}` },
    });

    let finalText = '';
    let settled = false;

    function done(err, result) {
      if (settled) return;
      settled = true;
      try { ws.close(); } catch (_) {}
      if (err) reject(err);
      else resolve(result);
    }

    ws.on('open', () => {
      ws.send(JSON.stringify({
        header: {
          action: 'run-task',
          task_id: taskId,
          streaming: 'duplex',
        },
        payload: {
          task_group: 'audio',
          task: 'asr',
          function: 'recognition',
          model,
          parameters: {
            format: 'pcm',
            sample_rate: 16000,
            language_hints: ['zh'],
          },
          input: {},
        },
      }));
    });

    ws.on('message', (data, isBinary) => {
      if (isBinary) return; // ASR doesn't return binary

      let msg;
      try { msg = JSON.parse(data.toString()); } catch { return; }

      const event = msg.header?.event;

      if (event === 'task-started') {
        // Send PCM audio in 100ms chunks (3200 bytes @ 16kHz/16-bit mono)
        const CHUNK = 3200;
        for (let offset = 0; offset < pcmBuffer.length; offset += CHUNK) {
          ws.send(pcmBuffer.slice(offset, Math.min(offset + CHUNK, pcmBuffer.length)));
        }
        // Signal end of audio stream
        ws.send(JSON.stringify({
          header: { action: 'finish-task', task_id: taskId, streaming: 'duplex' },
          payload: { input: {} },
        }));

      } else if (event === 'result-generated') {
        const sentence = msg.payload?.output?.sentence;
        if (sentence?.text) {
          // Accumulate all sentence segments
          finalText += sentence.text;
        }

      } else if (event === 'task-finished') {
        done(null, finalText.trim());

      } else if (event === 'task-failed') {
        done(new Error(`ASR failed: ${JSON.stringify(msg.header)}`));
      }
    });

    ws.on('error', (err) => done(err));
    ws.on('close', (code) => {
      if (!settled && code !== 1000) {
        done(new Error(`ASR WebSocket closed unexpectedly: ${code}`));
      }
    });

    // Safety timeout
    setTimeout(() => done(new Error('ASR timeout after 15s')), 15000);
  });
}

module.exports = { transcribeAudio };
