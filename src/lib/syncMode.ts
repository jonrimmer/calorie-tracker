import type { LocalMeta } from "../types";

export interface SyncRequest {
  spreadsheetId?: string;
  prompt: "" | "consent";
}

export function syncRequestForMeta(meta: Pick<LocalMeta, "localOnly" | "spreadsheetId">): SyncRequest {
  if (meta.localOnly && !meta.spreadsheetId) {
    return { prompt: "consent" };
  }

  return { spreadsheetId: meta.spreadsheetId, prompt: "" };
}
