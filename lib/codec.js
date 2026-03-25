'use strict';

const OpusScript = require('opusscript');

const SAMPLE_RATE   = 16000;
const CHANNELS      = 1;
const FRAME_SAMPLES = 320;               // 20ms at 16kHz
const FRAME_BYTES   = FRAME_SAMPLES * 2; // 16-bit PCM = 640 bytes/frame

let _decoder = null;
let _encoder = null;

function getDecoder() {
  if (!_decoder) _decoder = new OpusScript(SAMPLE_RATE, CHANNELS);
  return _decoder;
}

function getEncoder() {
  if (!_encoder) {
    _encoder = new OpusScript(SAMPLE_RATE, CHANNELS, OpusScript.Application.VOIP);
    _encoder.setBitrate(16000);
  }
  return _encoder;
}

function toBuffer(v) {
  if (Buffer.isBuffer(v)) return v;
  if (v && v.buffer) return Buffer.from(v.buffer, v.byteOffset, v.byteLength);
  return Buffer.from(v);
}

/**
 * Decode array of Opus packets → single PCM Buffer (16kHz 16-bit mono)
 */
function decodeOpusPackets(packets) {
  const decoder = getDecoder();
  const chunks = [];
  for (const pkt of packets) {
    try {
      const pcm = decoder.decode(toBuffer(pkt), FRAME_SAMPLES);
      if (pcm && pcm.length > 0) chunks.push(toBuffer(pcm));
    } catch (e) {
      console.warn('[codec] decode error:', e.message);
    }
  }
  return Buffer.concat(chunks);
}

/**
 * Encode PCM Buffer (16kHz 16-bit mono) → array of Opus packet Buffers
 */
function encodePcmToOpus(pcmBuffer) {
  const encoder = getEncoder();
  const packets = [];
  for (let offset = 0; offset < pcmBuffer.length; offset += FRAME_BYTES) {
    let frame = pcmBuffer.slice(offset, offset + FRAME_BYTES);
    // Pad last frame to full 20ms if needed
    if (frame.length < FRAME_BYTES) {
      const padded = Buffer.alloc(FRAME_BYTES, 0);
      frame.copy(padded);
      frame = padded;
    }
    try {
      const pkt = encoder.encode(frame, FRAME_SAMPLES);
      if (pkt && pkt.length > 0) packets.push(toBuffer(pkt));
    } catch (e) {
      console.warn('[codec] encode error:', e.message);
    }
  }
  return packets;
}

module.exports = { decodeOpusPackets, encodePcmToOpus };
