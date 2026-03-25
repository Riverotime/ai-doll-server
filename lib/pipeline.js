'use strict';

const { transcribeAudio }   = require('./asr');
const { chatWithLLMStream } = require('./llm');
const { synthesizeSpeech }  = require('./tts');

// Sentence boundary characters (Chinese + English)
const SENTENCE_END = /[。！？!?]/;

/**
 * Pipeline: Audio → ASR → LLM stream → sentence TTS → PCM
 *
 * LLM tokens are buffered by sentence boundary. Each complete sentence
 * is sent to TTS immediately (sequentially), so TTS starts before LLM
 * finishes — reducing total latency significantly.
 */
async function processAudioAndImage(audioBuffer, imageBuffer) {
  // 1. Speech → Text (real-time WebSocket, ~1-2s)
  const userText = await transcribeAudio(audioBuffer);
  console.log(`[asr] "${userText}"`);
  if (!userText.trim()) throw new Error('Empty ASR result');

  // 2. LLM stream → sentence TTS pipeline
  const pcmChunks = [];
  let textBuffer = '';

  async function flushSentence(sentence) {
    const trimmed = sentence.trim();
    if (!trimmed) return;
    console.log(`[tts] "${trimmed}"`);
    const pcm = await synthesizeSpeech(trimmed);
    pcmChunks.push(pcm);
  }

  for await (const token of chatWithLLMStream(userText, imageBuffer)) {
    textBuffer += token;

    // Split on sentence boundaries, keeping the delimiter with the sentence
    let match;
    while ((match = SENTENCE_END.exec(textBuffer)) !== null) {
      const sentence = textBuffer.slice(0, match.index + 1);
      textBuffer = textBuffer.slice(match.index + 1);
      await flushSentence(sentence);
    }
  }

  // Flush any remaining text
  await flushSentence(textBuffer);

  if (pcmChunks.length === 0) throw new Error('No TTS output generated');
  return Buffer.concat(pcmChunks);
}

module.exports = { processAudioAndImage };
