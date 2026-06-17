export async function fetchOpenAIResponse(userMessage) {
  const response = await fetch('/api/openai', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message: userMessage }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || 'OpenAI request failed.');
  }

  if (!payload.text) {
    throw new Error('OpenAI returned an empty response.');
  }

  return payload.text.trim();
}
