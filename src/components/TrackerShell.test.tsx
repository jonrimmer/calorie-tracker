import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { TrackerShell, type TrackerShellProps } from "./TrackerShell";
import type {
  FavouriteDraft,
  FavouriteMeal,
  DailyStats,
  DailyStatsDraft,
  EmotionEntry,
  EmotionEntryDraft,
  Meal,
  MealDraft,
  MealEstimate,
  SettingsDraft,
  SyncState,
  TrackerData
} from "../types";

const selectedDate = "2026-06-15";
const now = "2026-06-15T10:00:00.000Z";

function makeData(): TrackerData {
  return {
    settings: {
      schemaVersion: 1,
      calorieTarget: 3000,
      proteinTargetG: 180,
      carbsTargetG: 350,
      fatTargetG: 85,
      updatedAt: now
    },
    meals: [],
    favourites: [],
    dailyStats: [],
    emotionEntries: []
  };
}

function Harness({
  authUser = { email: "jon@example.com" },
  authLoading = false,
  isConfigured = true,
  localModeActive = false,
  syncState = { phase: "ready", message: "Ready" },
  onSignIn = () => undefined,
  onSync = async () => undefined,
  onEstimateMeal = async () => ({
    name: "Estimated meal",
    calories: 650,
    proteinG: 52,
    carbsG: 72,
    fatG: 18
  })
}: {
  authUser?: TrackerShellProps["authUser"];
  authLoading?: boolean;
  isConfigured?: boolean;
  localModeActive?: boolean;
  syncState?: SyncState;
  onSignIn?: () => void;
  onSync?: () => Promise<void>;
  onEstimateMeal?: (description: string) => Promise<MealEstimate>;
} = {}) {
  const [data, setData] = useState<TrackerData>(makeData());
  const [date, setDate] = useState(selectedDate);

  const props: TrackerShellProps = {
    authUser,
    authLoading,
    authMessage: undefined,
    localModeActive,
    data,
    selectedDate: date,
    syncState,
    googleClientConfigured: true,
    isConfigured,
    isOnline: true,
    onSelectDate: setDate,
    onSignIn,
    onSignOut: async () => undefined,
    onSetupGoogle: async () => undefined,
    onSync,
    onSaveSettings: async (settings: SettingsDraft) => {
      setData((current) => ({
        ...current,
        settings: { ...settings, schemaVersion: 1, updatedAt: now }
      }));
    },
    onSaveMeal: async (meal: MealDraft) => {
      setData((current) => {
        const existing = meal.id ? current.meals.find((item) => item.id === meal.id) : undefined;
        const saved: Meal = {
          ...existing,
          ...meal,
          id: meal.id ?? `meal-${current.meals.length + 1}`,
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
          deletedAt: undefined
        };
        return {
          ...current,
          meals: existing ? current.meals.map((item) => (item.id === saved.id ? saved : item)) : [...current.meals, saved]
        };
      });
    },
    onSaveDailyStats: async (stats: DailyStatsDraft) => {
      setData((current) => {
        const existing = current.dailyStats.find((item) => item.id === stats.date);
        const saved: DailyStats = {
          ...existing,
          ...stats,
          id: stats.date,
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
          deletedAt: undefined
        };
        return {
          ...current,
          dailyStats: existing
            ? current.dailyStats.map((item) => (item.id === saved.id ? saved : item))
            : [...current.dailyStats, saved]
        };
      });
    },
    onSaveEmotionEntry: async (entry: EmotionEntryDraft) => {
      setData((current) => {
        const existing = entry.id ? current.emotionEntries.find((item) => item.id === entry.id) : undefined;
        const saved: EmotionEntry = {
          ...existing,
          ...entry,
          id: entry.id ?? `emotion-${current.emotionEntries.length + 1}`,
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
          deletedAt: undefined
        };
        return {
          ...current,
          emotionEntries: existing
            ? current.emotionEntries.map((item) => (item.id === saved.id ? saved : item))
            : [...current.emotionEntries, saved]
        };
      });
    },
    onEstimateMeal,
    onDeleteMeal: async (meal: Meal) => {
      setData((current) => ({
        ...current,
        meals: current.meals.map((item) => (item.id === meal.id ? { ...item, deletedAt: now, updatedAt: now } : item))
      }));
    },
    onDeleteEmotionEntry: async (entry: EmotionEntry) => {
      setData((current) => ({
        ...current,
        emotionEntries: current.emotionEntries.map((item) =>
          item.id === entry.id ? { ...item, deletedAt: now, updatedAt: now } : item
        )
      }));
    },
    onSaveFavourite: async (favourite: FavouriteDraft) => {
      let saved!: FavouriteMeal;
      setData((current) => {
        const existing = favourite.id ? current.favourites.find((item) => item.id === favourite.id) : undefined;
        saved = {
          ...existing,
          ...favourite,
          id: favourite.id ?? `favourite-${current.favourites.length + 1}`,
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
          deletedAt: undefined
        };
        return {
          ...current,
          favourites: existing
            ? current.favourites.map((item) => (item.id === saved.id ? saved : item))
            : [...current.favourites, saved]
        };
      });
      return saved;
    },
    onDeleteFavourite: async (favourite: FavouriteMeal) => {
      setData((current) => ({
        ...current,
        favourites: current.favourites.map((item) =>
          item.id === favourite.id ? { ...item, deletedAt: now, updatedAt: now } : item
        )
      }));
    }
  };

  return <TrackerShell {...props} />;
}

function fillMeal(name: string) {
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: name } });
  fireEvent.change(screen.getByLabelText("Calories"), { target: { value: "650" } });
  fireEvent.change(screen.getByLabelText("Protein"), { target: { value: "52" } });
  fireEvent.change(screen.getByLabelText("Carbs"), { target: { value: "72" } });
  fireEvent.change(screen.getByLabelText("Fat"), { target: { value: "18" } });
}

describe("TrackerShell", () => {
  it("shows Google sign-in before tracker setup", () => {
    const onSignIn = vi.fn();
    render(<Harness authUser={null} onSignIn={onSignIn} />);

    fireEvent.click(screen.getByRole("button", { name: "Sign in with Google" }));

    expect(onSignIn).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Log meal")).not.toBeInTheDocument();
  });

  it("shows Google Sheets setup after sign-in", () => {
    render(<Harness isConfigured={false} />);

    expect(screen.getByRole("button", { name: "Connect Google Sheets" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sign in with Google" })).not.toBeInTheDocument();
  });

  it("logs, edits, and deletes a meal", async () => {
    render(<Harness />);

    fillMeal("Chicken bowl");
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(await screen.findByText("Chicken bowl")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Edit Chicken bowl" }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Chicken wrap" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Chicken wrap")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete Chicken wrap" }));

    await waitFor(() => expect(screen.queryByText("Chicken wrap")).not.toBeInTheDocument());
    expect(screen.getByText("No meals logged.")).toBeInTheDocument();
  });

  it("estimates meal macros from a description", async () => {
    const onEstimateMeal = vi.fn(async () => ({
      name: "Chicken Rice Bowl",
      calories: 720,
      proteinG: 45,
      carbsG: 82,
      fatG: 20
    }));
    render(<Harness onEstimateMeal={onEstimateMeal} />);

    fireEvent.change(screen.getByLabelText("Description"), {
      target: { value: "large chicken rice bowl with guacamole" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Estimate macros" }));

    await screen.findByText("Estimated macros added.");

    expect(onEstimateMeal).toHaveBeenCalledWith("large chicken rice bowl with guacamole");
    expect(screen.getByLabelText("Name")).toHaveDisplayValue("Chicken Rice Bowl");
    expect(screen.getByLabelText("Calories")).toHaveDisplayValue("720");
    expect(screen.getByLabelText("Protein")).toHaveDisplayValue("45");
    expect(screen.getByLabelText("Carbs")).toHaveDisplayValue("82");
    expect(screen.getByLabelText("Fat")).toHaveDisplayValue("20");
  });

  it("tracks daily anxiety and energy", async () => {
    render(<Harness />);

    fireEvent.change(screen.getByRole("slider", { name: /Anxiety/i }), { target: { value: "8" } });
    fireEvent.change(screen.getByRole("slider", { name: /Energy/i }), { target: { value: "4" } });
    fireEvent.click(screen.getByRole("button", { name: "Save stats" }));

    expect(await screen.findByText("Stats saved.")).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: /Anxiety/i })).toHaveValue("8");
    expect(screen.getByRole("slider", { name: /Energy/i })).toHaveValue("4");
  });

  it("logs and deletes an emotion moment", async () => {
    render(<Harness />);

    fireEvent.click(screen.getByRole("button", { name: "Happy" }));
    fireEvent.change(screen.getByLabelText("Time"), { target: { value: "14:20" } });
    fireEvent.click(screen.getByRole("button", { name: "Save emotion" }));

    expect(await screen.findByText("Emotion saved.")).toBeInTheDocument();
    const timeline = screen.getByLabelText("Emotion timeline");
    expect(within(timeline).getByText("Happy")).toBeInTheDocument();
    expect(within(timeline).getByText("14:20")).toBeInTheDocument();

    fireEvent.click(within(timeline).getByRole("button", { name: "Delete Happy emotion" }));

    await waitFor(() => expect(screen.queryByLabelText("Emotion timeline")).not.toBeInTheDocument());
    expect(screen.getByText("No emotions logged.")).toBeInTheDocument();
  });

  it("saves and logs a favourite meal", async () => {
    render(<Harness />);

    fillMeal("Mass shake");
    fireEvent.click(screen.getByLabelText("Favourite"));
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    fireEvent.click(screen.getByRole("button", { name: /Faves/i }));
    const favourites = await screen.findByLabelText("Favourite meals");
    expect(within(favourites).getByText("Mass shake")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Log Mass shake" }));
    fireEvent.click(screen.getByRole("button", { name: /Today/i }));

    await waitFor(() => expect(screen.getAllByText("Mass shake").length).toBeGreaterThanOrEqual(2));
  });

  it("updates targets", async () => {
    render(<Harness />);

    fireEvent.click(screen.getByRole("button", { name: /Targets/i }));
    fireEvent.change(screen.getByLabelText("Calories"), { target: { value: "3200" } });
    fireEvent.change(screen.getByLabelText("Protein"), { target: { value: "190" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    fireEvent.click(screen.getByRole("button", { name: /Today/i }));

    expect(await screen.findByText("0 / 3,200")).toBeInTheDocument();
  });

  it("shows a soft macro mismatch warning", () => {
    render(<Harness />);

    fireEvent.change(screen.getByLabelText("Calories"), { target: { value: "1000" } });
    fireEvent.change(screen.getByLabelText("Protein"), { target: { value: "10" } });
    fireEvent.change(screen.getByLabelText("Carbs"), { target: { value: "10" } });
    fireEvent.change(screen.getByLabelText("Fat"), { target: { value: "10" } });

    expect(screen.getByText("170 kcal from macros")).toBeInTheDocument();
  });

  it("puts pending sync status and action in the main shell", async () => {
    const onSync = vi.fn(async () => undefined);
    render(<Harness syncState={{ phase: "pending", message: "Meal saved. Sync needed." }} onSync={onSync} />);

    expect(screen.getByRole("button", { name: "Sync needed" })).toBeInTheDocument();
    expect(screen.getByLabelText("Sync status")).toHaveTextContent("Meal saved. Sync needed.");

    fireEvent.click(screen.getByRole("button", { name: "Sync needed" }));

    await waitFor(() => expect(onSync).toHaveBeenCalledTimes(1));
  });
});
