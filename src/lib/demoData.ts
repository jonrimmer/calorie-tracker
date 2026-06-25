import type { TrackerData } from "../types";
import { toISODate } from "./date";

export function createDemoData(now = new Date()): TrackerData {
  const today = toISODate(now);
  const createdAt = now.toISOString();

  return {
    settings: {
      schemaVersion: 1,
      calorieTarget: 3000,
      proteinTargetG: 180,
      carbsTargetG: 350,
      fatTargetG: 85,
      updatedAt: createdAt
    },
    meals: [
      {
        id: "demo-breakfast",
        date: today,
        name: "Greek yoghurt bowl",
        calories: 520,
        proteinG: 42,
        carbsG: 58,
        fatG: 14,
        favouriteId: "demo-fav-1",
        createdAt,
        updatedAt: createdAt
      }
    ],
    favourites: [
      {
        id: "demo-fav-1",
        name: "Greek yoghurt bowl",
        calories: 520,
        proteinG: 42,
        carbsG: 58,
        fatG: 14,
        createdAt,
        updatedAt: createdAt
      }
    ],
    dailyStats: [
      {
        id: today,
        date: today,
        anxiety: 3,
        energy: 7,
        createdAt,
        updatedAt: createdAt
      }
    ]
  };
}
