import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { bundleFaq } from "../src/catalog/faqBundle.ts";
import { parseRestaurantFaq } from "../src/catalog/restaurantFaq.ts";
import { RestaurantFaqService } from "../src/catalog/restaurantFaqService.ts";

const canonicalFaqPath = fileURLToPath(new URL("../data/faq.json", import.meta.url));

function faqSource(faqs: unknown[]): string {
  return JSON.stringify({
    schema_version: 1,
    version: "1.2.3",
    restaurant: {
      id: "haiyen-restaurant",
      name: "Haiyen Restaurant"
    },
    content_policy: {
      scope: "static",
      excluded_topics: [
        "current_prices",
        "item_availability",
        "temporary_closures",
        "orders",
        "payments",
        "customer_information"
      ]
    },
    categories: [
      { id: "general", label: "General" },
      { id: "visit", label: "Visit" }
    ],
    faqs
  });
}

const FAQ_SOURCE = faqSource([
  {
    id: "faq.visit.hours",
    category_id: "visit",
    questions: ["What are your regular hours?", "When do you normally close?"],
    approved_answer: "Our regular hours are 11 AM to 9 PM.",
    search_terms: ["opening times"]
  },
  {
    id: "faq.visit.parking",
    category_id: "visit",
    questions: ["Is parking offered?", "Where can I park?"],
    approved_answer: "Street parking is offered.",
    search_terms: []
  }
]);

test("parses the versioned FAQ schema with stable ids and approved answers", () => {
  const faq = parseRestaurantFaq("/tmp/faq.json", FAQ_SOURCE);

  assert.equal(faq.schemaVersion, 1);
  assert.equal(faq.version, "1.2.3");
  assert.deepEqual(faq.restaurant, {
    id: "haiyen-restaurant",
    name: "Haiyen Restaurant"
  });
  assert.deepEqual(faq.entries[0], {
    id: "faq.visit.hours",
    categoryId: "visit",
    questions: ["What are your regular hours?", "When do you normally close?"],
    approvedAnswer: "Our regular hours are 11 AM to 9 PM.",
    searchTerms: ["opening times"]
  });
});

test("rejects unstable ids, invalid versions, and unknown categories", () => {
  assert.throws(
    () => parseRestaurantFaq(
      "/tmp/faq.json",
      faqSource([{
        id: "hours",
        category_id: "visit",
        questions: ["What are your regular hours?"],
        approved_answer: "Our regular hours are 11 AM to 9 PM."
      }])
    ),
    /invalid stable id/
  );
  assert.throws(
    () => parseRestaurantFaq(
      "/tmp/faq.json",
      FAQ_SOURCE.replace('"version":"1.2.3"', '"version":"latest"')
    ),
    /semantic versioning/
  );
  assert.throws(
    () => parseRestaurantFaq(
      "/tmp/faq.json",
      faqSource([{
        id: "faq.unknown.topic",
        category_id: "unknown",
        questions: ["What kind of cuisine do you serve?"],
        approved_answer: "We serve Vietnamese cuisine."
      }])
    ),
    /references unknown category/
  );
});

test("rejects duplicate ids and question variations", () => {
  assert.throws(
    () => parseRestaurantFaq(
      "/tmp/faq.json",
      faqSource([
        {
          id: "faq.general.cuisine",
          category_id: "general",
          questions: ["What cuisine do you serve?"],
          approved_answer: "We serve Vietnamese cuisine."
        },
        {
          id: "faq.general.cuisine",
          category_id: "general",
          questions: ["What type of food do you serve?"],
          approved_answer: "We serve Vietnamese cuisine."
        }
      ])
    ),
    /entry ids must be unique/
  );
  assert.throws(
    () => parseRestaurantFaq(
      "/tmp/faq.json",
      faqSource([{
        id: "faq.general.cuisine",
        category_id: "general",
        questions: ["What cuisine do you serve?", "What cuisine do you serve?"],
        approved_answer: "We serve Vietnamese cuisine."
      }])
    ),
    /must not contain duplicates/
  );
});

test("rejects dynamic and transactional topics from the static FAQ catalog", () => {
  const forbiddenEntries = [
    ["faq.general.prices", "What are your current prices?"],
    ["faq.general.availability", "Which menu items are available?"],
    ["faq.general.closure", "Are you temporarily closed?"],
    ["faq.general.orders", "Can I change my order?"],
    ["faq.general.payments", "Can I pay by credit card?"],
    ["faq.general.customer", "Can you update my customer information?"]
  ];

  for (const [id, question] of forbiddenEntries) {
    assert.throws(
      () => parseRestaurantFaq(
        "/tmp/faq.json",
        faqSource([{
          id,
          category_id: "general",
          questions: [question],
          approved_answer: "This must come from the backend."
        }])
      ),
      /contains non-static topic/
    );
  }
});

test("returns concise, versioned voice results for exact and keyword matches", () => {
  const service = new RestaurantFaqService(
    parseRestaurantFaq("/tmp/faq.json", FAQ_SOURCE)
  );
  const expected = {
    found: true,
    ambiguous: false,
    source: "static_faq",
    version: "1.2.3",
    faq: {
      id: "faq.visit.hours",
      category: {
        id: "visit",
        label: "Visit"
      },
      answer: "Our regular hours are 11 AM to 9 PM."
    }
  };

  assert.deepEqual(service.answerQuestion("When do you normally close?"), expected);
  assert.deepEqual(
    service.answerQuestion("Could you tell me the opening times?"),
    expected
  );
});

test("returns a structured not-found result instead of inventing an answer", () => {
  const service = new RestaurantFaqService(
    parseRestaurantFaq("/tmp/faq.json", FAQ_SOURCE)
  );

  assert.deepEqual(service.answerQuestion("Do you have live music?"), {
    found: false,
    ambiguous: false,
    source: "static_faq",
    version: "1.2.3",
    question: "Do you have live music?",
    reason: "not_found"
  });
});

test("bundles the canonical FAQ without creating a second maintained source", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "faq-bundle-"));
  const outputPath = join(tempDir, "voice", "faq.json");
  const result = await bundleFaq(canonicalFaqPath, outputPath);

  assert.equal(result.version, "1.0.0");
  assert.equal(
    await readFile(outputPath, "utf8"),
    await readFile(canonicalFaqPath, "utf8")
  );
});
