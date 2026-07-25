import type { ApiResponse, FetchLike, GeminiContent } from "./geminiTypes.ts";
import type { SkillDefinition } from "./skills.ts";

export class GeminiClient {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly skills: SkillDefinition[];
  private readonly fetcher: FetchLike;

  constructor(
    apiKey: string,
    model: string,
    skills: SkillDefinition[],
    fetcher: FetchLike
  ) {
    this.apiKey = apiKey;
    this.model = model;
    this.skills = skills;
    this.fetcher = fetcher;
  }

  async createResponse(contents: GeminiContent[]): Promise<ApiResponse> {
    const response = await this.fetcher(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
        this.model
      )}:generateContent`,
      {
        method: "POST",
        headers: {
          "x-goog-api-key": this.apiKey,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: this.createSystemInstruction() }]
          },
          contents,
          tools: [
            {
              functionDeclarations: this.skills.map((skill) => ({
                name: skill.name,
                description: skill.description,
                parameters: toGeminiSchema(skill.parameters)
              }))
            }
          ]
        })
      }
    );

    if (!response.ok) {
      throw new Error(`Gemini API ${response.status}: ${await response.text()}`);
    }
    return (await response.json()) as ApiResponse;
  }

  private createSystemInstruction(): string {
    return [
      "You are a minimal backend agent. Tell the user about your registered skills when asked.",
      "Use check_menu_item whenever the user asks whether a menu item exists.",
      "Use list_food whenever the user asks what food or menu items are available.",
      "Never invent skills or menu results.",
      "Registered skill instructions:",
      ...this.skills.map(
        (skill) => `${skill.name} from ${skill.sourcePath}:\n${skill.instructions}`
      )
    ].join("\n\n");
  }
}

function toGeminiSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => toGeminiSchema(item));
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => key !== "additionalProperties")
      .map(([key, entry]) => [key, toGeminiSchema(entry)])
  );
}
