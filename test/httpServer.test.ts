import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { BackendAgent } from "../src/agent/backendAgent.ts";
import { BackendDataStore } from "../src/persistence/backendDataStore.ts";
import {
  createHttpServer,
  type ChatAgent,
  type ExternalSessionStore
} from "../src/http/httpServer.ts";
import { MemorySessionStore, PostgresSessionStore } from "../src/persistence/sessionStore.ts";

const bearerToken = "test-backend-token";
const authorization = { authorization: `Bearer ${bearerToken}` };
const skillsPath = fileURLToPath(new URL("../.agents/skills", import.meta.url));
const menuPath = fileURLToPath(new URL("../data/menu.json", import.meta.url));
const allSkillsSettingsPath = fileURLToPath(
  new URL("./fixtures/all-skills-settings.json", import.meta.url)
);

class TestExternalSessionStore
  extends MemorySessionStore
  implements ExternalSessionStore {
  readonly externalToInternal = new Map<string, string>();
  readonly providerCallIds = new Map<string, string>();

  async getOrCreateExternalSession(
    externalSessionId: string,
    providerCallId?: string
  ): Promise<string> {
    let internalSessionId = this.externalToInternal.get(externalSessionId);
    if (!internalSessionId) {
      internalSessionId = await this.createSession();
      this.externalToInternal.set(externalSessionId, internalSessionId);
    }
    if (providerCallId) {
      this.providerCallIds.set(externalSessionId, providerCallId);
    }
    return internalSessionId;
  }
}

function textResponse(text: string): unknown {
  return {
    candidates: [
      {
        content: {
          role: "model",
          parts: [{ text }]
        }
      }
    ]
  };
}

function toolCallResponse(
  name: string,
  args: Record<string, unknown>,
  id = "call_1"
): unknown {
  return {
    candidates: [
      {
        content: {
          role: "model",
          parts: [{ functionCall: { name, args, id } }]
        }
      }
    ]
  };
}

function fakeFetchWith(
  responses: unknown[],
  requestBodies: unknown[]
): (input: string | URL | Request, init?: RequestInit) => Promise<Response> {
  return async (_input, init) => {
    requestBodies.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify(responses.shift()), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  };
}

test("health and readiness endpoints expose process and dependency status", async (t) => {
  let ready = true;
  const server = createHttpServer({
    bearerToken,
    agent: { chat: async () => "unused" },
    sessionStore: new TestExternalSessionStore(),
    readyCheck: async () => {
      if (!ready) throw new Error("database unavailable");
    }
  });
  t.after(() => server.close());

  const health = await server.inject({ method: "GET", url: "/health" });
  assert.equal(health.statusCode, 200);
  assert.deepEqual(health.json(), { status: "ok" });

  const firstReady = await server.inject({ method: "GET", url: "/ready" });
  assert.equal(firstReady.statusCode, 200);
  assert.deepEqual(firstReady.json(), { status: "ready" });

  ready = false;
  const unavailable = await server.inject({ method: "GET", url: "/ready" });
  assert.equal(unavailable.statusCode, 503);
  assert.deepEqual(unavailable.json(), { status: "not_ready" });
});

test("POST /v1/chat requires the configured bearer token", async (t) => {
  let chatCalls = 0;
  const server = createHttpServer({
    bearerToken,
    agent: {
      chat: async () => {
        chatCalls += 1;
        return "unused";
      }
    },
    sessionStore: new TestExternalSessionStore()
  });
  t.after(() => server.close());

  for (const headers of [{}, { authorization: "Bearer wrong-token" }]) {
    const response = await server.inject({
      method: "POST",
      url: "/v1/chat",
      headers,
      payload: { message: "Do you have beef pho?", sessionId: "voice-1" }
    });
    assert.equal(response.statusCode, 401);
    assert.deepEqual(response.json(), { error: "Unauthorized." });
    assert.equal(response.headers["www-authenticate"], "Bearer");
  }

  assert.equal(chatCalls, 0);
});

test("POST /v1/chat validates its JSON body", async (t) => {
  const server = createHttpServer({
    bearerToken,
    agent: { chat: async () => "unused" },
    sessionStore: new TestExternalSessionStore()
  });
  t.after(() => server.close());

  const invalidPayloads = [
    {},
    { message: "hello" },
    { sessionId: "voice-1" },
    { message: 42, sessionId: "voice-1" },
    { message: "hello", sessionId: 42 },
    { message: "   ", sessionId: "voice-1" },
    { message: "hello", sessionId: "   " },
    { message: "hello", sessionId: "voice-1", callSid: "   " },
    { message: "hello", sessionId: "voice-1", unexpected: true }
  ];

  for (const payload of invalidPayloads) {
    const response = await server.inject({
      method: "POST",
      url: "/v1/chat",
      headers: authorization,
      payload
    });
    assert.equal(response.statusCode, 400);
    assert.equal(typeof response.json().error, "string");
  }

  const malformedJson = await server.inject({
    method: "POST",
    url: "/v1/chat",
    headers: {
      ...authorization,
      "content-type": "application/json"
    },
    payload: '{"message":'
  });
  assert.equal(malformedJson.statusCode, 400);
  assert.deepEqual(malformedJson.json(), { error: "Invalid request body." });
});

test("POST /v1/chat returns the voice-agent response contract", async (t) => {
  const sessions = new TestExternalSessionStore();
  const calls: Array<{ message: string; sessionId?: string }> = [];
  const agent: ChatAgent = {
    chat: async (message, _onSkillDiscovered, options) => {
      calls.push({ message, sessionId: options?.sessionId });
      return "Yes, beef pho is available.";
    }
  };
  const server = createHttpServer({
    bearerToken,
    agent,
    sessionStore: sessions
  });
  t.after(() => server.close());

  const response = await server.inject({
    method: "POST",
    url: "/v1/chat",
    headers: authorization,
    payload: {
      message: "Do you have beef pho?",
      sessionId: "voice-session-id",
      callSid: "CA123"
    }
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { response: "Yes, beef pho is available." });
  assert.deepEqual(calls, [
    { message: "Do you have beef pho?", sessionId: "session_0001" }
  ]);
  assert.equal(sessions.providerCallIds.get("voice-session-id"), "CA123");
});

test("rejects malformed backend-agent responses", async (t) => {
  const malformedResponses: unknown[] = [undefined, 42, "", "   "];
  const server = createHttpServer({
    bearerToken,
    agent: {
      chat: async () => malformedResponses.shift() as string
    },
    sessionStore: new TestExternalSessionStore()
  });
  t.after(() => server.close());

  for (let index = 0; index < 4; index += 1) {
    const response = await server.inject({
      method: "POST",
      url: "/v1/chat",
      headers: authorization,
      payload: { message: "hello", sessionId: `voice-${index}` }
    });
    assert.equal(response.statusCode, 502);
    assert.deepEqual(response.json(), {
      error: "Backend agent returned an invalid response."
    });
  }
});

test("handles a backend agent that rejects a malformed model response", async (t) => {
  const server = createHttpServer({
    bearerToken,
    agent: {
      chat: async () => {
        throw new Error("The API returned no assistant text.");
      }
    },
    sessionStore: new TestExternalSessionStore()
  });
  t.after(() => server.close());

  const response = await server.inject({
    method: "POST",
    url: "/v1/chat",
    headers: authorization,
    payload: { message: "hello", sessionId: "voice-1" }
  });

  assert.equal(response.statusCode, 502);
  assert.deepEqual(response.json(), {
    error: "The backend agent failed to produce a response."
  });
});

test("reuses one internal session and isolates distinct external sessions", async (t) => {
  const sessions = new TestExternalSessionStore();
  const internalSessionIds: Array<string | undefined> = [];
  const server = createHttpServer({
    bearerToken,
    agent: {
      chat: async (_message, _onSkillDiscovered, options) => {
        internalSessionIds.push(options?.sessionId);
        return "ok";
      }
    },
    sessionStore: sessions
  });
  t.after(() => server.close());

  for (const sessionId of ["voice-a", "voice-a", "voice-b", "voice-a"]) {
    const response = await server.inject({
      method: "POST",
      url: "/v1/chat",
      headers: authorization,
      payload: { message: "hello", sessionId }
    });
    assert.equal(response.statusCode, 200);
  }

  assert.deepEqual(internalSessionIds, [
    "session_0001",
    "session_0001",
    "session_0002",
    "session_0001"
  ]);
  assert.equal(sessions.externalToInternal.size, 2);
});

test("preserves a draft order across two HTTP turns", async (t) => {
  const tempDir = await mkdtemp(join(tmpdir(), "backend-http-order-"));
  const backendStatePath = join(tempDir, "backend-state.json");
  const requestBodies: unknown[] = [];
  const sessionStore = new TestExternalSessionStore();
  const agent = await BackendAgent.create({
    apiKey: "test-key",
    model: "test-model",
    skillsPath,
    settingsPath: allSkillsSettingsPath,
    menuPath,
    backendStatePath,
    sessionStore,
    fetcher: fakeFetchWith(
      [
        toolCallResponse("create_order", {
          items: [{ item: "Egg Rolls", quantity: 1 }]
        }),
        textResponse("I started a draft order with one egg roll."),
        toolCallResponse("add_item_to_order", {
          order_id: "order_0001",
          item: "Chicken Pho",
          quantity: 1
        }),
        textResponse("I added one chicken pho.")
      ],
      requestBodies
    )
  });
  const server = createHttpServer({ bearerToken, agent, sessionStore });
  t.after(() => server.close());

  const firstTurn = await server.inject({
    method: "POST",
    url: "/v1/chat",
    headers: authorization,
    payload: {
      message: "I want one egg roll.",
      sessionId: "voice-order-session"
    }
  });
  assert.equal(firstTurn.statusCode, 200);

  const secondTurn = await server.inject({
    method: "POST",
    url: "/v1/chat",
    headers: authorization,
    payload: {
      message: "Add one chicken pho.",
      sessionId: "voice-order-session"
    }
  });
  assert.equal(secondTurn.statusCode, 200);
  assert.deepEqual(secondTurn.json(), { response: "I added one chicken pho." });
  assert.equal(sessionStore.externalToInternal.size, 1);

  const state = new BackendDataStore(backendStatePath).read();
  assert.equal(state.orders.length, 1);
  assert.deepEqual(
    state.orders[0]!.items.map((item) => [item.name, item.quantity]),
    [["Egg Rolls", 1], ["Chicken Pho", 1]]
  );

  const secondTurnRequest = requestBodies[2] as {
    contents: Array<{ parts: Array<{ text?: string }> }>;
  };
  assert.equal(
    secondTurnRequest.contents.some((content) =>
      content.parts.some((part) => part.text === "I want one egg roll.")
    ),
    true
  );
});

test("Postgres external session mapping uses one atomic upsert", async () => {
  const calls: Array<{ text: string; values: unknown[] }> = [];
  const pool = {
    query: async (text: string, values: unknown[]) => {
      calls.push({ text, values });
      return { rows: [{ id: "internal-uuid" }] };
    }
  };
  const store = new PostgresSessionStore(pool as never);

  const sessionId = await store.getOrCreateExternalSession("voice-1", "CA123");

  assert.equal(sessionId, "internal-uuid");
  assert.equal(calls.length, 1);
  assert.match(calls[0]!.text, /ON CONFLICT \(external_session_id\) DO UPDATE/);
  assert.match(calls[0]!.text, /RETURNING id/);
  assert.deepEqual(calls[0]!.values, ["voice-1", "CA123"]);
});
