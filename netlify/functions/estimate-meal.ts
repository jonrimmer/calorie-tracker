import OpenAI, { APIError } from "openai";

interface MealEstimate {
  name: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

interface NetlifyEnv {
  get(name: string): string | undefined;
}

const estimateSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    name: {
      type: "string",
      description: "A concise meal name suitable for a food log."
    },
    calories: {
      type: "integer",
      minimum: 0,
      maximum: 5000,
      description: "Estimated total calories in kcal."
    },
    proteinG: {
      type: "number",
      minimum: 0,
      maximum: 500,
      description: "Estimated protein in grams."
    },
    carbsG: {
      type: "number",
      minimum: 0,
      maximum: 800,
      description: "Estimated carbohydrate in grams."
    },
    fatG: {
      type: "number",
      minimum: 0,
      maximum: 500,
      description: "Estimated fat in grams."
    }
  },
  required: ["name", "calories", "proteinG", "carbsG", "fatG"]
} as const;

function getEnv(name: string): string | undefined {
  const netlifyEnv = (globalThis as typeof globalThis & { Netlify?: { env: NetlifyEnv } }).Netlify?.env;
  return netlifyEnv?.get(name) ?? process.env[name];
}

function isLocalDevelopment(): boolean {
  const context = getEnv("CONTEXT");
  const nodeEnv = getEnv("NODE_ENV");
  return context === "dev" || nodeEnv === "development" || getEnv("NETLIFY_DEV") === "true";
}

function json(data: unknown, init?: ResponseInit) {
  return Response.json(data, init);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseDescription(body: unknown): string | undefined {
  if (!isRecord(body) || typeof body.description !== "string") {
    return undefined;
  }

  const description = body.description.trim();
  return description ? description.slice(0, 800) : undefined;
}

function readNumber(value: unknown, max: number): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > max) {
    return undefined;
  }

  return Math.round(value);
}

function parseEstimate(content: string | null | undefined): MealEstimate | undefined {
  if (!content) {
    return undefined;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return undefined;
  }

  if (!isRecord(parsed)) {
    return undefined;
  }

  const name = typeof parsed.name === "string" ? parsed.name.trim().slice(0, 80) : "";
  const calories = readNumber(parsed.calories, 5000);
  const proteinG = readNumber(parsed.proteinG, 500);
  const carbsG = readNumber(parsed.carbsG, 800);
  const fatG = readNumber(parsed.fatG, 500);

  if (!name || calories === undefined || proteinG === undefined || carbsG === undefined || fatG === undefined) {
    return undefined;
  }

  return { name, calories, proteinG, carbsG, fatG };
}

function extractOutputText(response: unknown): string | undefined {
  if (!isRecord(response)) {
    return undefined;
  }

  if (typeof response.output_text === "string" && response.output_text.trim()) {
    return response.output_text;
  }

  if (!Array.isArray(response.output)) {
    return undefined;
  }

  const textParts: string[] = [];
  for (const item of response.output) {
    if (!isRecord(item) || !Array.isArray(item.content)) {
      continue;
    }

    for (const contentPart of item.content) {
      if (!isRecord(contentPart)) {
        continue;
      }

      if (contentPart.type === "output_text" && typeof contentPart.text === "string") {
        textParts.push(contentPart.text);
      }
    }
  }

  const text = textParts.join("").trim();
  return text || undefined;
}

function usesReasoningControls(model: string): boolean {
  const normalizedModel = model.toLowerCase();
  return normalizedModel.startsWith("gpt-5") || /^o\d/.test(normalizedModel);
}

function sanitizeErrorMessage(message: string): string {
  return message.replace(/sk-[A-Za-z0-9_-]+/g, "sk-...");
}

function describeEstimateFailure(error: unknown): string {
  if (error instanceof APIError) {
    const status = error.status ? ` (${error.status})` : "";
    const detail = isLocalDevelopment() ? ` ${sanitizeErrorMessage(error.message)}` : "";

    if (error.status === 401 || error.status === 403) {
      return `Meal estimate failed${status}. Check OPENAI_API_KEY or Netlify AI Gateway access.${detail}`;
    }

    if (error.status === 404) {
      return `Meal estimate failed${status}. Check MEAL_ESTIMATOR_MODEL is available for your OpenAI account or Netlify AI Gateway.${detail}`;
    }

    if (error.status === 429) {
      return `Meal estimate failed${status}. The OpenAI request was rate limited or out of quota.${detail}`;
    }

    return `Meal estimate failed${status}.${detail}`;
  }

  if (error instanceof Error && isLocalDevelopment()) {
    return `Meal estimate failed. ${sanitizeErrorMessage(error.message)}`;
  }

  return "Meal estimate failed.";
}

function describeResponseFailure(error: unknown): string {
  if (!isLocalDevelopment() || !isRecord(error)) {
    return "Meal estimate failed.";
  }

  const code = typeof error.code === "string" ? ` ${error.code}:` : "";
  const message = typeof error.message === "string" ? ` ${sanitizeErrorMessage(error.message)}` : "";
  return `Meal estimate failed.${code}${message}`.trim();
}

export default async (req: Request) => {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed." }, { status: 405 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid request body." }, { status: 400 });
  }

  const description = parseDescription(body);
  if (!description) {
    return json({ error: "Describe the meal first." }, { status: 400 });
  }

  const baseURL = getEnv("OPENAI_BASE_URL");
  const apiKey = getEnv("OPENAI_API_KEY") ?? (baseURL ? "netlify-ai-gateway" : undefined);

  if (!apiKey) {
    return json({ error: "Meal estimator is not configured. Set OPENAI_API_KEY or enable Netlify AI Gateway." }, { status: 500 });
  }

  const client = new OpenAI({ apiKey, baseURL });
  const model = getEnv("MEAL_ESTIMATOR_MODEL") ?? "gpt-5-mini";
  const reasoning = usesReasoningControls(model) && !model.toLowerCase().includes("pro") ? { effort: "low" as const } : undefined;

  try {
    const response = await client.responses.create({
      model,
      instructions:
        "You estimate nutrition for meal logging. Use the user's quantities when present, infer common serving sizes when absent, and return one plausible estimate. Calories are kcal; proteinG, carbsG, and fatG are grams.",
      input: `Meal description: ${description}`,
      max_output_tokens: 800,
      reasoning,
      store: false,
      text: {
        verbosity: "low",
        format: {
          type: "json_schema",
          name: "meal_macro_estimate",
          strict: true,
          schema: estimateSchema
        }
      }
    });

    if (response.status === "failed") {
      console.error("Meal estimate response failed", response.error);
      return json({ error: describeResponseFailure(response.error) }, { status: 502 });
    }

    if (response.status === "incomplete") {
      console.error("Meal estimate response incomplete", response.incomplete_details);
      return json({ error: "Meal estimate was incomplete. Try a shorter meal description." }, { status: 502 });
    }

    const estimate = parseEstimate(extractOutputText(response));

    if (!estimate) {
      return json({ error: "Meal estimate was incomplete." }, { status: 502 });
    }

    return json({ estimate });
  } catch (error) {
    console.error("Meal estimate failed", error);
    return json({ error: describeEstimateFailure(error) }, { status: 502 });
  }
};

export const config = {
  path: "/api/estimate-meal",
  method: "POST"
};
