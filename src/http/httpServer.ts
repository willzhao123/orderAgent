import { timingSafeEqual } from "node:crypto";
import Fastify, {
  type FastifyInstance,
  type FastifyServerOptions
} from "fastify";

/** Minimal agent contract exposed through the HTTP transport. */
export interface ChatAgent {
  chat(
    message: string,
    onSkillDiscovered?: (name: string) => void,
    options?: { sessionId?: string }
  ): Promise<string>;
}

export interface ExternalSessionStore {
  getOrCreateExternalSession(
    externalSessionId: string,
    providerCallId?: string
  ): Promise<string>;
}

export type HttpServerDependencies = {
  agent: ChatAgent;
  sessionStore: ExternalSessionStore;
  bearerToken: string;
  readyCheck?: () => Promise<void>;
  logger?: FastifyServerOptions["logger"];
};

type ChatBody = {
  message: string;
  sessionId: string;
  callSid?: string;
};

function tokensMatch(actual: string | undefined, expectedToken: string): boolean {
  if (!actual) return false;

  const expected = Buffer.from(`Bearer ${expectedToken}`);
  const supplied = Buffer.from(actual);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export function createHttpServer(
  dependencies: HttpServerDependencies
): FastifyInstance {
  if (!dependencies.bearerToken) {
    throw new Error("A non-empty bearer token is required.");
  }

  const server = Fastify({
    logger: dependencies.logger ?? false,
    ajv: {
      customOptions: {
        coerceTypes: false,
        removeAdditional: false
      }
    }
  });

  server.get("/health", async () => ({ status: "ok" }));

  server.get("/ready", async (_request, reply) => {
    try {
      await dependencies.readyCheck?.();
      return { status: "ready" };
    } catch {
      return reply.code(503).send({ status: "not_ready" });
    }
  });

  server.post<{ Body: ChatBody }>(
    "/v1/chat",
    {
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          required: ["message", "sessionId"],
          properties: {
            message: { type: "string", minLength: 1, maxLength: 10_000 },
            sessionId: { type: "string", minLength: 1, maxLength: 512 },
            callSid: { type: "string", minLength: 1, maxLength: 512 }
          }
        }
      },
      onRequest: async (request, reply) => {
        if (!tokensMatch(request.headers.authorization, dependencies.bearerToken)) {
          return reply
            .header("WWW-Authenticate", "Bearer")
            .code(401)
            .send({ error: "Unauthorized." });
        }
      }
    },
    async (request, reply) => {
      const message = request.body.message.trim();
      const externalSessionId = request.body.sessionId.trim();
      const providerCallId = request.body.callSid?.trim();

      if (
        !message ||
        !externalSessionId ||
        (request.body.callSid !== undefined && !providerCallId)
      ) {
        return reply
          .code(400)
          .send({ error: "message and sessionId must be non-empty strings." });
      }

      let internalSessionId: string;
      try {
        internalSessionId =
          await dependencies.sessionStore.getOrCreateExternalSession(
            externalSessionId,
            providerCallId
          );
      } catch (error) {
        request.log.error(error);
        return reply
          .code(500)
          .send({ error: "The chat session could not be created." });
      }

      let response: string;
      try {
        response = await dependencies.agent.chat(
          message,
          undefined,
          { sessionId: internalSessionId }
        );
      } catch (error) {
        request.log.error(error);
        return reply
          .code(502)
          .send({ error: "The backend agent failed to produce a response." });
      }

      if (typeof response !== "string" || response.trim().length === 0) {
        request.log.error("Backend agent returned an invalid response.");
        return reply
          .code(502)
          .send({ error: "Backend agent returned an invalid response." });
      }

      return { response };
    }
  );

  server.setErrorHandler((error, request, reply) => {
    if (error.validation || error.statusCode === 400) {
      return reply.code(400).send({ error: "Invalid request body." });
    }

    request.log.error(error);
    return reply.code(500).send({ error: "Internal server error." });
  });

  return server;
}
