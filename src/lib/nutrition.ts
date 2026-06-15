import type { FavouriteMeal, Meal, Nutrition, Settings } from "../types";
import { getWeekDates } from "./date";

export const DEFAULT_SETTINGS: Settings = {
  schemaVersion: 1,
  calorieTarget: 3000,
  proteinTargetG: 180,
  carbsTargetG: 350,
  fatTargetG: 85,
  updatedAt: new Date(0).toISOString()
};

export const EMPTY_NUTRITION: Nutrition = {
  calories: 0,
  proteinG: 0,
  carbsG: 0,
  fatG: 0
};

export function visibleMeals(meals: Meal[]): Meal[] {
  return meals.filter((meal) => !meal.deletedAt);
}

export function visibleFavourites(favourites: FavouriteMeal[]): FavouriteMeal[] {
  return favourites.filter((favourite) => !favourite.deletedAt);
}

export function sumNutrition(items: Nutrition[]): Nutrition {
  return items.reduce<Nutrition>(
    (total, item) => ({
      calories: total.calories + item.calories,
      proteinG: total.proteinG + item.proteinG,
      carbsG: total.carbsG + item.carbsG,
      fatG: total.fatG + item.fatG
    }),
    { ...EMPTY_NUTRITION }
  );
}

export function mealsForDate(meals: Meal[], date: string): Meal[] {
  return visibleMeals(meals).filter((meal) => meal.date === date);
}

export function mealsForWeek(meals: Meal[], date: string): Meal[] {
  const weekDates = new Set(getWeekDates(date));
  return visibleMeals(meals).filter((meal) => weekDates.has(meal.date));
}

export function dailyTarget(settings: Settings): Nutrition {
  return {
    calories: settings.calorieTarget,
    proteinG: settings.proteinTargetG,
    carbsG: settings.carbsTargetG,
    fatG: settings.fatTargetG
  };
}

export function weeklyTarget(settings: Settings): Nutrition {
  const day = dailyTarget(settings);
  return {
    calories: day.calories * 7,
    proteinG: day.proteinG * 7,
    carbsG: day.carbsG * 7,
    fatG: day.fatG * 7
  };
}

export function remainingNutrition(target: Nutrition, consumed: Nutrition): Nutrition {
  return {
    calories: target.calories - consumed.calories,
    proteinG: target.proteinG - consumed.proteinG,
    carbsG: target.carbsG - consumed.carbsG,
    fatG: target.fatG - consumed.fatG
  };
}

export function macroCalories(nutrition: Pick<Nutrition, "proteinG" | "carbsG" | "fatG">): number {
  return nutrition.proteinG * 4 + nutrition.carbsG * 4 + nutrition.fatG * 9;
}

export function hasMacroCalorieMismatch(nutrition: Nutrition): boolean {
  if (nutrition.calories <= 0) {
    return false;
  }

  const derived = macroCalories(nutrition);
  const difference = Math.abs(derived - nutrition.calories);
  return difference > Math.max(100, nutrition.calories * 0.15);
}

export function progressFraction(consumed: number, target: number): number {
  if (target <= 0) {
    return consumed > 0 ? 1 : 0;
  }

  return Math.min(consumed / target, 1);
}
