const express = require('express');
const fs = require('fs');
const http = require('http');
const path = require('path');
const fetch = require('node-fetch');

const app = express();
const port = Number(process.env.PORT || 3000);
const rootDir = __dirname;
const configPath = path.join(rootDir, 'api.json');

app.use(express.json({ limit: '1mb' }));

function loadLocalConfig() {
  if (!fs.existsSync(configPath)) return {};

  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (error) {
    throw new Error(`Could not parse api.json: ${error.message}`);
  }
}

function getConfig() {
  const local = loadLocalConfig();

  return {
    didApiKey: process.env.DID_API_KEY || local.key || '',
    didApiUrl: process.env.DID_API_URL || local.url || 'https://api.d-id.com',
    openaiApiKey: process.env.OPENAI_API_KEY || local.openai_key || '',
    openaiModel: process.env.OPENAI_MODEL || local.model || 'gpt-4o-mini',
    sourceUrl:
      process.env.DID_SOURCE_URL ||
      local.source_url ||
      'https://raw.githubusercontent.com/haiderrmasood99/Kris-AI-Avatar/main/oracle_pic.jpg',
    voiceId: process.env.DID_VOICE_ID || local.voice_id || 'en-US-ChristopherNeural',
    driverUrl: process.env.DID_DRIVER_URL || local.driver_url || 'bank://lively/',
  };
}

function getMissingConfig(config) {
  return [
    ['DID_API_KEY or api.json key', config.didApiKey],
    ['OPENAI_API_KEY or api.json openai_key', config.openaiApiKey],
  ]
    .filter(([, value]) => !value || value.includes('should be placed here') || value.includes('_here'))
    .map(([name]) => name);
}

function didAuthHeader(apiKey) {
  return `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}`;
}

async function readJsonResponse(response) {
  const text = await response.text();
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function providerErrorMessage(provider, payload) {
  return (
    payload?.error?.message ||
    payload?.message ||
    payload?.description ||
    payload?.raw ||
    `${provider} request failed`
  );
}

async function callDid(config, didPath, options = {}) {
  const response = await fetch(`${config.didApiUrl}${didPath}`, {
    method: options.method || 'GET',
    headers: {
      accept: 'application/json',
      authorization: didAuthHeader(config.didApiKey),
      'content-type': 'application/json',
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const payload = await readJsonResponse(response);
  if (!response.ok) {
    const error = new Error(providerErrorMessage('D-ID', payload));
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

function sendProviderError(res, error) {
  res.status(error.status || 500).json({
    error: error.message || 'Provider request failed',
    details: error.payload || undefined,
  });
}

app.get('/api/client-config', (req, res) => {
  try {
    const config = getConfig();
    const missing = getMissingConfig(config);

    res.json({
      configured: missing.length === 0,
      missing,
      openaiModel: config.openaiModel,
      voiceId: config.voiceId,
    });
  } catch (error) {
    res.status(500).json({ configured: false, missing: [error.message] });
  }
});

app.post('/api/openai', async (req, res) => {
  try {
    const config = getConfig();
    const missing = getMissingConfig(config);
    if (missing.length) return res.status(400).json({ error: `Missing config: ${missing.join(', ')}` });

    const message = String(req.body.message || '').trim();
    if (!message) return res.status(400).json({ error: 'Message is required.' });

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${config.openaiApiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: config.openaiModel,
        messages: [{ role: 'user', content: message }],
        temperature: 0.7,
        max_tokens: 160,
      }),
    });

    const payload = await readJsonResponse(response);
    if (!response.ok) {
      return res.status(response.status).json({ error: providerErrorMessage('OpenAI', payload) });
    }

    const text = payload?.choices?.[0]?.message?.content?.trim();
    if (!text) return res.status(502).json({ error: 'OpenAI returned an empty response.' });

    res.json({ text });
  } catch (error) {
    sendProviderError(res, error);
  }
});

app.post('/api/did/streams', async (req, res) => {
  try {
    const config = getConfig();
    const missing = getMissingConfig(config);
    if (missing.length) return res.status(400).json({ error: `Missing config: ${missing.join(', ')}` });

    const payload = await callDid(config, '/talks/streams', {
      method: 'POST',
      body: {
        source_url: config.sourceUrl,
        stream_warmup: true,
        config: { video_quality: 'hd' },
      },
    });

    res.json(payload);
  } catch (error) {
    sendProviderError(res, error);
  }
});

app.post('/api/did/streams/:streamId/sdp', async (req, res) => {
  try {
    const config = getConfig();
    const payload = await callDid(config, `/talks/streams/${encodeURIComponent(req.params.streamId)}/sdp`, {
      method: 'POST',
      body: {
        answer: req.body.answer,
        session_id: req.body.session_id,
      },
    });

    res.json(payload);
  } catch (error) {
    sendProviderError(res, error);
  }
});

app.post('/api/did/streams/:streamId/ice', async (req, res) => {
  try {
    const config = getConfig();
    const payload = await callDid(config, `/talks/streams/${encodeURIComponent(req.params.streamId)}/ice`, {
      method: 'POST',
      body: {
        candidate: req.body.candidate,
        sdpMid: req.body.sdpMid,
        sdpMLineIndex: req.body.sdpMLineIndex,
        session_id: req.body.session_id,
      },
    });

    res.json(payload);
  } catch (error) {
    sendProviderError(res, error);
  }
});

app.post('/api/did/streams/:streamId/talk', async (req, res) => {
  try {
    const config = getConfig();
    const input = String(req.body.input || '').trim();
    if (!input) return res.status(400).json({ error: 'Talk input is required.' });

    const payload = await callDid(config, `/talks/streams/${encodeURIComponent(req.params.streamId)}`, {
      method: 'POST',
      body: {
        script: {
          type: 'text',
          input,
          provider: {
            type: 'microsoft',
            voice_id: config.voiceId,
          },
        },
        config: { fluent: true, stitch: true },
        driver_url: config.driverUrl,
        session_id: req.body.session_id,
      },
    });

    res.json(payload);
  } catch (error) {
    sendProviderError(res, error);
  }
});

app.delete('/api/did/streams/:streamId', async (req, res) => {
  try {
    const config = getConfig();
    const payload = await callDid(config, `/talks/streams/${encodeURIComponent(req.params.streamId)}`, {
      method: 'DELETE',
      body: { session_id: req.body.session_id },
    });

    res.json(payload);
  } catch (error) {
    sendProviderError(res, error);
  }
});

app.get('/api/did/credits', async (req, res) => {
  try {
    const config = getConfig();
    const payload = await callDid(config, '/credits');
    res.json({
      remaining: payload.remaining,
      total: payload.total,
    });
  } catch (error) {
    sendProviderError(res, error);
  }
});

app.use('/', express.static(rootDir));

const server = http.createServer(app);
server.listen(port, () => {
  console.log(`Kris AI Avatar running at http://localhost:${port}`);
});
