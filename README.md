# Calorie Tracker

A mobile-first React SPA for tracking daily calories, protein, carbs, and fat while gaining muscle mass.

## Features

- Google sign-in with a user-owned Google Sheet as the backing store
- Offline-first local storage with IndexedDB
- Last-edit-wins sync when the network returns
- Daily and weekly calorie/macro dashboards
- Favourite meals for quick logging
- GitHub Pages deployment workflow

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

Without a Google client ID, the development build shows a local test mode button so the UI can be checked without Google setup. Production builds require Google sign-in for first use.

## Google Cloud Setup

Create an OAuth 2.0 client in Google Cloud:

- Application type: Web application
- Authorized JavaScript origins:
  - `http://localhost:5173`
  - your GitHub Pages origin, for example `https://USERNAME.github.io`
- Enable APIs:
  - Google Sheets API
  - Google Drive API

The app requests these scopes:

- `https://www.googleapis.com/auth/spreadsheets`
- `https://www.googleapis.com/auth/drive.appdata`
- `https://www.googleapis.com/auth/drive.file`

## GitHub Pages

Add this repository secret:

```bash
VITE_GOOGLE_CLIENT_ID=your-google-oauth-client-id.apps.googleusercontent.com
```

The included workflow builds on pushes to `main` and deploys the Vite output to GitHub Pages. Vite automatically uses `/${repo-name}/` as the base path in GitHub Actions.

## Commands

```bash
npm run test
npm run build
```
