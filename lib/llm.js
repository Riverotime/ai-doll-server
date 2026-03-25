'use strict';

/**
 * Streaming LLM via DashScope OpenAI-compatible API.
 * Yields text tokens as an async generator.
 */
async function* chatWithLLMStream(userText, imageBuffer) {
  const systemPrompt = process.env.SYSTEM_PROMPT
    || '你是一个友好的 AI 助手，说话简洁、亲切。';

  const hasImage = !!imageBuffer;
  const model = process.env.LLM_MODEL || (hasImage ? 'qwen-vl-max' : 'qwen-max');

  const userContent = hasImage
    ? [
        {
          type: 'image_url',
          image_url: { url: `data:image/jpeg;base64,${imageBuffer.toString('base64')}` },
        },
        { type: 'text', text: userText },
      ]
    : userText;

  const res = await fetch('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.DASHSCOPE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userContent  },
      ],
      max_tokens: 512,
      stream: true,
    }),
  });

  if (!res.ok) throw new Error(`LLM ${res.status}: ${await res.text()}`);

  // Parse SSE stream
  const decoder = new TextDecoder();
  let lineBuffer = '';

  for await (const chunk of res.body) {
    lineBuffer += decoder.decode(chunk, { stream: true });
    const lines = lineBuffer.split('\n');
    lineBuffer = lines.pop(); // Keep partial line

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const json = line.slice(6).trim();
      if (json === '[DONE]') return;
      try {
        const data = JSON.parse(json);
        const token = data.choices?.[0]?.delta?.content;
        if (token) yield token;
      } catch { /* skip malformed chunks */ }
    }
  }
}

module.exports = { chatWithLLMStream };
