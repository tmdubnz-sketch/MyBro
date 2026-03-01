import { fetch } from '@tauri-apps/plugin-http';

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

export async function chat(messages: {role: string, content: string}[], apiKey: string) {
  const response = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-4.1-mini',
      messages,
      max_tokens: 1024,
      temperature: 0.8
    })
  });

  const data = await response.json();
  return data.choices[0].message.content;
}
