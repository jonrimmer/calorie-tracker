import { describe, expect, it } from "vitest";
import { mergeRecords, mergeTrackerData } from "./sync";
import type { Meal, TrackerData } from "../types";

const baseMeal: Meal = {
  id: "meal-1",
  date: "2026-06-15",
  name: "Old",
  calories: 300,
  proteinG: 20,
  carbsG: 30,
  fatG: 8,
  createdAt: "2026-06-15T08:00:00.000Z",
  updatedAt: "2026-06-15T08:00:00.000Z"
};

describe("sync merge", () => {
  it("keeps the newest edit by timestamp", () => {
    const local = [{ ...baseMeal, name: "Local", updatedAt: "2026-06-15T10:00:00.000Z" }];
    const remote = [{ ...baseMeal, name: "Remote", updatedAt: "2026-06-15T09:00:00.000Z" }];

    expect(mergeRecords(local, remote)[0].name).toBe("Local");
  });

  it("keeps remote edits when they are newer", () => {
    const local = [{ ...baseMeal, name: "Local", updatedAt: "2026-06-15T09:00:00.000Z" }];
    const remote = [{ ...baseMeal, name: "Remote", updatedAt: "2026-06-15T10:00:00.000Z" }];

    expect(mergeRecords(local, remote)[0].name).toBe("Remote");
  });

  it("preserves tombstones for deletes", () => {
    const local = [
      {
        ...baseMeal,
        deletedAt: "2026-06-15T11:00:00.000Z",
        updatedAt: "2026-06-15T11:00:00.000Z"
      }
    ];
    const remote = [{ ...baseMeal, name: "Remote", updatedAt: "2026-06-15T10:00:00.000Z" }];

    expect(mergeRecords(local, remote)[0].deletedAt).toBe("2026-06-15T11:00:00.000Z");
  });

  it("merges settings, meals, favourites, and daily stats together", () => {
    const local: TrackerData = {
      settings: {
        schemaVersion: 1,
        calorieTarget: 3200,
        proteinTargetG: 190,
        carbsTargetG: 370,
        fatTargetG: 90,
        updatedAt: "2026-06-15T12:00:00.000Z"
      },
      meals: [{ ...baseMeal, name: "Local", updatedAt: "2026-06-15T12:00:00.000Z" }],
      favourites: [],
      dailyStats: [
        {
          id: "2026-06-15",
          date: "2026-06-15",
          anxiety: 4,
          energy: 8,
          createdAt: "2026-06-15T08:00:00.000Z",
          updatedAt: "2026-06-15T08:00:00.000Z"
        }
      ],
      emotionEntries: [
        {
          id: "emotion-1",
          date: "2026-06-15",
          occurredAt: "2026-06-15T11:30:00.000Z",
          emoji: "😊",
          feeling: "Happy",
          createdAt: "2026-06-15T11:30:00.000Z",
          updatedAt: "2026-06-15T11:30:00.000Z"
        }
      ]
    };
    const remote: TrackerData = {
      settings: {
        schemaVersion: 1,
        calorieTarget: 3000,
        proteinTargetG: 180,
        carbsTargetG: 350,
        fatTargetG: 85,
        updatedAt: "2026-06-15T11:00:00.000Z"
      },
      meals: [{ ...baseMeal, name: "Remote", updatedAt: "2026-06-15T10:00:00.000Z" }],
      favourites: [
        {
          id: "fav-1",
          name: "Shake",
          calories: 420,
          proteinG: 45,
          carbsG: 35,
          fatG: 10,
          createdAt: "2026-06-15T07:00:00.000Z",
          updatedAt: "2026-06-15T07:00:00.000Z"
        }
      ],
      dailyStats: [
        {
          id: "2026-06-15",
          date: "2026-06-15",
          anxiety: 7,
          energy: 3,
          createdAt: "2026-06-15T07:00:00.000Z",
          updatedAt: "2026-06-15T12:30:00.000Z"
        }
      ],
      emotionEntries: [
        {
          id: "emotion-2",
          date: "2026-06-15",
          occurredAt: "2026-06-15T12:10:00.000Z",
          emoji: "😌",
          feeling: "Calm",
          createdAt: "2026-06-15T12:10:00.000Z",
          updatedAt: "2026-06-15T12:10:00.000Z"
        }
      ]
    };

    const merged = mergeTrackerData(local, remote);

    expect(merged.settings.calorieTarget).toBe(3200);
    expect(merged.meals[0].name).toBe("Local");
    expect(merged.favourites[0].name).toBe("Shake");
    expect(merged.dailyStats[0].anxiety).toBe(7);
    expect(merged.emotionEntries.map((entry) => entry.feeling)).toEqual(["Happy", "Calm"]);
  });
});
