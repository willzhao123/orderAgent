import type { BackendState, JsonBackendStateStore } from "./backendStateStore.ts";
import type {
  AgentPolicy,
  AgentResponse,
  Business,
  BusinessEvent,
  BusinessHours,
  BusinessLocation,
  CallSession,
  ConversationSession,
  ConversationState,
  ConversationTurn,
  DetectedIntent,
  EscalationRule,
  FulfillmentType,
  HandoffStatus,
  HolidayHours,
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
  ResponseStyle,
  SmsMessage,
  ToolCall,
  TranscriptSegment,
  VoiceAgentConfig,
  WebhookDelivery,
  BusinessRule
} from "../domain/models.ts";

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

export type CreateDraftOrderInput = {
  businessId: string;
  locationId?: string;
  conversationSessionId?: string;
  customerId?: string;
  fulfillmentType?: FulfillmentType;
  customerName?: string;
  customerPhone?: string;
  items?: OrderItem[];
  specialInstructions?: string;
};

export type UpdateDraftOrderPatch = Partial<Pick<
  Order,
  "fulfillmentType" | "customerName" | "customerPhone" | "items" | "specialInstructions"
>>;

export type RecordToolCallInput = {
  conversationSessionId?: string;
  orderId?: string;
  name: string;
  toolCallId?: string;
  args: Record<string, unknown>;
  response?: Record<string, unknown>;
  errorMessage?: string;
};

export type RecordBusinessEventInput = {
  businessId: string;
  locationId?: string;
  conversationSessionId?: string;
  orderId?: string;
  type: string;
  payload?: Record<string, unknown>;
};

export interface BusinessRepositoryInterface {
  getBusiness(businessId: string): Business | undefined;
  listBusinesses(): Business[];
  getLocation(locationId: string): BusinessLocation | undefined;
  listLocationsForBusiness(businessId: string): BusinessLocation[];
  listBusinessHours(businessId: string, locationId?: string): BusinessHours[];
  listHolidayHours(businessId: string, locationId?: string): HolidayHours[];
}

export interface MenuRepositoryInterface {
  getMenu(menuId: string): MenuCatalog | undefined;
  getActiveMenuForBusiness(businessId: string, locationId?: string): MenuCatalog | undefined;
  getActiveMenuVersion(menuId: string): MenuVersion | undefined;
  listMenuVersions(menuId: string): MenuVersion[];
}

export interface ConversationSessionRepositoryInterface {
  createSession(input: CreateConversationSessionInput): {
    conversationSession: ConversationSession;
    callSession?: CallSession;
  };
  getSession(sessionId: string): ConversationSession | undefined;
  updateState(
    sessionId: string,
    state: ConversationState,
    patch?: { orderId?: string; confidence?: number }
  ): ConversationSession;
  updateHandoffStatus(input: UpdateHandoffInput): ConversationSession;
  closeSession(sessionId: string): ConversationSession;
  getCallSession(callSessionId: string): CallSession | undefined;
  getCallSessionForConversation(sessionId: string): CallSession | undefined;
}

export interface ConversationTurnRepositoryInterface {
  appendTurn(input: {
    conversationSessionId: string;
    role: ConversationTurn["role"];
    text?: string;
    confidence?: number;
    detectedIntent?: {
      name: string;
      confidence: number;
      slots?: Record<string, unknown>;
    };
  }): ConversationTurn;
  appendToolTurn(input: {
    conversationSessionId: string;
    toolCallId: string;
    createdAt: string;
  }): ConversationTurn;
  listTurns(sessionId: string): ConversationTurn[];
  listTranscript(sessionId: string): TranscriptSegment[];
  listDetectedIntents(sessionId: string): DetectedIntent[];
  listAgentResponses(sessionId: string): AgentResponse[];
}

export interface OrderRepositoryInterface {
  createDraftOrder(input: CreateDraftOrderInput): Order;
  getOrder(orderId: string): Order | undefined;
  listOrdersForSession(sessionId: string): Order[];
  listOrdersForCustomer(customerId: string): Order[];
  updateDraftOrder(orderId: string, patch: UpdateDraftOrderPatch): Order;
  updateOrderItems(orderId: string, items: OrderItem[]): Order;
  clearOrderItems(orderId: string): Order;
  markAwaitingConfirmation(orderId: string): Order;
  confirmOrder(orderId: string): Order;
  cancelOrder(orderId: string, reason?: string): Order;
  listStatusHistory(orderId: string): OrderStatusHistory[];
  identifyMissingOrderInformation(orderId: string): string[];
}

export interface OrderQuoteRepositoryInterface {
  createQuote(orderId: string): OrderQuote;
  getLatestQuote(orderId: string): OrderQuote | undefined;
  listQuotes(orderId: string): OrderQuote[];
}

export interface ToolCallRepositoryInterface {
  recordToolCall(input: RecordToolCallInput): ToolCall;
  getToolCall(toolCallId: string): ToolCall | undefined;
  listToolCallsForSession(sessionId: string): ToolCall[];
  listToolCallsForOrder(orderId: string): ToolCall[];
}

export interface BusinessEventRepositoryInterface {
  recordEvent(input: RecordBusinessEventInput): BusinessEvent;
  listEventsForBusiness(businessId: string): BusinessEvent[];
  listEventsForSession(sessionId: string): BusinessEvent[];
  listEventsForOrder(orderId: string): BusinessEvent[];
}

export interface IntegrationRepositoryInterface {
  listConnections(businessId: string, locationId?: string): IntegrationConnection[];
  getConnection(connectionId: string): IntegrationConnection | undefined;
  createPosSubmission(input: Omit<PosOrderSubmission, "id" | "createdAt" | "updatedAt">): PosOrderSubmission;
  updatePosSubmissionStatus(
    id: string,
    patch: Partial<Pick<PosOrderSubmission, "status" | "providerOrderId" | "responsePayload">>
  ): PosOrderSubmission;
  recordSmsMessage(input: Omit<SmsMessage, "id" | "createdAt">): SmsMessage;
  recordWebhookDelivery(input: Omit<WebhookDelivery, "id" | "createdAt" | "updatedAt">): WebhookDelivery;
  recordHumanHandoff(input: Omit<HumanHandoff, "id" | "createdAt">): HumanHandoff;
  updateHumanHandoffStatus(id: string, status: HumanHandoff["status"]): HumanHandoff;
}

export interface AgentPolicyRepositoryInterface {
  getVoiceAgentConfig(businessId: string, locationId?: string): VoiceAgentConfig | undefined;
  getAgentPolicy(businessId: string, locationId?: string): AgentPolicy | undefined;
  listResponseStyles(agentPolicyId: string): ResponseStyle[];
  listEscalationRules(agentPolicyId: string): EscalationRule[];
  listBusinessRules(businessId: string, locationId?: string): BusinessRule[];
}

function requireSession(state: BackendState, sessionId: string): ConversationSession {
  const session = state.conversationSessions.find((candidate) => candidate.id === sessionId);
  if (!session) throw new Error(`No conversation session matches id: ${sessionId}`);
  return session;
}

function requireOrder(state: BackendState, orderId: string): Order {
  const order = state.orders.find((candidate) => candidate.id === orderId);
  if (!order) throw new Error(`No order matches id: ${orderId}`);
  return order;
}

function missingOrderInformation(order: Order): string[] {
  return [
    ...(order.items.length === 0 ? ["items"] : []),
    ...(!order.fulfillmentType ? ["fulfillment_type"] : []),
    ...(!order.customerPhone ? ["customer_phone"] : [])
  ];
}

function reprice(order: Order): void {
  order.subtotal = order.items.reduce((total, item) => total + (item.lineTotal ?? 0), 0);
  order.tax = 0;
  order.total = order.subtotal + order.tax;
}

export class BusinessRepository implements BusinessRepositoryInterface {
  private readonly store: JsonBackendStateStore;

  constructor(store: JsonBackendStateStore) {
    this.store = store;
  }

  getBusiness(businessId: string): Business | undefined {
    return this.store.read().businesses.find((business) => business.id === businessId);
  }

  listBusinesses(): Business[] {
    return this.store.read().businesses;
  }

  getLocation(locationId: string): BusinessLocation | undefined {
    return this.store.read().locations.find((location) => location.id === locationId);
  }

  listLocationsForBusiness(businessId: string): BusinessLocation[] {
    return this.store.read().locations.filter((location) => location.businessId === businessId);
  }

  listBusinessHours(businessId: string, locationId?: string): BusinessHours[] {
    return this.store.read().businessHours.filter((hours) =>
      hours.businessId === businessId &&
      (locationId === undefined || hours.locationId === locationId)
    );
  }

  listHolidayHours(businessId: string, locationId?: string): HolidayHours[] {
    return this.store.read().holidayHours.filter((hours) =>
      hours.businessId === businessId &&
      (locationId === undefined || hours.locationId === locationId)
    );
  }
}

export class MenuRepository implements MenuRepositoryInterface {
  private readonly store: JsonBackendStateStore;

  constructor(store: JsonBackendStateStore) {
    this.store = store;
  }

  getMenu(menuId: string): MenuCatalog | undefined {
    return this.store.read().menus.find((menu) => menu.id === menuId);
  }

  getActiveMenuForBusiness(businessId: string, locationId?: string): MenuCatalog | undefined {
    return this.store.read().menus.find((menu) =>
      menu.businessId === businessId &&
      (locationId === undefined || menu.locationId === locationId)
    );
  }

  getActiveMenuVersion(menuId: string): MenuVersion | undefined {
    return this.store.read().menuVersions.find((version) =>
      version.menuId === menuId && version.active
    );
  }

  listMenuVersions(menuId: string): MenuVersion[] {
    return this.store.read().menuVersions.filter((version) => version.menuId === menuId);
  }
}

export class ConversationSessionRepository implements ConversationSessionRepositoryInterface {
  private readonly store: JsonBackendStateStore;

  constructor(store: JsonBackendStateStore) {
    this.store = store;
  }

  createSession(input: CreateConversationSessionInput): {
    conversationSession: ConversationSession;
    callSession?: CallSession;
  } {
    return this.store.update((state) => {
      const timestamp = this.store.now();
      const conversationSession: ConversationSession = {
        id: this.store.nextId("session", state.conversationSessions.map((session) => session.id)),
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
          id: this.store.nextId("call", state.callSessions.map((call) => call.id)),
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

      return { conversationSession, callSession };
    });
  }

  getSession(sessionId: string): ConversationSession | undefined {
    return this.store.read().conversationSessions.find((session) => session.id === sessionId);
  }

  updateState(
    sessionId: string,
    currentState: ConversationState,
    patch: { orderId?: string; confidence?: number } = {}
  ): ConversationSession {
    return this.store.update((state) => {
      const session = requireSession(state, sessionId);
      session.currentState = currentState;
      if (patch.orderId !== undefined) session.orderId = patch.orderId;
      if (patch.confidence !== undefined) session.confidence = patch.confidence;
      session.updatedAt = this.store.now();
      return session;
    });
  }

  updateHandoffStatus(input: UpdateHandoffInput): ConversationSession {
    return this.store.update((state) => {
      const session = requireSession(state, input.conversationSessionId);
      session.handoffStatus = input.status;
      if (input.reason !== undefined) session.handoffReason = input.reason;
      if (input.status === "requested") session.currentState = "handoff_requested";
      if (input.status === "connected") session.currentState = "handoff_connected";
      session.updatedAt = this.store.now();
      return session;
    });
  }

  closeSession(sessionId: string): ConversationSession {
    return this.store.update((state) => {
      const session = requireSession(state, sessionId);
      const timestamp = this.store.now();
      session.currentState = "closed";
      session.updatedAt = timestamp;
      session.closedAt = timestamp;

      for (const call of state.callSessions) {
        if (call.conversationSessionId === sessionId && !call.endedAt) {
          call.endedAt = timestamp;
          call.status = "completed";
        }
      }

      return session;
    });
  }

  getCallSession(callSessionId: string): CallSession | undefined {
    return this.store.read().callSessions.find((call) => call.id === callSessionId);
  }

  getCallSessionForConversation(sessionId: string): CallSession | undefined {
    return this.store.read().callSessions.find((call) => call.conversationSessionId === sessionId);
  }
}

export class ConversationTurnRepository implements ConversationTurnRepositoryInterface {
  private readonly store: JsonBackendStateStore;

  constructor(store: JsonBackendStateStore) {
    this.store = store;
  }

  appendTurn(input: {
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
    return this.store.update((state) => {
      const session = requireSession(state, input.conversationSessionId);
      const timestamp = this.store.now();
      const turnId = this.store.nextId("turn", state.conversationTurns.map((candidate) => candidate.id));
      const transcriptSegmentIds: string[] = [];
      const detectedIntentIds: string[] = [];
      let agentResponseId: string | undefined;

      if (input.text && input.role !== "tool") {
        if (input.role === "agent") {
          const response: AgentResponse = {
            id: this.store.nextId("response", state.agentResponses.map((candidate) => candidate.id)),
            conversationSessionId: session.id,
            turnId,
            text: input.text,
            createdAt: timestamp
          };
          state.agentResponses.push(response);
          agentResponseId = response.id;
        }

        const segment: TranscriptSegment = {
          id: this.store.nextId("segment", state.transcriptSegments.map((candidate) => candidate.id)),
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
          id: this.store.nextId("intent", state.detectedIntents.map((candidate) => candidate.id)),
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
      return turn;
    });
  }

  appendToolTurn(input: {
    conversationSessionId: string;
    toolCallId: string;
    createdAt: string;
  }): ConversationTurn {
    return this.store.update((state) => {
      const session = requireSession(state, input.conversationSessionId);
      const turn: ConversationTurn = {
        id: this.store.nextId("turn", state.conversationTurns.map((candidate) => candidate.id)),
        conversationSessionId: session.id,
        role: "tool",
        toolCallId: input.toolCallId,
        transcriptSegmentIds: [],
        detectedIntentIds: [],
        createdAt: input.createdAt
      };
      state.conversationTurns.push(turn);
      session.updatedAt = input.createdAt;
      return turn;
    });
  }

  listTurns(sessionId: string): ConversationTurn[] {
    return this.store.read().conversationTurns.filter((turn) => turn.conversationSessionId === sessionId);
  }

  listTranscript(sessionId: string): TranscriptSegment[] {
    return this.store.read().transcriptSegments.filter((segment) => segment.conversationSessionId === sessionId);
  }

  listDetectedIntents(sessionId: string): DetectedIntent[] {
    return this.store.read().detectedIntents.filter((intent) => intent.conversationSessionId === sessionId);
  }

  listAgentResponses(sessionId: string): AgentResponse[] {
    return this.store.read().agentResponses.filter((response) => response.conversationSessionId === sessionId);
  }
}

export class OrderRepository implements OrderRepositoryInterface {
  private readonly store: JsonBackendStateStore;

  constructor(store: JsonBackendStateStore) {
    this.store = store;
  }

  createDraftOrder(input: CreateDraftOrderInput): Order {
    return this.store.update((state) => {
      const timestamp = this.store.now();
      const order: Order = {
        id: this.store.nextId("order", state.orders.map((candidate) => candidate.id)),
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
      reprice(order);
      state.orders.push(order);
      state.orderStatusHistory.push({
        id: this.store.nextId("status", state.orderStatusHistory.map((candidate) => candidate.id)),
        orderId: order.id,
        toStatus: "draft",
        reason: "Draft order created by backend.",
        createdAt: timestamp
      });
      return order;
    });
  }

  getOrder(orderId: string): Order | undefined {
    return this.store.read().orders.find((order) => order.id === orderId);
  }

  listOrdersForSession(sessionId: string): Order[] {
    return this.store.read().orders.filter((order) => order.conversationSessionId === sessionId);
  }

  listOrdersForCustomer(customerId: string): Order[] {
    return this.store.read().orders.filter((order) => order.customerId === customerId);
  }

  updateDraftOrder(orderId: string, patch: UpdateDraftOrderPatch): Order {
    return this.store.update((state) => {
      const order = requireOrder(state, orderId);
      if (order.status !== "draft" && order.status !== "awaiting_confirmation") {
        throw new Error(`Order ${orderId} cannot be edited after status ${order.status}.`);
      }

      Object.assign(order, patch);
      order.status = "draft";
      order.updatedAt = this.store.now();
      reprice(order);
      return order;
    });
  }

  updateOrderItems(orderId: string, items: OrderItem[]): Order {
    return this.updateDraftOrder(orderId, { items });
  }

  clearOrderItems(orderId: string): Order {
    return this.updateOrderItems(orderId, []);
  }

  markAwaitingConfirmation(orderId: string): Order {
    return this.transitionOrder(orderId, "awaiting_confirmation", "Order is complete enough to confirm.");
  }

  confirmOrder(orderId: string): Order {
    return this.store.update((state) => {
      const order = requireOrder(state, orderId);
      const missing = missingOrderInformation(order);
      if (missing.length > 0) {
        throw new Error(`Order ${orderId} is missing: ${missing.join(", ")}.`);
      }

      this.transitionOrderInState(state, order, "confirmed", "Customer confirmed the order.");
      return order;
    });
  }

  cancelOrder(orderId: string, reason = "Order cancelled."): Order {
    return this.transitionOrder(orderId, "cancelled", reason);
  }

  listStatusHistory(orderId: string): OrderStatusHistory[] {
    return this.store.read().orderStatusHistory.filter((entry) => entry.orderId === orderId);
  }

  identifyMissingOrderInformation(orderId: string): string[] {
    return missingOrderInformation(requireOrder(this.store.read(), orderId));
  }

  private transitionOrder(orderId: string, toStatus: OrderStatus, reason: string): Order {
    return this.store.update((state) => {
      const order = requireOrder(state, orderId);
      this.transitionOrderInState(state, order, toStatus, reason);
      return order;
    });
  }

  private transitionOrderInState(
    state: BackendState,
    order: Order,
    toStatus: OrderStatus,
    reason: string
  ): void {
    const timestamp = this.store.now();
    const fromStatus = order.status;
    order.status = toStatus;
    order.updatedAt = timestamp;
    if (toStatus === "confirmed") order.confirmedAt = timestamp;
    state.orderStatusHistory.push({
      id: this.store.nextId("status", state.orderStatusHistory.map((candidate) => candidate.id)),
      orderId: order.id,
      fromStatus,
      toStatus,
      reason,
      createdAt: timestamp
    });
  }
}

export class OrderQuoteRepository implements OrderQuoteRepositoryInterface {
  private readonly store: JsonBackendStateStore;

  constructor(store: JsonBackendStateStore) {
    this.store = store;
  }

  createQuote(orderId: string): OrderQuote {
    return this.store.update((state) => {
      const order = requireOrder(state, orderId);
      const quote: OrderQuote = {
        id: this.store.nextId("quote", state.orderQuotes.map((candidate) => candidate.id)),
        orderId: order.id,
        subtotal: order.subtotal,
        tax: order.tax,
        total: order.total,
        currency: order.currency,
        missingInformation: missingOrderInformation(order),
        createdAt: this.store.now()
      };
      state.orderQuotes.push(quote);
      return quote;
    });
  }

  getLatestQuote(orderId: string): OrderQuote | undefined {
    return this.listQuotes(orderId).at(-1);
  }

  listQuotes(orderId: string): OrderQuote[] {
    return this.store.read().orderQuotes.filter((quote) => quote.orderId === orderId);
  }
}

export class ToolCallRepository implements ToolCallRepositoryInterface {
  private readonly store: JsonBackendStateStore;
  private readonly conversationTurns: ConversationTurnRepository;

  constructor(
    store: JsonBackendStateStore,
    conversationTurns: ConversationTurnRepository
  ) {
    this.store = store;
    this.conversationTurns = conversationTurns;
  }

  recordToolCall(input: RecordToolCallInput): ToolCall {
    const timestamp = this.store.now();
    const toolCall = this.store.update((state) => {
      if (input.conversationSessionId) requireSession(state, input.conversationSessionId);
      const createdToolCall: ToolCall = {
        id: input.toolCallId ?? this.store.nextId("tool", state.toolCalls.map((candidate) => candidate.id)),
        ...(input.conversationSessionId ? { conversationSessionId: input.conversationSessionId } : {}),
        ...(input.orderId ? { orderId: input.orderId } : {}),
        name: input.name,
        input: input.args,
        ...(input.response ? { output: input.response } : {}),
        status: input.errorMessage ? "failed" : "succeeded",
        ...(input.errorMessage ? { errorMessage: input.errorMessage } : {}),
        createdAt: timestamp,
        completedAt: timestamp
      };
      state.toolCalls.push(createdToolCall);
      return createdToolCall;
    });

    if (!input.conversationSessionId) return toolCall;
    const turn = this.conversationTurns.appendToolTurn({
      conversationSessionId: input.conversationSessionId,
      toolCallId: toolCall.id,
      createdAt: timestamp
    });

    return this.store.update((state) => {
      const storedToolCall = state.toolCalls.find((candidate) => candidate.id === toolCall.id)!;
      storedToolCall.turnId = turn.id;
      return storedToolCall;
    });
  }

  getToolCall(toolCallId: string): ToolCall | undefined {
    return this.store.read().toolCalls.find((toolCall) => toolCall.id === toolCallId);
  }

  listToolCallsForSession(sessionId: string): ToolCall[] {
    return this.store.read().toolCalls.filter((toolCall) => toolCall.conversationSessionId === sessionId);
  }

  listToolCallsForOrder(orderId: string): ToolCall[] {
    return this.store.read().toolCalls.filter((toolCall) => toolCall.orderId === orderId);
  }
}

export class BusinessEventRepository implements BusinessEventRepositoryInterface {
  private readonly store: JsonBackendStateStore;

  constructor(store: JsonBackendStateStore) {
    this.store = store;
  }

  recordEvent(input: RecordBusinessEventInput): BusinessEvent {
    return this.store.update((state) => {
      const event: BusinessEvent = {
        id: this.store.nextId("event", state.businessEvents.map((candidate) => candidate.id)),
        businessId: input.businessId,
        ...(input.locationId ? { locationId: input.locationId } : {}),
        ...(input.conversationSessionId ? { conversationSessionId: input.conversationSessionId } : {}),
        ...(input.orderId ? { orderId: input.orderId } : {}),
        type: input.type,
        payload: input.payload ?? {},
        createdAt: this.store.now()
      };
      state.businessEvents.push(event);
      return event;
    });
  }

  listEventsForBusiness(businessId: string): BusinessEvent[] {
    return this.store.read().businessEvents.filter((event) => event.businessId === businessId);
  }

  listEventsForSession(sessionId: string): BusinessEvent[] {
    return this.store.read().businessEvents.filter((event) => event.conversationSessionId === sessionId);
  }

  listEventsForOrder(orderId: string): BusinessEvent[] {
    return this.store.read().businessEvents.filter((event) => event.orderId === orderId);
  }
}

export class IntegrationRepository implements IntegrationRepositoryInterface {
  private readonly store: JsonBackendStateStore;

  constructor(store: JsonBackendStateStore) {
    this.store = store;
  }

  listConnections(businessId: string, locationId?: string): IntegrationConnection[] {
    return this.store.read().integrationConnections.filter((connection) =>
      connection.businessId === businessId &&
      (locationId === undefined || connection.locationId === locationId)
    );
  }

  getConnection(connectionId: string): IntegrationConnection | undefined {
    return this.store.read().integrationConnections.find((connection) => connection.id === connectionId);
  }

  createPosSubmission(input: Omit<PosOrderSubmission, "id" | "createdAt" | "updatedAt">): PosOrderSubmission {
    return this.store.update((state) => {
      const timestamp = this.store.now();
      const submission: PosOrderSubmission = {
        id: this.store.nextId("pos", state.posOrderSubmissions.map((candidate) => candidate.id)),
        ...input,
        createdAt: timestamp,
        updatedAt: timestamp
      };
      state.posOrderSubmissions.push(submission);
      return submission;
    });
  }

  updatePosSubmissionStatus(
    id: string,
    patch: Partial<Pick<PosOrderSubmission, "status" | "providerOrderId" | "responsePayload">>
  ): PosOrderSubmission {
    return this.store.update((state) => {
      const submission = state.posOrderSubmissions.find((candidate) => candidate.id === id);
      if (!submission) throw new Error(`No POS submission matches id: ${id}`);
      Object.assign(submission, patch);
      submission.updatedAt = this.store.now();
      return submission;
    });
  }

  recordSmsMessage(input: Omit<SmsMessage, "id" | "createdAt">): SmsMessage {
    return this.store.update((state) => {
      const message: SmsMessage = {
        id: this.store.nextId("sms", state.smsMessages.map((candidate) => candidate.id)),
        ...input,
        createdAt: this.store.now()
      };
      state.smsMessages.push(message);
      return message;
    });
  }

  recordWebhookDelivery(input: Omit<WebhookDelivery, "id" | "createdAt" | "updatedAt">): WebhookDelivery {
    return this.store.update((state) => {
      const timestamp = this.store.now();
      const delivery: WebhookDelivery = {
        id: this.store.nextId("webhook", state.webhookDeliveries.map((candidate) => candidate.id)),
        ...input,
        createdAt: timestamp,
        updatedAt: timestamp
      };
      state.webhookDeliveries.push(delivery);
      return delivery;
    });
  }

  recordHumanHandoff(input: Omit<HumanHandoff, "id" | "createdAt">): HumanHandoff {
    return this.store.update((state) => {
      const handoff: HumanHandoff = {
        id: this.store.nextId("handoff", state.humanHandoffs.map((candidate) => candidate.id)),
        ...input,
        createdAt: this.store.now()
      };
      state.humanHandoffs.push(handoff);
      return handoff;
    });
  }

  updateHumanHandoffStatus(id: string, status: HumanHandoff["status"]): HumanHandoff {
    return this.store.update((state) => {
      const handoff = state.humanHandoffs.find((candidate) => candidate.id === id);
      if (!handoff) throw new Error(`No human handoff matches id: ${id}`);
      handoff.status = status;
      if (status === "connected" || status === "missed" || status === "cancelled") {
        handoff.resolvedAt = this.store.now();
      }
      return handoff;
    });
  }
}

export class AgentPolicyRepository implements AgentPolicyRepositoryInterface {
  private readonly store: JsonBackendStateStore;

  constructor(store: JsonBackendStateStore) {
    this.store = store;
  }

  getVoiceAgentConfig(businessId: string, locationId?: string): VoiceAgentConfig | undefined {
    return this.store.read().voiceAgentConfigs.find((config) =>
      config.businessId === businessId &&
      (locationId === undefined || config.locationId === locationId)
    );
  }

  getAgentPolicy(businessId: string, locationId?: string): AgentPolicy | undefined {
    return this.store.read().agentPolicies.find((policy) =>
      policy.businessId === businessId &&
      (locationId === undefined || policy.locationId === locationId)
    );
  }

  listResponseStyles(agentPolicyId: string): ResponseStyle[] {
    return this.store.read().responseStyles.filter((style) => style.agentPolicyId === agentPolicyId);
  }

  listEscalationRules(agentPolicyId: string): EscalationRule[] {
    return this.store.read().escalationRules.filter((rule) => rule.agentPolicyId === agentPolicyId);
  }

  listBusinessRules(businessId: string, locationId?: string): BusinessRule[] {
    return this.store.read().businessRules.filter((rule) =>
      rule.businessId === businessId &&
      (locationId === undefined || rule.locationId === locationId)
    );
  }
}
