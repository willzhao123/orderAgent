import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type {
  AgentResponse,
  AuditLog,
  Business,
  BusinessEvent,
  BusinessHours,
  BusinessLocation,
  CallSession,
  ConversationSession,
  ConversationState,
  ConversationTurn,
  Customer,
  CustomerContact,
  CustomerHistory,
  CustomerPreference,
  DetectedIntent,
  HolidayHours,
  HandoffStatus,
  HumanHandoff,
  IntegrationConnection,
  MenuCatalog,
  MenuVersion,
  Order,
  OrderItem,
  OrderPayment,
  OrderQuote,
  OrderStatus,
  OrderStatusHistory,
  PosOrderSubmission,
  SmsMessage,
  ToolCall,
  TranscriptSegment,
  VoiceAgentConfig,
  WebhookDelivery,
  AgentPolicy,
  BusinessRule,
  EscalationRule,
  ResponseStyle
} from "./domain.ts";

export type BackendState = {
  businesses: Business[];
  locations: BusinessLocation[];
  businessHours: BusinessHours[];
  holidayHours: HolidayHours[];
  voiceAgentConfigs: VoiceAgentConfig[];
  menus: MenuCatalog[];
  menuVersions: MenuVersion[];
  customers: Customer[];
  customerContacts: CustomerContact[];
  customerPreferences: CustomerPreference[];
  customerHistory: CustomerHistory[];
  conversationSessions: ConversationSession[];
  callSessions: CallSession[];
  conversationTurns: ConversationTurn[];
  transcriptSegments: TranscriptSegment[];
  agentResponses: AgentResponse[];
  detectedIntents: DetectedIntent[];
  orders: Order[];
  orderQuotes: OrderQuote[];
  orderPayments: OrderPayment[];
  orderStatusHistory: OrderStatusHistory[];
  toolCalls: ToolCall[];
  businessEvents: BusinessEvent[];
  auditLogs: AuditLog[];
  integrationConnections: IntegrationConnection[];
  posOrderSubmissions: PosOrderSubmission[];
  smsMessages: SmsMessage[];
  humanHandoffs: HumanHandoff[];
  webhookDeliveries: WebhookDelivery[];
  agentPolicies: AgentPolicy[];
  responseStyles: ResponseStyle[];
  escalationRules: EscalationRule[];
  businessRules: BusinessRule[];
};

export type CreateConversationSessionInput = {
  businessId: string;
  locationId?: string;
  customerId?: string;
  channel: ConversationSession["channel"];
  callerPhone?: string;
  toPhone?: string;
  callProvider?: string;
  providerCallId?: string;
};

export type UpdateHandoffInput = {
  conversationSessionId: string;
  status: HandoffStatus;
  reason?: string;
};

const EMPTY_STATE: BackendState = {
  businesses: [],
  locations: [],
  businessHours: [],
  holidayHours: [],
  voiceAgentConfigs: [],
  menus: [],
  menuVersions: [],
  customers: [],
  customerContacts: [],
  customerPreferences: [],
  customerHistory: [],
  conversationSessions: [],
  callSessions: [],
  conversationTurns: [],
  transcriptSegments: [],
  agentResponses: [],
  detectedIntents: [],
  orders: [],
  orderQuotes: [],
  orderPayments: [],
  orderStatusHistory: [],
  toolCalls: [],
  businessEvents: [],
  auditLogs: [],
  integrationConnections: [],
  posOrderSubmissions: [],
  smsMessages: [],
  humanHandoffs: [],
  webhookDeliveries: [],
  agentPolicies: [],
  responseStyles: [],
  escalationRules: [],
  businessRules: []
};

function now(): string {
  return new Date().toISOString();
}

function nextId(prefix: string, existingIds: string[]): string {
  const nextNumber = existingIds
    .map((id) => id.match(new RegExp(`^${prefix}_(\\d+)$`))?.[1])
    .filter((value): value is string => Boolean(value))
    .map((value) => Number(value))
    .reduce((highest, value) => Math.max(highest, value), 0) + 1;

  return `${prefix}_${String(nextNumber).padStart(4, "0")}`;
}

function readJsonState(path: string): BackendState {
  if (!existsSync(path)) return structuredClone(EMPTY_STATE);

  const contents = readFileSync(path, "utf8").trim();
  if (!contents) return structuredClone(EMPTY_STATE);

  const parsed = JSON.parse(contents) as Partial<BackendState>;
  return { ...structuredClone(EMPTY_STATE), ...parsed };
}

export class BackendDataStore {
  private readonly statePath: string;

  constructor(statePath: string) {
    this.statePath = statePath;
  }

  read(): BackendState {
    return readJsonState(this.statePath);
  }

  createConversationSession(input: CreateConversationSessionInput): {
    conversationSession: ConversationSession;
    callSession?: CallSession;
  } {
    const state = this.read();
    const timestamp = now();
    const conversationSession: ConversationSession = {
      id: nextId("session", state.conversationSessions.map((session) => session.id)),
      businessId: input.businessId,
      ...(input.locationId ? { locationId: input.locationId } : {}),
      ...(input.customerId ? { customerId: input.customerId } : {}),
      channel: input.channel,
      currentState: "new",
      ...(input.callerPhone ? { callerPhone: input.callerPhone } : {}),
      ...(input.toPhone ? { toPhone: input.toPhone } : {}),
      handoffStatus: "none",
      startedAt: timestamp,
      updatedAt: timestamp
    };
    state.conversationSessions.push(conversationSession);

    let callSession: CallSession | undefined;
    if (input.channel === "phone") {
      callSession = {
        id: nextId("call", state.callSessions.map((call) => call.id)),
        conversationSessionId: conversationSession.id,
        provider: input.callProvider ?? "unknown",
        ...(input.providerCallId ? { providerCallId: input.providerCallId } : {}),
        ...(input.callerPhone ? { fromPhone: input.callerPhone } : {}),
        ...(input.toPhone ? { toPhone: input.toPhone } : {}),
        startedAt: timestamp,
        status: "in_progress"
      };
      state.callSessions.push(callSession);
    }

    this.write(state);
    return { conversationSession, callSession };
  }

  appendConversationTurn(input: {
    conversationSessionId: string;
    role: ConversationTurn["role"];
    text?: string;
    confidence?: number;
    detectedIntent?: {
      name: string;
      confidence: number;
      slots?: Record<string, unknown>;
    };
  }): ConversationTurn {
    const state = this.read();
    const session = this.requireSession(state, input.conversationSessionId);
    const timestamp = now();
    const turnId = nextId("turn", state.conversationTurns.map((candidate) => candidate.id));
    const transcriptSegmentIds: string[] = [];
    const detectedIntentIds: string[] = [];
    let agentResponseId: string | undefined;

    if (input.text && input.role !== "tool") {
      if (input.role === "agent") {
        const response: AgentResponse = {
          id: nextId("response", state.agentResponses.map((candidate) => candidate.id)),
          conversationSessionId: session.id,
          turnId,
          text: input.text,
          createdAt: timestamp
        };
        state.agentResponses.push(response);
        agentResponseId = response.id;
      }

      const segment: TranscriptSegment = {
        id: nextId("segment", state.transcriptSegments.map((candidate) => candidate.id)),
        conversationSessionId: session.id,
        turnId,
        speaker: input.role === "caller" ? "caller" : "agent",
        text: input.text,
        ...(input.confidence !== undefined ? { confidence: input.confidence } : {}),
        createdAt: timestamp
      };
      state.transcriptSegments.push(segment);
      transcriptSegmentIds.push(segment.id);
    }

    const turn: ConversationTurn = {
      id: turnId,
      conversationSessionId: session.id,
      role: input.role,
      ...(input.text ? { text: input.text } : {}),
      transcriptSegmentIds,
      detectedIntentIds,
      ...(agentResponseId ? { agentResponseId } : {}),
      ...(input.confidence !== undefined ? { confidence: input.confidence } : {}),
      createdAt: timestamp
    };

    if (input.detectedIntent) {
      const intent: DetectedIntent = {
        id: nextId("intent", state.detectedIntents.map((candidate) => candidate.id)),
        conversationSessionId: session.id,
        turnId: turn.id,
        name: input.detectedIntent.name,
        confidence: input.detectedIntent.confidence,
        slots: input.detectedIntent.slots ?? {},
        createdAt: timestamp
      };
      state.detectedIntents.push(intent);
      turn.detectedIntentIds.push(intent.id);
      session.confidence = input.detectedIntent.confidence;
    } else if (input.confidence !== undefined) {
      session.confidence = input.confidence;
    }

    session.updatedAt = timestamp;
    state.conversationTurns.push(turn);
    this.write(state);
    return turn;
  }

  updateConversationState(
    conversationSessionId: string,
    currentState: ConversationState,
    patch: { orderId?: string; confidence?: number } = {}
  ): ConversationSession {
    const state = this.read();
    const session = this.requireSession(state, conversationSessionId);
    session.currentState = currentState;
    if (patch.orderId !== undefined) session.orderId = patch.orderId;
    if (patch.confidence !== undefined) session.confidence = patch.confidence;
    session.updatedAt = now();
    this.write(state);
    return session;
  }

  updateHandoffStatus(input: UpdateHandoffInput): ConversationSession {
    const state = this.read();
    const session = this.requireSession(state, input.conversationSessionId);
    session.handoffStatus = input.status;
    if (input.reason !== undefined) session.handoffReason = input.reason;
    if (input.status === "requested") session.currentState = "handoff_requested";
    if (input.status === "connected") session.currentState = "handoff_connected";
    session.updatedAt = now();
    this.write(state);
    return session;
  }

  closeConversationSession(conversationSessionId: string): ConversationSession {
    const state = this.read();
    const session = this.requireSession(state, conversationSessionId);
    const timestamp = now();
    session.currentState = "closed";
    session.updatedAt = timestamp;
    session.closedAt = timestamp;

    for (const call of state.callSessions) {
      if (call.conversationSessionId === conversationSessionId && !call.endedAt) {
        call.endedAt = timestamp;
        call.status = "completed";
      }
    }

    this.write(state);
    return session;
  }

  recordToolCall(input: {
    conversationSessionId?: string;
    orderId?: string;
    name: string;
    toolCallId?: string;
    args: Record<string, unknown>;
    response?: Record<string, unknown>;
    errorMessage?: string;
  }): ToolCall {
    const state = this.read();
    const timestamp = now();
    const session = input.conversationSessionId
      ? this.requireSession(state, input.conversationSessionId)
      : undefined;
    const turnId = session
      ? nextId("turn", state.conversationTurns.map((candidate) => candidate.id))
      : undefined;
    const toolCall: ToolCall = {
      id: input.toolCallId ?? nextId("tool", state.toolCalls.map((candidate) => candidate.id)),
      ...(input.conversationSessionId ? { conversationSessionId: input.conversationSessionId } : {}),
      ...(turnId ? { turnId } : {}),
      ...(input.orderId ? { orderId: input.orderId } : {}),
      name: input.name,
      input: input.args,
      ...(input.response ? { output: input.response } : {}),
      status: input.errorMessage ? "failed" : "succeeded",
      ...(input.errorMessage ? { errorMessage: input.errorMessage } : {}),
      createdAt: timestamp,
      completedAt: timestamp
    };
    state.toolCalls.push(toolCall);
    if (session && turnId) {
      state.conversationTurns.push({
        id: turnId,
        conversationSessionId: session.id,
        role: "tool",
        toolCallId: toolCall.id,
        transcriptSegmentIds: [],
        detectedIntentIds: [],
        createdAt: timestamp
      });
      session.updatedAt = timestamp;
    }
    this.write(state);
    return toolCall;
  }

  recordBusinessEvent(input: {
    businessId: string;
    locationId?: string;
    conversationSessionId?: string;
    orderId?: string;
    type: string;
    payload?: Record<string, unknown>;
  }): BusinessEvent {
    const state = this.read();
    const event: BusinessEvent = {
      id: nextId("event", state.businessEvents.map((candidate) => candidate.id)),
      businessId: input.businessId,
      ...(input.locationId ? { locationId: input.locationId } : {}),
      ...(input.conversationSessionId ? { conversationSessionId: input.conversationSessionId } : {}),
      ...(input.orderId ? { orderId: input.orderId } : {}),
      type: input.type,
      payload: input.payload ?? {},
      createdAt: now()
    };
    state.businessEvents.push(event);
    this.write(state);
    return event;
  }

  createDraftOrder(input: {
    businessId: string;
    locationId?: string;
    conversationSessionId?: string;
    customerId?: string;
    fulfillmentType?: Order["fulfillmentType"];
    customerName?: string;
    customerPhone?: string;
    items?: OrderItem[];
    specialInstructions?: string;
  }): Order {
    const state = this.read();
    const timestamp = now();
    const order: Order = {
      id: nextId("order", state.orders.map((candidate) => candidate.id)),
      businessId: input.businessId,
      ...(input.locationId ? { locationId: input.locationId } : {}),
      ...(input.conversationSessionId ? { conversationSessionId: input.conversationSessionId } : {}),
      ...(input.customerId ? { customerId: input.customerId } : {}),
      status: "draft",
      ...(input.fulfillmentType ? { fulfillmentType: input.fulfillmentType } : {}),
      items: input.items ?? [],
      subtotal: 0,
      tax: 0,
      total: 0,
      currency: "USD",
      ...(input.customerName ? { customerName: input.customerName } : {}),
      ...(input.customerPhone ? { customerPhone: input.customerPhone } : {}),
      ...(input.specialInstructions ? { specialInstructions: input.specialInstructions } : {}),
      createdAt: timestamp,
      updatedAt: timestamp
    };
    this.reprice(order);
    state.orders.push(order);
    state.orderStatusHistory.push({
      id: nextId("status", state.orderStatusHistory.map((candidate) => candidate.id)),
      orderId: order.id,
      toStatus: "draft",
      reason: "Draft order created by backend.",
      createdAt: timestamp
    });
    this.write(state);
    return order;
  }

  getOrder(orderId: string): Order | undefined {
    return this.read().orders.find((order) => order.id === orderId);
  }

  updateDraftOrder(orderId: string, patch: Partial<Pick<
    Order,
    "fulfillmentType" | "customerName" | "customerPhone" | "items" | "specialInstructions"
  >>): Order {
    const state = this.read();
    const order = this.requireOrder(state, orderId);
    if (order.status !== "draft" && order.status !== "awaiting_confirmation") {
      throw new Error(`Order ${orderId} cannot be edited after status ${order.status}.`);
    }

    Object.assign(order, patch);
    order.status = "draft";
    order.updatedAt = now();
    this.reprice(order);
    this.write(state);
    return order;
  }

  updateOrderItems(orderId: string, items: OrderItem[]): Order {
    return this.updateDraftOrder(orderId, { items });
  }

  clearOrderItems(orderId: string): Order {
    return this.updateOrderItems(orderId, []);
  }

  identifyMissingOrderInformation(orderId: string): string[] {
    const order = this.requireOrder(this.read(), orderId);
    return [
      ...(order.items.length === 0 ? ["items"] : []),
      ...(!order.fulfillmentType ? ["fulfillment_type"] : []),
      ...(!order.customerPhone ? ["customer_phone"] : [])
    ];
  }

  quoteOrder(orderId: string): OrderQuote {
    const state = this.read();
    const order = this.requireOrder(state, orderId);
    const quote: OrderQuote = {
      id: nextId("quote", state.orderQuotes.map((candidate) => candidate.id)),
      orderId: order.id,
      subtotal: order.subtotal,
      tax: order.tax,
      total: order.total,
      currency: order.currency,
      missingInformation: this.missingOrderInformation(order),
      createdAt: now()
    };
    state.orderQuotes.push(quote);
    this.write(state);
    return quote;
  }

  markAwaitingConfirmation(orderId: string): Order {
    return this.transitionOrder(orderId, "awaiting_confirmation", "Order is complete enough to confirm.");
  }

  confirmOrder(orderId: string): Order {
    const state = this.read();
    const order = this.requireOrder(state, orderId);
    const missing = this.missingOrderInformation(order);
    if (missing.length > 0) {
      throw new Error(`Order ${orderId} is missing: ${missing.join(", ")}.`);
    }

    this.transitionOrderInState(state, order, "confirmed", "Customer confirmed the order.");
    this.write(state);
    return order;
  }

  private transitionOrder(orderId: string, toStatus: OrderStatus, reason: string): Order {
    const state = this.read();
    const order = this.requireOrder(state, orderId);
    this.transitionOrderInState(state, order, toStatus, reason);
    this.write(state);
    return order;
  }

  private transitionOrderInState(
    state: BackendState,
    order: Order,
    toStatus: OrderStatus,
    reason: string
  ): void {
    const timestamp = now();
    const fromStatus = order.status;
    order.status = toStatus;
    order.updatedAt = timestamp;
    if (toStatus === "confirmed") order.confirmedAt = timestamp;
    state.orderStatusHistory.push({
      id: nextId("status", state.orderStatusHistory.map((candidate) => candidate.id)),
      orderId: order.id,
      fromStatus,
      toStatus,
      reason,
      createdAt: timestamp
    });
  }

  private missingOrderInformation(order: Order): string[] {
    return [
      ...(order.items.length === 0 ? ["items"] : []),
      ...(!order.fulfillmentType ? ["fulfillment_type"] : []),
      ...(!order.customerPhone ? ["customer_phone"] : [])
    ];
  }

  private reprice(order: Order): void {
    order.subtotal = order.items.reduce((total, item) => total + (item.lineTotal ?? 0), 0);
    order.tax = 0;
    order.total = order.subtotal + order.tax;
  }

  private requireSession(state: BackendState, sessionId: string): ConversationSession {
    const session = state.conversationSessions.find((candidate) => candidate.id === sessionId);
    if (!session) throw new Error(`No conversation session matches id: ${sessionId}`);
    return session;
  }

  private requireOrder(state: BackendState, orderId: string): Order {
    const order = state.orders.find((candidate) => candidate.id === orderId);
    if (!order) throw new Error(`No order matches id: ${orderId}`);
    return order;
  }

  private write(state: BackendState): void {
    mkdirSync(dirname(this.statePath), { recursive: true });
    writeFileSync(this.statePath, `${JSON.stringify(state, null, 2)}\n`);
  }
}
