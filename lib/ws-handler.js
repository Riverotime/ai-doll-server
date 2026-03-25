'use strict';

const { parseFrame, buildFrame, FRAME_AUDIO_UP, FRAME_IMAGE_UP, FRAME_AUDIO_END, FRAME_AUDIO_DOWN } = require('./protocol');
const { processAudioAndImageStream } = require('./pipeline');
const { decodeOpusPackets, encodePcmToOpus } = require('./codec');

function handleConnection(ws, req) {
  const clientIP = req.socket.remoteAddress;
  console.log(`[ws] Connected: ${clientIP}`);

  let audioPackets = []; // accumulate Opus packets from ESP32
  let imageBuffer  = null;
  let isProcessing = false;

  async function processSpeech() {
    if (isProcessing || audioPackets.length === 0) return;
    isProcessing = true;

    // Grab and clear current buffers
    const packets = audioPackets.splice(0);
    const image   = imageBuffer;
    imageBuffer   = null;

    try {
      // 1. Decode Opus packets → PCM for ASR
      const pcmData = decodeOpusPackets(packets);
      const secs = (pcmData.length / (16000 * 2)).toFixed(1);
      console.log(`[pipeline] ${secs}s audio, image: ${image ? 'yes' : 'no'}`);

      // 2. Stream: each sentence TTS → encode to Opus → send immediately
      //    ESP32 starts playing the first sentence while server generates the rest
      for await (const pcmChunk of processAudioAndImageStream(pcmData, image)) {
        if (ws.readyState !== ws.OPEN) break;
        for (const opusPkt of encodePcmToOpus(pcmChunk)) {
          if (ws.readyState !== ws.OPEN) break;
          ws.send(buildFrame(FRAME_AUDIO_DOWN, opusPkt));
        }
      }

      console.log('[pipeline] Done');
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
      // Collect Opus-encoded audio packets
      audioPackets.push(Buffer.from(frame.payload));

    } else if (frame.frameType === FRAME_AUDIO_END) {
      // ESP32 signals end of speech — start processing immediately
      console.log(`[ws] Audio end, ${audioPackets.length} packets`);
      processSpeech();
    }
  });

  ws.on('close', () => {
    console.log(`[ws] Disconnected: ${clientIP}`);
  });

  ws.on('error', (err) => console.error(`[ws] Error: ${err.message}`));
}

module.exports = { handleConnection };
