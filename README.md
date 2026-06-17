# Kris AI Avatar

Kris AI Avatar is a local Express demo that connects a D-ID streaming avatar to OpenAI-generated replies.

The browser handles the WebRTC video session. The Express server keeps provider keys on the server side and proxies calls to D-ID and OpenAI, so API keys are no longer loaded by client-side JavaScript.

## Features

- D-ID streaming avatar session with WebRTC.
- OpenAI chat response generation.
- Server-side proxy for provider credentials.
- Local idle video and avatar image assets.
- Connection status display and inline error messages.
- Light and dark UI modes.

## Security Model

Do not put real keys in client-side files.

This repo uses `api.json` only as a local development config file. It is ignored by git. For deployed production use, set environment variables on the server instead and add authentication before exposing the demo publicly.

## Requirements

- Node.js 18 or newer.
- A D-ID API key.
- An OpenAI API key.

## Setup

Install dependencies:

```bash
npm install
```

Create a local config:

```bash
cp api.example.json api.json
```

On Windows PowerShell:

```powershell
Copy-Item api.example.json api.json
```

Edit `api.json` with your keys:

```json
{
  "key": "did_api_key_here",
  "openai_key": "openai_api_key_here",
  "url": "https://api.d-id.com",
  "model": "gpt-4o-mini",
  "voice_id": "en-US-ChristopherNeural",
  "source_url": "https://raw.githubusercontent.com/haiderrmasood99/Kris-AI-Avatar/main/oracle_pic.jpg",
  "driver_url": "bank://lively/"
}
```

You can also use environment variables:

```bash
DID_API_KEY=...
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-4o-mini
DID_VOICE_ID=en-US-ChristopherNeural
npm start
```

## Run

```bash
npm start
```

Open:

```text
http://localhost:3000
```

Click **Connect**, wait for the stream to initialize, type a message, and click **Send**.

## Provider Checks

Check D-ID credentials:

```bash
npm run test:did
```

Check OpenAI credentials:

```bash
npm run test:openai
```

Both checks read from local `api.json`.

## API Routes

The Express server exposes local proxy routes:

- `GET /api/client-config`
- `POST /api/openai`
- `POST /api/did/streams`
- `POST /api/did/streams/:streamId/sdp`
- `POST /api/did/streams/:streamId/ice`
- `POST /api/did/streams/:streamId/talk`
- `DELETE /api/did/streams/:streamId`
- `GET /api/did/credits`

## Repository Notes

- `oracle_pic.jpg` is the source image used for the avatar stream.
- `oracle_Idle.mp4` is the local idle-loop video.
- `api.example.json` is safe to commit.
- `api.json` is intentionally ignored.

## Production Hardening

Before deploying this publicly:

- Add authentication and rate limits.
- Store secrets in environment variables or a secret manager.
- Restrict allowed origins.
- Add request logging without storing user secrets.
- Review provider costs and abuse controls.

## License

MIT License. See [LICENSE](LICENSE).
