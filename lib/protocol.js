'use strict';

// Frame types (matches ESP32 Dri_web_client.h)
const FRAME_AUDIO_UP   = 0x11; // ESP32 → Server: Opus audio packet
const FRAME_IMAGE_UP   = 0x12; // ESP32 → Server: JPEG camera image
const FRAME_AUDIO_END  = 0x13; // ESP32 → Server: end of speech signal
const FRAME_AUDIO_DOWN = 0x21; // Server → ESP32: Opus TTS audio packet

/**
 * Parse an ESP32 binary frame
 * Layout: [version:1][type:1][reserved:2][payload_len:4 LE][payload:N]
 */
function parseFrame(buffer) {
  if (!Buffer.isBuffer(buffer)) buffer = Buffer.from(buffer);
  if (buffer.length < 8) return null;
  const payloadLen = buffer.readUInt32LE(4);
  if (buffer.length < 8 + payloadLen) return null;
  return {
    version: buffer[0],
    frameType: buffer[1],
    payload: buffer.slice(8, 8 + payloadLen),
  };
}

/**
 * Build a binary frame to send to ESP32
 */
function buildFrame(frameType, payload) {
  const header = Buffer.alloc(8);
  header[0] = 0x01;
  header[1] = frameType;
  header.writeUInt32LE(payload.length, 4);
  return Buffer.concat([header, payload]);
}

module.exports = { FRAME_AUDIO_UP, FRAME_IMAGE_UP, FRAME_AUDIO_END, FRAME_AUDIO_DOWN, parseFrame, buildFrame };
