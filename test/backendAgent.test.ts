import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { BackendAgent } from "../src/agent/backendAgent.ts";
import { BackendDataStore } from "../src/persistence/backendDataStore.ts";

const skillsPath = fileURLToPath(new URL("../.agents/skills", import.meta.url));
const defaultMenuPath = fileURLToPath(new URL("../data/menu.json", import.meta.url));
const allSkillsSettingsPath = fileURLToPath(
  new URL("./fixtures/all-skills-settings.json", import.meta.url)
);

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
  settingsPath?: string;
  backendStatePath?: string;
  faqFallbackEnabled?: boolean;
}): Promise<BackendAgent> {
  const tempDir = await mkdtemp(join(tmpdir(), "backend-skill-chat-state-"));
  return BackendAgent.create({
    apiKey: "test-key",
    model: "test-model",
    skillsPath,
    settingsPath: options.settingsPath ?? allSkillsSettingsPath,
    menuPath: options.menuPath ?? defaultMenuPath,
    faqFallbackEnabled: options.faqFallbackEnabled ?? true,
    backendStatePath: options.backendStatePath ?? join(tempDir, "backend-state.json"),
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

function seedBackendOrder(statePath: string): void {
  const store = new BackendDataStore(statePath);
  store.createDraftOrder({
    businessId: "business_0001",
    customerPhone: "+13125550100",
    items: [
      {
        id: "line_0001",
        menuItemId: "appetizers-egg-rolls",
        name: "Egg Rolls",
        quantity: 2,
        category: "Appetizers",
        unitPrice: 8,
        lineTotal: 16,
        modifiers: []
      },
      {
        id: "line_0002",
        menuItemId: "beef-noodle-soup-chicken-pho",
        name: "Chicken Pho",
        quantity: 1,
        category: "Beef Noodle Soup",
        unitPrice: 13,
        lineTotal: 13,
        notes: "no cilantro",
        specialInstructions: "no cilantro",
        modifiers: []
      }
    ]
  });
}

function readBackendState(statePath: string): ReturnType<BackendDataStore["read"]> {
  return new BackendDataStore(statePath).read();
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

  assert.match(agent.describeSkills(), /12 skills/);
  assert.match(agent.describeSkills(), /answer_restaurant_faq/);
  assert.match(agent.describeSkills(), /check_menu_item/);
  assert.match(agent.describeSkills(), /list_food/);
  assert.match(agent.describeSkills(), /list_category_items/);
  assert.match(agent.describeSkills(), /get_item_details/);
  assert.match(agent.describeSkills(), /create_order/);
  assert.match(agent.describeSkills(), /add_item_to_order/);
  assert.match(agent.describeSkills(), /update_order_item/);
  assert.match(agent.describeSkills(), /remove_order_item/);
  assert.match(agent.describeSkills(), /clear_order/);
  assert.match(agent.describeSkills(), /summarize_order/);
  assert.match(agent.describeSkills(), /quote_order_total/);

  const discovered: string[] = [];
  const reply = await agent.chat("Do you have beef pho?", (name) => {
    discovered.push(name);
  });

  assert.deepEqual(discovered, ["check_menu_item"]);
  assert.equal(reply, "Yes, beef pho is on the approved menu.");
  assert.equal(requestBodies.length, 2);

  const firstRequest = requestBodies[0] as {
    systemInstruction: { parts: Array<{ text: string }> };
    tools: Array<{ functionDeclarations: Array<{ parameters: Record<string, unknown> }> }>;
  };
  const systemPrompt = firstRequest.systemInstruction.parts[0]!.text;
  assert.match(systemPrompt, /helpful restaurant phone attendant/);
  assert.match(systemPrompt, /Default to one or two short sentences/);
  assert.match(systemPrompt, /Never include order ids, line-item ids, or menu item ids/);
  assert.match(systemPrompt, /Match the language of the customer's latest substantive message/);
  assert.match(systemPrompt, /do not replace pho with the generic phrase beef noodle soup/);
  assert.match(systemPrompt, /Do not recite English and Vietnamese names together/);
  assert.match(systemPrompt, /list_food[\s\S]*mention no more than five broad category names/);
  assert.match(systemPrompt, /list_category_items[\s\S]*mention up to four item names/);
  assert.match(systemPrompt, /get_item_details[\s\S]*answer only what the customer asked about/i);
  assert.match(systemPrompt, /add_item_to_order[\s\S]*Do not recap the full order/);
  assert.match(systemPrompt, /answer_restaurant_faq[\s\S]*answer directly in one or two natural sentences/);
  assert.match(systemPrompt, /check_menu_item[\s\S]*Never read a full category or menu/);
  assert.match(systemPrompt, /clear_order[\s\S]*confirm in one short sentence/);
  assert.match(systemPrompt, /create_order[\s\S]*focus on one unresolved item at a time/);
  assert.match(systemPrompt, /create_order[\s\S]*The subtotal\.[\s\S]*Never include the order id/);
  assert.match(systemPrompt, /quote_order_total[\s\S]*Do not call it a final total/);
  assert.match(systemPrompt, /remove_order_item[\s\S]*Do not recap the remaining order/);
  assert.match(systemPrompt, /summarize_order[\s\S]*natural spoken language/);
  assert.match(systemPrompt, /update_order_item[\s\S]*confirm only the changed quantity or note/);
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

test("keeps FAQ and menu skills available when order skills are off", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "backend-skill-chat-settings-"));
  const settingsPath = join(tempDir, "settings.json");
  await writeFile(settingsPath, JSON.stringify({
    skills: { order: false }
  }));
  const requestBodies: unknown[] = [];
  const agent = await createAgent({
    settingsPath,
    requestBodies,
    responses: [textResponse("Ordering is currently unavailable.")]
  });

  assert.match(agent.describeSkills(), /5 skills/);
  assert.match(agent.describeSkills(), /answer_restaurant_faq/);
  assert.match(agent.describeSkills(), /check_menu_item/);
  assert.doesNotMatch(agent.describeSkills(), /create_order/);
  assert.doesNotMatch(agent.describeSkills(), /quote_order_total/);

  const reply = await agent.chat("I want to place an order.");
  assert.equal(reply, "Ordering is currently unavailable.");

  const request = requestBodies[0] as {
    systemInstruction: { parts: Array<{ text: string }> };
    tools: Array<{
      functionDeclarations: Array<{ name: string }>;
    }>;
  };
  const registeredNames = request.tools[0]!.functionDeclarations
    .map((declaration) => declaration.name);
  assert.deepEqual(new Set(registeredNames), new Set([
    "answer_restaurant_faq",
    "check_menu_item",
    "list_food",
    "list_category_items",
    "get_item_details"
  ]));
  assert.doesNotMatch(
    request.systemInstruction.parts[0]!.text,
    /create_order from/
  );
});

test("removes backend FAQ handling unless fallback is enabled", async () => {
  const requestBodies: unknown[] = [];
  const agent = await createAgent({
    faqFallbackEnabled: false,
    requestBodies,
    responses: [textResponse("Hello!")]
  });

  assert.match(agent.describeSkills(), /11 skills/);
  assert.doesNotMatch(agent.describeSkills(), /answer_restaurant_faq/);
  assert.equal(await agent.chat("Hello"), "Hello!");

  const request = requestBodies[0] as {
    tools: Array<{
      functionDeclarations: Array<{ name: string }>;
    }>;
  };
  assert.equal(
    request.tools[0]!.functionDeclarations.some(
      ({ name }) => name === "answer_restaurant_faq"
    ),
    false
  );
});

test("executes answer_restaurant_faq using the static FAQ store", async () => {
  const requestBodies: unknown[] = [];
  const agent = await createAgent({
    requestBodies,
    responses: [
      toolCallResponse("answer_restaurant_faq", {
        question: "What kind of cuisine do you serve?"
      }),
      textResponse("We serve Vietnamese cuisine.")
    ]
  });

  const discovered: string[] = [];
  const reply = await agent.chat("What kind of cuisine do you serve?", (name) => {
    discovered.push(name);
  });

  assert.deepEqual(discovered, ["answer_restaurant_faq"]);
  assert.equal(reply, "We serve Vietnamese cuisine.");
  assert.deepEqual(lastFunctionResponse(requestBodies).response, {
    found: true,
    ambiguous: false,
    source: "static_faq",
    version: "1.0.0",
    faq: {
      id: "faq.general.cuisine",
      category: {
        id: "general",
        label: "General"
      },
      answer: "Haiyen Restaurant serves Vietnamese cuisine."
    }
  });
});

test("rejects malformed answer_restaurant_faq arguments", async () => {
  const agent = await createAgent({
    responses: [
      toolCallResponse("answer_restaurant_faq", { question: "   " })
    ]
  });

  await assert.rejects(
    () => agent.chat("What are your restaurant hours?"),
    /answer_restaurant_faq requires a non-empty string question/
  );
});

test("executes create_order and persists approved menu items", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "backend-skill-chat-orders-"));
  const backendStatePath = join(tempDir, "backend-state.json");
  const requestBodies: unknown[] = [];
  const agent = await createAgent({
    backendStatePath,
    requestBodies,
    responses: [
      toolCallResponse("create_order", {
        items: [
          { item: "Egg Rolls", quantity: 2 },
          { item: "Pho Ga", quantity: 1, notes: "no cilantro" }
        ]
      }),
      textResponse("Order order_0001 is created.")
    ]
  });

  const discovered: string[] = [];
  const reply = await agent.chat("I want 2 egg rolls and one chicken pho, no cilantro.", (name) => {
    discovered.push(name);
  });

  assert.deepEqual(discovered, ["create_order"]);
  assert.equal(reply, "Order order_0001 is created.");

  const response = lastFunctionResponse(requestBodies).response;
  assert.equal(response.created, true);
  assert.equal(response.message, "Draft order created and stored.");

  const order = response.order as Record<string, unknown>;
  assert.equal(order.id, "order_0001");
  assert.equal(order.status, "draft");
  assert.equal(order.businessId, "business_0001");
  assert.equal(order.subtotal, 29);
  assert.equal(order.tax, 0);
  assert.equal(order.total, 29);
  assert.equal(order.currency, "USD");
  assert.match(String(order.createdAt), /^\d{4}-\d{2}-\d{2}T/);
  assert.match(String(order.updatedAt), /^\d{4}-\d{2}-\d{2}T/);
  assert.deepEqual(response.missingInformation, ["fulfillment_type", "customer_phone"]);
  assert.equal(response.readyForConfirmation, false);
  assert.deepEqual(order.items, [
    {
      id: "line_0001",
      menuItemId: "appetizers-egg-rolls",
      name: "Egg Rolls",
      quantity: 2,
      category: "Appetizers",
      unitPrice: 8,
      lineTotal: 16,
      modifiers: []
    },
    {
      id: "line_0002",
      menuItemId: "beef-noodle-soup-chicken-pho",
      name: "Chicken Pho",
      quantity: 1,
      category: "Beef Noodle Soup",
      unitPrice: 13,
      lineTotal: 13,
      modifiers: [],
      notes: "no cilantro",
      specialInstructions: "no cilantro"
    }
  ]);

  const state = readBackendState(backendStatePath);
  assert.equal(state.orders.length, 1);
  assert.deepEqual(state.orders[0], order);
  assert.equal(state.orderQuotes[0]!.total, 29);
});

test("create_order does not persist unavailable or ambiguous items", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "backend-skill-chat-orders-"));
  const backendStatePath = join(tempDir, "backend-state.json");
  const requestBodies: unknown[] = [];
  const agent = await createAgent({
    backendStatePath,
    requestBodies,
    responses: [
      toolCallResponse("create_order", {
        items: [
          { item: "pizza", quantity: 1 },
          { item: "Hawaiian Leaf Sausage", quantity: 1 }
        ]
      }),
      textResponse("I need to clarify those order items first.")
    ]
  });

  await agent.chat("I want pizza and Hawaiian Leaf Sausage.");

  const response = lastFunctionResponse(requestBodies).response;
  assert.equal(response.created, false);
  assert.equal(response.message, "No order was stored. Resolve unavailable or ambiguous items with the customer first.");

  const issues = response.issues as Array<Record<string, unknown>>;
  assert.equal(issues.length, 2);
  assert.deepEqual(issues.map((issue) => issue.reason), ["not_found", "ambiguous"]);
  assert.equal(issues[0]!.item, "pizza");
  assert.equal(issues[1]!.item, "Hawaiian Leaf Sausage");

  assert.equal(readBackendState(backendStatePath).orders.length, 0);
});

test("rejects malformed create_order arguments", async () => {
  const agent = await createAgent({
    responses: [toolCallResponse("create_order", { items: [{ item: "Egg Rolls", quantity: 0 }] })]
  });

  await assert.rejects(
    () => agent.chat("Order zero egg rolls."),
    /create_order item 1 requires a positive integer quantity/
  );
});

test("executes add_item_to_order and persists the updated order", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "backend-skill-chat-orders-"));
  const backendStatePath = join(tempDir, "backend-state.json");
  seedBackendOrder(backendStatePath);

  const requestBodies: unknown[] = [];
  const agent = await createAgent({
    backendStatePath,
    requestBodies,
    responses: [
      toolCallResponse("add_item_to_order", {
        order_id: "order_0001",
        item: "Spring Rolls",
        quantity: 2
      }),
      textResponse("I added spring rolls.")
    ]
  });

  const discovered: string[] = [];
  await agent.chat("Add 2 spring rolls to order_0001.", (name) => {
    discovered.push(name);
  });

  assert.deepEqual(discovered, ["add_item_to_order"]);
  const response = lastFunctionResponse(requestBodies).response;
  assert.equal(response.added, true);

  const order = response.order as Record<string, unknown>;
  assert.equal(order.subtotal, 45);
  assert.deepEqual((order.items as unknown[]).at(-1), {
    id: "line_0003",
    menuItemId: "appetizers-spring-rolls",
    name: "Spring Rolls",
    quantity: 2,
    category: "Appetizers",
    unitPrice: 8,
    lineTotal: 16,
    modifiers: []
  });

  const state = readBackendState(backendStatePath);
  assert.deepEqual(state.orders[0]!.items, order.items);
});

test("executes update_order_item and recalculates totals", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "backend-skill-chat-orders-"));
  const backendStatePath = join(tempDir, "backend-state.json");
  seedBackendOrder(backendStatePath);

  const requestBodies: unknown[] = [];
  const agent = await createAgent({
    backendStatePath,
    requestBodies,
    responses: [
      toolCallResponse("update_order_item", {
        order_id: "order_0001",
        item: "Egg Rolls",
        quantity: 3,
        notes: "extra sauce"
      }),
      textResponse("Egg rolls are updated.")
    ]
  });

  await agent.chat("Change order_0001 egg rolls to 3 with extra sauce.");

  const response = lastFunctionResponse(requestBodies).response;
  assert.equal(response.updated, true);

  const order = response.order as Record<string, unknown>;
  assert.equal(order.subtotal, 37);
  assert.deepEqual((order.items as Array<Record<string, unknown>>)[0], {
    id: "line_0001",
    menuItemId: "appetizers-egg-rolls",
    name: "Egg Rolls",
    quantity: 3,
    category: "Appetizers",
    unitPrice: 8,
    lineTotal: 24,
    modifiers: [],
    notes: "extra sauce",
    specialInstructions: "extra sauce"
  });
});

test("executes remove_order_item and persists the remaining order", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "backend-skill-chat-orders-"));
  const backendStatePath = join(tempDir, "backend-state.json");
  seedBackendOrder(backendStatePath);

  const requestBodies: unknown[] = [];
  const agent = await createAgent({
    backendStatePath,
    requestBodies,
    responses: [
      toolCallResponse("remove_order_item", {
        order_id: "order_0001",
        item: "Chicken Pho"
      }),
      textResponse("Chicken pho is removed.")
    ]
  });

  await agent.chat("Remove chicken pho from order_0001.");

  const response = lastFunctionResponse(requestBodies).response;
  assert.equal(response.removed, true);
  const order = response.order as Record<string, unknown>;
  assert.equal(order.subtotal, 16);
  assert.deepEqual(order.items, [
    {
      id: "line_0001",
      menuItemId: "appetizers-egg-rolls",
      name: "Egg Rolls",
      quantity: 2,
      category: "Appetizers",
      unitPrice: 8,
      lineTotal: 16,
      modifiers: []
    }
  ]);
});

test("executes clear_order and leaves an empty stored order", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "backend-skill-chat-orders-"));
  const backendStatePath = join(tempDir, "backend-state.json");
  seedBackendOrder(backendStatePath);

  const requestBodies: unknown[] = [];
  const agent = await createAgent({
    backendStatePath,
    requestBodies,
    responses: [
      toolCallResponse("clear_order", { order_id: "order_0001" }),
      textResponse("The order is empty now.")
    ]
  });

  await agent.chat("Clear order_0001.");

  const response = lastFunctionResponse(requestBodies).response;
  assert.equal(response.cleared, true);
  const order = response.order as Record<string, unknown>;
  assert.deepEqual(order.items, []);
  assert.equal(order.subtotal, 0);
  assert.deepEqual(response.missingInformation, ["items", "fulfillment_type"]);
});

test("executes summarize_order for stored order contents", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "backend-skill-chat-orders-"));
  const backendStatePath = join(tempDir, "backend-state.json");
  seedBackendOrder(backendStatePath);

  const requestBodies: unknown[] = [];
  const agent = await createAgent({
    backendStatePath,
    requestBodies,
    responses: [
      toolCallResponse("summarize_order", { order_id: "order_0001" }),
      textResponse("Order order_0001 has egg rolls and chicken pho.")
    ]
  });

  await agent.chat("Summarize order_0001.");

  const response = lastFunctionResponse(requestBodies).response;
  assert.equal(response.found, true);
  const order = response.order as Record<string, unknown>;
  assert.equal(order.id, "order_0001");
  assert.equal((order.items as unknown[]).length, 2);
  assert.equal(order.subtotal, 29);
});

test("executes quote_order_total for the stored subtotal", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "backend-skill-chat-orders-"));
  const backendStatePath = join(tempDir, "backend-state.json");
  seedBackendOrder(backendStatePath);

  const requestBodies: unknown[] = [];
  const agent = await createAgent({
    backendStatePath,
    requestBodies,
    responses: [
      toolCallResponse("quote_order_total", { order_id: "order_0001" }),
      textResponse("The subtotal is $29.")
    ]
  });

  await agent.chat("What is the total for order_0001?");

  assert.deepEqual(lastFunctionResponse(requestBodies).response, {
    found: true,
    order_id: "order_0001",
    subtotal: 29,
    tax: 0,
    total: 29,
    currency: "USD",
    missingInformation: ["fulfillment_type"],
    itemCount: 3,
    unpricedItems: [],
    message: "Return this stored order total to the customer."
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

test("matches accented Vietnamese menu names", async () => {
  const requestBodies: unknown[] = [];
  const agent = await createAgent({
    requestBodies,
    responses: [
      toolCallResponse("get_item_details", { item: "Phở Gà" }),
      textResponse("Phở Gà giá 13 đô.")
    ]
  });

  const reply = await agent.chat("Phở Gà giá bao nhiêu?");

  assert.equal(reply, "Phở Gà giá 13 đô.");
  assert.equal(lastFunctionResponse(requestBodies).response.found, true);
  assert.equal(
    (lastFunctionResponse(requestBodies).response.item as Record<string, unknown>).vietnamese_name,
    "Pho Ga"
  );
});

test("requires a trusted skill for Vietnamese menu questions", async () => {
  const agent = await createAgent({
    responses: [textResponse("Có, nhà hàng có phở gà.")]
  });

  await assert.rejects(
    () => agent.chat("Nhà hàng có phở gà không?"),
    /model answered without calling a required skill/i
  );
});

test("resolves an accented Vietnamese dish term to its menu category", async () => {
  const requestBodies: unknown[] = [];
  const agent = await createAgent({
    requestBodies,
    responses: [
      toolCallResponse("list_category_items", { category: "phở" }),
      textResponse("Bên em có Phở Đặc Biệt, Phở Tái, Phở Tái Nạm và Phở Gà. Anh chị muốn nghe thêm món nào?")
    ]
  });

  await agent.chat("Các món phở có gì?");

  const category = lastFunctionResponse(requestBodies).response.category as Record<string, unknown>;
  assert.equal(category.id, "beef-noodle-soup");
});

test("resolves a Vietnamese alias when changing an existing order", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "backend-skill-chat-orders-"));
  const backendStatePath = join(tempDir, "backend-state.json");
  seedBackendOrder(backendStatePath);

  const requestBodies: unknown[] = [];
  const agent = await createAgent({
    backendStatePath,
    requestBodies,
    responses: [
      toolCallResponse("remove_order_item", {
        order_id: "order_0001",
        item: "Phở Gà"
      }),
      textResponse("Đã bỏ Phở Gà khỏi đơn.")
    ]
  });

  await agent.chat("Bỏ Phở Gà ra.");

  const response = lastFunctionResponse(requestBodies).response;
  assert.equal(response.removed, true);
  assert.deepEqual(
    (response.order as { items: Array<{ name: string }> }).items.map((item) => item.name),
    ["Egg Rolls"]
  );
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
