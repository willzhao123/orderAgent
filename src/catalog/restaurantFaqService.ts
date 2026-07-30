import type {
  RestaurantFaq,
  RestaurantFaqCategory,
  RestaurantFaqEntry
} from "./restaurantFaq.ts";

/** Common words that should not influence FAQ matching. */
const STOP_WORDS = new Set([
  "a", "an", "and", "are", "at", "can", "do", "does", "for", "how", "i", "in",
  "is", "it", "me", "of", "on", "restaurant", "the", "to", "what", "when", "where",
  "which", "with", "you", "your"
]);

function normalize(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ");
}

function tokens(value: string): string[] {
  return normalize(value)
    .split(" ")
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

function searchValues(
  entry: RestaurantFaqEntry,
  category: RestaurantFaqCategory
): string[] {
  return [
    entry.id,
    ...entry.questions,
    ...entry.searchTerms,
    category.id,
    category.label
  ];
}

function summarize(
  entry: RestaurantFaqEntry,
  category: RestaurantFaqCategory
): Record<string, unknown> {
  return {
    id: entry.id,
    category: {
      id: category.id,
      label: category.label
    },
    answer: entry.approvedAnswer
  };
}

export class RestaurantFaqService {
  private readonly faq: RestaurantFaq;

  constructor(faq: RestaurantFaq) {
    this.faq = faq;
  }

  answerQuestion(question: string): Record<string, unknown> {
    const normalizedQuestion = normalize(question);
    const exactMatches = this.faq.entries.filter((entry) =>
      searchValues(entry, this.categoryFor(entry))
        .some((value) => normalize(value) === normalizedQuestion)
    );
    if (exactMatches.length === 1) {
      const entry = exactMatches[0]!;
      return {
        found: true,
        ambiguous: false,
        source: "static_faq",
        version: this.faq.version,
        faq: summarize(entry, this.categoryFor(entry))
      };
    }
    if (exactMatches.length > 1) {
      return this.ambiguousResult(question, exactMatches);
    }

    const questionTokens = new Set(tokens(question));
    const ranked = this.faq.entries
      .map((entry) => {
        const values = searchValues(entry, this.categoryFor(entry));
        const entryTokens = new Set(values.flatMap(tokens));
        const overlap = [...questionTokens].filter((token) => entryTokens.has(token)).length;
        const phraseMatch = values.some((value) => {
          const normalizedValue = normalize(value);
          return normalizedValue.length >= 4 &&
            (
              normalizedValue.includes(normalizedQuestion) ||
              normalizedQuestion.includes(normalizedValue)
            );
        });
        return { entry, score: overlap * 2 + (phraseMatch ? 1 : 0) };
      })
      .filter(({ score }) => score > 0)
      .sort((left, right) => right.score - left.score);

    if (ranked.length === 0) {
      return {
        found: false,
        ambiguous: false,
        source: "static_faq",
        version: this.faq.version,
        question,
        reason: "not_found"
      };
    }

    const topScore = ranked[0]!.score;
    const topMatches = ranked
      .filter(({ score }) => score === topScore)
      .map(({ entry }) => entry);
    if (topMatches.length > 1) {
      return this.ambiguousResult(question, topMatches);
    }

    const entry = topMatches[0]!;
    return {
      found: true,
      ambiguous: false,
      source: "static_faq",
      version: this.faq.version,
      faq: summarize(entry, this.categoryFor(entry))
    };
  }

  private ambiguousResult(
    question: string,
    entries: RestaurantFaqEntry[]
  ): Record<string, unknown> {
    return {
      found: false,
      ambiguous: true,
      source: "static_faq",
      version: this.faq.version,
      question,
      matches: entries.slice(0, 5).map((entry) => ({
        id: entry.id,
        category: this.categoryFor(entry),
        question: entry.questions[0]
      })),
      reason: "multiple_matches"
    };
  }

  private categoryFor(entry: RestaurantFaqEntry): RestaurantFaqCategory {
    return this.faq.categories.find(({ id }) => id === entry.categoryId)!;
  }
}
