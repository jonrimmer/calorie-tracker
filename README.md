# Calorie Tracker

A mobile-first React SPA for tracking daily calories, protein, carbs, and fat while gaining muscle mass.

## Features

- Google SSO sign-in
- User-owned Google Sheet backing store for sync
- Offline-first local storage with IndexedDB
- Last-edit-wins sync when the network returns
- Daily and weekly calorie/macro dashboards
- Favourite meals for quick logging
- LLM-assisted macro estimates from short meal descriptions
- Netlify deployment configuration

## Local Setup

Install dependencies:

```bash
npm install
```

Create `.env.local`:

```bash
VITE_GOOGLE_CLIENT_ID=your-google-oauth-client-id.apps.googleusercontent.com
# Optional; defaults to dev locally and prod in production builds:
VITE_GOOGLE_SYNC_PROFILE=dev
# Optional for local macro estimates when not using Netlify AI Gateway:
OPENAI_API_KEY=your-openai-api-key
# Optional for an OpenAI-compatible proxy such as Netlify AI Gateway:
OPENAI_BASE_URL=https://...
MEAL_ESTIMATOR_MODEL=gpt-5-mini
```

Run the app:

```bash
npm run dev
```

Run through Netlify Dev when testing meal macro estimates locally so the `/api/estimate-meal` function is available:

```bash
netlify dev
```

If you are using Netlify AI Gateway locally, run `netlify dev` from a site that has been deployed at least once so Netlify can inject the gateway environment variables. Without AI Gateway, set `OPENAI_API_KEY` in `.env.local`.

Google sign-in uses Google Identity Services directly in the browser, so local sign-in works on `npm run dev` and `netlify dev` without a deployed auth callback. Without a Google client ID, the development build shows a local test mode button so the UI can be checked without Google Sheets setup.

Local test mode still stores data in IndexedDB first. Pressing Sync later will ask for Google consent, create or find the tracker spreadsheet, and promote the local data into normal Google Sheets sync.

Google Sheets sync is namespaced by `VITE_GOOGLE_SYNC_PROFILE`. Production uses the existing spreadsheet pointer, while local dev defaults to `dev` and creates a separate spreadsheet named `Calorie Tracker (dev)`.

## Google Cloud Setup

Create an OAuth 2.0 client in Google Cloud for Google sign-in and Google Sheets sync:

- Application type: Web application
- Authorized JavaScript origins:
  - `http://localhost:5173`
  - `http://localhost:8888`
  - your Netlify site origin, for example `https://YOUR-SITE.netlify.app`
  - any alternate local origin Vite chooses, for example `http://localhost:5174`
- Enable APIs:
  - Google Sheets API
  - Google Drive API

The app requests these scopes:

- `openid`
- `email`
- `profile`
- `https://www.googleapis.com/auth/spreadsheets`
- `https://www.googleapis.com/auth/drive.appdata`
- `https://www.googleapis.com/auth/drive.file`

## Netlify

This repository includes `netlify.toml` with:

- Build command: `npm run build`
- Publish directory: `dist`
- SPA fallback redirect to `index.html`

In Netlify, create a site from this repo and add this environment variable:

```bash
VITE_GOOGLE_CLIENT_ID=your-google-oauth-client-id.apps.googleusercontent.com
```

Meal macro estimates use a Netlify Function and the OpenAI SDK Responses API. On Netlify, enable AI Gateway for the site or set `OPENAI_API_KEY`; `MEAL_ESTIMATOR_MODEL` is optional and defaults to `gpt-5-mini`.

## Commands

```bash
npm run test
npm run build
```
