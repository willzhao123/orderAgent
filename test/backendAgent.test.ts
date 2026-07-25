import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { BackendAgent } from "../src/backendAgent.ts";

const skillsPath = fileURLToPath(new URL("../.agents/skills", import.meta.url));
const defaultMenuPath = fileURLToPath(new URL("../data/menu.json", import.meta.url));

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}

function fakeFetchWith(
  responses: unknown[],
  requestBodies: unknown[] = []
): (input: string | URL | Request, init?: RequestInit) => Promise<Response> {
  return async (_input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    requestBodies.push(JSON.parse(String(init?.body)));
    return jsonResponse(responses.shift());
  };
}

async function createAgent(options: {
  responses: unknown[];
  requestBodies?: unknown[];
  menuPath?: string;
}): Promise<BackendAgent> {
  return BackendAgent.create({
    apiKey: "test-key",
    model: "test-model",
    skillsPath,
    menuPath: options.menuPath ?? defaultMenuPath,
    fetcher: fakeFetchWith(options.responses, options.requestBodies)
  });
}

function toolCallResponse(name: string, args: Record<string, unknown>, id = "call_1"): unknown {
  return {
    candidates: [
      {
        content: {
          role: "model",
          parts: [{ functionCall: { name, args, id } }]
        }
      }
    ]
  };
}

function textResponse(text: string): unknown {
  return {
    candidates: [
      {
        content: {
          role: "model",
          parts: [{ text }]
        }
      }
    ]
  };
}

function lastFunctionResponse(requestBodies: unknown[]): {
  name: string;
  response: Record<string, unknown>;
  id?: string;
} {
  const secondRequest = requestBodies.at(-1) as {
    contents: Array<{
      parts: Array<{
        functionResponse?: {
          name: string;
          response: Record<string, unknown>;
          id?: string;
        };
      }>;
    }>;
  };

  return secondRequest.contents.at(-1)!.parts[0]!.functionResponse!;
}

test("loads skills, discovers one, executes it, and returns the final reply", async () => {
  const requestBodies: unknown[] = [];
  const agent = await createAgent({
    requestBodies,
    responses: [
      toolCallResponse("check_menu_item", { item_name: "beef pho" }),
      textResponse("Yes, beef pho is on the approved menu.")
    ]
  });

  assert.match(agent.describeSkills(), /4 skills/);
  assert.match(agent.describeSkills(), /check_menu_item/);
  assert.match(agent.describeSkills(), /list_food/);
  assert.match(agent.describeSkills(), /list_category_items/);
  assert.match(agent.describeSkills(), /get_item_details/);

  const discovered: string[] = [];
  const reply = await agent.chat("Do you have beef pho?", (name) => {
    discovered.push(name);
  });

  assert.deepEqual(discovered, ["check_menu_item"]);
  assert.equal(reply, "Yes, beef pho is on the approved menu.");
  assert.equal(requestBodies.length, 2);

  const firstRequest = requestBodies[0] as {
    tools: Array<{ functionDeclarations: Array<{ parameters: Record<string, unknown> }> }>;
  };
  assert.equal(
    "additionalProperties" in firstRequest.tools[0]!.functionDeclarations[0]!.parameters,
    false
  );

  const functionResponse = lastFunctionResponse(requestBodies);
  assert.equal(functionResponse.name, "check_menu_item");
  assert.deepEqual(functionResponse.response, {
    found: true,
    ambiguous: false,
    item: {
      id: "beef-noodle-soup-combo-beef-pho",
      name: "Combo Beef Pho",
      category: "Beef Noodle Soup",
      vietnamese_name: "Pho Dac Biet",
      description: "Combination beef noodle soup.",
      price: 15
    }
  });
});

test("executes list_food and returns voice-friendly category summaries", async () => {
  const requestBodies: unknown[] = [];
  const agent = await createAgent({
    requestBodies,
    responses: [
      toolCallResponse("list_food", {}),
      textResponse("The approved menu has salads, pho, appetizers, soups, and rice plates.")
    ]
  });

  const discovered: string[] = [];
  const reply = await agent.chat("What food do you have?", (name) => {
    discovered.push(name);
  });

  assert.deepEqual(discovered, ["list_food"]);
  assert.equal(reply, "The approved menu has salads, pho, appetizers, soups, and rice plates.");

  const functionResponse = lastFunctionResponse(requestBodies);
  assert.equal(functionResponse.name, "list_food");

  const categories = functionResponse.response.categories as Array<{
    id: string;
    name: string;
    itemCount: number;
    examples: Array<Record<string, unknown>>;
  }>;
  assert.equal(categories.length, 9);
  assert.equal(functionResponse.response.message, "Return these category summaries first. Ask which category the customer wants before listing every item.");
  assert.equal(categories[0]!.id, "salads");
  assert.equal(categories[0]!.name, "Salads");
  assert.equal(categories[0]!.itemCount, 5);
  assert.deepEqual(categories[0]!.examples[0], {
    id: "salads-chicken-salad",
    name: "Chicken Salad",
    price: 14
  });
  assert.equal("confidence" in categories[0]!.examples[0]!, false);
});

test("loads menu items from the configured JSON file", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "backend-skill-chat-"));
  const menuPath = join(tempDir, "menu.json");
  await writeFile(menuPath, JSON.stringify(["tofu pho", "mango rice"], null, 2));

  const requestBodies: unknown[] = [];
  const agent = await createAgent({
    menuPath,
    requestBodies,
    responses: [
      toolCallResponse("list_food", {}),
      textResponse("The approved menu has tofu pho and mango rice.")
    ]
  });

  await agent.chat("What food do you have?");

  assert.deepEqual(lastFunctionResponse(requestBodies).response, {
    categories: [
      {
        id: "menu",
        name: "Menu",
        itemCount: 2,
        examples: [
          { id: "tofu-pho", name: "tofu pho" },
          { id: "mango-rice", name: "mango rice" }
        ]
      }
    ],
    message: "Return these category summaries first. Ask which category the customer wants before listing every item."
  });
});

test("executes list_category_items for a selected category", async () => {
  const requestBodies: unknown[] = [];
  const agent = await createAgent({
    requestBodies,
    responses: [
      toolCallResponse("list_category_items", { category: "Salads" }),
      textResponse("The salad options include chicken salad, banana blossom salad, and beef salad.")
    ]
  });

  const discovered: string[] = [];
  const reply = await agent.chat("What items are in salads?", (name) => {
    discovered.push(name);
  });

  assert.deepEqual(discovered, ["list_category_items"]);
  assert.equal(reply, "The salad options include chicken salad, banana blossom salad, and beef salad.");

  const response = lastFunctionResponse(requestBodies).response;
  assert.equal(response.found, true);
  assert.equal(response.ambiguous, false);

  const category = response.category as {
    id: string;
    name: string;
    items: Array<Record<string, unknown>>;
  };
  assert.equal(category.id, "salads");
  assert.equal(category.name, "Salads");
  assert.equal(category.items.length, 5);
  assert.deepEqual(category.items[0], {
    id: "salads-chicken-salad",
    name: "Chicken Salad",
    category: "Salads",
    vietnamese_name: "Goi Ga",
    description: "Cabbage, mint, dried onion, peanut.",
    price: 14
  });
});

test("executes list_category_items with a stable category id", async () => {
  const requestBodies: unknown[] = [];
  const agent = await createAgent({
    requestBodies,
    responses: [
      toolCallResponse("list_category_items", { category: "rice-plates" }),
      textResponse("Rice plates include fried rice, grilled chicken, and grilled pork chops.")
    ]
  });

  await agent.chat("Show me rice plates.");

  const category = lastFunctionResponse(requestBodies).response.category as {
    id: string;
    name: string;
  };
  assert.equal(category.id, "rice-plates");
  assert.equal(category.name, "Rice Plates");
});

test("returns category candidates when list_category_items cannot find a category", async () => {
  const requestBodies: unknown[] = [];
  const agent = await createAgent({
    requestBodies,
    responses: [
      toolCallResponse("list_category_items", { category: "dessert" }),
      textResponse("I do not see desserts. Available categories include salads, pho, and appetizers.")
    ]
  });

  await agent.chat("What desserts do you have?");

  const response = lastFunctionResponse(requestBodies).response;
  assert.equal(response.found, false);
  assert.equal(response.ambiguous, false);
  assert.deepEqual(response.categories, [
    { id: "salads", name: "Salads", itemCount: 5 },
    { id: "beef-noodle-soup", name: "Beef Noodle Soup", itemCount: 8 },
    { id: "vermicelli", name: "Vermicelli", itemCount: 5 },
    { id: "appetizers", name: "Appetizers", itemCount: 13 },
    { id: "self-wrapped", name: "Self Wrapped", itemCount: 5 },
    { id: "shrimp-and-pork-noodle-soup", name: "Shrimp and Pork Noodle Soup", itemCount: 6 }
  ]);
});

test("rejects malformed list_category_items arguments", async () => {
  const agent = await createAgent({
    responses: [toolCallResponse("list_category_items", { category: "" })]
  });

  await assert.rejects(
    () => agent.chat("What is in that category?"),
    /list_category_items requires a non-empty string category/
  );
});

test("executes get_item_details for an exact item name", async () => {
  const requestBodies: unknown[] = [];
  const agent = await createAgent({
    requestBodies,
    responses: [
      toolCallResponse("get_item_details", { item: "Egg Rolls" }),
      textResponse("Egg rolls are 3 pieces for $8.")
    ]
  });

  const discovered: string[] = [];
  const reply = await agent.chat("How much are egg rolls and what is in them?", (name) => {
    discovered.push(name);
  });

  assert.deepEqual(discovered, ["get_item_details"]);
  assert.equal(reply, "Egg rolls are 3 pieces for $8.");

  assert.deepEqual(lastFunctionResponse(requestBodies).response, {
    found: true,
    ambiguous: false,
    item: {
      id: "appetizers-egg-rolls",
      name: "Egg Rolls",
      category: "Appetizers",
      vietnamese_name: "Cha Gio",
      description: "Shrimp, pork, taro, wood ear mushroom, cellophane noodles.",
      price: 8,
      serving: "3 pieces"
    }
  });
});

test("executes get_item_details with a stable item id and category modifiers", async () => {
  const requestBodies: unknown[] = [];
  const agent = await createAgent({
    requestBodies,
    responses: [
      toolCallResponse("get_item_details", { item: "beef-noodle-soup-chicken-pho" }),
      textResponse("Chicken pho is $13.")
    ]
  });

  await agent.chat("What are the details for beef-noodle-soup-chicken-pho?");

  const item = lastFunctionResponse(requestBodies).response.item as Record<string, unknown>;
  assert.equal(item.id, "beef-noodle-soup-chicken-pho");
  assert.equal(item.name, "Chicken Pho");
  assert.equal(item.price, 13);
  assert.deepEqual(item.availableModifiers, [
    {
      name: "Add noodle, meatball, tendon or tripe",
      price: 1.5
    },
    {
      name: "Add eye-round steak",
      price: 2
    }
  ]);
});

test("executes get_item_details with a Vietnamese alias", async () => {
  const requestBodies: unknown[] = [];
  const agent = await createAgent({
    requestBodies,
    responses: [
      toolCallResponse("get_item_details", { item: "Cha Gio" }),
      textResponse("Cha Gio is egg rolls.")
    ]
  });

  await agent.chat("What is Cha Gio?");

  const item = lastFunctionResponse(requestBodies).response.item as Record<string, unknown>;
  assert.equal(item.id, "appetizers-egg-rolls");
  assert.equal(item.name, "Egg Rolls");
  assert.equal(item.vietnamese_name, "Cha Gio");
});

test("returns ambiguity from get_item_details for duplicate item names", async () => {
  const requestBodies: unknown[] = [];
  const agent = await createAgent({
    requestBodies,
    responses: [
      toolCallResponse("get_item_details", { item: "Shrimp Paste on Sugarcane" }),
      textResponse("There are multiple shrimp paste on sugarcane options.")
    ]
  });

  await agent.chat("Tell me the price for Shrimp Paste on Sugarcane.");

  const response = lastFunctionResponse(requestBodies).response;
  assert.equal(response.found, false);
  assert.equal(response.ambiguous, true);
  assert.equal((response.matches as unknown[]).length, 2);
});

test("returns candidates from get_item_details when an item is missing", async () => {
  const requestBodies: unknown[] = [];
  const agent = await createAgent({
    requestBodies,
    responses: [
      toolCallResponse("get_item_details", { item: "pork chop" }),
      textResponse("I found a few pork chop options. Which one do you mean?")
    ]
  });

  await agent.chat("How much is the pork chop?");

  const response = lastFunctionResponse(requestBodies).response;
  assert.equal(response.found, false);
  assert.equal(response.ambiguous, true);
  assert.equal((response.matches as unknown[]).length, 3);
});

test("rejects malformed get_item_details arguments", async () => {
  const agent = await createAgent({
    responses: [toolCallResponse("get_item_details", { item: "" })]
  });

  await assert.rejects(
    () => agent.chat("How much is that?"),
    /get_item_details requires a non-empty string item/
  );
});

test("rejects malformed check_menu_item arguments before execution", async () => {
  const agent = await createAgent({
    responses: [toolCallResponse("check_menu_item", { item_name: "" })]
  });

  await assert.rejects(
    () => agent.chat("Do you have anything?"),
    /check_menu_item requires a non-empty string item_name/
  );
});

test("returns ambiguity for broad partial item names", async () => {
  const requestBodies: unknown[] = [];
  const agent = await createAgent({
    requestBodies,
    responses: [
      toolCallResponse("check_menu_item", { item_name: "pho" }),
      textResponse("We have several pho options. Which one would you like?")
    ]
  });

  await agent.chat("Do you have pho?");

  const response = lastFunctionResponse(requestBodies).response;
  assert.equal(response.found, false);
  assert.equal(response.ambiguous, true);
  assert.equal(response.query, "pho");
  assert.equal((response.matches as unknown[]).length, 5);
  assert.deepEqual((response.matches as Array<Record<string, unknown>>)[0], {
    id: "beef-noodle-soup-combo-beef-pho",
    name: "Combo Beef Pho",
    category: "Beef Noodle Soup",
    vietnamese_name: "Pho Dac Biet",
    description: "Combination beef noodle soup.",
    price: 15
  });
  assert.equal("approvedMenu" in response, false);
});

test("returns a short prompt for unavailable items instead of the full menu", async () => {
  const requestBodies: unknown[] = [];
  const agent = await createAgent({
    requestBodies,
    responses: [
      toolCallResponse("check_menu_item", { item_name: "pizza" }),
      textResponse("I do not see pizza. We have categories like salads, pho, and rice plates.")
    ]
  });

  await agent.chat("Do you have pizza?");

  const response = lastFunctionResponse(requestBodies).response;
  assert.equal(response.found, false);
  assert.equal(response.ambiguous, false);
  assert.deepEqual(response.matches, []);
  assert.deepEqual(response.categories, [
    "Salads",
    "Beef Noodle Soup",
    "Vermicelli",
    "Appetizers",
    "Self Wrapped",
    "Shrimp and Pork Noodle Soup"
  ]);
  assert.equal("approvedMenu" in response, false);
});

test("returns ambiguity for duplicate menu names", async () => {
  const requestBodies: unknown[] = [];
  const agent = await createAgent({
    requestBodies,
    responses: [
      toolCallResponse("check_menu_item", { item_name: "Hawaiian Leaf Sausage" }),
      textResponse("There are multiple Hawaiian Leaf Sausage options.")
    ]
  });

  await agent.chat("Do you have Hawaiian Leaf Sausage?");

  const response = lastFunctionResponse(requestBodies).response;
  assert.equal(response.found, false);
  assert.equal(response.ambiguous, true);
  assert.equal((response.matches as unknown[]).length, 3);
});

test("matches menu aliases, including Vietnamese names", async () => {
  const requestBodies: unknown[] = [];
  const agent = await createAgent({
    requestBodies,
    responses: [
      toolCallResponse("check_menu_item", { item_name: "Pho Ga" }),
      textResponse("Yes, chicken pho is available.")
    ]
  });

  await agent.chat("Do you have Pho Ga?");

  const response = lastFunctionResponse(requestBodies).response;
  assert.deepEqual(response, {
    found: true,
    ambiguous: false,
    item: {
      id: "beef-noodle-soup-chicken-pho",
      name: "Chicken Pho",
      category: "Beef Noodle Soup",
      vietnamese_name: "Pho Ga",
      price: 13
    }
  });
});

test("rejects malformed list_food arguments", async () => {
  const agent = await createAgent({
    responses: [toolCallResponse("list_food", { item_name: "pho" })]
  });

  await assert.rejects(
    () => agent.chat("What food do you have?"),
    /list_food does not accept arguments/
  );
});

test("rejects unknown model function calls", async () => {
  const agent = await createAgent({
    responses: [toolCallResponse("unknown_skill", {})]
  });

  await assert.rejects(
    () => agent.chat("Do you have pho?"),
    /Model requested an unknown skill: unknown_skill/
  );
});

test("rejects menu answers when the model skips the required skill", async () => {
  const agent = await createAgent({
    responses: [textResponse("Yes, we have pho.")]
  });

  await assert.rejects(
    () => agent.chat("Do you have pho?"),
    /model answered without calling a required skill/i
  );
});
