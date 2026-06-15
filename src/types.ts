export type ISODate = string;
export type ISODateTime = string;

export interface Nutrition {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export interface Settings {
  schemaVersion: number;
  calorieTarget: number;
  proteinTargetG: number;
  carbsTargetG: number;
  fatTargetG: number;
  updatedAt: ISODateTime;
}

export interface Meal extends Nutrition {
  id: string;
  date: ISODate;
  name: string;
  favouriteId?: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  deletedAt?: ISODateTime;
}

export interface FavouriteMeal extends Nutrition {
  id: string;
  name: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  deletedAt?: ISODateTime;
}

export interface TrackerData {
  settings: Settings;
  meals: Meal[];
  favourites: FavouriteMeal[];
}

export interface LocalMeta {
  spreadsheetId?: string;
  lastSyncAt?: ISODateTime;
  localOnly?: boolean;
  pendingSync?: boolean;
}

export interface SyncRecord {
  id: string;
  updatedAt: ISODateTime;
  deletedAt?: ISODateTime;
}

export type SyncPhase =
  | "loading"
  | "needs-setup"
  | "offline"
  | "ready"
  | "syncing"
  | "synced"
  | "error";

export interface SyncState {
  phase: SyncPhase;
  message?: string;
  lastSyncAt?: ISODateTime;
}

export type MealDraft = Omit<Meal, "id" | "createdAt" | "updatedAt" | "deletedAt"> & {
  id?: string;
};

export type FavouriteDraft = Omit<FavouriteMeal, "id" | "createdAt" | "updatedAt" | "deletedAt"> & {
  id?: string;
};

export type SettingsDraft = Omit<Settings, "schemaVersion" | "updatedAt">;
