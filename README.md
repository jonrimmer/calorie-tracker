# Calorie Tracker

A mobile-first React SPA for tracking daily calories, protein, carbs, and fat while gaining muscle mass.

## Features

- Netlify Identity sign-in with Google
- User-owned Google Sheet backing store for sync
- Offline-first local storage with IndexedDB
- Last-edit-wins sync when the network returns
- Daily and weekly calorie/macro dashboards
- Favourite meals for quick logging
- Netlify deployment configuration

## Local Setup

Install dependencies:

```bash
npm install
```

Create `.env.local`:

```bash
VITE_GOOGLE_CLIENT_ID=your-google-oauth-client-id.apps.googleusercontent.com
```

Run the app:

```bash
npm run dev
```

Without a Google client ID, the development build shows a local test mode button so the UI can be checked without Google Sheets setup. Netlify Identity sign-in is intended to be tested on a Netlify deploy preview or production deploy.

## Google Cloud Setup

Create an OAuth 2.0 client in Google Cloud for Google Sheets sync:

- Application type: Web application
- Authorized JavaScript origins:
  - `http://localhost:5173`
  - your Netlify site origin, for example `https://YOUR-SITE.netlify.app`
- Enable APIs:
  - Google Sheets API
  - Google Drive API

The app requests these scopes:

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

Enable Identity in **Project configuration > Identity**, then enable Google under **External providers**. If Netlify asks for Google OAuth credentials, add the Netlify Identity callback URL to the Google OAuth client's authorized redirect URIs:

```text
https://YOUR-SITE.netlify.app/.netlify/identity/callback
```

Add the same callback for any custom production domain you use.

## Commands

```bash
npm run test
npm run build
```
