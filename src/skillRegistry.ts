import type { Menu, MenuCategory, MenuItem } from "./menu.ts";
import type { Order, OrderLine, OrderStore } from "./orders.ts";

type SkillContext = {
  menu: Menu;
  orderStore: OrderStore;
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

function summarizeItemDetails(item: MenuItem, menu: Menu): Record<string, unknown> {
  const summary = summarizeItem(item);
  const category = menu.categories.find((candidate) => candidate.id === item.categoryId);

  if (item.ingredients !== undefined) summary.ingredients = item.ingredients;
  if (category?.modifiers) {
    summary.availableModifiers = category.modifiers.map(summarizeModifier);
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

function summarizeModifier(modifier: unknown): unknown {
  if (!modifier || typeof modifier !== "object") return modifier;
  const { confidence: _confidence, ...customerFacingModifier } = modifier as Record<string, unknown>;
  return customerFacingModifier;
}

function summarizeCategoryItems(category: MenuCategory): Record<string, unknown> {
  return {
    id: category.id,
    name: category.name,
    ...(category.menuHeading ? { menuHeading: category.menuHeading } : {}),
    ...(category.categoryDescription
      ? { description: category.categoryDescription }
      : {}),
    ...(category.modifiers ? { modifiers: category.modifiers.map(summarizeModifier) } : {}),
    items: category.items.map(summarizeItem)
  };
}

function topCandidates(items: MenuItem[], limit = 5): Record<string, unknown>[] {
  return items.slice(0, limit).map(summarizeItem);
}

function exactItemMatches(menuItems: MenuItem[], query: string): MenuItem[] {
  const normalizedQuery = normalize(query);
  return menuItems.filter((item) =>
    item.id === normalizedQuery ||
    item.aliases.some((alias) => normalize(alias) === normalizedQuery)
  );
}

function containedItemMatches(menuItems: MenuItem[], query: string): MenuItem[] {
  const normalizedQuery = normalize(query);
  return menuItems.filter((item) =>
    item.aliases.some((alias) => normalize(alias).includes(normalizedQuery))
  );
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
  const exactMatches = exactItemMatches(context.menu.items, itemName);

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

  const containedMatches = containedItemMatches(context.menu.items, itemName);
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

function validateGetItemDetailsInput(input: Record<string, unknown>): string {
  if (typeof input.item !== "string" || !input.item.trim()) {
    throw new Error("get_item_details requires a non-empty string item.");
  }

  return input.item.trim();
}

type RequestedOrderItem = {
  item: string;
  quantity: number;
  notes?: string;
};

function validateCreateOrderInput(input: Record<string, unknown>): RequestedOrderItem[] {
  if (!Array.isArray(input.items) || input.items.length === 0) {
    throw new Error("create_order requires a non-empty items array.");
  }

  return input.items.map((rawItem, index) => {
    if (!rawItem || typeof rawItem !== "object") {
      throw new Error(`create_order item ${index + 1} must be an object.`);
    }

    const item = rawItem as Record<string, unknown>;
    if (typeof item.item !== "string" || !item.item.trim()) {
      throw new Error(`create_order item ${index + 1} requires a non-empty string item.`);
    }

    if (
      typeof item.quantity !== "number" ||
      !Number.isInteger(item.quantity) ||
      item.quantity < 1
    ) {
      throw new Error(`create_order item ${index + 1} requires a positive integer quantity.`);
    }

    if (item.notes !== undefined && typeof item.notes !== "string") {
      throw new Error(`create_order item ${index + 1} notes must be a string when provided.`);
    }

    return {
      item: item.item.trim(),
      quantity: item.quantity,
      ...(typeof item.notes === "string" && item.notes.trim()
        ? { notes: item.notes.trim() }
        : {})
    };
  });
}

function resolveMenuItem(menuItems: MenuItem[], query: string): {
  item?: MenuItem;
  issue?: Record<string, unknown>;
} {
  const exactMatches = exactItemMatches(menuItems, query);
  if (exactMatches.length === 1) return { item: exactMatches[0] };
  if (exactMatches.length > 1) {
    return {
      issue: {
        item: query,
        reason: "ambiguous",
        matches: topCandidates(exactMatches),
        message: "Multiple menu items match that order item. Ask which one they mean."
      }
    };
  }

  const containedMatches = containedItemMatches(menuItems, query);
  if (containedMatches.length === 1) return { item: containedMatches[0] };
  if (containedMatches.length > 1) {
    return {
      issue: {
        item: query,
        reason: "ambiguous",
        matches: topCandidates(containedMatches),
        message: "Several menu items match that order item. Ask which one they mean."
      }
    };
  }

  return {
    issue: {
      item: query,
      reason: "not_found",
      matches: topCandidates(closeMatches(menuItems, query)),
      message: "That order item is not on the approved menu. Offer close matches if present."
    }
  };
}

function toOrderLine(item: MenuItem, requestedItem: RequestedOrderItem): OrderLine {
  const unitPrice = typeof item.price === "number" ? item.price : undefined;

  return {
    menuItemId: item.id,
    name: item.name,
    quantity: requestedItem.quantity,
    ...(item.category ? { category: item.category } : {}),
    ...(unitPrice !== undefined
      ? {
          unitPrice,
          lineTotal: unitPrice * requestedItem.quantity
        }
      : {}),
    ...(requestedItem.notes ? { notes: requestedItem.notes } : {})
  };
}

function recalculateOrderLine(line: OrderLine): OrderLine {
  return {
    ...line,
    ...(line.unitPrice !== undefined
      ? { lineTotal: line.unitPrice * line.quantity }
      : {})
  };
}

function summarizeOrderForCustomer(order: Order): Record<string, unknown> {
  return {
    id: order.id,
    status: order.status,
    items: order.items,
    subtotal: order.subtotal,
    currency: order.currency,
    createdAt: order.createdAt
  };
}

function validateOrderId(input: Record<string, unknown>, skillName: string): string {
  if (typeof input.order_id !== "string" || !input.order_id.trim()) {
    throw new Error(`${skillName} requires a non-empty string order_id.`);
  }

  return input.order_id.trim();
}

function getOrderOrMissing(context: SkillContext, orderId: string): {
  order?: Order;
  response?: Record<string, unknown>;
} {
  const order = context.orderStore.get(orderId);
  if (order) return { order };

  return {
    response: {
      found: false,
      order_id: orderId,
      message: "No stored order matches that order id."
    }
  };
}

function findOrderLineIndex(order: Order, itemQuery: string): {
  index?: number;
  response?: Record<string, unknown>;
} {
  const normalizedQuery = normalize(itemQuery);
  const matches = order.items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) =>
      item.menuItemId === normalizedQuery ||
      normalize(item.name) === normalizedQuery
    );

  if (matches.length === 1) return { index: matches[0]!.index };

  if (matches.length > 1) {
    return {
      response: {
        updated: false,
        ambiguous: true,
        item: itemQuery,
        matches: matches.map(({ item }) => item),
        message: "Multiple order lines match that item. Ask which line the customer means."
      }
    };
  }

  return {
    response: {
      updated: false,
      found: false,
      item: itemQuery,
      items: order.items,
      message: "That item is not in the stored order."
    }
  };
}

function validateAddItemToOrderInput(input: Record<string, unknown>): {
  orderId: string;
  requestedItem: RequestedOrderItem;
} {
  const orderId = validateOrderId(input, "add_item_to_order");
  const [requestedItem] = validateCreateOrderInput({ items: [{
    item: input.item,
    quantity: input.quantity,
    notes: input.notes
  }] });

  return { orderId, requestedItem: requestedItem! };
}

function addItemToOrder(context: SkillContext, input: Record<string, unknown>): Record<string, unknown> {
  const { orderId, requestedItem } = validateAddItemToOrderInput(input);
  const { order, response } = getOrderOrMissing(context, orderId);
  if (!order) return response!;

  const resolved = resolveMenuItem(context.menu.items, requestedItem.item);
  if (!resolved.item) {
    return {
      added: false,
      issue: resolved.issue,
      message: "No order changes were stored. Resolve unavailable or ambiguous items first."
    };
  }

  const newLine = toOrderLine(resolved.item, requestedItem);
  const existingIndex = order.items.findIndex((item) => item.menuItemId === newLine.menuItemId);
  const items = [...order.items];

  if (existingIndex === -1) {
    items.push(newLine);
  } else {
    const existingLine = items[existingIndex]!;
    items[existingIndex] = recalculateOrderLine({
      ...existingLine,
      quantity: existingLine.quantity + requestedItem.quantity,
      ...(requestedItem.notes ? { notes: requestedItem.notes } : {})
    });
  }

  const updatedOrder = context.orderStore.update(order.id, items)!;
  return {
    added: true,
    order: summarizeOrderForCustomer(updatedOrder),
    message: "Item added to the order."
  };
}

function validateUpdateOrderItemInput(input: Record<string, unknown>): {
  orderId: string;
  item: string;
  quantity?: number;
  notes?: string;
} {
  const orderId = validateOrderId(input, "update_order_item");
  if (typeof input.item !== "string" || !input.item.trim()) {
    throw new Error("update_order_item requires a non-empty string item.");
  }

  if (input.quantity === undefined && input.notes === undefined) {
    throw new Error("update_order_item requires quantity or notes.");
  }

  if (
    input.quantity !== undefined &&
    (
      typeof input.quantity !== "number" ||
      !Number.isInteger(input.quantity) ||
      input.quantity < 1
    )
  ) {
    throw new Error("update_order_item quantity must be a positive integer when provided.");
  }

  if (input.notes !== undefined && typeof input.notes !== "string") {
    throw new Error("update_order_item notes must be a string when provided.");
  }

  return {
    orderId,
    item: input.item.trim(),
    ...(typeof input.quantity === "number" ? { quantity: input.quantity } : {}),
    ...(typeof input.notes === "string" ? { notes: input.notes.trim() } : {})
  };
}

function updateOrderItem(context: SkillContext, input: Record<string, unknown>): Record<string, unknown> {
  const update = validateUpdateOrderItemInput(input);
  const { order, response } = getOrderOrMissing(context, update.orderId);
  if (!order) return response!;

  const lineMatch = findOrderLineIndex(order, update.item);
  if (lineMatch.index === undefined) return lineMatch.response!;

  const items = [...order.items];
  const existingLine = items[lineMatch.index]!;
  items[lineMatch.index] = recalculateOrderLine({
    ...existingLine,
    ...(update.quantity !== undefined ? { quantity: update.quantity } : {}),
    ...(update.notes !== undefined ? { notes: update.notes } : {})
  });

  const updatedOrder = context.orderStore.update(order.id, items)!;
  return {
    updated: true,
    order: summarizeOrderForCustomer(updatedOrder),
    message: "Order item updated."
  };
}

function validateOrderItemInput(input: Record<string, unknown>, skillName: string): {
  orderId: string;
  item: string;
} {
  const orderId = validateOrderId(input, skillName);
  if (typeof input.item !== "string" || !input.item.trim()) {
    throw new Error(`${skillName} requires a non-empty string item.`);
  }

  return { orderId, item: input.item.trim() };
}

function removeOrderItem(context: SkillContext, input: Record<string, unknown>): Record<string, unknown> {
  const { orderId, item } = validateOrderItemInput(input, "remove_order_item");
  const { order, response } = getOrderOrMissing(context, orderId);
  if (!order) return response!;

  const lineMatch = findOrderLineIndex(order, item);
  if (lineMatch.index === undefined) {
    return {
      ...lineMatch.response!,
      removed: false
    };
  }

  const items = order.items.filter((_line, index) => index !== lineMatch.index);
  const updatedOrder = context.orderStore.update(order.id, items)!;
  return {
    removed: true,
    order: summarizeOrderForCustomer(updatedOrder),
    message: "Order item removed."
  };
}

function clearOrder(context: SkillContext, input: Record<string, unknown>): Record<string, unknown> {
  const orderId = validateOrderId(input, "clear_order");
  const { order, response } = getOrderOrMissing(context, orderId);
  if (!order) return response!;

  const updatedOrder = context.orderStore.update(order.id, [])!;
  return {
    cleared: true,
    order: summarizeOrderForCustomer(updatedOrder),
    message: "Order cleared."
  };
}

function summarizeOrder(context: SkillContext, input: Record<string, unknown>): Record<string, unknown> {
  const orderId = validateOrderId(input, "summarize_order");
  const { order, response } = getOrderOrMissing(context, orderId);
  if (!order) return response!;

  return {
    found: true,
    order: summarizeOrderForCustomer(order),
    message: order.items.length > 0
      ? "Return this stored order summary to the customer."
      : "The stored order is empty."
  };
}

function quoteOrderTotal(context: SkillContext, input: Record<string, unknown>): Record<string, unknown> {
  const orderId = validateOrderId(input, "quote_order_total");
  const { order, response } = getOrderOrMissing(context, orderId);
  if (!order) return response!;

  const unpricedItems = order.items.filter((item) => item.lineTotal === undefined);
  return {
    found: true,
    order_id: order.id,
    subtotal: order.subtotal,
    currency: order.currency,
    itemCount: order.items.reduce((total, item) => total + item.quantity, 0),
    unpricedItems,
    message: unpricedItems.length > 0
      ? "Some items do not have a single stored price, so the quoted subtotal excludes those items."
      : "Return this stored order subtotal to the customer."
  };
}

function createOrder(context: SkillContext, input: Record<string, unknown>): Record<string, unknown> {
  const requestedItems = validateCreateOrderInput(input);
  const resolved = requestedItems.map((requestedItem) => ({
    requestedItem,
    ...resolveMenuItem(context.menu.items, requestedItem.item)
  }));
  const issues = resolved.flatMap((result) => result.issue ? [result.issue] : []);

  if (issues.length > 0) {
    return {
      created: false,
      issues,
      message: "No order was stored. Resolve unavailable or ambiguous items with the customer first."
    };
  }

  const items = resolved.map((result) =>
    toOrderLine(result.item!, result.requestedItem)
  );
  const order = context.orderStore.create(items);

  return {
    created: true,
    order,
    message: "Order created and stored."
  };
}

function getItemDetails(context: SkillContext, input: Record<string, unknown>): Record<string, unknown> {
  const itemQuery = validateGetItemDetailsInput(input);
  const exactMatches = exactItemMatches(context.menu.items, itemQuery);

  if (exactMatches.length === 1) {
    return {
      found: true,
      ambiguous: false,
      item: summarizeItemDetails(exactMatches[0]!, context.menu)
    };
  }

  if (exactMatches.length > 1) {
    return {
      found: false,
      ambiguous: true,
      query: itemQuery,
      matches: topCandidates(exactMatches),
      message: "Multiple menu items match that name. Ask the customer which one they mean."
    };
  }

  const containedMatches = containedItemMatches(context.menu.items, itemQuery);
  if (containedMatches.length === 1) {
    return {
      found: true,
      ambiguous: false,
      item: summarizeItemDetails(containedMatches[0]!, context.menu)
    };
  }

  return {
    found: false,
    ambiguous: containedMatches.length > 1,
    query: itemQuery,
    matches: topCandidates(containedMatches.length > 0
      ? containedMatches
      : closeMatches(context.menu.items, itemQuery)),
    message: containedMatches.length > 1
      ? "Several items match that request. Ask which one they mean."
      : "No matching item was found. Offer close matches if present."
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
  },
  get_item_details: {
    name: "get_item_details",
    codexName: "get-item-details",
    parameters: {
      type: "object",
      properties: {
        item: {
          type: "string",
          description: "The non-empty menu item id, English name, Vietnamese name, or alias."
        }
      },
      required: ["item"],
      additionalProperties: false
    },
    usageInstruction: "Use get_item_details when the user asks for an item's price, description, serving size, ingredients, Vietnamese name, category, or modifiers.",
    shouldUse: (message) => /\b(price|cost|how much|description|describe|ingredients?|what is in|serving|pieces|vietnamese|modifiers?|comes with|details?)\b/i
      .test(message) && menuIntent(message),
    execute: getItemDetails
  },
  create_order: {
    name: "create_order",
    codexName: "create-order",
    parameters: {
      type: "object",
      properties: {
        items: {
          type: "array",
          description: "The approved menu items the customer wants to order.",
          items: {
            type: "object",
            properties: {
              item: {
                type: "string",
                description: "The menu item id, English name, Vietnamese name, or alias."
              },
              quantity: {
                type: "number",
                description: "The positive integer quantity for this item."
              },
              notes: {
                type: "string",
                description: "Optional customer notes for this line item."
              }
            },
            required: ["item", "quantity"],
            additionalProperties: false
          }
        }
      },
      required: ["items"],
      additionalProperties: false
    },
    usageInstruction: "Use create_order when the customer asks to place, create, start, or submit an order with menu items.",
    shouldUse: (message) => /\b(order|place|create|start|submit|buy|get|want|would like|i'll have|add)\b/i
      .test(message) && menuIntent(message),
    execute: createOrder
  },
  add_item_to_order: {
    name: "add_item_to_order",
    codexName: "add-item-to-order",
    parameters: {
      type: "object",
      properties: {
        order_id: {
          type: "string",
          description: "The stored order id to update."
        },
        item: {
          type: "string",
          description: "The menu item id, English name, Vietnamese name, or alias to add."
        },
        quantity: {
          type: "number",
          description: "The positive integer quantity to add."
        },
        notes: {
          type: "string",
          description: "Optional customer notes for this line item."
        }
      },
      required: ["order_id", "item", "quantity"],
      additionalProperties: false
    },
    usageInstruction: "Use add_item_to_order when the customer asks to add another approved menu item to an existing stored order.",
    shouldUse: (message) => /\b(add|also|another|include|put)\b/i
      .test(message) && menuIntent(message),
    execute: addItemToOrder
  },
  update_order_item: {
    name: "update_order_item",
    codexName: "update-order-item",
    parameters: {
      type: "object",
      properties: {
        order_id: {
          type: "string",
          description: "The stored order id to update."
        },
        item: {
          type: "string",
          description: "The order item id or name to update."
        },
        quantity: {
          type: "number",
          description: "Optional replacement positive integer quantity."
        },
        notes: {
          type: "string",
          description: "Optional replacement customer notes for the line item."
        }
      },
      required: ["order_id", "item"],
      additionalProperties: false
    },
    usageInstruction: "Use update_order_item when the customer asks to change the quantity or notes for one item already in an existing order.",
    shouldUse: (message) => /\b(update|change|make it|instead|quantity|note|notes|no|extra)\b/i
      .test(message) && menuIntent(message),
    execute: updateOrderItem
  },
  remove_order_item: {
    name: "remove_order_item",
    codexName: "remove-order-item",
    parameters: {
      type: "object",
      properties: {
        order_id: {
          type: "string",
          description: "The stored order id to update."
        },
        item: {
          type: "string",
          description: "The order item id or name to remove."
        }
      },
      required: ["order_id", "item"],
      additionalProperties: false
    },
    usageInstruction: "Use remove_order_item when the customer asks to remove one item from an existing stored order.",
    shouldUse: (message) => /\b(remove|delete|take off|drop|without|cancel item)\b/i
      .test(message) && menuIntent(message),
    execute: removeOrderItem
  },
  clear_order: {
    name: "clear_order",
    codexName: "clear-order",
    parameters: {
      type: "object",
      properties: {
        order_id: {
          type: "string",
          description: "The stored order id to clear."
        }
      },
      required: ["order_id"],
      additionalProperties: false
    },
    usageInstruction: "Use clear_order when the customer asks to remove every item from an existing order.",
    shouldUse: (message) => /\b(clear|empty|remove everything|start over|cancel order)\b/i
      .test(message) && /\border\b/i.test(message),
    execute: clearOrder
  },
  summarize_order: {
    name: "summarize_order",
    codexName: "summarize-order",
    parameters: {
      type: "object",
      properties: {
        order_id: {
          type: "string",
          description: "The stored order id to summarize."
        }
      },
      required: ["order_id"],
      additionalProperties: false
    },
    usageInstruction: "Use summarize_order when the customer asks what is currently in an existing stored order.",
    shouldUse: (message) => /\b(summary|summarize|what's in|what is in|show|review|recap)\b/i
      .test(message) && /\border\b/i.test(message),
    execute: summarizeOrder
  },
  quote_order_total: {
    name: "quote_order_total",
    codexName: "quote-order-total",
    parameters: {
      type: "object",
      properties: {
        order_id: {
          type: "string",
          description: "The stored order id to quote."
        }
      },
      required: ["order_id"],
      additionalProperties: false
    },
    usageInstruction: "Use quote_order_total when the customer asks for the current subtotal or total for an existing stored order.",
    shouldUse: (message) => /\b(total|subtotal|quote|how much|cost|amount)\b/i
      .test(message) && /\border\b/i.test(message),
    execute: quoteOrderTotal
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
