import {
  AlertCircle,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Cloud,
  Home,
  LogIn,
  LogOut,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  SlidersHorizontal,
  Star,
  Trash2,
  UserCircle,
  WandSparkles,
  WifiOff
} from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import type {
  FavouriteDraft,
  FavouriteMeal,
  Meal,
  MealDraft,
  MealEstimate,
  Nutrition,
  Settings,
  SettingsDraft,
  SyncState,
  TrackerData
} from "../types";
import {
  dailyTarget,
  hasMacroCalorieMismatch,
  macroCalories,
  mealsForDate,
  mealsForWeek,
  progressFraction,
  remainingNutrition,
  sumNutrition,
  visibleFavourites,
  weeklyTarget
} from "../lib/nutrition";
import { addDays, formatShortDate, formatWeekRange, getWeekDates } from "../lib/date";

type TabId = "today" | "week" | "favourites" | "targets";

export interface ShellUser {
  name?: string;
  email?: string;
  pictureUrl?: string;
}

export interface TrackerShellProps {
  authUser: ShellUser | null;
  authLoading: boolean;
  authMessage?: string;
  localModeActive: boolean;
  data: TrackerData;
  selectedDate: string;
  syncState: SyncState;
  googleClientConfigured: boolean;
  isConfigured: boolean;
  isOnline: boolean;
  onSelectDate: (date: string) => void;
  onSignIn: () => void;
  onSignOut: () => Promise<void>;
  onSetupGoogle: () => Promise<void>;
  onSync: () => Promise<void>;
  onStartLocalMode?: () => Promise<void>;
  onSaveSettings: (settings: SettingsDraft) => Promise<void>;
  onSaveMeal: (meal: MealDraft) => Promise<void>;
  onEstimateMeal: (description: string) => Promise<MealEstimate>;
  onDeleteMeal: (meal: Meal) => Promise<void>;
  onSaveFavourite: (favourite: FavouriteDraft) => Promise<FavouriteMeal>;
  onDeleteFavourite: (favourite: FavouriteMeal) => Promise<void>;
}

function numberValue(value: FormDataEntryValue | null): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatNumber(value: number): string {
  return Math.round(value).toLocaleString();
}

function classNames(...classes: Array<string | false | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

function ProgressBar({ value, target, tone = "green" }: { value: number; target: number; tone?: "green" | "amber" | "red" }) {
  return (
    <span className="progress" aria-hidden="true">
      <span
        className={`progress__fill progress__fill--${tone}`}
        style={{ transform: `scaleX(${progressFraction(value, target)})` }}
      />
    </span>
  );
}

function MacroRow({
  label,
  consumed,
  target,
  tone
}: {
  label: string;
  consumed: number;
  target: number;
  tone: "green" | "amber" | "red";
}) {
  return (
    <div className="macro-row">
      <div className="macro-row__top">
        <span>{label}</span>
        <strong>
          {formatNumber(consumed)} / {formatNumber(target)}g
        </strong>
      </div>
      <ProgressBar value={consumed} target={target} tone={tone} />
    </div>
  );
}

function Dashboard({
  title,
  subtitle,
  consumed,
  target
}: {
  title: string;
  subtitle: string;
  consumed: Nutrition;
  target: Nutrition;
}) {
  const remaining = remainingNutrition(target, consumed);

  return (
    <section className="dashboard" aria-label={title}>
      <div className="section-heading">
        <div>
          <p className="eyebrow">{subtitle}</p>
          <h1>{title}</h1>
        </div>
        <div className={classNames("calorie-pill", remaining.calories < 0 && "calorie-pill--over")}>
          <span>{remaining.calories < 0 ? "Over" : "Left"}</span>
          <strong>{formatNumber(Math.abs(remaining.calories))}</strong>
        </div>
      </div>

      <div className="calorie-meter">
        <div>
          <span>Calories</span>
          <strong>
            {formatNumber(consumed.calories)} / {formatNumber(target.calories)}
          </strong>
        </div>
        <ProgressBar value={consumed.calories} target={target.calories} tone={remaining.calories < 0 ? "red" : "green"} />
      </div>

      <div className="macro-grid">
        <MacroRow label="Protein" consumed={consumed.proteinG} target={target.proteinG} tone="green" />
        <MacroRow label="Carbs" consumed={consumed.carbsG} target={target.carbsG} tone="amber" />
        <MacroRow label="Fat" consumed={consumed.fatG} target={target.fatG} tone="red" />
      </div>
    </section>
  );
}

function DateStepper({ selectedDate, onSelectDate }: { selectedDate: string; onSelectDate: (date: string) => void }) {
  return (
    <div className="date-stepper">
      <button type="button" onClick={() => onSelectDate(addDays(selectedDate, -1))} aria-label="Previous day" title="Previous day">
        <ChevronLeft size={18} />
      </button>
      <input
        aria-label="Selected date"
        type="date"
        value={selectedDate}
        onChange={(event) => onSelectDate(event.currentTarget.value)}
      />
      <button type="button" onClick={() => onSelectDate(addDays(selectedDate, 1))} aria-label="Next day" title="Next day">
        <ChevronRight size={18} />
      </button>
    </div>
  );
}

interface MealFormProps {
  selectedDate: string;
  favourites: FavouriteMeal[];
  editingMeal?: Meal;
  onCancelEdit: () => void;
  onSaveMeal: (meal: MealDraft) => Promise<void>;
  onEstimateMeal: (description: string) => Promise<MealEstimate>;
  onSaveFavourite: (favourite: FavouriteDraft) => Promise<FavouriteMeal>;
  isOnline: boolean;
}

function MealForm({
  selectedDate,
  favourites,
  editingMeal,
  onCancelEdit,
  onSaveMeal,
  onEstimateMeal,
  onSaveFavourite,
  isOnline
}: MealFormProps) {
  const [selectedFavouriteId, setSelectedFavouriteId] = useState("");
  const [mealDescription, setMealDescription] = useState("");
  const [estimateState, setEstimateState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [estimateMessage, setEstimateMessage] = useState("");
  const [form, setForm] = useState({
    name: editingMeal?.name ?? "",
    date: editingMeal?.date ?? selectedDate,
    calories: editingMeal?.calories ? String(editingMeal.calories) : "",
    proteinG: editingMeal?.proteinG ? String(editingMeal.proteinG) : "",
    carbsG: editingMeal?.carbsG ? String(editingMeal.carbsG) : "",
    fatG: editingMeal?.fatG ? String(editingMeal.fatG) : ""
  });

  function applyFavourite(favouriteId: string) {
    setSelectedFavouriteId(favouriteId);
    const favourite = favourites.find((item) => item.id === favouriteId);
    if (favourite) {
      setForm({
        name: favourite.name,
        date: selectedDate,
        calories: String(favourite.calories),
        proteinG: String(favourite.proteinG),
        carbsG: String(favourite.carbsG),
        fatG: String(favourite.fatG)
      });
    }
  }

  function updateField(field: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleEstimate() {
    const description = mealDescription.trim();

    if (!description) {
      return;
    }

    if (!isOnline) {
      setEstimateState("error");
      setEstimateMessage("Online estimate needed.");
      return;
    }

    setEstimateState("loading");
    setEstimateMessage("");

    try {
      const estimate = await onEstimateMeal(description);
      setForm((current) => ({
        ...current,
        name: current.name.trim() ? current.name : estimate.name,
        calories: String(estimate.calories),
        proteinG: String(estimate.proteinG),
        carbsG: String(estimate.carbsG),
        fatG: String(estimate.fatG)
      }));
      setEstimateState("success");
      setEstimateMessage("Estimated macros added.");
    } catch (error) {
      setEstimateState("error");
      setEstimateMessage(error instanceof Error && error.message ? error.message : "Estimate failed.");
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const saveAsFavourite = formData.get("saveAsFavourite") === "on";
    let favouriteId = String(formData.get("favouriteId") ?? "") || editingMeal?.favouriteId;
    const draft = {
      id: editingMeal?.id,
      date: String(formData.get("date")),
      name: String(formData.get("name") ?? "").trim(),
      calories: numberValue(formData.get("calories")),
      proteinG: numberValue(formData.get("proteinG")),
      carbsG: numberValue(formData.get("carbsG")),
      fatG: numberValue(formData.get("fatG")),
      favouriteId: favouriteId || undefined
    };

    if (!draft.name) {
      return;
    }

    if (saveAsFavourite) {
      const savedFavourite = await onSaveFavourite({
        id: favouriteId || undefined,
        name: draft.name,
        calories: draft.calories,
        proteinG: draft.proteinG,
        carbsG: draft.carbsG,
        fatG: draft.fatG
      });
      favouriteId = savedFavourite.id;
    }

    await onSaveMeal({ ...draft, favouriteId: favouriteId || undefined });
    form.reset();
    setSelectedFavouriteId("");
    setMealDescription("");
    setEstimateState("idle");
    setEstimateMessage("");
    setForm({ name: "", date: selectedDate, calories: "", proteinG: "", carbsG: "", fatG: "" });
    onCancelEdit();
  }

  const preview: Nutrition = {
    calories: numberValue(form.calories),
    proteinG: numberValue(form.proteinG),
    carbsG: numberValue(form.carbsG),
    fatG: numberValue(form.fatG)
  };
  const mismatch = hasMacroCalorieMismatch(preview);

  return (
    <form className="entry-form" onSubmit={handleSubmit}>
      <div className="form-title">
        <h2>{editingMeal ? "Edit meal" : "Log meal"}</h2>
        {editingMeal && (
          <button type="button" className="ghost-button" onClick={onCancelEdit}>
            Cancel
          </button>
        )}
      </div>

      <div className="estimate-box">
        <label className="field field--wide">
          <span>Description</span>
          <textarea
            value={mealDescription}
            onChange={(event) => {
              setMealDescription(event.currentTarget.value);
              setEstimateState("idle");
              setEstimateMessage("");
            }}
            placeholder="Chicken burrito bowl with rice and guac"
            rows={3}
          />
        </label>
        <div className="estimate-box__actions">
          {estimateMessage && (
            <p className={classNames("estimate-message", estimateState === "error" && "estimate-message--error")}>
              {estimateMessage}
            </p>
          )}
          <button
            className="ghost-button"
            type="button"
            onClick={handleEstimate}
            disabled={estimateState === "loading" || !mealDescription.trim()}
            aria-label="Estimate macros"
          >
            {estimateState === "loading" ? <RefreshCw size={18} /> : <WandSparkles size={18} />}
            {estimateState === "loading" ? "Estimating" : "Estimate"}
          </button>
        </div>
      </div>

      <div className="field-grid">
        <label className="field field--wide">
          <span>Name</span>
          <input name="name" value={form.name} onChange={(event) => updateField("name", event.currentTarget.value)} placeholder="Meal" autoComplete="off" />
        </label>
        <label className="field">
          <span>Date</span>
          <input name="date" type="date" value={form.date} onChange={(event) => updateField("date", event.currentTarget.value)} />
        </label>
      </div>

      {favourites.length > 0 && !editingMeal && (
        <label className="field">
          <span>Favourite</span>
          <select name="favouriteId" value={selectedFavouriteId} onChange={(event) => applyFavourite(event.currentTarget.value)}>
            <option value="">Select</option>
            {favourites.map((favourite) => (
              <option key={favourite.id} value={favourite.id}>
                {favourite.name}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="macro-input-grid">
        <label className="field">
          <span>Calories</span>
          <input
            name="calories"
            type="number"
            min="0"
            inputMode="numeric"
            value={form.calories}
            onChange={(event) => updateField("calories", event.currentTarget.value)}
          />
        </label>
        <label className="field">
          <span>Protein</span>
          <input
            name="proteinG"
            type="number"
            min="0"
            inputMode="decimal"
            value={form.proteinG}
            onChange={(event) => updateField("proteinG", event.currentTarget.value)}
          />
        </label>
        <label className="field">
          <span>Carbs</span>
          <input
            name="carbsG"
            type="number"
            min="0"
            inputMode="decimal"
            value={form.carbsG}
            onChange={(event) => updateField("carbsG", event.currentTarget.value)}
          />
        </label>
        <label className="field">
          <span>Fat</span>
          <input
            name="fatG"
            type="number"
            min="0"
            inputMode="decimal"
            value={form.fatG}
            onChange={(event) => updateField("fatG", event.currentTarget.value)}
          />
        </label>
      </div>

      {mismatch && <p className="soft-warning">{formatNumber(macroCalories(preview))} kcal from macros</p>}

      <div className="form-actions">
        <label className="check-field">
          <input type="checkbox" name="saveAsFavourite" />
          <span>Favourite</span>
        </label>
        <button className="primary-button" type="submit">
          {editingMeal ? <Save size={18} /> : <Plus size={18} />}
          {editingMeal ? "Save" : "Add"}
        </button>
      </div>
    </form>
  );
}

function MealList({
  meals,
  onEditMeal,
  onDeleteMeal
}: {
  meals: Meal[];
  onEditMeal: (meal: Meal) => void;
  onDeleteMeal: (meal: Meal) => Promise<void>;
}) {
  if (meals.length === 0) {
    return <p className="empty-state">No meals logged.</p>;
  }

  return (
    <div className="item-list" aria-label="Meals">
      {meals.map((meal) => (
        <article className="list-item" key={meal.id}>
          <div>
            <h3>{meal.name}</h3>
            <p>
              {formatNumber(meal.calories)} kcal · P {formatNumber(meal.proteinG)} · C {formatNumber(meal.carbsG)} · F{" "}
              {formatNumber(meal.fatG)}
            </p>
          </div>
          <div className="icon-actions">
            <button type="button" onClick={() => onEditMeal(meal)} aria-label={`Edit ${meal.name}`} title="Edit">
              <Pencil size={18} />
            </button>
            <button type="button" onClick={() => onDeleteMeal(meal)} aria-label={`Delete ${meal.name}`} title="Delete">
              <Trash2 size={18} />
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}

function TodayView(props: TrackerShellProps) {
  const favourites = visibleFavourites(props.data.favourites);
  const dayMeals = mealsForDate(props.data.meals, props.selectedDate);
  const [editingMeal, setEditingMeal] = useState<Meal | undefined>();
  const total = sumNutrition(dayMeals);

  return (
    <>
      <DateStepper selectedDate={props.selectedDate} onSelectDate={props.onSelectDate} />
      <Dashboard title="Today" subtitle={formatShortDate(props.selectedDate)} consumed={total} target={dailyTarget(props.data.settings)} />
      <MealForm
        key={editingMeal?.id ?? `new-${props.selectedDate}`}
        selectedDate={props.selectedDate}
        favourites={favourites}
        editingMeal={editingMeal}
        onCancelEdit={() => setEditingMeal(undefined)}
        onSaveMeal={props.onSaveMeal}
        onEstimateMeal={props.onEstimateMeal}
        onSaveFavourite={props.onSaveFavourite}
        isOnline={props.isOnline}
      />
      <MealList meals={dayMeals} onEditMeal={setEditingMeal} onDeleteMeal={props.onDeleteMeal} />
    </>
  );
}

function WeekView({ data, selectedDate }: Pick<TrackerShellProps, "data" | "selectedDate">) {
  const weekMeals = mealsForWeek(data.meals, selectedDate);
  const total = sumNutrition(weekMeals);
  const weekDates = getWeekDates(selectedDate);

  return (
    <>
      <Dashboard title="Week" subtitle={formatWeekRange(selectedDate)} consumed={total} target={weeklyTarget(data.settings)} />
      <div className="week-list" aria-label="Week days">
        {weekDates.map((date) => {
          const dayMeals = mealsForDate(data.meals, date);
          const dayTotal = sumNutrition(dayMeals);
          return (
            <article className="day-row" key={date}>
              <div>
                <h3>{formatShortDate(date)}</h3>
                <p>{dayMeals.length} meals</p>
              </div>
              <div>
                <strong>{formatNumber(dayTotal.calories)}</strong>
                <ProgressBar value={dayTotal.calories} target={data.settings.calorieTarget} tone="green" />
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}

function FavouriteForm({
  editingFavourite,
  onCancelEdit,
  onSaveFavourite
}: {
  editingFavourite?: FavouriteMeal;
  onCancelEdit: () => void;
  onSaveFavourite: (favourite: FavouriteDraft) => Promise<FavouriteMeal>;
}) {
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const draft = {
      id: editingFavourite?.id,
      name: String(formData.get("name") ?? "").trim(),
      calories: numberValue(formData.get("calories")),
      proteinG: numberValue(formData.get("proteinG")),
      carbsG: numberValue(formData.get("carbsG")),
      fatG: numberValue(formData.get("fatG"))
    };

    if (!draft.name) {
      return;
    }

    await onSaveFavourite(draft);
    form.reset();
    onCancelEdit();
  }

  return (
    <form className="entry-form" onSubmit={handleSubmit}>
      <div className="form-title">
        <h2>{editingFavourite ? "Edit favourite" : "Favourite meal"}</h2>
        {editingFavourite && (
          <button type="button" className="ghost-button" onClick={onCancelEdit}>
            Cancel
          </button>
        )}
      </div>
      <label className="field">
        <span>Name</span>
        <input name="name" defaultValue={editingFavourite?.name ?? ""} placeholder="Meal" autoComplete="off" />
      </label>
      <div className="macro-input-grid">
        <label className="field">
          <span>Calories</span>
          <input name="calories" type="number" min="0" inputMode="numeric" defaultValue={editingFavourite?.calories || ""} />
        </label>
        <label className="field">
          <span>Protein</span>
          <input name="proteinG" type="number" min="0" inputMode="decimal" defaultValue={editingFavourite?.proteinG || ""} />
        </label>
        <label className="field">
          <span>Carbs</span>
          <input name="carbsG" type="number" min="0" inputMode="decimal" defaultValue={editingFavourite?.carbsG || ""} />
        </label>
        <label className="field">
          <span>Fat</span>
          <input name="fatG" type="number" min="0" inputMode="decimal" defaultValue={editingFavourite?.fatG || ""} />
        </label>
      </div>
      <div className="form-actions form-actions--end">
        <button className="primary-button" type="submit">
          <Save size={18} />
          Save
        </button>
      </div>
    </form>
  );
}

function FavouritesView(props: TrackerShellProps) {
  const favourites = visibleFavourites(props.data.favourites);
  const [editingFavourite, setEditingFavourite] = useState<FavouriteMeal | undefined>();

  async function logFavourite(favourite: FavouriteMeal) {
    await props.onSaveMeal({
      date: props.selectedDate,
      name: favourite.name,
      calories: favourite.calories,
      proteinG: favourite.proteinG,
      carbsG: favourite.carbsG,
      fatG: favourite.fatG,
      favouriteId: favourite.id
    });
  }

  return (
    <>
      <FavouriteForm
        key={editingFavourite?.id ?? "new-favourite"}
        editingFavourite={editingFavourite}
        onCancelEdit={() => setEditingFavourite(undefined)}
        onSaveFavourite={props.onSaveFavourite}
      />

      {favourites.length === 0 ? (
        <p className="empty-state">No favourites saved.</p>
      ) : (
        <div className="item-list" aria-label="Favourite meals">
          {favourites.map((favourite) => (
            <article className="list-item" key={favourite.id}>
              <div>
                <h3>{favourite.name}</h3>
                <p>
                  {formatNumber(favourite.calories)} kcal · P {formatNumber(favourite.proteinG)} · C{" "}
                  {formatNumber(favourite.carbsG)} · F {formatNumber(favourite.fatG)}
                </p>
              </div>
              <div className="icon-actions">
                <button type="button" onClick={() => logFavourite(favourite)} aria-label={`Log ${favourite.name}`} title="Log">
                  <Plus size={18} />
                </button>
                <button type="button" onClick={() => setEditingFavourite(favourite)} aria-label={`Edit ${favourite.name}`} title="Edit">
                  <Pencil size={18} />
                </button>
                <button
                  type="button"
                  onClick={() => props.onDeleteFavourite(favourite)}
                  aria-label={`Delete ${favourite.name}`}
                  title="Delete"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}

function TargetForm({
  settings,
  onSaveSettings
}: {
  settings: Settings;
  onSaveSettings: (settings: SettingsDraft) => Promise<void>;
}) {
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    await onSaveSettings({
      calorieTarget: numberValue(formData.get("calorieTarget")),
      proteinTargetG: numberValue(formData.get("proteinTargetG")),
      carbsTargetG: numberValue(formData.get("carbsTargetG")),
      fatTargetG: numberValue(formData.get("fatTargetG"))
    });
  }

  return (
    <form className="entry-form" onSubmit={handleSubmit}>
      <div className="form-title">
        <h2>Targets</h2>
      </div>
      <div className="macro-input-grid">
        <label className="field">
          <span>Calories</span>
          <input name="calorieTarget" type="number" min="0" inputMode="numeric" defaultValue={settings.calorieTarget} />
        </label>
        <label className="field">
          <span>Protein</span>
          <input name="proteinTargetG" type="number" min="0" inputMode="decimal" defaultValue={settings.proteinTargetG} />
        </label>
        <label className="field">
          <span>Carbs</span>
          <input name="carbsTargetG" type="number" min="0" inputMode="decimal" defaultValue={settings.carbsTargetG} />
        </label>
        <label className="field">
          <span>Fat</span>
          <input name="fatTargetG" type="number" min="0" inputMode="decimal" defaultValue={settings.fatTargetG} />
        </label>
      </div>
      <div className="form-actions form-actions--end">
        <button className="primary-button" type="submit">
          <Save size={18} />
          Save
        </button>
      </div>
    </form>
  );
}

function TargetsView(props: TrackerShellProps) {
  return (
    <>
      <TargetForm settings={props.data.settings} onSaveSettings={props.onSaveSettings} />
      <section className="sync-panel" aria-label="Sync">
        <div>
          <h2>Sync</h2>
          <p>{props.syncState.message ?? "Ready"}</p>
        </div>
        <button className="primary-button" type="button" onClick={props.onSync} disabled={!props.isOnline || props.syncState.phase === "syncing"}>
          <RefreshCw size={18} />
          Sync
        </button>
      </section>
    </>
  );
}

function SetupScreen({
  googleClientConfigured,
  isOnline,
  syncState,
  onSetupGoogle,
  onStartLocalMode
}: Pick<
  TrackerShellProps,
  "googleClientConfigured" | "isOnline" | "syncState" | "onSetupGoogle" | "onStartLocalMode"
>) {
  const disabled = !googleClientConfigured || !isOnline || syncState.phase === "syncing";

  return (
    <main className="setup-screen">
      <div className="app-mark">
        <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" />
      </div>
      <h1>Calorie Tracker</h1>
      <div className="setup-actions">
        <button className="primary-button primary-button--wide" type="button" onClick={onSetupGoogle} disabled={disabled}>
          <Cloud size={18} />
          Connect Google Sheets
        </button>
        {onStartLocalMode && (
          <button className="ghost-button ghost-button--wide" type="button" onClick={onStartLocalMode}>
            Local test mode
          </button>
        )}
      </div>
      <p className="setup-status">
        {!isOnline
          ? "Online setup required."
          : !googleClientConfigured
            ? "Set VITE_GOOGLE_CLIENT_ID."
            : syncState.message ?? "Connect Google Sheets."}
      </p>
    </main>
  );
}

function AuthScreen({
  authLoading,
  authMessage,
  isOnline,
  onSignIn,
  onStartLocalMode
}: Pick<TrackerShellProps, "authLoading" | "authMessage" | "isOnline" | "onSignIn" | "onStartLocalMode">) {
  const disabled = authLoading || !isOnline;

  return (
    <main className="setup-screen">
      <div className="app-mark">
        <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" />
      </div>
      <h1>Calorie Tracker</h1>
      <div className="setup-actions">
        <button className="primary-button primary-button--wide" type="button" onClick={onSignIn} disabled={disabled}>
          <LogIn size={18} />
          {authLoading ? "Checking sign-in" : "Sign in with Google"}
        </button>
        {onStartLocalMode && (
          <button className="ghost-button ghost-button--wide" type="button" onClick={onStartLocalMode}>
            Local test mode
          </button>
        )}
      </div>
      <p className="setup-status">
        {authLoading ? "Checking sign-in." : !isOnline ? "Online sign-in required." : authMessage ?? "Sign in to continue."}
      </p>
    </main>
  );
}

function SyncBadge({
  syncState,
  isOnline,
  onSync
}: {
  syncState: SyncState;
  isOnline: boolean;
  onSync: () => Promise<void>;
}) {
  const display = getSyncDisplay(syncState, isOnline, onSync);
  const Icon = display.icon;

  return (
    <button
      type="button"
      className={classNames("sync-badge", `sync-badge--${display.tone}`)}
      onClick={display.onSync}
      disabled={display.disabled}
      aria-label={display.label}
      title={display.title}
    >
      <Icon size={16} />
      <span>{display.label}</span>
    </button>
  );
}

function getSyncDisplay(syncState: SyncState, isOnline: boolean, onSync?: () => Promise<void>) {
  if (!isOnline) {
    return {
      label: "Offline",
      title: "Offline changes are saved locally",
      tone: "offline",
      icon: WifiOff,
      disabled: true,
      onSync
    };
  }

  if (syncState.phase === "syncing") {
    return {
      label: "Syncing",
      title: "Syncing with Google Sheets",
      tone: "syncing",
      icon: RefreshCw,
      disabled: true,
      onSync
    };
  }

  if (syncState.phase === "pending") {
    return {
      label: "Sync needed",
      title: syncState.message ?? "Local changes need to sync",
      tone: "pending",
      icon: AlertCircle,
      disabled: false,
      onSync
    };
  }

  if (syncState.phase === "error") {
    return {
      label: "Sync error",
      title: syncState.message ?? "Sync failed",
      tone: "error",
      icon: AlertCircle,
      disabled: false,
      onSync
    };
  }

  if (syncState.phase === "synced") {
    return {
      label: "Synced",
      title: syncState.message ?? "Synced",
      tone: "synced",
      icon: CheckCircle2,
      disabled: false,
      onSync
    };
  }

  return {
    label: "Sync",
    title: syncState.message ?? "Sync with Google Sheets",
    tone: "ready",
    icon: Cloud,
    disabled: false,
    onSync
  };
}

function SyncNotice({ syncState, isOnline, onSync }: { syncState: SyncState; isOnline: boolean; onSync: () => Promise<void> }) {
  const display = getSyncDisplay(syncState, isOnline, onSync);
  const showNotice =
    !isOnline || syncState.phase === "pending" || syncState.phase === "error" || syncState.phase === "syncing";

  if (!showNotice) {
    return null;
  }

  const title =
    syncState.phase === "pending"
      ? "Sync needed"
      : syncState.phase === "error"
        ? "Sync error"
        : syncState.phase === "syncing"
          ? "Syncing"
          : "Offline";

  return (
    <section className={classNames("sync-notice", `sync-notice--${display.tone}`)} aria-label="Sync status">
      <div>
        <strong>{title}</strong>
        <p>{syncState.message ?? display.title}</p>
      </div>
      {(syncState.phase === "pending" || syncState.phase === "error") && (
        <button type="button" className="ghost-button" onClick={onSync} disabled={!isOnline}>
          <RefreshCw size={18} />
          Sync
        </button>
      )}
    </section>
  );
}

const tabs: Array<{ id: TabId; label: string; icon: typeof Home }> = [
  { id: "today", label: "Today", icon: Home },
  { id: "week", label: "Week", icon: CalendarDays },
  { id: "favourites", label: "Faves", icon: Star },
  { id: "targets", label: "Targets", icon: SlidersHorizontal }
];

function AccountButton({ user, onSignOut }: { user: ShellUser; onSignOut: () => Promise<void> }) {
  const label = user.name ?? user.email ?? "Account";

  return (
    <button type="button" className="account-button" onClick={onSignOut} aria-label={`Sign out ${label}`} title={`Sign out ${label}`}>
      {user.pictureUrl ? <img src={user.pictureUrl} alt="" /> : <UserCircle size={17} />}
      <span>{label}</span>
      <LogOut size={15} />
    </button>
  );
}

export function TrackerShell(props: TrackerShellProps) {
  const [activeTab, setActiveTab] = useState<TabId>("today");
  const currentView = useMemo(() => {
    if (activeTab === "today") {
      return <TodayView {...props} />;
    }
    if (activeTab === "week") {
      return <WeekView data={props.data} selectedDate={props.selectedDate} />;
    }
    if (activeTab === "favourites") {
      return <FavouritesView {...props} />;
    }
    return <TargetsView {...props} />;
  }, [activeTab, props]);

  if (props.authLoading && !props.localModeActive) {
    return <AuthScreen {...props} />;
  }

  if (!props.authUser && !props.localModeActive) {
    return <AuthScreen {...props} />;
  }

  if (!props.isConfigured) {
    return <SetupScreen {...props} />;
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Calorie Tracker</p>
          <strong>{formatShortDate(props.selectedDate)}</strong>
        </div>
        <div className="topbar__actions">
          <SyncBadge syncState={props.syncState} isOnline={props.isOnline} onSync={props.onSync} />
          {props.authUser && <AccountButton user={props.authUser} onSignOut={props.onSignOut} />}
        </div>
      </header>

      <main className="content">
        <SyncNotice syncState={props.syncState} isOnline={props.isOnline} onSync={props.onSync} />
        {currentView}
      </main>

      <nav className="tabbar" aria-label="Primary">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              className={classNames(activeTab === tab.id && "is-active")}
              onClick={() => setActiveTab(tab.id)}
              aria-current={activeTab === tab.id ? "page" : undefined}
            >
              <Icon size={20} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
