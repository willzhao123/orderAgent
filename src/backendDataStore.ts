import { JsonBackendStateStore, type BackendState } from "./backendStateStore.ts";
import type {
  BusinessEvent,
  CallSession,
  ConversationSession,
  ConversationState,
  ConversationTurn,
  Order,
  OrderItem,
  OrderQuote,
  ToolCall
} from "./domain.ts";
import {
  AgentPolicyRepository,
  BusinessEventRepository,
  BusinessRepository,
  ConversationSessionRepository,
  ConversationTurnRepository,
  IntegrationRepository,
  MenuRepository,
  OrderQuoteRepository,
  OrderRepository,
  ToolCallRepository,
  type CreateConversationSessionInput,
  type CreateDraftOrderInput,
  type RecordBusinessEventInput,
  type RecordToolCallInput,
  type UpdateDraftOrderPatch,
  type UpdateHandoffInput
} from "./repositories.ts";

export type { BackendState } from "./backendStateStore.ts";
export type {
  CreateConversationSessionInput,
  CreateDraftOrderInput,
  RecordBusinessEventInput,
  RecordToolCallInput,
  UpdateDraftOrderPatch,
  UpdateHandoffInput
} from "./repositories.ts";

export class BackendDataStore {
  private readonly stateStore: JsonBackendStateStore;

  readonly businesses: BusinessRepository;
  readonly menus: MenuRepository;
  readonly conversationSessions: ConversationSessionRepository;
  readonly conversationTurns: ConversationTurnRepository;
  readonly orders: OrderRepository;
  readonly orderQuotes: OrderQuoteRepository;
  readonly toolCalls: ToolCallRepository;
  readonly businessEvents: BusinessEventRepository;
  readonly integrations: IntegrationRepository;
  readonly agentPolicies: AgentPolicyRepository;

  constructor(statePath: string) {
    this.stateStore = new JsonBackendStateStore(statePath);
    this.businesses = new BusinessRepository(this.stateStore);
    this.menus = new MenuRepository(this.stateStore);
    this.conversationSessions = new ConversationSessionRepository(this.stateStore);
    this.conversationTurns = new ConversationTurnRepository(this.stateStore);
    this.orders = new OrderRepository(this.stateStore);
    this.orderQuotes = new OrderQuoteRepository(this.stateStore);
    this.toolCalls = new ToolCallRepository(this.stateStore, this.conversationTurns);
    this.businessEvents = new BusinessEventRepository(this.stateStore);
    this.integrations = new IntegrationRepository(this.stateStore);
    this.agentPolicies = new AgentPolicyRepository(this.stateStore);
  }

  read(): BackendState {
    return this.stateStore.read();
  }

  createConversationSession(input: CreateConversationSessionInput): {
    conversationSession: ConversationSession;
    callSession?: CallSession;
  } {
    return this.conversationSessions.createSession(input);
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
    return this.conversationTurns.appendTurn(input);
  }

  updateConversationState(
    conversationSessionId: string,
    currentState: ConversationState,
    patch: { orderId?: string; confidence?: number } = {}
  ): ConversationSession {
    return this.conversationSessions.updateState(conversationSessionId, currentState, patch);
  }

  updateHandoffStatus(input: UpdateHandoffInput): ConversationSession {
    return this.conversationSessions.updateHandoffStatus(input);
  }

  closeConversationSession(conversationSessionId: string): ConversationSession {
    return this.conversationSessions.closeSession(conversationSessionId);
  }

  recordToolCall(input: RecordToolCallInput): ToolCall {
    return this.toolCalls.recordToolCall(input);
  }

  recordBusinessEvent(input: RecordBusinessEventInput): BusinessEvent {
    return this.businessEvents.recordEvent(input);
  }

  createDraftOrder(input: CreateDraftOrderInput): Order {
    return this.orders.createDraftOrder(input);
  }

  getOrder(orderId: string): Order | undefined {
    return this.orders.getOrder(orderId);
  }

  updateDraftOrder(orderId: string, patch: UpdateDraftOrderPatch): Order {
    return this.orders.updateDraftOrder(orderId, patch);
  }

  updateOrderItems(orderId: string, items: OrderItem[]): Order {
    return this.orders.updateOrderItems(orderId, items);
  }

  clearOrderItems(orderId: string): Order {
    return this.orders.clearOrderItems(orderId);
  }

  identifyMissingOrderInformation(orderId: string): string[] {
    return this.orders.identifyMissingOrderInformation(orderId);
  }

  quoteOrder(orderId: string): OrderQuote {
    return this.orderQuotes.createQuote(orderId);
  }

  markAwaitingConfirmation(orderId: string): Order {
    return this.orders.markAwaitingConfirmation(orderId);
  }

  confirmOrder(orderId: string): Order {
    return this.orders.confirmOrder(orderId);
  }
}
