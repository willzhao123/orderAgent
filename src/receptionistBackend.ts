import { BackendDataStore } from "./backendDataStore.ts";
import type { ConversationSession, FulfillmentType, OrderItem } from "./domain.ts";
import type { MenuItem } from "./menu.ts";
import { MenuService } from "./menuService.ts";

type DraftOrderItemInput = {
  item: string;
  quantity: number;
  notes?: string;
};

type BuildDraftOrderInput = {
  conversationSessionId: string;
  businessId: string;
  locationId?: string;
  customerId?: string;
  customerPhone?: string;
  customerName?: string;
  fulfillmentType?: FulfillmentType;
  items: DraftOrderItemInput[];
  specialInstructions?: string;
};

function toOrderItem(menuItem: MenuItem, requestedItem: DraftOrderItemInput, index: number): OrderItem {
  const unitPrice = typeof menuItem.price === "number" ? menuItem.price : undefined;

  return {
    id: `line_${String(index + 1).padStart(4, "0")}`,
    menuItemId: menuItem.id,
    name: menuItem.name,
    quantity: requestedItem.quantity,
    ...(menuItem.category ? { category: menuItem.category } : {}),
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

export class ReceptionistBackend {
  private readonly menuService: MenuService;
  private readonly store: BackendDataStore;

  constructor(menuService: MenuService, store: BackendDataStore) {
    this.menuService = menuService;
    this.store = store;
  }

  createPhoneSession(input: {
    businessId: string;
    locationId?: string;
    callerPhone?: string;
    toPhone?: string;
    provider?: string;
    providerCallId?: string;
  }): ConversationSession {
    const { conversationSession, callSession } = this.store.createConversationSession({
      businessId: input.businessId,
      ...(input.locationId ? { locationId: input.locationId } : {}),
      channel: "phone",
      ...(input.callerPhone ? { callerPhone: input.callerPhone } : {}),
      ...(input.toPhone ? { toPhone: input.toPhone } : {}),
      ...(input.provider ? { callProvider: input.provider } : {}),
      ...(input.providerCallId ? { providerCallId: input.providerCallId } : {})
    });

    this.store.recordBusinessEvent({
      businessId: input.businessId,
      ...(input.locationId ? { locationId: input.locationId } : {}),
      conversationSessionId: conversationSession.id,
      type: "conversation.session_created",
      payload: {
        channel: "phone",
        ...(callSession ? { callSessionId: callSession.id } : {})
      }
    });
    return conversationSession;
  }

  addCallerTurn(input: {
    conversationSessionId: string;
    businessId: string;
    locationId?: string;
    text: string;
    confidence?: number;
    detectedIntent?: { name: string; confidence: number; slots?: Record<string, unknown> };
  }): void {
    this.store.appendConversationTurn({
      conversationSessionId: input.conversationSessionId,
      role: "caller",
      text: input.text,
      ...(input.confidence !== undefined ? { confidence: input.confidence } : {}),
      ...(input.detectedIntent ? { detectedIntent: input.detectedIntent } : {})
    });
    this.store.recordBusinessEvent({
      businessId: input.businessId,
      ...(input.locationId ? { locationId: input.locationId } : {}),
      conversationSessionId: input.conversationSessionId,
      type: "conversation.turn_added",
      payload: { role: "caller" }
    });
  }

  addAgentTurn(input: {
    conversationSessionId: string;
    businessId: string;
    locationId?: string;
    text: string;
  }): void {
    this.store.appendConversationTurn({
      conversationSessionId: input.conversationSessionId,
      role: "agent",
      text: input.text
    });
    this.store.recordBusinessEvent({
      businessId: input.businessId,
      ...(input.locationId ? { locationId: input.locationId } : {}),
      conversationSessionId: input.conversationSessionId,
      type: "conversation.turn_added",
      payload: { role: "agent" }
    });
  }

  recordToolExecution(input: {
    sessionId: string;
    name: string;
    toolCallId?: string;
    args: Record<string, unknown>;
    response?: Record<string, unknown>;
    errorMessage?: string;
  }): void {
    const orderId = typeof input.response?.order === "object" &&
      input.response.order !== null &&
      typeof (input.response.order as { id?: unknown }).id === "string"
      ? (input.response.order as { id: string }).id
      : undefined;

    this.store.recordToolCall({
      conversationSessionId: input.sessionId,
      ...(orderId ? { orderId } : {}),
      name: input.name,
      ...(input.toolCallId ? { toolCallId: input.toolCallId } : {}),
      args: input.args,
      ...(input.response ? { response: input.response } : {}),
      ...(input.errorMessage ? { errorMessage: input.errorMessage } : {})
    });
  }

  buildDraftOrder(input: BuildDraftOrderInput): Record<string, unknown> {
    const resolved = input.items.map((requestedItem) => ({
      requestedItem,
      ...this.menuService.resolveMenuItem(requestedItem.item)
    }));
    const issues = resolved.flatMap((result) => result.issue ? [result.issue] : []);

    if (issues.length > 0) {
      this.store.recordBusinessEvent({
        businessId: input.businessId,
        ...(input.locationId ? { locationId: input.locationId } : {}),
        conversationSessionId: input.conversationSessionId,
        type: "order.draft_rejected",
        payload: { issues }
      });
      return {
        created: false,
        issues,
        missingInformation: ["items"],
        message: "Resolve unavailable or ambiguous menu items before creating the draft order."
      };
    }

    const order = this.store.createDraftOrder({
      businessId: input.businessId,
      ...(input.locationId ? { locationId: input.locationId } : {}),
      conversationSessionId: input.conversationSessionId,
      ...(input.customerId ? { customerId: input.customerId } : {}),
      ...(input.customerPhone ? { customerPhone: input.customerPhone } : {}),
      ...(input.customerName ? { customerName: input.customerName } : {}),
      ...(input.fulfillmentType ? { fulfillmentType: input.fulfillmentType } : {}),
      items: resolved.map((result, index) =>
        toOrderItem(result.item!, result.requestedItem, index)
      ),
      ...(input.specialInstructions ? { specialInstructions: input.specialInstructions } : {})
    });
    const missingInformation = this.store.identifyMissingOrderInformation(order.id);
    const quote = this.store.quoteOrder(order.id);
    const nextState = missingInformation.length > 0 ? "collecting_order" : "awaiting_confirmation";

    this.store.updateConversationState(input.conversationSessionId, nextState, { orderId: order.id });
    if (missingInformation.length === 0) this.store.markAwaitingConfirmation(order.id);
    this.store.recordBusinessEvent({
      businessId: input.businessId,
      ...(input.locationId ? { locationId: input.locationId } : {}),
      conversationSessionId: input.conversationSessionId,
      orderId: order.id,
      type: "order.draft_created",
      payload: { missingInformation, quoteId: quote.id }
    });

    return {
      created: true,
      order,
      quote,
      missingInformation,
      readyForConfirmation: missingInformation.length === 0
    };
  }

  confirmOrder(input: {
    businessId: string;
    locationId?: string;
    conversationSessionId: string;
    orderId: string;
  }): Record<string, unknown> {
    const missingInformation = this.store.identifyMissingOrderInformation(input.orderId);
    if (missingInformation.length > 0) {
      this.store.recordBusinessEvent({
        businessId: input.businessId,
        ...(input.locationId ? { locationId: input.locationId } : {}),
        conversationSessionId: input.conversationSessionId,
        orderId: input.orderId,
        type: "order.confirmation_blocked",
        payload: { missingInformation }
      });
      return {
        confirmed: false,
        orderId: input.orderId,
        missingInformation
      };
    }

    const order = this.store.confirmOrder(input.orderId);
    this.store.updateConversationState(input.conversationSessionId, "confirmed", { orderId: order.id });
    this.store.recordBusinessEvent({
      businessId: input.businessId,
      ...(input.locationId ? { locationId: input.locationId } : {}),
      conversationSessionId: input.conversationSessionId,
      orderId: input.orderId,
      type: "order.confirmed",
      payload: { total: order.total, currency: order.currency }
    });

    return {
      confirmed: true,
      order
    };
  }
}
