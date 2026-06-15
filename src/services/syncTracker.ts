import { mergeTrackerData } from "../lib/sync";
import type { LocalMeta, TrackerData } from "../types";

export interface SyncTrackerOptions {
  spreadsheetId?: string;
  prompt?: "" | "consent";
  meta: LocalMeta;
  getGoogleToken: (prompt: "" | "consent") => Promise<string>;
  getLocalData: () => Promise<TrackerData>;
  ensureSpreadsheet: (accessToken: string) => Promise<string>;
  readRemoteData: (accessToken: string, spreadsheetId: string) => Promise<TrackerData>;
  writeRemoteData: (accessToken: string, spreadsheetId: string, data: TrackerData) => Promise<void>;
  now?: () => string;
}

export interface SyncTrackerResult {
  data: TrackerData;
  meta: LocalMeta;
}

export async function syncTrackerData({
  spreadsheetId,
  prompt = "",
  meta,
  getGoogleToken,
  getLocalData,
  ensureSpreadsheet,
  readRemoteData,
  writeRemoteData,
  now = () => new Date().toISOString()
}: SyncTrackerOptions): Promise<SyncTrackerResult> {
  const token = await getGoogleToken(prompt);
  const resolvedSpreadsheetId = spreadsheetId ?? meta.spreadsheetId ?? (await ensureSpreadsheet(token));
  const localData = await getLocalData();
  const remoteData = await readRemoteData(token, resolvedSpreadsheetId);
  const merged = mergeTrackerData(localData, remoteData);

  await writeRemoteData(token, resolvedSpreadsheetId, merged);

  return {
    data: merged,
    meta: {
      ...meta,
      spreadsheetId: resolvedSpreadsheetId,
      lastSyncAt: now(),
      localOnly: false,
      pendingSync: false
    }
  };
}
