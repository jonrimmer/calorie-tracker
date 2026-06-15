import { openDB, type DBSchema } from "idb";
import type { FavouriteMeal, LocalMeta, Meal, Settings, TrackerData } from "../types";
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
  meta: {
    key: string;
    value: unknown;
  };
}

const DB_NAME = "calorie-tracker";
const DB_VERSION = 1;

const dbPromise = openDB<CalorieTrackerDB>(DB_NAME, DB_VERSION, {
  upgrade(db) {
    const meals = db.createObjectStore("meals", { keyPath: "id" });
    meals.createIndex("by-date", "date");
    meals.createIndex("by-updated", "updatedAt");

    const favourites = db.createObjectStore("favourites", { keyPath: "id" });
    favourites.createIndex("by-updated", "updatedAt");

    db.createObjectStore("meta");
  }
});

export async function getTrackerData(): Promise<TrackerData> {
  const db = await dbPromise;
  const [settings, meals, favourites] = await Promise.all([
    db.get("meta", "settings") as Promise<Settings | undefined>,
    db.getAll("meals"),
    db.getAll("favourites")
  ]);

  return {
    settings: settings ?? DEFAULT_SETTINGS,
    meals,
    favourites
  };
}

export async function saveTrackerData(data: TrackerData): Promise<void> {
  const db = await dbPromise;
  const tx = db.transaction(["meta", "meals", "favourites"], "readwrite");

  await Promise.all([
    tx.objectStore("meta").put(data.settings, "settings"),
    ...data.meals.map((meal) => tx.objectStore("meals").put(meal)),
    ...data.favourites.map((favourite) => tx.objectStore("favourites").put(favourite))
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

export async function getLocalMeta(): Promise<LocalMeta> {
  const db = await dbPromise;
  return ((await db.get("meta", "localMeta")) as LocalMeta | undefined) ?? {};
}

export async function saveLocalMeta(meta: LocalMeta): Promise<void> {
  const db = await dbPromise;
  await db.put("meta", meta, "localMeta");
}
