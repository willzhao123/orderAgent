import { fileURLToPath } from "node:url";
import { BackendAgent } from "./agent/backendAgent.ts";
import { createHttpServer } from "./http/httpServer.ts";
import { PostgresOrderStore } from "./orders/postgresOrderStore.ts";
import { db } from "./persistence/db.ts";
import { PostgresSessionStore } from "./persistence/sessionStore.ts";

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey || apiKey === "replace_with_your_key") {
  throw new Error("GEMINI_API_KEY is missing.");
}

const bearerToken = process.env.BACKEND_BEARER_TOKEN;
if (!bearerToken) {
  throw new Error("BACKEND_BEARER_TOKEN is missing.");
}

const portText = process.env.PORT ?? "3000";
const port = Number(portText);
if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error(`PORT must be an integer between 1 and 65535; received ${portText}.`);
}

const skillsPath = fileURLToPath(new URL("../.agents/skills", import.meta.url));
const menuPath = fileURLToPath(new URL("../data/menu.json", import.meta.url));
const faqPath = fileURLToPath(new URL("../data/restaurant-faq.json", import.meta.url));

const sessionStore = new PostgresSessionStore(db);
const orderStore = new PostgresOrderStore(db);
const agent = await BackendAgent.create({
  apiKey,
  model: process.env.GEMINI_MODEL ?? "gemini-3.6-flash",
  skillsPath,
  menuPath,
  faqPath,
  sessionStore,
  orderStore,
  businessId: process.env.BUSINESS_ID ?? "business_0001",
  locationId: process.env.LOCATION_ID
});

const server = createHttpServer({
  agent,
  sessionStore,
  bearerToken,
  readyCheck: async () => {
    await db.query("SELECT 1");
  },
  logger: true
});

let shuttingDown = false;
async function shutDown(): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  await server.close();
  await db.end();
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void shutDown()
      .then(() => process.exit(0))
      .catch((error) => {
        console.error(error);
        process.exit(1);
      });
  });
}

try {
  await server.listen({ host: "0.0.0.0", port });
} catch (error) {
  await db.end();
  throw error;
}
