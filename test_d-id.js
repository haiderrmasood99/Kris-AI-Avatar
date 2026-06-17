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
  const response = await fetch(`${config.url || 'https://api.d-id.com'}/credits`, {
    headers: {
      accept: 'application/json',
      authorization: `Basic ${Buffer.from(`${config.key}:`).toString('base64')}`,
    },
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.message || payload.description || 'D-ID credit check failed.');
  }

  console.log('D-ID credits:', {
    remaining: payload.remaining,
    total: payload.total,
  });
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
