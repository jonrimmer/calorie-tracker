import { describe, expect, it } from "vitest";
import {
  dailyTarget,
  hasMacroCalorieMismatch,
  macroCalories,
  mealsForWeek,
  remainingNutrition,
  sumNutrition,
  weeklyTarget
} from "./nutrition";
import type { Meal, Settings } from "../types";

const settings: Settings = {
  schemaVersion: 1,
  calorieTarget: 3000,
  proteinTargetG: 180,
  carbsTargetG: 350,
  fatTargetG: 85,
  updatedAt: "2026-06-15T08:00:00.000Z"
};

const meals: Meal[] = [
  {
    id: "1",
    date: "2026-06-15",
    name: "Breakfast",
    calories: 500,
    proteinG: 40,
    carbsG: 60,
    fatG: 12,
    createdAt: "2026-06-15T08:00:00.000Z",
    updatedAt: "2026-06-15T08:00:00.000Z"
  },
  {
    id: "2",
    date: "2026-06-21",
    name: "Dinner",
    calories: 900,
    proteinG: 55,
    carbsG: 100,
    fatG: 30,
    createdAt: "2026-06-21T18:00:00.000Z",
    updatedAt: "2026-06-21T18:00:00.000Z"
  },
  {
    id: "3",
    date: "2026-06-22",
    name: "Next week",
    calories: 300,
    proteinG: 20,
    carbsG: 20,
    fatG: 10,
    createdAt: "2026-06-22T09:00:00.000Z",
    updatedAt: "2026-06-22T09:00:00.000Z"
  }
];

describe("nutrition calculations", () => {
  it("builds daily and weekly targets", () => {
    expect(dailyTarget(settings)).toEqual({
      calories: 3000,
      proteinG: 180,
      carbsG: 350,
      fatG: 85
    });
    expect(weeklyTarget(settings)).toEqual({
      calories: 21000,
      proteinG: 1260,
      carbsG: 2450,
      fatG: 595
    });
  });

  it("sums meals and calculates remaining nutrition", () => {
    const total = sumNutrition(meals.slice(0, 2));

    expect(total).toEqual({
      calories: 1400,
      proteinG: 95,
      carbsG: 160,
      fatG: 42
    });
    expect(remainingNutrition(dailyTarget(settings), total)).toEqual({
      calories: 1600,
      proteinG: 85,
      carbsG: 190,
      fatG: 43
    });
  });

  it("uses Monday-start weeks", () => {
    expect(mealsForWeek(meals, "2026-06-18").map((meal) => meal.id)).toEqual(["1", "2"]);
  });

  it("detects material calorie and macro mismatches", () => {
    expect(macroCalories({ proteinG: 40, carbsG: 50, fatG: 20 })).toBe(540);
    expect(hasMacroCalorieMismatch({ calories: 540, proteinG: 40, carbsG: 50, fatG: 20 })).toBe(false);
    expect(hasMacroCalorieMismatch({ calories: 900, proteinG: 40, carbsG: 50, fatG: 20 })).toBe(true);
  });
});
