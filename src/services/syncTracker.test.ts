import { describe, expect, it } from "vitest";
import { syncTrackerData } from "./syncTracker";
import type { TrackerData } from "../types";

const localData: TrackerData = {
  settings: {
    schemaVersion: 1,
    calorieTarget: 3200,
    proteinTargetG: 190,
    carbsTargetG: 360,
    fatTargetG: 90,
    updatedAt: "2026-06-15T12:00:00.000Z"
  },
  meals: [
    {
      id: "meal-local",
      date: "2026-06-15",
      name: "Post-workout pasta",
      calories: 820,
      proteinG: 48,
      carbsG: 112,
      fatG: 18,
      createdAt: "2026-06-15T11:55:00.000Z",
      updatedAt: "2026-06-15T12:00:00.000Z"
    }
  ],
  favourites: []
};

const remoteData: TrackerData = {
  settings: {
    schemaVersion: 1,
    calorieTarget: 3000,
    proteinTargetG: 180,
    carbsTargetG: 350,
    fatTargetG: 85,
    updatedAt: "2026-06-15T10:00:00.000Z"
  },
  meals: [],
  favourites: []
};

describe("syncTrackerData", () => {
  it("writes the latest local IndexedDB snapshot, including meals", async () => {
    let writtenData: TrackerData | undefined;

    const result = await syncTrackerData({
      meta: { spreadsheetId: "sheet-1", pendingSync: true },
      getGoogleToken: async () => "token",
      getLocalData: async () => localData,
      ensureSpreadsheet: async () => "unused",
      readRemoteData: async () => remoteData,
      writeRemoteData: async (_token, spreadsheetId, data) => {
        expect(spreadsheetId).toBe("sheet-1");
        writtenData = data;
      },
      now: () => "2026-06-15T12:01:00.000Z"
    });

    expect(writtenData?.settings.calorieTarget).toBe(3200);
    expect(writtenData?.meals).toHaveLength(1);
    expect(writtenData?.meals[0].name).toBe("Post-workout pasta");
    expect(result.meta).toMatchObject({
      spreadsheetId: "sheet-1",
      lastSyncAt: "2026-06-15T12:01:00.000Z",
      localOnly: false,
      pendingSync: false
    });
  });
});
