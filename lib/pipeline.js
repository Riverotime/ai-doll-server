'use strict';

const { transcribeAudio }   = require('./asr');
const { chatWithLLMStream } = require('./llm');
const { synthesizeSpeech }  = require('./tts');

const SENTENCE_END = /[。！？!?]/;

/**
 * Streaming pipeline: PCM → ASR → LLM stream → per-sentence TTS → yields PCM chunks
 *
 * Each sentence is yielded as soon as its TTS is ready, so the caller
 * can stream audio back to the device without waiting for the full response.
 */
async function* processAudioAndImageStream(audioBuffer, imageBuffer) {
  const userText = await transcribeAudio(audioBuffer);
  console.log(`[asr] "${userText}"`);
  if (!userText.trim()) throw new Error('Empty ASR result');

  let textBuffer = '';

  for await (const token of chatWithLLMStream(userText, imageBuffer)) {
    textBuffer += token;

    let match;
    while ((match = SENTENCE_END.exec(textBuffer)) !== null) {
      const sentence = textBuffer.slice(0, match.index + 1).trim();
      textBuffer = textBuffer.slice(match.index + 1);
      if (sentence) {
        console.log(`[tts] "${sentence}"`);
        yield await synthesizeSpeech(sentence);
      }
    }
  }

  if (textBuffer.trim()) {
    console.log(`[tts] "${textBuffer.trim()}"`);
    yield await synthesizeSpeech(textBuffer.trim());
  }
}

/**
 * Non-streaming version for the HTTP endpoint (api/process.js).
 * Collects all PCM chunks and returns a single buffer.
 */
async function processAudioAndImage(audioBuffer, imageBuffer) {
  const chunks = [];
  for await (const pcm of processAudioAndImageStream(audioBuffer, imageBuffer)) {
    chunks.push(pcm);
  }
  if (chunks.length === 0) throw new Error('No TTS output generated');
  return Buffer.concat(chunks);
}

module.exports = { processAudioAndImage, processAudioAndImageStream };
