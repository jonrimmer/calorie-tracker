import type { MealEstimate } from "../types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return undefined;
  }

  return value;
}

function parseEstimate(value: unknown): MealEstimate {
  const candidate = isRecord(value) && isRecord(value.estimate) ? value.estimate : value;

  if (!isRecord(candidate)) {
    throw new Error("Meal estimate was not returned.");
  }

  const name = typeof candidate.name === "string" ? candidate.name.trim() : "";
  const calories = asNumber(candidate.calories);
  const proteinG = asNumber(candidate.proteinG);
  const carbsG = asNumber(candidate.carbsG);
  const fatG = asNumber(candidate.fatG);

  if (!name || calories === undefined || proteinG === undefined || carbsG === undefined || fatG === undefined) {
    throw new Error("Meal estimate was incomplete.");
  }

  return {
    name,
    calories: Math.round(calories),
    proteinG: Math.round(proteinG),
    carbsG: Math.round(carbsG),
    fatG: Math.round(fatG)
  };
}

async function readResponse(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

export async function estimateMealFromDescription(description: string): Promise<MealEstimate> {
  const response = await fetch("/api/estimate-meal", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ description })
  });
  const body = await readResponse(response);

  if (!response.ok) {
    const message = isRecord(body) && typeof body.error === "string" ? body.error : "Meal estimate failed.";
    throw new Error(message);
  }

  return parseEstimate(body);
}
