import { BackendDataStore } from "./backendDataStore.ts";
import type { FulfillmentType, Order, OrderItem, OrderQuote } from "./domain.ts";
import type { MenuItem } from "./menu.ts";
import { MenuService } from "./menuService.ts";
import type { CreateDraftOrderInput } from "./repositories.ts";

type MaybePromise<T> = T | Promise<T>;

export interface OrderStore {
  createDraftOrder(input: CreateDraftOrderInput): MaybePromise<Order>;
  getOrder(orderId: string): MaybePromise<Order | undefined>;
  updateOrderItems(orderId: string, items: OrderItem[]): MaybePromise<Order>;
  clearOrderItems(orderId: string): MaybePromise<Order>;
  identifyMissingOrderInformation(orderId: string): MaybePromise<string[]>;
  quoteOrder(orderId: string): MaybePromise<OrderQuote>;
}

export type RequestedOrderItem = {
  item: string;
  quantity: number;
  notes?: string;
};

export type OrderServiceContext = {
  businessId: string;
  locationId?: string;
  conversationSessionId?: string;
  customerId?: string;
  customerPhone?: string;
  customerName?: string;
  fulfillmentType?: FulfillmentType;
  specialInstructions?: string;
};

function normalize(value: string): string {
  return value.toLowerCase().trim().replace(/\s+/g, " ");
}

function nextLineId(items: OrderItem[]): string {
  const nextNumber = items
    .map((item) => item.id.match(/^line_(\d+)$/)?.[1])
    .filter((value): value is string => Boolean(value))
    .map((value) => Number(value))
    .reduce((highest, value) => Math.max(highest, value), items.length) + 1;

  return `line_${String(nextNumber).padStart(4, "0")}`;
}

function toOrderItem(item: MenuItem, requestedItem: RequestedOrderItem, id: string): OrderItem {
  const unitPrice = typeof item.price === "number" ? item.price : undefined;

  return {
    id,
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
    modifiers: [],
    ...(requestedItem.notes ? {
      notes: requestedItem.notes,
      specialInstructions: requestedItem.notes
    } : {})
  };
}

function recalculateOrderItem(item: OrderItem): OrderItem {
  return {
    ...item,
    ...(item.unitPrice !== undefined
      ? { lineTotal: item.unitPrice * item.quantity }
      : {})
  };
}

function summarizeOrder(order: Order): Record<string, unknown> {
  return {
    id: order.id,
    businessId: order.businessId,
    ...(order.locationId ? { locationId: order.locationId } : {}),
    ...(order.conversationSessionId ? { conversationSessionId: order.conversationSessionId } : {}),
    status: order.status,
    ...(order.fulfillmentType ? { fulfillmentType: order.fulfillmentType } : {}),
    items: order.items,
    subtotal: order.subtotal,
    tax: order.tax,
    total: order.total,
    currency: order.currency,
    ...(order.customerName ? { customerName: order.customerName } : {}),
    ...(order.customerPhone ? { customerPhone: order.customerPhone } : {}),
    ...(order.specialInstructions ? { specialInstructions: order.specialInstructions } : {}),
    createdAt: order.createdAt,
    updatedAt: order.updatedAt
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

export class OrderService {
  private readonly menuService: MenuService;
  private readonly store: OrderStore;

  constructor(menuService: MenuService, store: OrderStore | BackendDataStore) {
    this.menuService = menuService;
    this.store = store;
  }

  async createOrder(
    items: RequestedOrderItem[],
    context: OrderServiceContext
  ): Promise<Record<string, unknown>> {
    const resolved = items.map((requestedItem) => ({
      requestedItem,
      ...this.menuService.resolveMenuItem(requestedItem.item)
    }));
    const issues = resolved.flatMap((result) => result.issue ? [result.issue] : []);

    if (issues.length > 0) {
      return {
        created: false,
        issues,
        message: "No order was stored. Resolve unavailable or ambiguous items with the customer first."
      };
    }

    const order = await this.store.createDraftOrder({
      businessId: context.businessId,
      ...(context.locationId ? { locationId: context.locationId } : {}),
      ...(context.conversationSessionId ? { conversationSessionId: context.conversationSessionId } : {}),
      ...(context.customerId ? { customerId: context.customerId } : {}),
      ...(context.customerPhone ? { customerPhone: context.customerPhone } : {}),
      ...(context.customerName ? { customerName: context.customerName } : {}),
      ...(context.fulfillmentType ? { fulfillmentType: context.fulfillmentType } : {}),
      items: resolved.map((result, index) =>
        toOrderItem(result.item!, result.requestedItem, `line_${String(index + 1).padStart(4, "0")}`)
      ),
      ...(context.specialInstructions ? { specialInstructions: context.specialInstructions } : {})
    });
    const missingInformation = await this.store.identifyMissingOrderInformation(order.id);
    const quote = await this.store.quoteOrder(order.id);

    return {
      created: true,
      order: summarizeOrder(order),
      quote,
      missingInformation,
      readyForConfirmation: missingInformation.length === 0,
      message: "Draft order created and stored."
    };
  }

  async addItemToOrder(
    orderId: string,
    requestedItem: RequestedOrderItem
  ): Promise<Record<string, unknown>> {
    const order = await this.store.getOrder(orderId);
    if (!order) return this.missingOrder(orderId);

    const resolved = this.menuService.resolveMenuItem(requestedItem.item);
    if (!resolved.item) {
      return {
        added: false,
        issue: resolved.issue,
        message: "No order changes were stored. Resolve unavailable or ambiguous items first."
      };
    }

    const items = [...order.items];
    const existingIndex = items.findIndex((item) => item.menuItemId === resolved.item!.id);
    if (existingIndex === -1) {
      items.push(toOrderItem(resolved.item, requestedItem, nextLineId(items)));
    } else {
      const existingLine = items[existingIndex]!;
      items[existingIndex] = recalculateOrderItem({
        ...existingLine,
        quantity: existingLine.quantity + requestedItem.quantity,
        ...(requestedItem.notes ? {
          notes: requestedItem.notes,
          specialInstructions: requestedItem.notes
        } : {})
      });
    }

    const updatedOrder = await this.store.updateOrderItems(order.id, items);
    const quote = await this.store.quoteOrder(updatedOrder.id);
    return {
      added: true,
      order: summarizeOrder(updatedOrder),
      quote,
      missingInformation: quote.missingInformation,
      message: "Item added to the order."
    };
  }

  async updateOrderItem(
    orderId: string,
    update: { item: string; quantity?: number; notes?: string }
  ): Promise<Record<string, unknown>> {
    const order = await this.store.getOrder(orderId);
    if (!order) return this.missingOrder(orderId);

    const lineMatch = findOrderLineIndex(order, update.item);
    if (lineMatch.index === undefined) return lineMatch.response!;

    const items = [...order.items];
    const existingLine = items[lineMatch.index]!;
    items[lineMatch.index] = recalculateOrderItem({
      ...existingLine,
      ...(update.quantity !== undefined ? { quantity: update.quantity } : {}),
      ...(update.notes !== undefined ? {
        notes: update.notes,
        specialInstructions: update.notes
      } : {})
    });

    const updatedOrder = await this.store.updateOrderItems(order.id, items);
    const quote = await this.store.quoteOrder(updatedOrder.id);
    return {
      updated: true,
      order: summarizeOrder(updatedOrder),
      quote,
      missingInformation: quote.missingInformation,
      message: "Order item updated."
    };
  }

  async removeOrderItem(orderId: string, item: string): Promise<Record<string, unknown>> {
    const order = await this.store.getOrder(orderId);
    if (!order) return this.missingOrder(orderId);

    const lineMatch = findOrderLineIndex(order, item);
    if (lineMatch.index === undefined) {
      return {
        ...lineMatch.response!,
        removed: false
      };
    }

    const updatedOrder = await this.store.updateOrderItems(
      order.id,
      order.items.filter((_line, index) => index !== lineMatch.index)
    );
    const quote = await this.store.quoteOrder(updatedOrder.id);
    return {
      removed: true,
      order: summarizeOrder(updatedOrder),
      quote,
      missingInformation: quote.missingInformation,
      message: "Order item removed."
    };
  }

  async clearOrder(orderId: string): Promise<Record<string, unknown>> {
    const order = await this.store.getOrder(orderId);
    if (!order) return this.missingOrder(orderId);

    const updatedOrder = await this.store.clearOrderItems(order.id);
    const quote = await this.store.quoteOrder(updatedOrder.id);
    return {
      cleared: true,
      order: summarizeOrder(updatedOrder),
      quote,
      missingInformation: quote.missingInformation,
      message: "Order cleared."
    };
  }

  async summarizeOrder(orderId: string): Promise<Record<string, unknown>> {
    const order = await this.store.getOrder(orderId);
    if (!order) return this.missingOrder(orderId);
    const missingInformation = await this.store.identifyMissingOrderInformation(order.id);

    return {
      found: true,
      order: summarizeOrder(order),
      missingInformation,
      message: order.items.length > 0
        ? "Return this stored order summary to the customer."
        : "The stored order is empty."
    };
  }

  async quoteOrderTotal(orderId: string): Promise<Record<string, unknown>> {
    const order = await this.store.getOrder(orderId);
    if (!order) return this.missingOrder(orderId);

    const quote = await this.store.quoteOrder(order.id);
    const unpricedItems = order.items.filter((item) => item.lineTotal === undefined);
    return {
      found: true,
      order_id: order.id,
      subtotal: quote.subtotal,
      tax: quote.tax,
      total: quote.total,
      currency: quote.currency,
      missingInformation: quote.missingInformation,
      itemCount: order.items.reduce((total, item) => total + item.quantity, 0),
      unpricedItems,
      message: unpricedItems.length > 0
        ? "Some items do not have a single stored price, so the quoted total excludes those items."
        : "Return this stored order total to the customer."
    };
  }

  private missingOrder(orderId: string): Record<string, unknown> {
    return {
      found: false,
      order_id: orderId,
      message: "No stored order matches that order id."
    };
  }
}
