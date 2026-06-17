const fs = require('fs');
const fetch = require('node-fetch');

function loadConfig() {
  if (!fs.existsSync('api.json')) {
    throw new Error('Missing api.json. Copy api.example.json to api.json first.');
  }

  return JSON.parse(fs.readFileSync('api.json', 'utf8'));
}

async function main() {
  const config = loadConfig();
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${config.openai_key}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model || 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'Reply with one short sentence.' }],
      max_tokens: 40,
    }),
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error?.message || 'OpenAI test failed.');
  }

  console.log('OpenAI response:', payload.choices[0].message.content.trim());
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
