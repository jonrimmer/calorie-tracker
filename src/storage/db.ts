import { openDB, type DBSchema } from "idb";
import type { DailyStats, FavouriteMeal, LocalMeta, Meal, Settings, TrackerData } from "../types";
import { DEFAULT_SETTINGS } from "../lib/nutrition";

interface CalorieTrackerDB extends DBSchema {
  meals: {
    key: string;
    value: Meal;
    indexes: { "by-date": string; "by-updated": string };
  };
  favourites: {
    key: string;
    value: FavouriteMeal;
    indexes: { "by-updated": string };
  };
  dailyStats: {
    key: string;
    value: DailyStats;
    indexes: { "by-date": string; "by-updated": string };
  };
  meta: {
    key: string;
    value: unknown;
  };
}

const DB_NAME = "calorie-tracker";
const DB_VERSION = 2;

const dbPromise = openDB<CalorieTrackerDB>(DB_NAME, DB_VERSION, {
  upgrade(db) {
    if (!db.objectStoreNames.contains("meals")) {
      const meals = db.createObjectStore("meals", { keyPath: "id" });
      meals.createIndex("by-date", "date");
      meals.createIndex("by-updated", "updatedAt");
    }

    if (!db.objectStoreNames.contains("favourites")) {
      const favourites = db.createObjectStore("favourites", { keyPath: "id" });
      favourites.createIndex("by-updated", "updatedAt");
    }

    if (!db.objectStoreNames.contains("dailyStats")) {
      const dailyStats = db.createObjectStore("dailyStats", { keyPath: "id" });
      dailyStats.createIndex("by-date", "date");
      dailyStats.createIndex("by-updated", "updatedAt");
    }

    if (!db.objectStoreNames.contains("meta")) {
      db.createObjectStore("meta");
    }
  }
});

export async function getTrackerData(): Promise<TrackerData> {
  const db = await dbPromise;
  const [settings, meals, favourites, dailyStats] = await Promise.all([
    db.get("meta", "settings") as Promise<Settings | undefined>,
    db.getAll("meals"),
    db.getAll("favourites"),
    db.getAll("dailyStats")
  ]);

  return {
    settings: settings ?? DEFAULT_SETTINGS,
    meals,
    favourites,
    dailyStats
  };
}

export async function saveTrackerData(data: TrackerData): Promise<void> {
  const db = await dbPromise;
  const tx = db.transaction(["meta", "meals", "favourites", "dailyStats"], "readwrite");

  await Promise.all([
    tx.objectStore("meta").put(data.settings, "settings"),
    ...data.meals.map((meal) => tx.objectStore("meals").put(meal)),
    ...data.favourites.map((favourite) => tx.objectStore("favourites").put(favourite)),
    ...data.dailyStats.map((stats) => tx.objectStore("dailyStats").put(stats))
  ]);

  await tx.done;
}

export async function saveSettings(settings: Settings): Promise<void> {
  const db = await dbPromise;
  await db.put("meta", settings, "settings");
}

export async function saveMeal(meal: Meal): Promise<void> {
  const db = await dbPromise;
  await db.put("meals", meal);
}

export async function saveFavourite(favourite: FavouriteMeal): Promise<void> {
  const db = await dbPromise;
  await db.put("favourites", favourite);
}

export async function saveDailyStats(stats: DailyStats): Promise<void> {
  const db = await dbPromise;
  await db.put("dailyStats", stats);
}

export async function getLocalMeta(): Promise<LocalMeta> {
  const db = await dbPromise;
  return ((await db.get("meta", "localMeta")) as LocalMeta | undefined) ?? {};
}

export async function saveLocalMeta(meta: LocalMeta): Promise<void> {
  const db = await dbPromise;
  await db.put("meta", meta, "localMeta");
}
