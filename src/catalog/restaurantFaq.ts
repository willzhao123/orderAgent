import { readFile } from "node:fs/promises";

export const REQUIRED_EXCLUDED_FAQ_TOPICS = [
  "current_prices",
  "item_availability",
  "temporary_closures",
  "orders",
  "payments",
  "customer_information"
] as const;

export type RestaurantFaqCategory = {
  id: string;
  label: string;
};

/** A verified, static restaurant fact that may be returned to a caller. */
export type RestaurantFaqEntry = {
  id: string;
  categoryId: string;
  questions: string[];
  approvedAnswer: string;
  searchTerms: string[];
};

export type RestaurantFaq = {
  schemaVersion: 1;
  version: string;
  restaurant: {
    id: string;
    name: string;
  };
  excludedTopics: string[];
  categories: RestaurantFaqCategory[];
  entries: RestaurantFaqEntry[];
};

const ID_PATTERN = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;
const FAQ_ID_PATTERN = /^faq\.[a-z0-9]+(?:[._-][a-z0-9]+)*$/;
const VERSION_PATTERN = /^\d+\.\d+\.\d+$/;

const NON_STATIC_PATTERNS: Array<{ topic: string; pattern: RegExp }> = [
  { topic: "current_prices", pattern: /\b(current )?(price|prices|cost|costs|how much)\b/i },
  {
    topic: "item_availability",
    pattern: /\b(item|items|dish|dishes|food|menu)\b.{0,40}\b(available|availability|sold out|in stock)\b|\b(available|availability|sold out|in stock)\b.{0,40}\b(item|items|dish|dishes|food|menu)\b/i
  },
  {
    topic: "temporary_closures",
    pattern: /\b(temporar(?:y|ily) clos(?:ed|ure)|closed today|holiday closure|currently closed)\b/i
  },
  { topic: "orders", pattern: /\b(order|orders|ordering|cart|subtotal)\b/i },
  {
    topic: "payments",
    pattern: /\b(payment|payments|pay|credit card|debit card|cash|apple pay|google pay)\b/i
  },
  {
    topic: "customer_information",
    pattern: /\b(customer (?:information|data)|phone number|email address|customer account)\b/i
  }
];

function requiredString(
  value: unknown,
  field: string,
  sourcePath: string
): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`FAQ ${field} must be a non-empty string: ${sourcePath}`);
  }
  return value.trim();
}

function requiredId(
  value: unknown,
  field: string,
  sourcePath: string,
  pattern = ID_PATTERN
): string {
  const id = requiredString(value, field, sourcePath);
  if (!pattern.test(id)) {
    throw new Error(`FAQ ${field} has an invalid stable id "${id}": ${sourcePath}`);
  }
  return id;
}

function stringArray(
  value: unknown,
  field: string,
  sourcePath: string,
  allowEmpty = false
): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`FAQ ${field} must be an array of strings: ${sourcePath}`);
  }

  const strings = value.map((entry, index) =>
    requiredString(entry, `${field}[${index}]`, sourcePath)
  );
  if (!allowEmpty && strings.length === 0) {
    throw new Error(`FAQ ${field} must not be empty: ${sourcePath}`);
  }
  if (new Set(strings).size !== strings.length) {
    throw new Error(`FAQ ${field} must not contain duplicates: ${sourcePath}`);
  }
  return strings;
}

function objectValue(
  value: unknown,
  field: string,
  sourcePath: string
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`FAQ ${field} must be an object: ${sourcePath}`);
  }
  return value as Record<string, unknown>;
}

function ensureUnique(
  values: string[],
  field: string,
  sourcePath: string
): void {
  const duplicate = values.find((value, index) => values.indexOf(value) !== index);
  if (duplicate) {
    throw new Error(`FAQ ${field} must be unique; duplicate "${duplicate}": ${sourcePath}`);
  }
}

function validateStaticScope(entry: RestaurantFaqEntry, sourcePath: string): void {
  const searchableContent = [
    entry.id,
    ...entry.questions,
    entry.approvedAnswer,
    ...entry.searchTerms
  ].join(" ");
  const forbidden = NON_STATIC_PATTERNS.find(({ pattern }) =>
    pattern.test(searchableContent)
  );
  if (forbidden) {
    throw new Error(
      `FAQ entry "${entry.id}" contains non-static topic "${forbidden.topic}": ${sourcePath}`
    );
  }
}

export function parseRestaurantFaq(sourcePath: string, contents: string): RestaurantFaq {
  let parsed: unknown;
  try {
    parsed = JSON.parse(contents) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid FAQ JSON in ${sourcePath}: ${message}`);
  }

  const root = objectValue(parsed, "document", sourcePath);
  if (root.schema_version !== 1) {
    throw new Error(`FAQ schema_version must be 1: ${sourcePath}`);
  }

  const version = requiredString(root.version, "version", sourcePath);
  if (!VERSION_PATTERN.test(version)) {
    throw new Error(`FAQ version must use semantic versioning: ${sourcePath}`);
  }

  const restaurantValue = objectValue(root.restaurant, "restaurant", sourcePath);
  const restaurant = {
    id: requiredId(restaurantValue.id, "restaurant.id", sourcePath),
    name: requiredString(restaurantValue.name, "restaurant.name", sourcePath)
  };

  const policy = objectValue(root.content_policy, "content_policy", sourcePath);
  if (policy.scope !== "static") {
    throw new Error(`FAQ content_policy.scope must be "static": ${sourcePath}`);
  }
  const excludedTopics = stringArray(
    policy.excluded_topics,
    "content_policy.excluded_topics",
    sourcePath
  );
  const missingExcludedTopic = REQUIRED_EXCLUDED_FAQ_TOPICS.find(
    (topic) => !excludedTopics.includes(topic)
  );
  if (missingExcludedTopic) {
    throw new Error(
      `FAQ content policy must exclude "${missingExcludedTopic}": ${sourcePath}`
    );
  }

  if (!Array.isArray(root.categories) || root.categories.length === 0) {
    throw new Error(`FAQ categories must be a non-empty array: ${sourcePath}`);
  }
  const categories = root.categories.map((value, index) => {
    const category = objectValue(value, `categories[${index}]`, sourcePath);
    return {
      id: requiredId(category.id, `categories[${index}].id`, sourcePath),
      label: requiredString(category.label, `categories[${index}].label`, sourcePath)
    };
  });
  ensureUnique(categories.map(({ id }) => id), "category ids", sourcePath);

  if (!Array.isArray(root.faqs) || root.faqs.length === 0) {
    throw new Error(`FAQ faqs must be a non-empty array: ${sourcePath}`);
  }
  const categoryIds = new Set(categories.map(({ id }) => id));
  const entries = root.faqs.map((value, index) => {
    const raw = objectValue(value, `faqs[${index}]`, sourcePath);
    const entry: RestaurantFaqEntry = {
      id: requiredId(raw.id, `faqs[${index}].id`, sourcePath, FAQ_ID_PATTERN),
      categoryId: requiredId(
        raw.category_id,
        `faqs[${index}].category_id`,
        sourcePath
      ),
      questions: stringArray(raw.questions, `faqs[${index}].questions`, sourcePath),
      approvedAnswer: requiredString(
        raw.approved_answer,
        `faqs[${index}].approved_answer`,
        sourcePath
      ),
      searchTerms: raw.search_terms === undefined
        ? []
        : stringArray(raw.search_terms, `faqs[${index}].search_terms`, sourcePath, true)
    };
    if (!categoryIds.has(entry.categoryId)) {
      throw new Error(
        `FAQ entry "${entry.id}" references unknown category "${entry.categoryId}": ${sourcePath}`
      );
    }
    validateStaticScope(entry, sourcePath);
    return entry;
  });
  ensureUnique(entries.map(({ id }) => id), "entry ids", sourcePath);

  return {
    schemaVersion: 1,
    version,
    restaurant,
    excludedTopics,
    categories,
    entries
  };
}

export async function loadRestaurantFaq(faqPath: string): Promise<RestaurantFaq> {
  return parseRestaurantFaq(faqPath, await readFile(faqPath, "utf8"));
}
