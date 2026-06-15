import type { FavouriteMeal, Meal, Settings, TrackerData } from "../types";
import { DEFAULT_SETTINGS } from "../lib/nutrition";

const SHEET_TITLE = "Calorie Tracker";
const APP_DATA_FILE = "calorie-tracker-spreadsheet.json";
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

interface TokenResponse {
  access_token?: string;
  error?: string;
  error_description?: string;
}

interface TokenClient {
  requestAccessToken: (options?: { prompt?: string }) => void;
  callback?: (response: TokenResponse) => void;
}

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

let identityScriptPromise: Promise<void> | undefined;

function loadIdentityScript(): Promise<void> {
  if (window.google?.accounts.oauth2) {
    return Promise.resolve();
  }

  if (!identityScriptPromise) {
    identityScriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new GoogleApiError("Google sign-in could not load."));
      document.head.appendChild(script);
    });
  }

  return identityScriptPromise;
}

export async function authorizeGoogle(clientId: string, prompt: "" | "consent" = ""): Promise<string> {
  if (!clientId) {
    throw new GoogleApiError("Missing Google OAuth client ID.");
  }

  await loadIdentityScript();

  return new Promise((resolve, reject) => {
    const tokenClient = window.google?.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPES,
      callback: (response) => {
        if (response.error || !response.access_token) {
          reject(new GoogleApiError(response.error_description ?? "Google sign-in was cancelled."));
          return;
        }

        resolve(response.access_token);
      }
    });

    tokenClient?.requestAccessToken({ prompt });
  });
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

async function findAppDataFile(accessToken: string): Promise<string | undefined> {
  const params = new URLSearchParams({
    spaces: "appDataFolder",
    q: `name='${APP_DATA_FILE}' and trashed=false`,
    fields: "files(id,name)"
  });

  const result = await googleFetch<{ files?: Array<{ id: string }> }>(
    accessToken,
    `https://www.googleapis.com/drive/v3/files?${params.toString()}`
  );

  return result.files?.[0]?.id;
}

async function readSpreadsheetPointer(accessToken: string): Promise<string | undefined> {
  const fileId = await findAppDataFile(accessToken);
  if (!fileId) {
    return undefined;
  }

  const pointer = await googleFetch<{ spreadsheetId?: string }>(
    accessToken,
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`
  );

  return pointer.spreadsheetId;
}

async function saveSpreadsheetPointer(accessToken: string, spreadsheetId: string): Promise<void> {
  const fileId = await findAppDataFile(accessToken);
  const metadata = {
    name: APP_DATA_FILE,
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

async function createTrackerSpreadsheet(accessToken: string): Promise<string> {
  const spreadsheet = await googleFetch<{ spreadsheetId: string }>(
    accessToken,
    "https://sheets.googleapis.com/v4/spreadsheets",
    {
      method: "POST",
      body: JSON.stringify({
        properties: { title: SHEET_TITLE },
        sheets: [
          { properties: { title: "Settings" } },
          { properties: { title: "Meals" } },
          { properties: { title: "Favourites" } }
        ]
      })
    }
  );

  await writeSheetData(accessToken, spreadsheet.spreadsheetId, {
    settings: { ...DEFAULT_SETTINGS, updatedAt: new Date().toISOString() },
    meals: [],
    favourites: []
  });
  await saveSpreadsheetPointer(accessToken, spreadsheet.spreadsheetId);

  return spreadsheet.spreadsheetId;
}

export async function ensureTrackerSpreadsheet(accessToken: string): Promise<string> {
  const existingSpreadsheetId = await readSpreadsheetPointer(accessToken);
  if (existingSpreadsheetId) {
    return existingSpreadsheetId;
  }

  return createTrackerSpreadsheet(accessToken);
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

export async function readSheetData(accessToken: string, spreadsheetId: string): Promise<TrackerData> {
  const params = new URLSearchParams();
  ["Settings!A1:F2", "Meals!A1:K", "Favourites!A1:I"].forEach((range) => params.append("ranges", range));
  params.set("majorDimension", "ROWS");

  const response = await googleFetch<{
    valueRanges?: Array<{ range: string; values?: unknown[][] }>;
  }>(accessToken, `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchGet?${params}`);

  const [settingsRange, mealsRange, favouritesRange] = response.valueRanges ?? [];

  return {
    settings: parseSettings(settingsRange?.values),
    meals: parseMeals(mealsRange?.values),
    favourites: parseFavourites(favouritesRange?.values)
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

export async function writeSheetData(accessToken: string, spreadsheetId: string, data: TrackerData): Promise<void> {
  await googleFetch<void>(
    accessToken,
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchClear`,
    {
      method: "POST",
      body: JSON.stringify({
        ranges: ["Settings!A1:F", "Meals!A1:K", "Favourites!A1:I"]
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
          { range: "Favourites!A1:I", values: favouriteRows(data.favourites) }
        ]
      })
    }
  );
}
