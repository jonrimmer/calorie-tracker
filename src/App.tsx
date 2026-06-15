import { useCallback, useEffect, useMemo, useState } from "react";
import { TrackerShell } from "./components/TrackerShell";
import { createDemoData } from "./lib/demoData";
import { DEFAULT_SETTINGS } from "./lib/nutrition";
import { mergeTrackerData } from "./lib/sync";
import {
  getLocalMeta,
  getTrackerData,
  saveFavourite as saveFavouriteRecord,
  saveLocalMeta,
  saveMeal as saveMealRecord,
  saveSettings as saveSettingsRecord,
  saveTrackerData
} from "./storage/db";
import {
  authorizeGoogle,
  ensureTrackerSpreadsheet,
  readSheetData,
  writeSheetData,
  GoogleApiError
} from "./services/google";
import type {
  FavouriteDraft,
  FavouriteMeal,
  LocalMeta,
  Meal,
  MealDraft,
  SettingsDraft,
  SyncState,
  TrackerData
} from "./types";
import { toISODate } from "./lib/date";

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? "";

function newId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;
}

function errorMessage(error: unknown): string {
  if (error instanceof GoogleApiError || error instanceof Error) {
    return error.message;
  }

  return "Something went wrong.";
}

export default function App() {
  const [data, setData] = useState<TrackerData>({
    settings: DEFAULT_SETTINGS,
    meals: [],
    favourites: []
  });
  const [meta, setMeta] = useState<LocalMeta>({});
  const [accessToken, setAccessToken] = useState<string | undefined>();
  const [selectedDate, setSelectedDate] = useState(toISODate());
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [syncState, setSyncState] = useState<SyncState>({ phase: "loading" });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const [storedData, storedMeta] = await Promise.all([getTrackerData(), getLocalMeta()]);
      if (cancelled) {
        return;
      }

      setData(storedData);
      setMeta(storedMeta);
      setSyncState({
        phase: storedMeta.spreadsheetId || storedMeta.localOnly ? "ready" : "needs-setup",
        lastSyncAt: storedMeta.lastSyncAt,
        message: storedMeta.localOnly ? "Local test mode" : storedMeta.lastSyncAt ? "Synced" : undefined
      });
    }

    load().catch((error) => {
      setSyncState({ phase: "error", message: errorMessage(error) });
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function markOnline() {
      setIsOnline(true);
    }

    function markOffline() {
      setIsOnline(false);
      setSyncState((current) => ({ ...current, phase: "offline", message: "Offline changes saved locally." }));
    }

    window.addEventListener("online", markOnline);
    window.addEventListener("offline", markOffline);

    return () => {
      window.removeEventListener("online", markOnline);
      window.removeEventListener("offline", markOffline);
    };
  }, []);

  const persistAll = useCallback(async (nextData: TrackerData) => {
    setData(nextData);
    await saveTrackerData(nextData);
    setSyncState((current) => ({
      ...current,
      phase: navigator.onLine ? "ready" : "offline",
      message: navigator.onLine ? "Changes saved locally." : "Offline changes saved locally."
    }));
  }, []);

  const persistMeta = useCallback(async (nextMeta: LocalMeta) => {
    setMeta(nextMeta);
    await saveLocalMeta(nextMeta);
  }, []);

  const getGoogleToken = useCallback(
    async (prompt: "" | "consent") => {
      if (accessToken && prompt !== "consent") {
        return accessToken;
      }

      const token = await authorizeGoogle(GOOGLE_CLIENT_ID, prompt);
      setAccessToken(token);
      return token;
    },
    [accessToken]
  );

  const saveSettings = useCallback(
    async (draft: SettingsDraft) => {
      const settings = {
        ...draft,
        schemaVersion: 1,
        updatedAt: new Date().toISOString()
      };
      const nextData = { ...data, settings };
      setData(nextData);
      await saveSettingsRecord(settings);
      setSyncState((current) => ({ ...current, phase: navigator.onLine ? "ready" : "offline", message: "Targets saved." }));
    },
    [data]
  );

  const saveMeal = useCallback(
    async (draft: MealDraft) => {
      const now = new Date().toISOString();
      const existing = draft.id ? data.meals.find((meal) => meal.id === draft.id) : undefined;
      const meal: Meal = {
        ...existing,
        ...draft,
        id: draft.id ?? newId("meal"),
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        deletedAt: undefined
      };
      const meals = existing ? data.meals.map((item) => (item.id === meal.id ? meal : item)) : [...data.meals, meal];
      const nextData = { ...data, meals };

      setData(nextData);
      await saveMealRecord(meal);
      setSyncState((current) => ({ ...current, phase: navigator.onLine ? "ready" : "offline", message: "Meal saved." }));
    },
    [data]
  );

  const deleteMeal = useCallback(
    async (meal: Meal) => {
      const now = new Date().toISOString();
      const deleted = { ...meal, updatedAt: now, deletedAt: now };
      const nextData = {
        ...data,
        meals: data.meals.map((item) => (item.id === meal.id ? deleted : item))
      };

      setData(nextData);
      await saveMealRecord(deleted);
      setSyncState((current) => ({ ...current, phase: navigator.onLine ? "ready" : "offline", message: "Meal deleted." }));
    },
    [data]
  );

  const saveFavourite = useCallback(
    async (draft: FavouriteDraft) => {
      const now = new Date().toISOString();
      const existing = draft.id ? data.favourites.find((favourite) => favourite.id === draft.id) : undefined;
      const favourite: FavouriteMeal = {
        ...existing,
        ...draft,
        id: draft.id ?? newId("favourite"),
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        deletedAt: undefined
      };
      const favourites = existing
        ? data.favourites.map((item) => (item.id === favourite.id ? favourite : item))
        : [...data.favourites, favourite];
      const nextData = { ...data, favourites };

      setData(nextData);
      await saveFavouriteRecord(favourite);
      setSyncState((current) => ({ ...current, phase: navigator.onLine ? "ready" : "offline", message: "Favourite saved." }));
      return favourite;
    },
    [data]
  );

  const deleteFavourite = useCallback(
    async (favourite: FavouriteMeal) => {
      const now = new Date().toISOString();
      const deleted = { ...favourite, updatedAt: now, deletedAt: now };
      const nextData = {
        ...data,
        favourites: data.favourites.map((item) => (item.id === favourite.id ? deleted : item))
      };

      setData(nextData);
      await saveFavouriteRecord(deleted);
      setSyncState((current) => ({ ...current, phase: navigator.onLine ? "ready" : "offline", message: "Favourite deleted." }));
    },
    [data]
  );

  const performGoogleSync = useCallback(
    async (spreadsheetId?: string, prompt: "" | "consent" = "") => {
      if (!navigator.onLine) {
        setSyncState({ phase: "offline", message: "Offline changes saved locally.", lastSyncAt: meta.lastSyncAt });
        return;
      }

      setSyncState({ phase: "syncing", message: "Syncing..." });
      const token = await getGoogleToken(prompt);
      const resolvedSpreadsheetId = spreadsheetId ?? meta.spreadsheetId ?? (await ensureTrackerSpreadsheet(token));
      const remoteData = await readSheetData(token, resolvedSpreadsheetId);
      const merged = mergeTrackerData(data, remoteData);
      await writeSheetData(token, resolvedSpreadsheetId, merged);

      const lastSyncAt = new Date().toISOString();
      await persistAll(merged);
      await persistMeta({ spreadsheetId: resolvedSpreadsheetId, lastSyncAt, localOnly: false });
      setSyncState({ phase: "synced", message: "Synced", lastSyncAt });
    },
    [data, getGoogleToken, meta.lastSyncAt, meta.spreadsheetId, persistAll, persistMeta]
  );

  const setupGoogle = useCallback(async () => {
    try {
      await performGoogleSync(undefined, "consent");
    } catch (error) {
      setSyncState({ phase: "error", message: errorMessage(error), lastSyncAt: meta.lastSyncAt });
    }
  }, [meta.lastSyncAt, performGoogleSync]);

  const syncNow = useCallback(async () => {
    if (meta.localOnly && !meta.spreadsheetId) {
      setSyncState({ phase: "ready", message: "Local test mode" });
      return;
    }

    try {
      await performGoogleSync(meta.spreadsheetId, meta.spreadsheetId ? "" : "consent");
    } catch (error) {
      setSyncState({ phase: "error", message: errorMessage(error), lastSyncAt: meta.lastSyncAt });
    }
  }, [meta.lastSyncAt, meta.localOnly, meta.spreadsheetId, performGoogleSync]);

  useEffect(() => {
    if (!isOnline || !meta.spreadsheetId || meta.localOnly || !accessToken || syncState.phase !== "offline") {
      return;
    }

    performGoogleSync(meta.spreadsheetId).catch((error) => {
      setSyncState({ phase: "error", message: errorMessage(error), lastSyncAt: meta.lastSyncAt });
    });
  }, [accessToken, isOnline, meta.lastSyncAt, meta.localOnly, meta.spreadsheetId, performGoogleSync, syncState.phase]);

  const startLocalMode = useMemo(() => {
    if (!import.meta.env.DEV) {
      return undefined;
    }

    return async () => {
      const demoData = createDemoData();
      const nextMeta = { localOnly: true };
      await saveTrackerData(demoData);
      await persistMeta(nextMeta);
      setData(demoData);
      setSyncState({ phase: "ready", message: "Local test mode" });
    };
  }, [persistMeta]);

  return (
    <TrackerShell
      data={data}
      selectedDate={selectedDate}
      syncState={syncState}
      googleClientConfigured={Boolean(GOOGLE_CLIENT_ID)}
      isConfigured={Boolean(meta.spreadsheetId || meta.localOnly)}
      isOnline={isOnline}
      onSelectDate={setSelectedDate}
      onSetupGoogle={setupGoogle}
      onSync={syncNow}
      onStartLocalMode={startLocalMode}
      onSaveSettings={saveSettings}
      onSaveMeal={saveMeal}
      onDeleteMeal={deleteMeal}
      onSaveFavourite={saveFavourite}
      onDeleteFavourite={deleteFavourite}
    />
  );
}
