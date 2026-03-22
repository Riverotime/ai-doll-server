'use strict';

const { parseFrame, buildFrame, FRAME_AUDIO_UP, FRAME_IMAGE_UP, FRAME_AUDIO_DOWN } = require('./protocol');
const { processAudioAndImage } = require('./pipeline');

const SILENCE_TIMEOUT_MS = 800; // 800ms no audio = end of speech
const AUDIO_CHUNK_SIZE   = 640; // 20ms at 16kHz 16-bit mono

function handleConnection(ws, req) {
  const clientIP = req.socket.remoteAddress;
  console.log(`[ws] Connected: ${clientIP}`);

  let audioChunks  = [];
  let imageBuffer  = null;
  let silenceTimer = null;
  let isProcessing = false;

  async function processSpeech() {
    if (isProcessing || audioChunks.length === 0) return;
    isProcessing = true;

    const audioData = Buffer.concat(audioChunks);
    audioChunks = [];
    const image = imageBuffer;
    imageBuffer = null;

    const secs = (audioData.length / (16000 * 2)).toFixed(1);
    console.log(`[pipeline] ${secs}s audio, image: ${image ? 'yes' : 'no'}`);

    try {
      const responseAudio = await processAudioAndImage(audioData, image);

      for (let i = 0; i < responseAudio.length; i += AUDIO_CHUNK_SIZE) {
        if (ws.readyState !== ws.OPEN) break;
        ws.send(buildFrame(FRAME_AUDIO_DOWN, responseAudio.slice(i, i + AUDIO_CHUNK_SIZE)));
      }
      console.log(`[pipeline] Sent ${responseAudio.length} bytes`);
    } catch (err) {
      console.error(`[pipeline] Error: ${err.message}`);
    } finally {
      isProcessing = false;
    }
  }

  ws.on('message', (data) => {
    const frame = parseFrame(data);
    if (!frame) return;

    if (frame.frameType === FRAME_IMAGE_UP) {
      imageBuffer = frame.payload;
      console.log(`[ws] Image: ${imageBuffer.length} bytes`);
    } else if (frame.frameType === FRAME_AUDIO_UP) {
      audioChunks.push(frame.payload);
      clearTimeout(silenceTimer);
      silenceTimer = setTimeout(processSpeech, SILENCE_TIMEOUT_MS);
    }
  });

  ws.on('close', () => {
    clearTimeout(silenceTimer);
    console.log(`[ws] Disconnected: ${clientIP}`);
  });

  ws.on('error', (err) => console.error(`[ws] Error: ${err.message}`));
}

module.exports = { handleConnection };
