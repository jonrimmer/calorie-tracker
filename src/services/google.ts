import type { DailyStats, EmotionEntry, FavouriteMeal, Meal, Settings, TrackerData } from "../types";
import { DEFAULT_SETTINGS } from "../lib/nutrition";

const SHEET_TITLE = "Calorie Tracker";
const APP_DATA_FILE = "calorie-tracker-spreadsheet.json";
const PRODUCTION_SYNC_PROFILE = "prod";
const GOOGLE_USER_STORAGE_KEY = "calorie-tracker-google-user";
const PROFILE_SCOPES = ["openid", "email", "profile"].join(" ");
const SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/drive.appdata",
  "https://www.googleapis.com/auth/drive.file"
].join(" ");

const SETTINGS_HEADERS = [
  "schemaVersion",
  "calorieTarget",
  "proteinTargetG",
  "carbsTargetG",
  "fatTargetG",
  "updatedAt"
] as const;

const MEAL_HEADERS = [
  "id",
  "date",
  "name",
  "calories",
  "proteinG",
  "carbsG",
  "fatG",
  "favouriteId",
  "createdAt",
  "updatedAt",
  "deletedAt"
] as const;

const FAVOURITE_HEADERS = [
  "id",
  "name",
  "calories",
  "proteinG",
  "carbsG",
  "fatG",
  "createdAt",
  "updatedAt",
  "deletedAt"
] as const;

const DAILY_STATS_HEADERS = ["id", "date", "anxiety", "energy", "createdAt", "updatedAt", "deletedAt"] as const;

const EMOTION_ENTRY_HEADERS = [
  "id",
  "date",
  "occurredAt",
  "emoji",
  "feeling",
  "createdAt",
  "updatedAt",
  "deletedAt"
] as const;

const REQUIRED_DATA_SHEETS = ["DailyStats", "EmotionEntries"] as const;

interface TokenResponse {
  access_token?: string;
  error?: string;
  error_description?: string;
}

interface TokenClient {
  requestAccessToken: (options?: { prompt?: GooglePrompt }) => void;
  callback?: (response: TokenResponse) => void;
}

interface SpreadsheetConfig {
  appDataFile: string;
  sheetTitle: string;
}

export interface GoogleUser {
  id: string;
  email: string;
  name?: string;
  pictureUrl?: string;
}

type GooglePrompt = "" | "consent" | "none" | "select_account";

interface GoogleIdentity {
  accounts: {
    oauth2: {
      initTokenClient: (config: {
        client_id: string;
        scope: string;
        callback: (response: TokenResponse) => void;
      }) => TokenClient;
    };
  };
}

declare global {
  interface Window {
    google?: GoogleIdentity;
  }
}

export class GoogleApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GoogleApiError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normaliseSyncProfile(profile: string | undefined): string {
  const normalised = (profile ?? PRODUCTION_SYNC_PROFILE)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalised || PRODUCTION_SYNC_PROFILE;
}

export function spreadsheetConfigForProfile(profile?: string): SpreadsheetConfig {
  const syncProfile = normaliseSyncProfile(profile);

  if (syncProfile === PRODUCTION_SYNC_PROFILE) {
    return {
      appDataFile: APP_DATA_FILE,
      sheetTitle: SHEET_TITLE
    };
  }

  return {
    appDataFile: `calorie-tracker-spreadsheet.${syncProfile}.json`,
    sheetTitle: `${SHEET_TITLE} (${syncProfile})`
  };
}

function parseGoogleUser(value: unknown): GoogleUser {
  if (!isRecord(value)) {
    throw new GoogleApiError("Google profile was not returned.");
  }

  const id =
    typeof value.id === "string"
      ? value.id.trim()
      : typeof value.sub === "string"
        ? value.sub.trim()
        : "";
  const email = typeof value.email === "string" ? value.email.trim() : "";
  const name = typeof value.name === "string" ? value.name.trim() : "";
  const pictureUrl =
    typeof value.pictureUrl === "string" ? value.pictureUrl : typeof value.picture === "string" ? value.picture : "";

  if (!id || !email) {
    throw new GoogleApiError("Google profile was incomplete.");
  }

  return {
    id,
    email,
    name: name || undefined,
    pictureUrl: pictureUrl || undefined
  };
}

function getLocalStorage(): Pick<Storage, "getItem" | "setItem" | "removeItem"> | undefined {
  if (
    typeof localStorage === "undefined" ||
    typeof localStorage.getItem !== "function" ||
    typeof localStorage.setItem !== "function" ||
    typeof localStorage.removeItem !== "function"
  ) {
    return undefined;
  }

  return localStorage;
}

function saveStoredGoogleUser(user: GoogleUser): void {
  getLocalStorage()?.setItem(GOOGLE_USER_STORAGE_KEY, JSON.stringify(user));
}

export function getStoredGoogleUser(): GoogleUser | null {
  try {
    const value = getLocalStorage()?.getItem(GOOGLE_USER_STORAGE_KEY);
    return value ? parseGoogleUser(JSON.parse(value)) : null;
  } catch {
    return null;
  }
}

export function clearStoredGoogleUser(): void {
  getLocalStorage()?.removeItem(GOOGLE_USER_STORAGE_KEY);
}

let googleScriptPromise: Promise<void> | undefined;

function loadGoogleScript(): Promise<void> {
  if (window.google?.accounts.oauth2) {
    return Promise.resolve();
  }

  if (!googleScriptPromise) {
    googleScriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new GoogleApiError("Google sign-in could not load."));
      document.head.appendChild(script);
    });
  }

  return googleScriptPromise;
}

async function requestGoogleAccessToken(
  clientId: string,
  scope: string,
  prompt: GooglePrompt,
  cancelMessage: string
): Promise<string> {
  if (!clientId) {
    throw new GoogleApiError("Missing Google OAuth client ID.");
  }

  await loadGoogleScript();

  return new Promise((resolve, reject) => {
    const tokenClient = window.google?.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope,
      callback: (response) => {
        if (response.error || !response.access_token) {
          reject(new GoogleApiError(response.error_description ?? cancelMessage));
          return;
        }

        resolve(response.access_token);
      }
    });

    tokenClient?.requestAccessToken({ prompt });
  });
}

export async function signInWithGoogle(clientId: string): Promise<GoogleUser> {
  const accessToken = await requestGoogleAccessToken(
    clientId,
    PROFILE_SCOPES,
    "select_account",
    "Google sign-in was cancelled."
  );
  const user = parseGoogleUser(
    await googleFetch<unknown>(accessToken, "https://openidconnect.googleapis.com/v1/userinfo")
  );

  saveStoredGoogleUser(user);
  return user;
}

export async function authorizeGoogle(clientId: string, prompt: "" | "consent" = ""): Promise<string> {
  return requestGoogleAccessToken(clientId, SCOPES, prompt, "Google sign-in was cancelled.");
}

async function googleFetch<T>(accessToken: string, url: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${accessToken}`);
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(url, {
    ...init,
    headers
  });

  if (!response.ok) {
    const details = await response.text();
    throw new GoogleApiError(`Google API request failed (${response.status}): ${details}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

async function findAppDataFile(accessToken: string, appDataFile: string): Promise<string | undefined> {
  const params = new URLSearchParams({
    spaces: "appDataFolder",
    q: `name='${appDataFile}' and trashed=false`,
    fields: "files(id,name)"
  });

  const result = await googleFetch<{ files?: Array<{ id: string }> }>(
    accessToken,
    `https://www.googleapis.com/drive/v3/files?${params.toString()}`
  );

  return result.files?.[0]?.id;
}

async function readSpreadsheetPointer(accessToken: string, config: SpreadsheetConfig): Promise<string | undefined> {
  const fileId = await findAppDataFile(accessToken, config.appDataFile);
  if (!fileId) {
    return undefined;
  }

  const pointer = await googleFetch<{ spreadsheetId?: string }>(
    accessToken,
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`
  );

  return pointer.spreadsheetId;
}

async function saveSpreadsheetPointer(accessToken: string, spreadsheetId: string, config: SpreadsheetConfig): Promise<void> {
  const fileId = await findAppDataFile(accessToken, config.appDataFile);
  const metadata = {
    name: config.appDataFile,
    parents: ["appDataFolder"],
    mimeType: "application/json"
  };
  const body = JSON.stringify({ spreadsheetId });
  const boundary = `calorie-tracker-${crypto.randomUUID()}`;
  const multipartBody = [
    `--${boundary}`,
    "Content-Type: application/json; charset=UTF-8",
    "",
    JSON.stringify(metadata),
    `--${boundary}`,
    "Content-Type: application/json",
    "",
    body,
    `--${boundary}--`
  ].join("\r\n");

  const method = fileId ? "PATCH" : "POST";
  const url = fileId
    ? `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`
    : "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart";

  await googleFetch<void>(accessToken, url, {
    method,
    headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
    body: multipartBody
  });
}

async function createTrackerSpreadsheet(accessToken: string, config: SpreadsheetConfig): Promise<string> {
  const spreadsheet = await googleFetch<{ spreadsheetId: string }>(
    accessToken,
    "https://sheets.googleapis.com/v4/spreadsheets",
    {
      method: "POST",
      body: JSON.stringify({
        properties: { title: config.sheetTitle },
        sheets: [
          { properties: { title: "Settings" } },
          { properties: { title: "Meals" } },
          { properties: { title: "Favourites" } },
          { properties: { title: "DailyStats" } },
          { properties: { title: "EmotionEntries" } }
        ]
      })
    }
  );

  await writeSheetData(accessToken, spreadsheet.spreadsheetId, {
    settings: { ...DEFAULT_SETTINGS, updatedAt: new Date().toISOString() },
    meals: [],
    favourites: [],
    dailyStats: [],
    emotionEntries: []
  });
  await saveSpreadsheetPointer(accessToken, spreadsheet.spreadsheetId, config);

  return spreadsheet.spreadsheetId;
}

export async function ensureTrackerSpreadsheet(accessToken: string, profile?: string): Promise<string> {
  const config = spreadsheetConfigForProfile(profile);
  const existingSpreadsheetId = await readSpreadsheetPointer(accessToken, config);
  if (existingSpreadsheetId) {
    return existingSpreadsheetId;
  }

  return createTrackerSpreadsheet(accessToken, config);
}

function asNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function mapRows<T extends readonly string[]>(headers: T, rows: unknown[][] = []): Array<Record<T[number], string>> {
  return rows.slice(1).map((row) => {
    const record = {} as Record<T[number], string>;
    headers.forEach((header: T[number], index) => {
      record[header] = String(row[index] ?? "");
    });
    return record;
  });
}

function parseSettings(rows: unknown[][] = []): Settings {
  const record = mapRows(SETTINGS_HEADERS, rows)[0];
  if (!record) {
    return DEFAULT_SETTINGS;
  }

  return {
    schemaVersion: asNumber(record.schemaVersion) || 1,
    calorieTarget: asNumber(record.calorieTarget),
    proteinTargetG: asNumber(record.proteinTargetG),
    carbsTargetG: asNumber(record.carbsTargetG),
    fatTargetG: asNumber(record.fatTargetG),
    updatedAt: record.updatedAt || new Date(0).toISOString()
  };
}

function parseMeals(rows: unknown[][] = []): Meal[] {
  return mapRows(MEAL_HEADERS, rows)
    .filter((record) => record.id)
    .map((record) => ({
      id: record.id,
      date: record.date,
      name: record.name,
      calories: asNumber(record.calories),
      proteinG: asNumber(record.proteinG),
      carbsG: asNumber(record.carbsG),
      fatG: asNumber(record.fatG),
      favouriteId: record.favouriteId || undefined,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      deletedAt: record.deletedAt || undefined
    }));
}

function parseFavourites(rows: unknown[][] = []): FavouriteMeal[] {
  return mapRows(FAVOURITE_HEADERS, rows)
    .filter((record) => record.id)
    .map((record) => ({
      id: record.id,
      name: record.name,
      calories: asNumber(record.calories),
      proteinG: asNumber(record.proteinG),
      carbsG: asNumber(record.carbsG),
      fatG: asNumber(record.fatG),
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      deletedAt: record.deletedAt || undefined
    }));
}

function readStatValue(value: unknown): number {
  const parsed = Math.round(Number(value));
  return Number.isFinite(parsed) ? Math.min(10, Math.max(1, parsed)) : 5;
}

function parseDailyStats(rows: unknown[][] = []): DailyStats[] {
  return mapRows(DAILY_STATS_HEADERS, rows)
    .filter((record) => record.id || record.date)
    .map((record) => {
      const date = record.date || record.id;
      return {
        id: record.id || date,
        date,
        anxiety: readStatValue(record.anxiety),
        energy: readStatValue(record.energy),
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        deletedAt: record.deletedAt || undefined
      };
    });
}

function parseEmotionEntries(rows: unknown[][] = []): EmotionEntry[] {
  return mapRows(EMOTION_ENTRY_HEADERS, rows)
    .filter((record) => record.id)
    .map((record) => ({
      id: record.id,
      date: record.date,
      occurredAt: record.occurredAt,
      emoji: record.emoji,
      feeling: record.feeling,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      deletedAt: record.deletedAt || undefined
    }));
}

async function ensureDataSheets(accessToken: string, spreadsheetId: string): Promise<void> {
  const spreadsheet = await googleFetch<{ sheets?: Array<{ properties?: { title?: string } }> }>(
    accessToken,
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`
  );
  const existingTitles = new Set(spreadsheet.sheets?.map((sheet) => sheet.properties?.title).filter(Boolean));
  const missingTitles = REQUIRED_DATA_SHEETS.filter((title) => !existingTitles.has(title));

  if (missingTitles.length === 0) {
    return;
  }

  await googleFetch<void>(accessToken, `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({
      requests: missingTitles.map((title) => ({
        addSheet: {
          properties: { title }
        }
      }))
    })
  });
}

export async function readSheetData(accessToken: string, spreadsheetId: string): Promise<TrackerData> {
  await ensureDataSheets(accessToken, spreadsheetId);

  const params = new URLSearchParams();
  ["Settings!A1:F2", "Meals!A1:K", "Favourites!A1:I", "DailyStats!A1:G", "EmotionEntries!A1:H"].forEach((range) =>
    params.append("ranges", range)
  );
  params.set("majorDimension", "ROWS");

  const response = await googleFetch<{
    valueRanges?: Array<{ range: string; values?: unknown[][] }>;
  }>(accessToken, `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchGet?${params}`);

  const [settingsRange, mealsRange, favouritesRange, dailyStatsRange, emotionEntriesRange] = response.valueRanges ?? [];

  return {
    settings: parseSettings(settingsRange?.values),
    meals: parseMeals(mealsRange?.values),
    favourites: parseFavourites(favouritesRange?.values),
    dailyStats: parseDailyStats(dailyStatsRange?.values),
    emotionEntries: parseEmotionEntries(emotionEntriesRange?.values)
  };
}

function settingsRows(settings: Settings): unknown[][] {
  return [
    [...SETTINGS_HEADERS],
    [
      settings.schemaVersion,
      settings.calorieTarget,
      settings.proteinTargetG,
      settings.carbsTargetG,
      settings.fatTargetG,
      settings.updatedAt
    ]
  ];
}

function mealRows(meals: Meal[]): unknown[][] {
  return [
    [...MEAL_HEADERS],
    ...meals.map((meal) => [
      meal.id,
      meal.date,
      meal.name,
      meal.calories,
      meal.proteinG,
      meal.carbsG,
      meal.fatG,
      meal.favouriteId ?? "",
      meal.createdAt,
      meal.updatedAt,
      meal.deletedAt ?? ""
    ])
  ];
}

function favouriteRows(favourites: FavouriteMeal[]): unknown[][] {
  return [
    [...FAVOURITE_HEADERS],
    ...favourites.map((favourite) => [
      favourite.id,
      favourite.name,
      favourite.calories,
      favourite.proteinG,
      favourite.carbsG,
      favourite.fatG,
      favourite.createdAt,
      favourite.updatedAt,
      favourite.deletedAt ?? ""
    ])
  ];
}

function dailyStatsRows(dailyStats: DailyStats[]): unknown[][] {
  return [
    [...DAILY_STATS_HEADERS],
    ...dailyStats.map((stats) => [
      stats.id,
      stats.date,
      stats.anxiety,
      stats.energy,
      stats.createdAt,
      stats.updatedAt,
      stats.deletedAt ?? ""
    ])
  ];
}

function emotionEntryRows(emotionEntries: EmotionEntry[]): unknown[][] {
  return [
    [...EMOTION_ENTRY_HEADERS],
    ...emotionEntries.map((entry) => [
      entry.id,
      entry.date,
      entry.occurredAt,
      entry.emoji,
      entry.feeling,
      entry.createdAt,
      entry.updatedAt,
      entry.deletedAt ?? ""
    ])
  ];
}

export async function writeSheetData(accessToken: string, spreadsheetId: string, data: TrackerData): Promise<void> {
  await ensureDataSheets(accessToken, spreadsheetId);

  await googleFetch<void>(
    accessToken,
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchClear`,
    {
      method: "POST",
      body: JSON.stringify({
        ranges: ["Settings!A1:F", "Meals!A1:K", "Favourites!A1:I", "DailyStats!A1:G", "EmotionEntries!A1:H"]
      })
    }
  );

  await googleFetch<void>(
    accessToken,
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`,
    {
      method: "POST",
      body: JSON.stringify({
        valueInputOption: "RAW",
        data: [
          { range: "Settings!A1:F2", values: settingsRows(data.settings) },
          { range: "Meals!A1:K", values: mealRows(data.meals) },
          { range: "Favourites!A1:I", values: favouriteRows(data.favourites) },
          { range: "DailyStats!A1:G", values: dailyStatsRows(data.dailyStats) },
          { range: "EmotionEntries!A1:H", values: emotionEntryRows(data.emotionEntries) }
        ]
      })
    }
  );
}
