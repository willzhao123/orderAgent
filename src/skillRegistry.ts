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
    id: item.id,
    name: item.name,
    category: item.category
  };

  for (const key of ["vietnamese_name", "description", "price", "prices", "serving"]) {
    if (item[key] !== undefined) summary[key] = item[key];
  }

  return summary;
}

function summarizeCategoryForVoice(category: MenuCategory): Record<string, unknown> {
  return {
    id: category.id,
    name: category.name,
    ...(category.menuHeading ? { menuHeading: category.menuHeading } : {}),
    ...(category.categoryDescription
      ? { description: category.categoryDescription }
      : {}),
    itemCount: category.items.length,
    examples: category.items.slice(0, 3).map((item) => ({
      id: item.id,
      name: item.name,
      ...(item.price !== undefined ? { price: item.price } : {}),
      ...(item.prices !== undefined ? { prices: item.prices } : {})
    }))
  };
}

function summarizeCategoryCandidate(category: MenuCategory): Record<string, unknown> {
  return {
    id: category.id,
    name: category.name,
    itemCount: category.items.length
  };
}

function summarizeCategoryItems(category: MenuCategory): Record<string, unknown> {
  return {
    id: category.id,
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
      const itemTokens = item.aliases.flatMap((alias) => tokens(alias));
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
  const exactMatches = context.menu.items.filter((item) =>
    item.id === normalizedItemName ||
    item.aliases.some((alias) => normalize(alias) === normalizedItemName)
  );

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
    item.aliases.some((alias) => normalize(alias).includes(normalizedItemName))
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
    categories: context.menu.categories.map(summarizeCategoryForVoice),
    message: "Return these category summaries first. Ask which category the customer wants before listing every item."
  };
}

function validateListCategoryItemsInput(input: Record<string, unknown>): string {
  if (typeof input.category !== "string" || !input.category.trim()) {
    throw new Error("list_category_items requires a non-empty string category.");
  }

  return input.category.trim();
}

function categoryMatches(category: MenuCategory, query: string): boolean {
  const normalizedQuery = normalize(query);
  return category.id === normalizedQuery ||
    normalize(category.name) === normalizedQuery ||
    Boolean(category.menuHeading && normalize(category.menuHeading) === normalizedQuery);
}

function categoryContains(category: MenuCategory, query: string): boolean {
  const normalizedQuery = normalize(query);
  return category.id.includes(normalizedQuery) ||
    normalize(category.name).includes(normalizedQuery) ||
    Boolean(category.menuHeading && normalize(category.menuHeading).includes(normalizedQuery));
}

function listCategoryItems(context: SkillContext, input: Record<string, unknown>): Record<string, unknown> {
  const categoryQuery = validateListCategoryItemsInput(input);
  const exactMatches = context.menu.categories.filter((category) =>
    categoryMatches(category, categoryQuery)
  );

  if (exactMatches.length === 1) {
    return {
      found: true,
      ambiguous: false,
      category: summarizeCategoryItems(exactMatches[0]!)
    };
  }

  if (exactMatches.length > 1) {
    return {
      found: false,
      ambiguous: true,
      query: categoryQuery,
      categories: exactMatches.map(summarizeCategoryCandidate),
      message: "Multiple categories match that request. Ask which category they mean."
    };
  }

  const containedMatches = context.menu.categories.filter((category) =>
    categoryContains(category, categoryQuery)
  );
  if (containedMatches.length === 1) {
    return {
      found: true,
      ambiguous: false,
      category: summarizeCategoryItems(containedMatches[0]!)
    };
  }

  return {
    found: false,
    ambiguous: containedMatches.length > 1,
    query: categoryQuery,
    categories: (containedMatches.length > 0
      ? containedMatches
      : context.menu.categories.slice(0, 6)
    ).map(summarizeCategoryCandidate),
    message: containedMatches.length > 1
      ? "Several categories match that request. Ask which one they want."
      : "No matching category was found. Offer the available category options."
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
  },
  list_category_items: {
    name: "list_category_items",
    codexName: "list-category-items",
    parameters: {
      type: "object",
      properties: {
        category: {
          type: "string",
          description: "The non-empty menu category id or category name the customer selected."
        }
      },
      required: ["category"],
      additionalProperties: false
    },
    usageInstruction: "Use list_category_items after the customer chooses a category, or when they ask what items are in a specific category.",
    shouldUse: (message) => /\b(category|categories|salads?|pho|appetizers?|soups?|rice plates?|vermicelli|self wrapped|noodle)\b/i
      .test(message) && /\b(what|which|list|items?|options|in|under|show|tell me)\b/i
      .test(message),
    execute: listCategoryItems
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
