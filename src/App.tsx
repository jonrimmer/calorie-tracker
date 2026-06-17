import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AuthError,
  MissingIdentityError,
  getUser,
  handleAuthCallback,
  logout,
  oauthLogin,
  onAuthChange,
  type CallbackResult,
  type User as NetlifyUser
} from "@netlify/identity";
import { TrackerShell } from "./components/TrackerShell";
import { createDemoData } from "./lib/demoData";
import { DEFAULT_SETTINGS } from "./lib/nutrition";
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
import { syncTrackerData } from "./services/syncTracker";
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
import { estimateMealFromDescription } from "./services/mealEstimator";

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

function authErrorMessage(error: unknown): string {
  if (error instanceof MissingIdentityError) {
    return "Netlify Identity is available after deployment.";
  }

  if (error instanceof AuthError || error instanceof Error) {
    return error.message;
  }

  return "Sign-in failed.";
}

function authCallbackMessage(result: CallbackResult | null): string | undefined {
  if (!result) {
    return undefined;
  }

  if (result.type === "oauth") {
    return "Signed in.";
  }

  if (result.type === "confirmation") {
    return "Email confirmed.";
  }

  if (result.type === "email_change") {
    return "Email updated.";
  }

  return undefined;
}

export default function App() {
  const [data, setData] = useState<TrackerData>({
    settings: DEFAULT_SETTINGS,
    meals: [],
    favourites: []
  });
  const [meta, setMeta] = useState<LocalMeta>({});
  const [authUser, setAuthUser] = useState<NetlifyUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authMessage, setAuthMessage] = useState<string | undefined>();
  const [accessToken, setAccessToken] = useState<string | undefined>();
  const [silentAuthAttempted, setSilentAuthAttempted] = useState(false);
  const [selectedDate, setSelectedDate] = useState(toISODate());
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [syncState, setSyncState] = useState<SyncState>({ phase: "loading" });

  useEffect(() => {
    let cancelled = false;

    async function loadAuth() {
      try {
        const result = await handleAuthCallback();
        const currentUser = result?.user ?? (await getUser());

        if (cancelled) {
          return;
        }

        setAuthUser(currentUser);
        setAuthMessage(authCallbackMessage(result));
      } catch (error) {
        const currentUser = await getUser();

        if (cancelled) {
          return;
        }

        setAuthUser(currentUser);
        setAuthMessage(authErrorMessage(error));
      } finally {
        if (!cancelled) {
          setAuthLoading(false);
        }
      }
    }

    const unsubscribe = onAuthChange((_event, currentUser) => {
      setAuthUser(currentUser);
      if (!currentUser) {
        setAccessToken(undefined);
      }
    });

    loadAuth();

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

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
        phase: storedMeta.pendingSync ? (navigator.onLine ? "pending" : "offline") : storedMeta.spreadsheetId || storedMeta.localOnly ? "ready" : "needs-setup",
        lastSyncAt: storedMeta.lastSyncAt,
        message: storedMeta.localOnly
          ? "Local test mode"
          : storedMeta.pendingSync
            ? navigator.onLine
              ? "Sync needed."
              : "Offline changes saved locally."
            : storedMeta.lastSyncAt
              ? "Synced"
              : undefined
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

  const noteLocalChange = useCallback(
    async (message: string) => {
      if (meta.spreadsheetId && !meta.localOnly) {
        await persistMeta({ ...meta, pendingSync: true });
      }

      setSyncState((current) => ({
        ...current,
        phase: navigator.onLine && meta.spreadsheetId && !meta.localOnly ? "pending" : navigator.onLine ? "ready" : "offline",
        message:
          meta.spreadsheetId && !meta.localOnly
            ? navigator.onLine
              ? `${message} Sync needed.`
              : "Offline changes saved locally."
            : message
      }));
    },
    [meta, persistMeta]
  );

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

  const signIn = useCallback(() => {
    try {
      setAuthMessage("Redirecting...");
      oauthLogin("google");
    } catch (error) {
      setAuthMessage(authErrorMessage(error));
    }
  }, []);

  const signOut = useCallback(async () => {
    let message: string | undefined;

    try {
      await logout();
    } catch (error) {
      message = authErrorMessage(error);
    }

    setAuthUser(null);
    setAccessToken(undefined);
    setAuthMessage(message);
  }, []);

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
      await noteLocalChange("Targets saved.");
    },
    [data, noteLocalChange]
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
      await noteLocalChange("Meal saved.");
    },
    [data, noteLocalChange]
  );

  const estimateMeal = useCallback(async (description: string) => estimateMealFromDescription(description), []);

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
      await noteLocalChange("Meal deleted.");
    },
    [data, noteLocalChange]
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
      await noteLocalChange("Favourite saved.");
      return favourite;
    },
    [data, noteLocalChange]
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
      await noteLocalChange("Favourite deleted.");
    },
    [data, noteLocalChange]
  );

  const performGoogleSync = useCallback(
    async (spreadsheetId?: string, prompt: "" | "consent" = "", tokenOverride?: string) => {
      if (!navigator.onLine) {
        setSyncState({ phase: "offline", message: "Offline changes saved locally.", lastSyncAt: meta.lastSyncAt });
        return;
      }

      setSyncState({ phase: "syncing", message: "Syncing..." });
      const result = await syncTrackerData({
        spreadsheetId,
        prompt,
        meta,
        getGoogleToken: tokenOverride ? async () => tokenOverride : getGoogleToken,
        getLocalData: getTrackerData,
        ensureSpreadsheet: ensureTrackerSpreadsheet,
        readRemoteData: readSheetData,
        writeRemoteData: writeSheetData
      });

      await persistAll(result.data);
      await persistMeta(result.meta);
      setSyncState({ phase: "synced", message: "Synced", lastSyncAt: result.meta.lastSyncAt });
    },
    [getGoogleToken, meta, persistAll, persistMeta]
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
      await performGoogleSync(meta.spreadsheetId);
    } catch (error) {
      setSyncState({ phase: "error", message: errorMessage(error), lastSyncAt: meta.lastSyncAt });
    }
  }, [meta.lastSyncAt, meta.localOnly, meta.spreadsheetId, performGoogleSync]);

  useEffect(() => {
    if (!meta.spreadsheetId || meta.localOnly || syncState.phase === "syncing" || syncState.phase === "error") {
      return;
    }

    if (!isOnline && meta.pendingSync) {
      setSyncState((current) => ({ ...current, phase: "offline", message: "Offline changes saved locally." }));
      return;
    }

    if (isOnline && meta.pendingSync && !accessToken) {
      setSyncState((current) => ({ ...current, phase: "pending", message: "Sync needed. Tap Sync." }));
    }
  }, [accessToken, isOnline, meta.localOnly, meta.pendingSync, meta.spreadsheetId, syncState.phase]);

  useEffect(() => {
    if (
      silentAuthAttempted ||
      accessToken ||
      !GOOGLE_CLIENT_ID ||
      !isOnline ||
      !meta.spreadsheetId ||
      meta.localOnly ||
      syncState.phase === "syncing"
    ) {
      return;
    }

    let cancelled = false;
    setSilentAuthAttempted(true);

    getGoogleToken("")
      .then((token) => {
        if (cancelled) {
          return;
        }

        return performGoogleSync(meta.spreadsheetId, "", token);
      })
      .catch(() => {
        if (cancelled) {
          return;
        }

        setSyncState((current) => ({
          ...current,
          phase: meta.pendingSync ? "pending" : "ready",
          message: meta.pendingSync ? "Sync needed. Tap Sync." : "Tap Sync to refresh."
        }));
      });

    return () => {
      cancelled = true;
    };
  }, [
    accessToken,
    getGoogleToken,
    isOnline,
    meta.localOnly,
    meta.pendingSync,
    meta.spreadsheetId,
    performGoogleSync,
    silentAuthAttempted,
    syncState.phase
  ]);

  useEffect(() => {
    if (!isOnline || !meta.spreadsheetId || meta.localOnly || !meta.pendingSync || !accessToken || syncState.phase === "syncing") {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      performGoogleSync(meta.spreadsheetId).catch((error) => {
        setSyncState({ phase: "error", message: errorMessage(error), lastSyncAt: meta.lastSyncAt });
      });
    }, 800);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [
    accessToken,
    isOnline,
    meta.lastSyncAt,
    meta.localOnly,
    meta.pendingSync,
    meta.spreadsheetId,
    performGoogleSync,
    syncState.phase
  ]);

  const startLocalMode = useMemo(() => {
    if (!import.meta.env.DEV) {
      return undefined;
    }

    return async () => {
      const demoData = createDemoData();
      const nextMeta = { localOnly: true, pendingSync: false };
      await saveTrackerData(demoData);
      await persistMeta(nextMeta);
      setData(demoData);
      setSyncState({ phase: "ready", message: "Local test mode" });
    };
  }, [persistMeta]);

  return (
    <TrackerShell
      authUser={authUser ? { name: authUser.name, email: authUser.email, pictureUrl: authUser.pictureUrl } : null}
      authLoading={authLoading}
      authMessage={authMessage}
      localModeActive={Boolean(meta.localOnly && startLocalMode)}
      data={data}
      selectedDate={selectedDate}
      syncState={syncState}
      googleClientConfigured={Boolean(GOOGLE_CLIENT_ID)}
      isConfigured={Boolean(meta.spreadsheetId || meta.localOnly)}
      isOnline={isOnline}
      onSelectDate={setSelectedDate}
      onSignIn={signIn}
      onSignOut={signOut}
      onSetupGoogle={setupGoogle}
      onSync={syncNow}
      onStartLocalMode={startLocalMode}
      onSaveSettings={saveSettings}
      onSaveMeal={saveMeal}
      onEstimateMeal={estimateMeal}
      onDeleteMeal={deleteMeal}
      onSaveFavourite={saveFavourite}
      onDeleteFavourite={deleteFavourite}
    />
  );
}
