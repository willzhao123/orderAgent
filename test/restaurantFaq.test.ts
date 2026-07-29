import assert from "node:assert/strict";
import test from "node:test";
import { parseRestaurantFaq } from "../src/catalog/restaurantFaq.ts";
import { RestaurantFaqService } from "../src/catalog/restaurantFaqService.ts";

const FAQ_SOURCE = JSON.stringify({
  faqs: [
    {
      id: "hours",
      category: "Visit",
      question: "What are your hours?",
      answer: "We are open from 11 AM to 9 PM.",
      aliases: ["When do you close?"],
      keywords: ["opening times"]
    },
    {
      id: "parking",
      category: "Visit",
      question: "Is parking available?",
      answer: "Street parking is available.",
      aliases: ["Where can I park?"]
    }
  ]
});

test("parses structured restaurant FAQs and generates optional ids", () => {
  const faq = parseRestaurantFaq("/tmp/faq.json", JSON.stringify([
    { question: "Do you take reservations?", answer: "Yes." }
  ]));

  assert.deepEqual(faq.entries, [
    {
      id: "do-you-take-reservations",
      question: "Do you take reservations?",
      answer: "Yes.",
      aliases: [],
      keywords: []
    }
  ]);
});

test("rejects malformed and duplicate restaurant FAQ entries", () => {
  assert.throws(
    () => parseRestaurantFaq("/tmp/faq.json", JSON.stringify({
      faqs: [{ id: "hours", question: "Hours?", answer: "" }]
    })),
    /requires a non-empty answer/
  );
  assert.throws(
    () => parseRestaurantFaq("/tmp/faq.json", JSON.stringify({
      faqs: [
        { id: "hours", question: "Hours?", answer: "First" },
        { id: "hours", question: "When?", answer: "Second" }
      ]
    })),
    /ids must be unique/
  );
});

test("answers exact aliases and keyword-based restaurant FAQ questions", () => {
  const service = new RestaurantFaqService(parseRestaurantFaq("/tmp/faq.json", FAQ_SOURCE));

  assert.deepEqual(service.answerQuestion("When do you close?"), {
    found: true,
    ambiguous: false,
    faq: {
      id: "hours",
      category: "Visit",
      question: "What are your hours?",
      answer: "We are open from 11 AM to 9 PM."
    }
  });
  assert.deepEqual(service.answerQuestion("Could you tell me the opening times?"), {
    found: true,
    ambiguous: false,
    faq: {
      id: "hours",
      category: "Visit",
      question: "What are your hours?",
      answer: "We are open from 11 AM to 9 PM."
    }
  });
});

test("returns a safe not-found result instead of inventing an FAQ answer", () => {
  const service = new RestaurantFaqService(parseRestaurantFaq("/tmp/faq.json", FAQ_SOURCE));
  const result = service.answerQuestion("Do you have live music?");

  assert.equal(result.found, false);
  assert.equal(result.ambiguous, false);
  assert.match(String(result.message), /do not provide this information/);
});
