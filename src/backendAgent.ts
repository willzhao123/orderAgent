import { GeminiClient } from "./geminiClient.ts";
import type { ApiResponse, FetchLike, FunctionCall, GeminiContent } from "./geminiTypes.ts";
import { loadMenu } from "./menu.ts";
import { SkillExecutor } from "./skillExecutor.ts";
import { loadSkills, type SkillDefinition } from "./skills.ts";

export class BackendAgent {
  private readonly skills: SkillDefinition[];
  private readonly executor: SkillExecutor;
  private readonly gemini: GeminiClient;
  private readonly history: GeminiContent[] = [];

  private constructor(
    apiKey: string,
    model: string,
    skills: SkillDefinition[],
    executor: SkillExecutor,
    fetcher: FetchLike
  ) {
    this.skills = skills;
    this.executor = executor;
    this.gemini = new GeminiClient(apiKey, model, skills, fetcher);
  }

  static async create(options: {
    apiKey: string;
    model: string;
    skillsPath: string;
    menuPath: string;
    fetcher?: FetchLike;
  }): Promise<BackendAgent> {
    const skills = await loadSkills(options.skillsPath);
    const menu = await loadMenu(options.menuPath);

    return new BackendAgent(
      options.apiKey,
      options.model,
      skills,
      new SkillExecutor(menu),
      options.fetcher ?? fetch
    );
  }

  describeSkills(): string {
    return [
      `I loaded ${this.skills.length} skill${this.skills.length === 1 ? "" : "s"}:`,
      ...this.skills.map(
        (skill) => `- ${skill.codexName} (${skill.name}): ${skill.description}`
      )
    ].join("\n");
  }

  async chat(
    message: string,
    onSkillDiscovered?: (name: string) => void
  ): Promise<string> {
    const userContent: GeminiContent = {
      role: "user",
      parts: [{ text: message }]
    };
    this.history.push(userContent);

    let response = await this.gemini.createResponse(this.history);

    for (let step = 0; step < 3; step += 1) {
      const modelContent = response.candidates?.[0]?.content;
      if (!modelContent) throw new Error("The API returned no candidate content.");

      this.history.push(modelContent);
      const calls = this.readFunctionCalls(modelContent);

      if (calls.length === 0) {
        if (step === 0 && this.executor.requiresSkill(message)) {
          throw new Error("The model answered without calling a required skill.");
        }
        return this.readText(response);
      }

      const toolContent: GeminiContent = {
        role: "user",
        parts: calls.map((call) => {
          const skill = this.skills.find((candidate) => candidate.name === call.name);
          if (!skill) throw new Error(`Model requested an unknown skill: ${call.name}`);

          onSkillDiscovered?.(skill.name);
          return {
            functionResponse: {
              name: skill.name,
              response: this.executor.execute(skill.name, call.args ?? {}),
              ...(call.id ? { id: call.id } : {})
            }
          };
        })
      };

      this.history.push(toolContent);
      response = await this.gemini.createResponse(this.history);
    }

    throw new Error("The agent exceeded the tool-call limit.");
  }

  private readText(response: ApiResponse): string {
    for (const part of response.candidates?.[0]?.content?.parts ?? []) {
      if ("text" in part && part.text) return part.text;
    }
    throw new Error("The API returned no assistant text.");
  }

  private readFunctionCalls(content: GeminiContent): FunctionCall[] {
    return content.parts.flatMap((part) =>
      "functionCall" in part ? [part.functionCall] : []
    );
  }
}
