'use strict';

const { transcribeAudio } = require('./asr');
const { chatWithLLM }     = require('./llm');
const { synthesizeSpeech } = require('./tts');

async function processAudioAndImage(audioBuffer, imageBuffer) {
  // 1. Speech → Text
  const userText = await transcribeAudio(audioBuffer);
  console.log(`[asr] "${userText}"`);
  if (!userText.trim()) throw new Error('Empty ASR result');

  // 2. Text (+ Image) → LLM response
  const responseText = await chatWithLLM(userText, imageBuffer);
  console.log(`[llm] "${responseText}"`);

  // 3. Text → Speech (PCM)
  return synthesizeSpeech(responseText);
}

module.exports = { processAudioAndImage };
