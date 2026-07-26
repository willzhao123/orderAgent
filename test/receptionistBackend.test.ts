import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { BackendDataStore } from "../src/backendDataStore.ts";
import { loadMenu } from "../src/menu.ts";
import { MenuService } from "../src/menuService.ts";
import { ReceptionistBackend } from "../src/receptionistBackend.ts";

const defaultMenuPath = fileURLToPath(new URL("../data/menu.json", import.meta.url));

async function createBackend(): Promise<{
  backend: ReceptionistBackend;
  store: BackendDataStore;
  statePath: string;
}> {
  const tempDir = await mkdtemp(join(tmpdir(), "receptionist-backend-"));
  const statePath = join(tempDir, "backend-state.json");
  const menu = await loadMenu(defaultMenuPath);
  const store = new BackendDataStore(statePath);
  return {
    backend: new ReceptionistBackend(new MenuService(menu), store),
    store,
    statePath
  };
}

test("creates a phone session and stores transcript turns outside chat history", async () => {
  const { backend, store } = await createBackend();
  const session = backend.createPhoneSession({
    businessId: "business_0001",
    locationId: "location_0001",
    callerPhone: "+13125550100",
    toPhone: "+13125550199",
    provider: "twilio",
    providerCallId: "CA123"
  });

  backend.addCallerTurn({
    conversationSessionId: session.id,
    businessId: "business_0001",
    locationId: "location_0001",
    text: "I want two egg rolls.",
    confidence: 0.93,
    detectedIntent: {
      name: "order.add_item",
      confidence: 0.9,
      slots: { item: "Egg Rolls", quantity: 2 }
    }
  });

  const state = store.read();
  assert.equal(state.conversationSessions.length, 1);
  assert.equal(state.conversationSessions[0]!.currentState, "new");
  assert.equal(state.callSessions[0]!.providerCallId, "CA123");
  assert.equal(state.transcriptSegments[0]!.text, "I want two egg rolls.");
  assert.equal(state.detectedIntents[0]!.name, "order.add_item");
  assert.deepEqual(
    state.businessEvents.map((event) => event.type),
    ["conversation.session_created", "conversation.turn_added"]
  );
});

test("builds a deterministic draft order and identifies missing confirmation data", async () => {
  const { backend, store } = await createBackend();
  const session = backend.createPhoneSession({
    businessId: "business_0001",
    callerPhone: "+13125550100"
  });

  const result = backend.buildDraftOrder({
    conversationSessionId: session.id,
    businessId: "business_0001",
    customerPhone: "+13125550100",
    items: [
      { item: "Egg Rolls", quantity: 2 },
      { item: "Pho Ga", quantity: 1, notes: "no cilantro" }
    ]
  });

  assert.equal(result.created, true);
  assert.deepEqual(result.missingInformation, ["fulfillment_type"]);
  assert.equal(result.readyForConfirmation, false);

  const state = store.read();
  assert.equal(state.orders.length, 1);
  assert.equal(state.orders[0]!.status, "draft");
  assert.equal(state.orders[0]!.subtotal, 29);
  assert.equal(state.orderQuotes[0]!.missingInformation[0], "fulfillment_type");
  assert.equal(state.conversationSessions[0]!.orderId, state.orders[0]!.id);
  assert.equal(state.conversationSessions[0]!.currentState, "collecting_order");
});

test("blocks confirmation until required order information is present", async () => {
  const { backend, store } = await createBackend();
  const session = backend.createPhoneSession({
    businessId: "business_0001",
    callerPhone: "+13125550100"
  });
  const draft = backend.buildDraftOrder({
    conversationSessionId: session.id,
    businessId: "business_0001",
    customerPhone: "+13125550100",
    items: [{ item: "Egg Rolls", quantity: 1 }]
  });
  const orderId = (draft.order as { id: string }).id;

  const blocked = backend.confirmOrder({
    businessId: "business_0001",
    conversationSessionId: session.id,
    orderId
  });

  assert.deepEqual(blocked, {
    confirmed: false,
    orderId,
    missingInformation: ["fulfillment_type"]
  });
  assert.equal(
    store.read().businessEvents.at(-1)!.type,
    "order.confirmation_blocked"
  );
});

test("confirms complete draft orders and records status history", async () => {
  const { backend, store, statePath } = await createBackend();
  const session = backend.createPhoneSession({
    businessId: "business_0001",
    callerPhone: "+13125550100"
  });
  const draft = backend.buildDraftOrder({
    conversationSessionId: session.id,
    businessId: "business_0001",
    customerPhone: "+13125550100",
    fulfillmentType: "pickup",
    items: [{ item: "Egg Rolls", quantity: 1 }]
  });
  const orderId = (draft.order as { id: string }).id;

  const confirmed = backend.confirmOrder({
    businessId: "business_0001",
    conversationSessionId: session.id,
    orderId
  });

  assert.equal(confirmed.confirmed, true);
  const state = JSON.parse(await readFile(statePath, "utf8")) as ReturnType<BackendDataStore["read"]>;
  assert.equal(state.orders[0]!.status, "confirmed");
  assert.equal(state.orders[0]!.confirmedAt?.startsWith("20"), true);
  assert.deepEqual(
    state.orderStatusHistory.map((entry) => entry.toStatus),
    ["draft", "awaiting_confirmation", "confirmed"]
  );
  assert.equal(state.conversationSessions[0]!.currentState, "confirmed");
  assert.equal(state.businessEvents.at(-1)!.type, "order.confirmed");
});
