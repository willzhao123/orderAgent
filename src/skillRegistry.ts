import type { MenuService } from "./menuService.ts";
import type { OrderService, OrderServiceContext, RequestedOrderItem } from "./orderService.ts";
import type { RestaurantFaqService } from "./restaurantFaqService.ts";

type SkillContext = {
  menuService: MenuService;
  orderService: OrderService;
  restaurantFaqService: RestaurantFaqService;
  orderContext: OrderServiceContext;
};

export type SkillRegistryEntry = {
  name: string;
  codexName: string;
  parameters: Record<string, unknown>;
  usageInstruction: string;
  shouldUse: (message: string) => boolean;
  execute: (
    context: SkillContext,
    input: Record<string, unknown>
  ) => Record<string, unknown> | Promise<Record<string, unknown>>;
};

function validateCheckMenuItemInput(input: Record<string, unknown>): string {
  if (typeof input.item_name !== "string" || !input.item_name.trim()) {
    throw new Error("check_menu_item requires a non-empty string item_name.");
  }

  return input.item_name.trim();
}

function checkMenuItem(context: SkillContext, input: Record<string, unknown>): Record<string, unknown> {
  const itemName = validateCheckMenuItemInput(input);
  return context.menuService.checkMenuItem(itemName);
}

function listFood(context: SkillContext, input: Record<string, unknown>): Record<string, unknown> {
  if (Object.keys(input).length > 0) {
    throw new Error("list_food does not accept arguments.");
  }

  return {
    categories: context.menuService.listCategories(),
    message: "Return these category summaries first. Ask which category the customer wants before listing every item."
  };
}

function validateListCategoryItemsInput(input: Record<string, unknown>): string {
  if (typeof input.category !== "string" || !input.category.trim()) {
    throw new Error("list_category_items requires a non-empty string category.");
  }

  return input.category.trim();
}

function listCategoryItems(context: SkillContext, input: Record<string, unknown>): Record<string, unknown> {
  const categoryQuery = validateListCategoryItemsInput(input);
  return context.menuService.listCategoryItems(categoryQuery);
}

function validateGetItemDetailsInput(input: Record<string, unknown>): string {
  if (typeof input.item !== "string" || !input.item.trim()) {
    throw new Error("get_item_details requires a non-empty string item.");
  }

  return input.item.trim();
}

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

function validateOrderId(input: Record<string, unknown>, skillName: string): string {
  if (typeof input.order_id !== "string" || !input.order_id.trim()) {
    throw new Error(`${skillName} requires a non-empty string order_id.`);
  }

  return input.order_id.trim();
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

function addItemToOrder(
  context: SkillContext,
  input: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const { orderId, requestedItem } = validateAddItemToOrderInput(input);
  return context.orderService.addItemToOrder(orderId, requestedItem);
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

function updateOrderItem(
  context: SkillContext,
  input: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const update = validateUpdateOrderItemInput(input);
  return context.orderService.updateOrderItem(update.orderId, update);
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

function removeOrderItem(
  context: SkillContext,
  input: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const { orderId, item } = validateOrderItemInput(input, "remove_order_item");
  return context.orderService.removeOrderItem(orderId, item);
}

function clearOrder(
  context: SkillContext,
  input: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const orderId = validateOrderId(input, "clear_order");
  return context.orderService.clearOrder(orderId);
}

function summarizeOrder(
  context: SkillContext,
  input: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const orderId = validateOrderId(input, "summarize_order");
  return context.orderService.summarizeOrder(orderId);
}

function quoteOrderTotal(
  context: SkillContext,
  input: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const orderId = validateOrderId(input, "quote_order_total");
  return context.orderService.quoteOrderTotal(orderId);
}

function createOrder(
  context: SkillContext,
  input: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const requestedItems = validateCreateOrderInput(input);
  return context.orderService.createOrder(requestedItems, context.orderContext);
}

function getItemDetails(context: SkillContext, input: Record<string, unknown>): Record<string, unknown> {
  const itemQuery = validateGetItemDetailsInput(input);
  return context.menuService.getItemDetails(itemQuery);
}

function answerRestaurantFaq(
  context: SkillContext,
  input: Record<string, unknown>
): Record<string, unknown> {
  if (typeof input.question !== "string" || !input.question.trim()) {
    throw new Error("answer_restaurant_faq requires a non-empty string question.");
  }

  return context.restaurantFaqService.answerQuestion(input.question.trim());
}

function menuIntent(message: string): boolean {
  return /\b(menu|food|dish|dishes|item|items|serve|serves|have|available|order|pho|salad|rice|noodle|soup|rolls?)\b/i
    .test(message);
}

export const SKILL_REGISTRY: Record<string, SkillRegistryEntry> = {
  answer_restaurant_faq: {
    name: "answer_restaurant_faq",
    codexName: "answer-restaurant-faq",
    parameters: {
      type: "object",
      properties: {
        question: {
          type: "string",
          description: "The customer's complete question about the restaurant."
        }
      },
      required: ["question"],
      additionalProperties: false
    },
    usageInstruction: "Use answer_restaurant_faq for questions about restaurant facts, cuisine, hours, location, reservations, parking, service options, accessibility, or policies. Use menu skills for food items and prices.",
    shouldUse: (message) => {
      const faqIntent = /\b(faq|restaurant|cuisine|hours?|open|close[ds]?|location|located|address|parking|reservations?|catering|delivery|pickup|accessib(?:le|ility)|policy|policies|payment|credit cards?|wifi|dress code)\b/i
        .test(message);
      const explicitMenuQuestion = /\b(menu item|food item|order total)\b/i.test(message) ||
        (
          /\b(price|cost|how much)\b/i.test(message) &&
          /\b(menu|dish|item|pho|salad|rice|noodle|soup|rolls?)\b/i.test(message)
        );
      return faqIntent && !explicitMenuQuestion;
    },
    execute: answerRestaurantFaq
  },
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
