import { BackendDataStore } from "./backendDataStore.ts";
import { GeminiClient } from "./geminiClient.ts";
import type { ApiResponse, FetchLike, FunctionCall, GeminiContent } from "./geminiTypes.ts";
import { loadMenu } from "./menu.ts";
import { OrderService } from "./orderService.ts";
import { ReceptionistBackend } from "./receptionistBackend.ts";
import { SkillExecutor } from "./skillExecutor.ts";
import { loadSkills, type SkillDefinition } from "./skills.ts";

export class BackendAgent {
  private readonly skills: SkillDefinition[];
  private readonly executor: SkillExecutor;
  private readonly gemini: GeminiClient;
  private readonly receptionistBackend?: ReceptionistBackend;
  private readonly businessId: string;
  private readonly locationId?: string;
  private readonly history: GeminiContent[] = [];
  private currentSessionId?: string;

  private constructor(
    apiKey: string,
    model: string,
    skills: SkillDefinition[],
    executor: SkillExecutor,
    fetcher: FetchLike,
    businessId: string,
    locationId?: string,
    receptionistBackend?: ReceptionistBackend
  ) {
    this.skills = skills;
    this.executor = executor;
    this.gemini = new GeminiClient(apiKey, model, skills, fetcher);
    this.businessId = businessId;
    this.locationId = locationId;
    this.receptionistBackend = receptionistBackend;
  }

  static async create(options: {
    apiKey: string;
    model: string;
    skillsPath: string;
    menuPath: string;
    backendStatePath?: string;
    businessId?: string;
    locationId?: string;
    fetcher?: FetchLike;
  }): Promise<BackendAgent> {
    const skills = await loadSkills(options.skillsPath);
    const menu = await loadMenu(options.menuPath);
    const backendStatePath = options.backendStatePath ?? "data/backend-state.json";
    const backendDataStore = new BackendDataStore(backendStatePath);
    const receptionistBackend = options.backendStatePath
      ? new ReceptionistBackend(menu, backendDataStore)
      : undefined;
    const businessId = options.businessId ?? "business_0001";
    const orderService = new OrderService(menu, backendDataStore);

    return new BackendAgent(
      options.apiKey,
      options.model,
      skills,
      new SkillExecutor(menu, orderService, {
        businessId,
        ...(options.locationId ? { locationId: options.locationId } : {})
      }),
      options.fetcher ?? fetch,
      businessId,
      options.locationId,
      receptionistBackend
    );
  }

  startPhoneCall(options: {
    callerPhone?: string;
    toPhone?: string;
    provider?: string;
    providerCallId?: string;
  } = {}): string {
    if (!this.receptionistBackend) {
      throw new Error("BackendAgent was created without backendStatePath; session persistence is disabled.");
    }

    const session = this.receptionistBackend.createPhoneSession({
      businessId: this.businessId,
      ...(this.locationId ? { locationId: this.locationId } : {}),
      ...options
    });
    this.currentSessionId = session.id;
    return session.id;
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
    onSkillDiscovered?: (name: string) => void,
    options: { sessionId?: string } = {}
  ): Promise<string> {
    const sessionId = this.ensureSession(options.sessionId);
    if (sessionId) {
      this.receptionistBackend!.addCallerTurn({
        conversationSessionId: sessionId,
        businessId: this.businessId,
        ...(this.locationId ? { locationId: this.locationId } : {}),
        text: message
      });
    }

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
        const text = this.readText(response);
        if (sessionId) {
          this.receptionistBackend!.addAgentTurn({
            conversationSessionId: sessionId,
            businessId: this.businessId,
            ...(this.locationId ? { locationId: this.locationId } : {}),
            text
          });
        }
        return text;
      }

      const toolContent: GeminiContent = {
        role: "user",
        parts: calls.map((call) => {
          const skill = this.skills.find((candidate) => candidate.name === call.name);
          if (!skill) throw new Error(`Model requested an unknown skill: ${call.name}`);

          onSkillDiscovered?.(skill.name);
          let toolResponse: Record<string, unknown>;
          try {
            toolResponse = this.executor.execute(skill.name, call.args ?? {}, {
              ...(sessionId ? { conversationSessionId: sessionId } : {})
            });
          } catch (error) {
            if (sessionId) {
              this.receptionistBackend!.recordToolExecution({
                sessionId,
                name: skill.name,
                ...(call.id ? { toolCallId: call.id } : {}),
                args: call.args ?? {},
                errorMessage: error instanceof Error ? error.message : String(error)
              });
            }
            throw error;
          }
          if (sessionId) {
            this.receptionistBackend!.recordToolExecution({
              sessionId,
              name: skill.name,
              ...(call.id ? { toolCallId: call.id } : {}),
              args: call.args ?? {},
              response: toolResponse
            });
          }
          return {
            functionResponse: {
              name: skill.name,
              response: toolResponse,
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

  private ensureSession(sessionId?: string): string | undefined {
    if (!this.receptionistBackend) return undefined;
    if (sessionId) {
      this.currentSessionId = sessionId;
      return sessionId;
    }
    if (this.currentSessionId) return this.currentSessionId;
    return this.startPhoneCall();
  }
}
