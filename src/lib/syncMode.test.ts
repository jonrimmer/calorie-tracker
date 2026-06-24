import { describe, expect, it } from "vitest";
import { syncRequestForMeta } from "./syncMode";

describe("syncRequestForMeta", () => {
  it("uses an existing spreadsheet without forcing consent", () => {
    expect(syncRequestForMeta({ spreadsheetId: "sheet-1" })).toEqual({
      spreadsheetId: "sheet-1",
      prompt: ""
    });
  });

  it("promotes local-only data by asking for consent and creating a spreadsheet", () => {
    expect(syncRequestForMeta({ localOnly: true })).toEqual({
      prompt: "consent"
    });
  });
});
