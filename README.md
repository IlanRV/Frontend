# DevHub Frontend

Vite + React + TypeScript frontend for DevHub, a multi-repo workspace platform with BrowserPod-powered repo execution and AI code chat.

## Setup

```bash
npm install
npm run dev
```

Create a `.env` file with:

```bash
VITE_BP_APIKEY=your_browserpod_api_key
VITE_API_URL=http://localhost:3001/api
```

The Vite dev server sends COOP/COEP headers so BrowserPod can run in-browser.
