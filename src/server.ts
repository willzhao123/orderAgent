import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { BackendAgent } from "./agent/backendAgent.ts";

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) throw new Error("GEMINI_API_KEY is required");

const skillsPath = fileURLToPath(new URL("../.agents/skills", import.meta.url));
const menuPath = fileURLToPath(new URL("../data/menu.json", import.meta.url));

const server = createServer(async (request, response) => {
  response.setHeader("Content-Type", "application/json");

  if (request.method === "GET" && request.url === "/health") {
    response.end(JSON.stringify({ status: "ok" }));
    return;
  }

  if (request.method === "POST" && request.url === "/chat") {
    try {
      let body = "";
      for await (const chunk of request) body += chunk;

      const { message } = JSON.parse(body);
      if (typeof message !== "string" || !message.trim()) {
        response.statusCode = 400;
        response.end(JSON.stringify({ error: "message is required" }));
        return;
      }

      const agent = await BackendAgent.create({
        apiKey,
        model: process.env.GEMINI_MODEL ?? "gemini-3.6-flash",
        skillsPath,
        menuPath,
        faqFallbackEnabled:
          process.env.BACKEND_FAQ_FALLBACK_ENABLED === "true"
      });

      const reply = await agent.chat(message);
      response.end(JSON.stringify({
        reply,
        response: reply
      }));
    } catch (error) {
      response.statusCode = 500;
      response.end(JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error"
      }));
    }
    return;
  }

  response.statusCode = 404;
  response.end(JSON.stringify({ error: "Not found" }));
});

const port = Number(process.env.PORT ?? 10000);
server.listen(port, "0.0.0.0", () => {
  console.log(`Listening on port ${port}`);
});
