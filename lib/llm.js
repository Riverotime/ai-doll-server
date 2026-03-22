'use strict';

/**
 * Call Qianwen LLM (text or vision) via DashScope OpenAI-compatible API
 */
async function chatWithLLM(userText, imageBuffer) {
  const systemPrompt = process.env.SYSTEM_PROMPT
    || '你是一个友好的 AI 助手，说话简洁、亲切。';

  // Use vision model if image is attached
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
    }),
  });

  if (!res.ok) throw new Error(`LLM ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '抱歉，我没有理解。';
}

module.exports = { chatWithLLM };
