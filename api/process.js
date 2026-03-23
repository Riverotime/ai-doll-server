'use strict';

const { processAudioAndImage } = require('../lib/pipeline');

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  // Read raw binary body
  const chunks = [];
  await new Promise((resolve, reject) => {
    req.on('data', c => chunks.push(c));
    req.on('end', resolve);
    req.on('error', reject);
  });
  const body = Buffer.concat(chunks);

  if (body.length < 4) return res.status(400).end('body too short');

  // Protocol: [image_size: 4 bytes LE][image data][audio PCM data]
  const imageSize = body.readUInt32LE(0);
  const image = imageSize > 0 ? body.slice(4, 4 + imageSize) : null;
  const audio = body.slice(4 + imageSize);

  if (audio.length === 0) return res.status(400).end('no audio');

  let pcm;
  try {
    pcm = await processAudioAndImage(audio, image);
  } catch (err) {
    console.error('[process] pipeline error:', err);
    return res.status(500).json({ error: err.message });
  }

  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Length', pcm.length);
  res.end(pcm);
}

// Disable Vercel's default body parser — we read raw binary
handler.config = { api: { bodyParser: false } };

module.exports = handler;
