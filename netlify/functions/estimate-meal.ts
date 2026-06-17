import OpenAI from "openai";

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

  const parsed = JSON.parse(content) as unknown;

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

  const apiKey = getEnv("OPENAI_API_KEY");
  const baseURL = getEnv("OPENAI_BASE_URL");

  if (!apiKey) {
    return json({ error: "Meal estimator is not configured." }, { status: 500 });
  }

  const client = new OpenAI({ apiKey, baseURL });
  const model = getEnv("MEAL_ESTIMATOR_MODEL") ?? "gpt-5-mini";

  try {
    const completion = await client.chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content:
            "You estimate nutrition for meal logging. Use the user's quantities when present, infer common serving sizes when absent, and return one plausible estimate. Calories are kcal; proteinG, carbsG, and fatG are grams."
        },
        {
          role: "user",
          content: `Meal description: ${description}`
        }
      ],
      max_completion_tokens: 220,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "meal_macro_estimate",
          strict: true,
          schema: estimateSchema
        }
      }
    });

    const estimate = parseEstimate(completion.choices[0]?.message.content);

    if (!estimate) {
      return json({ error: "Meal estimate was incomplete." }, { status: 502 });
    }

    return json({ estimate });
  } catch (error) {
    console.error("Meal estimate failed", error);
    return json({ error: "Meal estimate failed." }, { status: 502 });
  }
};

export const config = {
  path: "/api/estimate-meal",
  method: "POST"
};
