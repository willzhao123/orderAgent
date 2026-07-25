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

  assert.match(agent.describeSkills(), /2 skills/);
  assert.match(agent.describeSkills(), /check_menu_item/);
  assert.match(agent.describeSkills(), /list_food/);

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
      name: "Combo Beef Pho",
      category: "Beef Noodle Soup",
      vietnamese_name: "Pho Dac Biet",
      description: "Combination beef noodle soup.",
      price: 15,
      confidence: "medium"
    }
  });
});

test("executes list_food and preserves structured menu details", async () => {
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
    name: string;
    items: Array<Record<string, unknown>>;
  }>;
  assert.equal(categories.length, 9);
  assert.equal(categories[0]!.name, "Salads");
  assert.deepEqual(categories[0]!.items[0], {
    name: "Chicken Salad",
    category: "Salads",
    vietnamese_name: "Goi Ga",
    description: "Cabbage, mint, dried onion, peanut.",
    price: 14,
    confidence: "high"
  });
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
        name: "Menu",
        items: [
          { name: "tofu pho" },
          { name: "mango rice" }
        ]
      }
    ]
  });
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
