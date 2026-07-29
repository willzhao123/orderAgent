import type { RestaurantFaq, RestaurantFaqEntry } from "./restaurantFaq.ts";

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

function searchValues(entry: RestaurantFaqEntry): string[] {
  return [
    entry.id,
    entry.question,
    ...entry.aliases,
    ...entry.keywords,
    ...(entry.category ? [entry.category] : [])
  ];
}

function summarize(entry: RestaurantFaqEntry): Record<string, unknown> {
  return {
    id: entry.id,
    ...(entry.category ? { category: entry.category } : {}),
    question: entry.question,
    answer: entry.answer
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
      searchValues(entry).some((value) => normalize(value) === normalizedQuestion)
    );
    if (exactMatches.length === 1) {
      return { found: true, ambiguous: false, faq: summarize(exactMatches[0]!) };
    }
    if (exactMatches.length > 1) {
      return this.ambiguousResult(question, exactMatches);
    }

    const questionTokens = new Set(tokens(question));
    const ranked = this.faq.entries
      .map((entry) => {
        const entryTokens = new Set(searchValues(entry).flatMap(tokens));
        const overlap = [...questionTokens].filter((token) => entryTokens.has(token)).length;
        const phraseMatch = searchValues(entry).some((value) => {
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
        question,
        message: "No matching restaurant FAQ was found. Say that the stored FAQs do not provide this information."
      };
    }

    const topScore = ranked[0]!.score;
    const topMatches = ranked
      .filter(({ score }) => score === topScore)
      .map(({ entry }) => entry);
    if (topMatches.length > 1) {
      return this.ambiguousResult(question, topMatches);
    }

    return { found: true, ambiguous: false, faq: summarize(topMatches[0]!) };
  }

  private ambiguousResult(
    question: string,
    entries: RestaurantFaqEntry[]
  ): Record<string, unknown> {
    return {
      found: false,
      ambiguous: true,
      question,
      matches: entries.slice(0, 5).map((entry) => ({
        id: entry.id,
        ...(entry.category ? { category: entry.category } : {}),
        question: entry.question
      })),
      message: "Multiple restaurant FAQs match. Ask a short clarifying question."
    };
  }
}
