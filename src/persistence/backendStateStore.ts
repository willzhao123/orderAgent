import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type {
  AgentPolicy,
  AgentResponse,
  AuditLog,
  Business,
  BusinessEvent,
  BusinessHours,
  BusinessLocation,
  CallSession,
  ConversationSession,
  ConversationTurn,
  Customer,
  CustomerContact,
  CustomerHistory,
  CustomerPreference,
  DetectedIntent,
  EscalationRule,
  HolidayHours,
  HumanHandoff,
  IntegrationConnection,
  MenuCatalog,
  MenuVersion,
  Order,
  OrderPayment,
  OrderQuote,
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

function readJsonState(path: string): BackendState {
  if (!existsSync(path)) return structuredClone(EMPTY_STATE);

  const contents = readFileSync(path, "utf8").trim();
  if (!contents) return structuredClone(EMPTY_STATE);

  const parsed = JSON.parse(contents) as Partial<BackendState>;
  return { ...structuredClone(EMPTY_STATE), ...parsed };
}

export class JsonBackendStateStore {
  private readonly statePath: string;

  constructor(statePath: string) {
    this.statePath = statePath;
  }

  read(): BackendState {
    return readJsonState(this.statePath);
  }

  write(state: BackendState): void {
    mkdirSync(dirname(this.statePath), { recursive: true });
    writeFileSync(this.statePath, `${JSON.stringify(state, null, 2)}\n`);
  }

  update<T>(mutate: (state: BackendState) => T): T {
    const state = this.read();
    const result = mutate(state);
    this.write(state);
    return result;
  }

  now(): string {
    return new Date().toISOString();
  }

  nextId(prefix: string, existingIds: string[]): string {
    const nextNumber = existingIds
      .map((id) => id.match(new RegExp(`^${prefix}_(\\d+)$`))?.[1])
      .filter((value): value is string => Boolean(value))
      .map((value) => Number(value))
      .reduce((highest, value) => Math.max(highest, value), 0) + 1;

    return `${prefix}_${String(nextNumber).padStart(4, "0")}`;
  }
}
