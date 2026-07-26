export type ISODateTime = string;

export type FulfillmentType = "pickup" | "delivery" | "dine_in";
export type ConversationChannel = "phone" | "sms" | "web" | "test";

export type Business = {
  id: string;
  name: string;
  timezone: string;
  phone?: string;
  policies: Record<string, unknown>;
  supportedFulfillmentTypes: FulfillmentType[];
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
};

export type BusinessLocation = {
  id: string;
  businessId: string;
  name: string;
  timezone: string;
  phone?: string;
  address?: {
    line1: string;
    line2?: string;
    city: string;
    region: string;
    postalCode: string;
    country: string;
  };
  handoffNumber?: string;
  active: boolean;
};

export type BusinessHours = {
  id: string;
  businessId: string;
  locationId: string;
  weekday: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  opensAt: string;
  closesAt: string;
  fulfillmentTypes: FulfillmentType[];
};

export type HolidayHours = {
  id: string;
  businessId: string;
  locationId: string;
  date: string;
  closed: boolean;
  opensAt?: string;
  closesAt?: string;
  reason?: string;
};

export type VoiceAgentConfig = {
  id: string;
  businessId: string;
  locationId?: string;
  disclosure: string;
  defaultLanguage: string;
  supportedLanguages: string[];
  handoffNumber?: string;
};

export type MenuVersion = {
  id: string;
  menuId: string;
  version: string;
  active: boolean;
  source: string;
  publishedAt: ISODateTime;
};

export type MenuAvailability = {
  active: boolean;
  soldOut: boolean;
  availableFulfillmentTypes?: FulfillmentType[];
  startsAt?: ISODateTime;
  endsAt?: ISODateTime;
};

export type MenuItemVariant = {
  id: string;
  menuItemId: string;
  name: string;
  price: number;
  active: boolean;
};

export type ModifierOption = {
  id: string;
  name: string;
  priceDelta: number;
  active: boolean;
  soldOut: boolean;
};

export type ModifierGroup = {
  id: string;
  menuItemId?: string;
  categoryId?: string;
  name: string;
  required: boolean;
  minSelections: number;
  maxSelections?: number;
  options: ModifierOption[];
};

export type MenuCatalog = {
  id: string;
  businessId: string;
  locationId?: string;
  name: string;
  currency: "USD";
  activeVersionId?: string;
};

export type Customer = {
  id: string;
  businessId: string;
  displayName?: string;
  languagePreference?: string;
  notes?: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
};

export type CustomerContact = {
  id: string;
  customerId: string;
  type: "phone" | "email";
  value: string;
  smsOptIn?: boolean;
  verifiedAt?: ISODateTime;
};

export type CustomerPreference = {
  id: string;
  customerId: string;
  key: string;
  value: string;
};

export type CustomerHistory = {
  id: string;
  customerId: string;
  orderId?: string;
  summary: string;
  occurredAt: ISODateTime;
};

export type ConversationState =
  | "new"
  | "greeting"
  | "collecting_order"
  | "clarifying"
  | "quoting"
  | "awaiting_confirmation"
  | "confirmed"
  | "handoff_requested"
  | "handoff_connected"
  | "closed";

export type HandoffStatus = "none" | "requested" | "connected" | "missed" | "cancelled";

export type ConversationSession = {
  id: string;
  businessId: string;
  locationId?: string;
  customerId?: string;
  channel: ConversationChannel;
  currentState: ConversationState;
  callerPhone?: string;
  toPhone?: string;
  orderId?: string;
  confidence?: number;
  handoffStatus?: HandoffStatus;
  handoffReason?: string;
  startedAt: ISODateTime;
  updatedAt: ISODateTime;
  closedAt?: ISODateTime;
};

export type CallSession = {
  id: string;
  conversationSessionId: string;
  provider: string;
  providerCallId?: string;
  fromPhone?: string;
  toPhone?: string;
  startedAt: ISODateTime;
  answeredAt?: ISODateTime;
  endedAt?: ISODateTime;
  status: "ringing" | "in_progress" | "completed" | "failed";
};

export type ConversationTurn = {
  id: string;
  conversationSessionId: string;
  role: "caller" | "agent" | "tool" | "system";
  text?: string;
  transcriptSegmentIds: string[];
  detectedIntentIds: string[];
  agentResponseId?: string;
  toolCallId?: string;
  confidence?: number;
  createdAt: ISODateTime;
};

export type TranscriptSegment = {
  id: string;
  conversationSessionId: string;
  turnId?: string;
  speaker: "caller" | "agent";
  text: string;
  confidence?: number;
  startedAt?: ISODateTime;
  endedAt?: ISODateTime;
  createdAt: ISODateTime;
};

export type AgentResponse = {
  id: string;
  conversationSessionId: string;
  turnId?: string;
  text: string;
  model?: string;
  responseStyleId?: string;
  createdAt: ISODateTime;
};

export type DetectedIntent = {
  id: string;
  conversationSessionId: string;
  turnId?: string;
  name: string;
  confidence: number;
  slots: Record<string, unknown>;
  createdAt: ISODateTime;
};

export type OrderStatus =
  | "draft"
  | "awaiting_confirmation"
  | "confirmed"
  | "submitted"
  | "failed_submission"
  | "cancelled";

export type OrderLine = {
  menuItemId: string;
  name: string;
  quantity: number;
  category?: string;
  unitPrice?: number;
  lineTotal?: number;
  notes?: string;
};

export type OrderItemModifier = {
  id: string;
  modifierGroupId?: string;
  modifierOptionId?: string;
  name: string;
  quantity: number;
  priceDelta: number;
};

export type OrderItem = OrderLine & {
  id: string;
  variantId?: string;
  modifiers: OrderItemModifier[];
  specialInstructions?: string;
};

export type OrderQuote = {
  id: string;
  orderId: string;
  subtotal: number;
  tax: number;
  total: number;
  currency: "USD";
  missingInformation: string[];
  createdAt: ISODateTime;
};

export type Order = {
  id: string;
  businessId: string;
  locationId?: string;
  conversationSessionId?: string;
  customerId?: string;
  status: OrderStatus;
  fulfillmentType?: FulfillmentType;
  items: OrderItem[];
  subtotal: number;
  tax: number;
  total: number;
  currency: "USD";
  customerName?: string;
  customerPhone?: string;
  specialInstructions?: string;
  confirmedAt?: ISODateTime;
  posSubmissionId?: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
};

export type OrderPayment = {
  id: string;
  orderId: string;
  provider: string;
  providerPaymentId?: string;
  status: "not_required" | "pending" | "authorized" | "captured" | "failed";
  amount: number;
  currency: "USD";
  createdAt: ISODateTime;
};

export type OrderStatusHistory = {
  id: string;
  orderId: string;
  fromStatus?: OrderStatus;
  toStatus: OrderStatus;
  reason?: string;
  createdAt: ISODateTime;
};

export type ToolCall = {
  id: string;
  conversationSessionId?: string;
  turnId?: string;
  orderId?: string;
  name: string;
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
  status: "started" | "succeeded" | "failed";
  errorMessage?: string;
  createdAt: ISODateTime;
  completedAt?: ISODateTime;
};

export type BusinessEvent = {
  id: string;
  businessId: string;
  locationId?: string;
  conversationSessionId?: string;
  orderId?: string;
  type: string;
  payload: Record<string, unknown>;
  createdAt: ISODateTime;
};

export type AuditLog = {
  id: string;
  actorType: "system" | "agent" | "human" | "integration";
  actorId?: string;
  action: string;
  entityType: string;
  entityId: string;
  payload: Record<string, unknown>;
  createdAt: ISODateTime;
};

export type IntegrationConnection = {
  id: string;
  businessId: string;
  locationId?: string;
  provider: string;
  kind: "telephony" | "pos" | "sms" | "webhook";
  status: "active" | "disabled" | "error";
  externalAccountId?: string;
  metadata: Record<string, unknown>;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
};

export type PosOrderSubmission = {
  id: string;
  orderId: string;
  integrationConnectionId: string;
  providerOrderId?: string;
  status: "pending" | "submitted" | "failed";
  requestPayload: Record<string, unknown>;
  responsePayload?: Record<string, unknown>;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
};

export type SmsMessage = {
  id: string;
  conversationSessionId?: string;
  customerId?: string;
  providerMessageId?: string;
  direction: "inbound" | "outbound";
  phone: string;
  body: string;
  status: "queued" | "sent" | "delivered" | "failed" | "received";
  createdAt: ISODateTime;
};

export type HumanHandoff = {
  id: string;
  conversationSessionId: string;
  reason: string;
  status: "requested" | "connected" | "missed" | "cancelled";
  handoffNumber?: string;
  createdAt: ISODateTime;
  resolvedAt?: ISODateTime;
};

export type WebhookDelivery = {
  id: string;
  integrationConnectionId: string;
  eventId: string;
  status: "pending" | "delivered" | "failed";
  attempts: number;
  lastError?: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
};

export type AgentPolicy = {
  id: string;
  businessId: string;
  locationId?: string;
  allergyPolicy: "handoff" | "read_disclaimer" | "unsupported";
  clarificationLimit: number;
  aiDisclosureRequired: boolean;
  supportedLanguages: string[];
};

export type ResponseStyle = {
  id: string;
  agentPolicyId: string;
  name: string;
  tone: "warm" | "concise" | "formal";
  maxResponseSeconds?: number;
};

export type EscalationRule = {
  id: string;
  agentPolicyId: string;
  trigger: string;
  action: "handoff" | "end_call" | "sms_followup";
  active: boolean;
};

export type BusinessRule = {
  id: string;
  businessId: string;
  locationId?: string;
  key: string;
  value: Record<string, unknown>;
  active: boolean;
};
