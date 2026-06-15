import type { FavouriteMeal, Meal, Settings, SyncRecord, TrackerData } from "../types";
import { DEFAULT_SETTINGS } from "./nutrition";

function newestTimestamp(record: SyncRecord): string {
  return record.deletedAt && record.deletedAt > record.updatedAt ? record.deletedAt : record.updatedAt;
}

export function mergeRecords<T extends SyncRecord>(local: T[], remote: T[]): T[] {
  const byId = new Map<string, T>();

  for (const record of remote) {
    byId.set(record.id, record);
  }

  for (const record of local) {
    const existing = byId.get(record.id);
    if (!existing || newestTimestamp(record) >= newestTimestamp(existing)) {
      byId.set(record.id, record);
    }
  }

  return Array.from(byId.values()).sort((a, b) => newestTimestamp(a).localeCompare(newestTimestamp(b)));
}

export function mergeSettings(local: Settings, remote?: Settings): Settings {
  if (!remote) {
    return local;
  }

  return local.updatedAt >= remote.updatedAt ? local : remote;
}

export function mergeTrackerData(local: TrackerData, remote?: Partial<TrackerData>): TrackerData {
  return {
    settings: mergeSettings(local.settings, remote?.settings ?? DEFAULT_SETTINGS),
    meals: mergeRecords<Meal>(local.meals, remote?.meals ?? []),
    favourites: mergeRecords<FavouriteMeal>(local.favourites, remote?.favourites ?? [])
  };
}
