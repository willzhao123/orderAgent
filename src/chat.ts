import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { fileURLToPath } from "node:url";
import { BackendAgent } from "./backendAgent.ts";

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey || apiKey === "replace_with_your_key") {
  console.error(
    "Add GEMINI_API_KEY to .env, then run ./run-chat.sh or npm run chat."
  );
  process.exit(1);
}

const skillsPath = fileURLToPath(new URL("../.agents/skills", import.meta.url));
const menuPath = fileURLToPath(new URL("../data/menu.json", import.meta.url));
const backendStatePath = fileURLToPath(new URL("../data/backend-state.json", import.meta.url));
const agent = await BackendAgent.create({
  apiKey,
  model: process.env.GEMINI_MODEL ?? "gemini-3.6-flash",
  skillsPath,
  menuPath,
  backendStatePath,
  businessId: process.env.BUSINESS_ID ?? "business_0001",
  locationId: process.env.LOCATION_ID
});

console.log(`\nBackend agent:\n${agent.describeSkills()}`);
console.log('\nTry: "What skills can you do?", "Do you have beef pho?", or "I want 2 egg rolls."');
console.log('Type "exit" to stop.\n');

const terminal = createInterface({ input, output });
while (true) {
  let answer: string;
  try {
    answer = await terminal.question("You: ");
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      error.code === "ERR_USE_AFTER_CLOSE"
    ) {
      break;
    }
    throw error;
  }

  const message = answer.trim();
  if (!message) continue;
  if (message.toLowerCase() === "exit") break;

  try {
    const reply = await agent.chat(message, (skillName) => {
      console.log(`[discovered skill: ${skillName}]`);
    });
    console.log(`Backend agent: ${reply}\n`);
  } catch (error) {
    console.error(
      `Backend agent error: ${error instanceof Error ? error.message : String(error)}\n`
    );
  }
}

terminal.close();
