import type { Menu, MenuCategory, MenuItem } from "./menu.ts";

type SkillContext = {
  menu: Menu;
};

export type SkillRegistryEntry = {
  name: string;
  codexName: string;
  parameters: Record<string, unknown>;
  usageInstruction: string;
  shouldUse: (message: string) => boolean;
  execute: (context: SkillContext, input: Record<string, unknown>) => Record<string, unknown>;
};

function normalize(value: string): string {
  return value.toLowerCase().trim().replace(/\s+/g, " ");
}

function tokens(value: string): string[] {
  return normalize(value)
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 1);
}

function summarizeItem(item: MenuItem): Record<string, unknown> {
  const summary: Record<string, unknown> = {
    name: item.name,
    category: item.category
  };

  for (const key of ["vietnamese_name", "description", "price", "prices", "serving", "confidence"]) {
    if (item[key] !== undefined) summary[key] = item[key];
  }

  return summary;
}

function summarizeCategory(category: MenuCategory): Record<string, unknown> {
  return {
    name: category.name,
    ...(category.menuHeading ? { menuHeading: category.menuHeading } : {}),
    ...(category.categoryDescription
      ? { description: category.categoryDescription }
      : {}),
    ...(category.modifiers ? { modifiers: category.modifiers } : {}),
    items: category.items.map(summarizeItem)
  };
}

function topCandidates(items: MenuItem[], limit = 5): Record<string, unknown>[] {
  return items.slice(0, limit).map(summarizeItem);
}

function closeMatches(menuItems: MenuItem[], query: string): MenuItem[] {
  const queryTokens = new Set(tokens(query));
  if (queryTokens.size === 0) return [];

  return menuItems
    .map((item) => {
      const itemTokens = tokens(item.name);
      const score = itemTokens.filter((token) => queryTokens.has(token)).length;
      return { item, score };
    })
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score)
    .map(({ item }) => item);
}

function validateCheckMenuItemInput(input: Record<string, unknown>): string {
  if (typeof input.item_name !== "string" || !input.item_name.trim()) {
    throw new Error("check_menu_item requires a non-empty string item_name.");
  }

  return input.item_name.trim();
}

function checkMenuItem(context: SkillContext, input: Record<string, unknown>): Record<string, unknown> {
  const itemName = validateCheckMenuItemInput(input);
  const normalizedItemName = normalize(itemName);
  const exactMatches = context.menu.items.filter((item) => normalize(item.name) === normalizedItemName);

  if (exactMatches.length === 1) {
    return { found: true, ambiguous: false, item: summarizeItem(exactMatches[0]!) };
  }

  if (exactMatches.length > 1) {
    return {
      found: false,
      ambiguous: true,
      query: itemName,
      matches: topCandidates(exactMatches),
      message: "Multiple menu items match that name. Ask the customer which one they mean."
    };
  }

  const containedMatches = context.menu.items.filter((item) =>
    normalize(item.name).includes(normalizedItemName)
  );
  if (containedMatches.length === 1) {
    return { found: true, ambiguous: false, item: summarizeItem(containedMatches[0]!) };
  }

  if (containedMatches.length > 1) {
    return {
      found: false,
      ambiguous: true,
      query: itemName,
      matches: topCandidates(containedMatches),
      message: "Several menu items match that request. Offer the top candidates and ask a follow-up."
    };
  }

  return {
    found: false,
    ambiguous: false,
    query: itemName,
    matches: topCandidates(closeMatches(context.menu.items, itemName)),
    categories: context.menu.categories.slice(0, 6).map((category) => category.name),
    message: "No exact item was found. Offer close matches if present, otherwise ask which category they want."
  };
}

function listFood(context: SkillContext, input: Record<string, unknown>): Record<string, unknown> {
  if (Object.keys(input).length > 0) {
    throw new Error("list_food does not accept arguments.");
  }

  return {
    categories: context.menu.categories.map(summarizeCategory)
  };
}

function menuIntent(message: string): boolean {
  return /\b(menu|food|dish|dishes|item|items|serve|serves|have|available|order|pho|salad|rice|noodle|soup|rolls?)\b/i
    .test(message);
}

export const SKILL_REGISTRY: Record<string, SkillRegistryEntry> = {
  check_menu_item: {
    name: "check_menu_item",
    codexName: "check-menu-item",
    parameters: {
      type: "object",
      properties: {
        item_name: {
          type: "string",
          description: "The non-empty food item the customer is asking about."
        }
      },
      required: ["item_name"],
      additionalProperties: false
    },
    usageInstruction: "Use check_menu_item whenever the user asks whether a menu item exists.",
    shouldUse: (message) => /\b(have|serve|serves|offer|offers|available|do you have|is there)\b/i
      .test(message) && menuIntent(message),
    execute: checkMenuItem
  },
  list_food: {
    name: "list_food",
    codexName: "list-food",
    parameters: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false
    },
    usageInstruction: "Use list_food whenever the user asks what food or menu items are available.",
    shouldUse: (message) => /\b(menu|what food|what dishes|what items|available|options)\b/i
      .test(message),
    execute: listFood
  }
};

export function getSkillRegistryEntry(name: string): SkillRegistryEntry | undefined {
  return SKILL_REGISTRY[name];
}

export function skillUsageInstructions(): string[] {
  return Object.values(SKILL_REGISTRY).map((entry) => entry.usageInstruction);
}

export function messageRequiresSkill(message: string): boolean {
  return Object.values(SKILL_REGISTRY).some((entry) => entry.shouldUse(message));
}
