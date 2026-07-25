import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { BackendAgent } from "../src/backendAgent.ts";

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}

test("loads skills, discovers one, executes it, and returns the final reply", async () => {
  const responses = [
    {
      candidates: [
        {
          content: {
            role: "model",
            parts: [
              {
                functionCall: {
                  name: "check_menu_item",
                  args: { item_name: "beef pho" },
                  id: "call_1"
                }
              }
            ]
          }
        }
      ]
    },
    {
      candidates: [
        {
          content: {
            role: "model",
            parts: [{ text: "Yes, beef pho is on the approved menu." }]
          }
        }
      ]
    }
  ];
  const requestBodies: unknown[] = [];
  const fakeFetch = async (
    _input: string | URL | Request,
    init?: RequestInit
  ): Promise<Response> => {
    requestBodies.push(JSON.parse(String(init?.body)));
    return jsonResponse(responses.shift());
  };

  const agent = await BackendAgent.create({
    apiKey: "test-key",
    model: "test-model",
    skillsPath: fileURLToPath(new URL("../.agents/skills", import.meta.url)),
    menuPath: fileURLToPath(new URL("../data/menu.json", import.meta.url)),
    fetcher: fakeFetch
  });

  assert.match(agent.describeSkills(), /2 skill/);
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

  const secondRequest = requestBodies[1] as {
    contents: Array<{
      role: string;
      parts: Array<{
        functionResponse?: {
          name: string;
          response: Record<string, unknown>;
          id?: string;
        };
      }>;
    }>;
  };
  const functionResponse = secondRequest.contents.at(-1)!.parts[0]!.functionResponse!;
  assert.deepEqual(functionResponse, {
    name: "check_menu_item",
    response: { found: true, item: "Combo Beef Pho" },
    id: "call_1"
  });
});

test("executes the list_food skill and returns every menu item", async () => {
  const responses = [
    {
      candidates: [
        {
          content: {
            role: "model",
            parts: [
              {
                functionCall: {
                  name: "list_food",
                  args: {},
                  id: "call_1"
                }
              }
            ]
          }
        }
      ]
    },
    {
      candidates: [
        {
          content: {
            role: "model",
            parts: [{ text: "The approved menu has beef pho, chicken pho, and egg rolls." }]
          }
        }
      ]
    }
  ];
  const requestBodies: unknown[] = [];
  const fakeFetch = async (
    _input: string | URL | Request,
    init?: RequestInit
  ): Promise<Response> => {
    requestBodies.push(JSON.parse(String(init?.body)));
    return jsonResponse(responses.shift());
  };

  const agent = await BackendAgent.create({
    apiKey: "test-key",
    model: "test-model",
    skillsPath: fileURLToPath(new URL("../.agents/skills", import.meta.url)),
    menuPath: fileURLToPath(new URL("../data/menu.json", import.meta.url)),
    fetcher: fakeFetch
  });

  const discovered: string[] = [];
  const reply = await agent.chat("What food do you have?", (name) => {
    discovered.push(name);
  });

  assert.deepEqual(discovered, ["list_food"]);
  assert.equal(reply, "The approved menu has beef pho, chicken pho, and egg rolls.");

  const secondRequest = requestBodies[1] as {
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
  const functionResponse = secondRequest.contents.at(-1)!.parts[0]!.functionResponse!;
  assert.deepEqual(functionResponse, {
    name: "list_food",
    response: {
      items: [
        "Chicken Salad",
        "Banana Blossom Salad",
        "Green Papaya and Mango Salad",
        "Lotus Root Salad",
        "Beef Salad",
        "Combo Beef Pho",
        "Eye-round Steak Pho",
        "Eye-round Steak and Brisket Pho",
        "Eye-round Steak and Meatball Pho",
        "Eye-round Steak and Meatball Tendon Pho",
        "Eye-round Steak, Meatball, Tendon, Tripe Pho",
        "Chicken Pho",
        "Chicken with Bone Pho",
        "Grilled Sesame Lemongrass Beef",
        "Grilled Lemongrass Pork",
        "Grilled Pork Meatball",
        "Grilled Shrimp",
        "Hawaiian Leaf Sausage",
        "Egg Rolls",
        "Beef Kabobs",
        "Spring Rolls",
        "Hawaiian Leaf Sausage",
        "Steamed Mini Crepe",
        "Tapioca Dumpling",
        "Shrimp Tempura",
        "Grilled Beef Wrapped Shrimp",
        "Shrimp Paste on Sugarcane",
        "Calamari",
        "Chicken Wings",
        "Vietnamese Half-Moon Crepe",
        "Grilled Beef Short Ribs",
        "Hawaiian Leaf Sausage",
        "Chargrilled Pork Sausage Skewer",
        "Special Jicama",
        "Sesame Lemongrass Beef or Pork",
        "Shrimp Paste on Sugarcane",
        "Spicy Lemongrass Beef Noodle Soup",
        "Crab Paste Noodle Soup",
        "Special Noodle Soup",
        "Vietnamese Dry Noodle",
        "Vietnamese Ham Hock Udon",
        "Vietnamese Shrimp and Crab Meat Udon",
        "Pad Thai",
        "Seafood and Meat Noodle",
        "Seafood Noodle",
        "Crab Meat Clear Vermicelli",
        "Hot Sour Soup",
        "Asparagus Soup",
        "Shrimp Tamarind Soup",
        "Fish Tamarind Soup",
        "Tom Yum",
        "Fried Rice",
        "Steam Chicken with Bone",
        "Grilled Chicken",
        "Grilled Pork Chops",
        "Grilled Pork Chop, Shredded Pork Skin and Pork-Egg Meatloaf",
        "Grilled Pork Chop and Shrimp Paste on Sugarcane",
        "Caramelized Shrimp and Pork",
        "Grilled Beef Short Ribs"
      ]
    },
    id: "call_1"
  });
});

test("loads menu items from the configured JSON file", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "backend-skill-chat-"));
  const menuPath = join(tempDir, "menu.json");
  await writeFile(menuPath, JSON.stringify(["tofu pho", "mango rice"], null, 2));

  const responses = [
    {
      candidates: [
        {
          content: {
            role: "model",
            parts: [
              {
                functionCall: {
                  name: "list_food",
                  args: {},
                  id: "call_1"
                }
              }
            ]
          }
        }
      ]
    },
    {
      candidates: [
        {
          content: {
            role: "model",
            parts: [{ text: "The approved menu has tofu pho and mango rice." }]
          }
        }
      ]
    }
  ];
  const requestBodies: unknown[] = [];
  const fakeFetch = async (
    _input: string | URL | Request,
    init?: RequestInit
  ): Promise<Response> => {
    requestBodies.push(JSON.parse(String(init?.body)));
    return jsonResponse(responses.shift());
  };

  const agent = await BackendAgent.create({
    apiKey: "test-key",
    model: "test-model",
    skillsPath: fileURLToPath(new URL("../.agents/skills", import.meta.url)),
    menuPath,
    fetcher: fakeFetch
  });

  await agent.chat("What food do you have?");

  const secondRequest = requestBodies[1] as {
    contents: Array<{
      parts: Array<{
        functionResponse?: {
          response: Record<string, unknown>;
        };
      }>;
    }>;
  };
  assert.deepEqual(secondRequest.contents.at(-1)!.parts[0]!.functionResponse!.response, {
    items: ["tofu pho", "mango rice"]
  });
});
