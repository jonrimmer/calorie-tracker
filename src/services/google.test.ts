import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearStoredGoogleUser, getStoredGoogleUser, spreadsheetConfigForProfile } from "./google";

const googleUserStorageKey = "calorie-tracker-google-user";
let storage: Map<string, string>;

beforeEach(() => {
  storage = new Map();
  vi.stubGlobal("localStorage", {
    getItem: vi.fn((key: string) => storage.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      storage.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      storage.delete(key);
    })
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("spreadsheetConfigForProfile", () => {
  it("keeps the existing production app-data pointer", () => {
    expect(spreadsheetConfigForProfile("prod")).toEqual({
      appDataFile: "calorie-tracker-spreadsheet.json",
      sheetTitle: "Calorie Tracker"
    });
  });

  it("uses a separate pointer and title for dev sync", () => {
    expect(spreadsheetConfigForProfile("dev")).toEqual({
      appDataFile: "calorie-tracker-spreadsheet.dev.json",
      sheetTitle: "Calorie Tracker (dev)"
    });
  });

  it("normalises custom sync profiles", () => {
    expect(spreadsheetConfigForProfile("Local Dev")).toEqual({
      appDataFile: "calorie-tracker-spreadsheet.local-dev.json",
      sheetTitle: "Calorie Tracker (local-dev)"
    });
  });
});

describe("stored Google user", () => {
  it("reads a stored Google profile", () => {
    localStorage.setItem(
      googleUserStorageKey,
      JSON.stringify({
        id: "google-user-1",
        email: "jon@example.com",
        name: "Jon",
        pictureUrl: "https://example.com/avatar.png"
      })
    );

    expect(getStoredGoogleUser()).toEqual({
      id: "google-user-1",
      email: "jon@example.com",
      name: "Jon",
      pictureUrl: "https://example.com/avatar.png"
    });
  });

  it("ignores malformed stored profiles", () => {
    localStorage.setItem(googleUserStorageKey, JSON.stringify({ email: "jon@example.com" }));

    expect(getStoredGoogleUser()).toBeNull();
  });

  it("clears the stored profile", () => {
    localStorage.setItem(googleUserStorageKey, JSON.stringify({ sub: "google-user-1", email: "jon@example.com" }));

    clearStoredGoogleUser();

    expect(getStoredGoogleUser()).toBeNull();
  });
});
