import { readFile } from "node:fs/promises";

/** A verified restaurant fact that may be returned to a customer. */
export type RestaurantFaqEntry = {
  id: string;
  question: string;
  answer: string;
  category?: string;
  aliases: string[];
  keywords: string[];
};

export type RestaurantFaq = {
  entries: RestaurantFaqEntry[];
};

function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter(Boolean))];
}

function parseEntry(value: unknown, index: number, sourcePath: string): RestaurantFaqEntry {
  if (!value || typeof value !== "object") {
    throw new Error(`Restaurant FAQ entry ${index + 1} must be an object: ${sourcePath}`);
  }

  const raw = value as Record<string, unknown>;
  if (typeof raw.question !== "string" || !raw.question.trim()) {
    throw new Error(
      `Restaurant FAQ entry ${index + 1} requires a non-empty question: ${sourcePath}`
    );
  }
  if (typeof raw.answer !== "string" || !raw.answer.trim()) {
    throw new Error(
      `Restaurant FAQ entry ${index + 1} requires a non-empty answer: ${sourcePath}`
    );
  }

  const question = raw.question.trim();
  const id = typeof raw.id === "string" && raw.id.trim()
    ? raw.id.trim()
    : slugify(question);
  if (!id) {
    throw new Error(`Restaurant FAQ entry ${index + 1} requires a usable id: ${sourcePath}`);
  }

  return {
    id,
    question,
    answer: raw.answer.trim(),
    ...(typeof raw.category === "string" && raw.category.trim()
      ? { category: raw.category.trim() }
      : {}),
    aliases: stringArray(raw.aliases),
    keywords: stringArray(raw.keywords)
  };
}

export function parseRestaurantFaq(sourcePath: string, contents: string): RestaurantFaq {
  const parsed = JSON.parse(contents) as unknown;
  const rawEntries = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === "object" &&
        Array.isArray((parsed as Record<string, unknown>).faqs)
      ? (parsed as { faqs: unknown[] }).faqs
      : [];

  if (rawEntries.length === 0) {
    throw new Error(
      `Restaurant FAQ file must contain a non-empty JSON array or faqs array: ${sourcePath}`
    );
  }

  const entries = rawEntries.map((entry, index) => parseEntry(entry, index, sourcePath));
  const duplicateIds = entries
    .map((entry) => entry.id)
    .filter((id, index, ids) => ids.indexOf(id) !== index);
  if (duplicateIds.length > 0) {
    throw new Error(
      `Restaurant FAQ ids must be unique; duplicate id "${duplicateIds[0]}": ${sourcePath}`
    );
  }

  return { entries };
}

export async function loadRestaurantFaq(faqPath: string): Promise<RestaurantFaq> {
  return parseRestaurantFaq(faqPath, await readFile(faqPath, "utf8"));
}
