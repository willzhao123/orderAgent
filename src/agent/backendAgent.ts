import { fileURLToPath } from "node:url";
import { loadMenu } from "../catalog/menu.ts";
import { MenuService } from "../catalog/menuService.ts";
import { loadRestaurantFaq } from "../catalog/restaurantFaq.ts";
import { RestaurantFaqService } from "../catalog/restaurantFaqService.ts";
import { GeminiClient } from "../gemini/geminiClient.ts";
import type { ApiResponse, FetchLike, FunctionCall, GeminiContent } from "../gemini/geminiTypes.ts";
import { OrderService, type OrderStore } from "../orders/orderService.ts";
import { BackendDataStore } from "../persistence/backendDataStore.ts";
import { MemorySessionStore, type SessionStore } from "../persistence/sessionStore.ts";
import { SkillExecutor } from "../skills/skillExecutor.ts";
import { loadSkills, type SkillDefinition } from "../skills/skillLoader.ts";
import { loadSkillSettings } from "../skills/skillSettings.ts";
import { ReceptionistBackend } from "./receptionistBackend.ts";

export class BackendAgent {
  private readonly skills: SkillDefinition[];
  private readonly executor: SkillExecutor;
  private readonly gemini: GeminiClient;
  private readonly receptionistBackend?: ReceptionistBackend;
  private readonly businessId: string;
  private readonly locationId?: string;
  private readonly sessionStore: SessionStore;
  private currentSessionId?: string;
  private currentReceptionistSessionId?: string;

  private constructor(
    apiKey: string,
    model: string,
    skills: SkillDefinition[],
    executor: SkillExecutor,
    fetcher: FetchLike,
    businessId: string,
    sessionStore: SessionStore,
    locationId?: string,
    receptionistBackend?: ReceptionistBackend
  ) {
    this.skills = skills;
    this.executor = executor;
    this.gemini = new GeminiClient(apiKey, model, skills, fetcher);
    this.businessId = businessId;
    this.sessionStore = sessionStore;
    this.locationId = locationId;
    this.receptionistBackend = receptionistBackend;
  }

  static async create(options: {
    apiKey: string;
    model: string;
    skillsPath: string;
    settingsPath?: string;
    menuPath: string;
    faqPath?: string;
    faqFallbackEnabled?: boolean;
    backendStatePath?: string;
    businessId?: string;
    locationId?: string;
    fetcher?: FetchLike;
    sessionStore?: SessionStore;
    orderStore?: OrderStore;
  }): Promise<BackendAgent> {
    const settings = await loadSkillSettings(
      options.settingsPath ??
        fileURLToPath(new URL("../../data/settings.json", import.meta.url))
    );
    const faqFallbackEnabled = options.faqFallbackEnabled ?? false;
    const loadedSkills = await loadSkills(options.skillsPath, settings);
    const skills = faqFallbackEnabled
      ? loadedSkills
      : loadedSkills.filter((skill) => skill.name !== "answer_restaurant_faq");
    const menu = await loadMenu(options.menuPath);
    const menuService = new MenuService(menu);
    const restaurantFaqService = faqFallbackEnabled
      ? new RestaurantFaqService(
          await loadRestaurantFaq(
            options.faqPath ??
              fileURLToPath(new URL("../../data/faq.json", import.meta.url))
          )
        )
      : undefined;
    const backendStatePath = options.backendStatePath ?? "data/backend-state.json";
    const backendDataStore = new BackendDataStore(backendStatePath);
    const receptionistBackend = options.backendStatePath
      ? new ReceptionistBackend(menuService, backendDataStore)
      : undefined;
    const businessId = options.businessId ?? "business_0001";
    const orderService = new OrderService(
      menuService,
      options.orderStore ?? backendDataStore
    );

    return new BackendAgent(
      options.apiKey,
      options.model,
      skills,
      new SkillExecutor(
        menuService,
        orderService,
        restaurantFaqService,
        {
          businessId,
          ...(options.locationId ? { locationId: options.locationId } : {})
        },
        skills.map((skill) => skill.name)
      ),
      options.fetcher ?? fetch,
      businessId,
      options.sessionStore ?? new MemorySessionStore(),
      options.locationId,
      receptionistBackend
    );
  }

  async startPhoneCall(options: {
    callerPhone?: string;
    toPhone?: string;
    provider?: string;
    providerCallId?: string;
  } = {}): Promise<string> {
    const sessionId = await this.sessionStore.createSession(options.callerPhone);
    if (this.receptionistBackend) {
      const session = this.receptionistBackend.createPhoneSession({
        businessId: this.businessId,
        ...(this.locationId ? { locationId: this.locationId } : {}),
        ...options
      });
      this.currentReceptionistSessionId = session.id;
    }

    this.currentSessionId = sessionId;
    return sessionId;
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
    const sessionId = await this.ensureSession(options.sessionId);
    if (this.receptionistBackend && this.currentReceptionistSessionId) {
      this.receptionistBackend!.addCallerTurn({
        conversationSessionId: this.currentReceptionistSessionId,
        businessId: this.businessId,
        ...(this.locationId ? { locationId: this.locationId } : {}),
        text: message
      });
    }

    const userContent: GeminiContent = {
      role: "user",
      parts: [{ text: message }]
    };
    await this.sessionStore.appendMessage(sessionId, "user", userContent);

    let response = await this.gemini.createResponse(
      await this.sessionStore.getHistory(sessionId)
    );

    for (let step = 0; step < 3; step += 1) {
      const modelContent = response.candidates?.[0]?.content;
      if (!modelContent) throw new Error("The API returned no candidate content.");

      await this.sessionStore.appendMessage(sessionId, "model", modelContent);
      const calls = this.readFunctionCalls(modelContent);

      if (calls.length === 0) {
        if (step === 0 && this.executor.requiresSkill(message)) {
          throw new Error("The model answered without calling a required skill.");
        }
        const text = this.readText(response);
        if (this.receptionistBackend && this.currentReceptionistSessionId) {
          this.receptionistBackend!.addAgentTurn({
            conversationSessionId: this.currentReceptionistSessionId,
            businessId: this.businessId,
            ...(this.locationId ? { locationId: this.locationId } : {}),
            text
          });
        }
        return text;
      }

      const toolContent: GeminiContent = {
        role: "user",
        parts: []
      };
      for (const call of calls) {
          const skill = this.skills.find((candidate) => candidate.name === call.name);
          if (!skill) throw new Error(`Model requested an unknown skill: ${call.name}`);

          onSkillDiscovered?.(skill.name);
          let toolResponse: Record<string, unknown>;
          try {
            toolResponse = await this.executor.execute(skill.name, call.args ?? {}, {
              conversationSessionId: sessionId
            });
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            const errorContent: GeminiContent = {
              role: "user",
              parts: [{
                functionResponse: {
                  name: skill.name,
                  response: { error: errorMessage },
                  ...(call.id ? { id: call.id } : {})
                }
              }]
            };
            await this.sessionStore.appendMessage(sessionId, "tool", errorContent);
            if (this.receptionistBackend && this.currentReceptionistSessionId) {
              this.receptionistBackend!.recordToolExecution({
                sessionId: this.currentReceptionistSessionId,
                name: skill.name,
                ...(call.id ? { toolCallId: call.id } : {}),
                args: call.args ?? {},
                errorMessage
              });
            }
            throw error;
          }
          if (this.receptionistBackend && this.currentReceptionistSessionId) {
            this.receptionistBackend!.recordToolExecution({
              sessionId: this.currentReceptionistSessionId,
              name: skill.name,
              ...(call.id ? { toolCallId: call.id } : {}),
              args: call.args ?? {},
              response: toolResponse
            });
          }
          toolContent.parts.push({
            functionResponse: {
              name: skill.name,
              response: toolResponse,
              ...(call.id ? { id: call.id } : {})
            }
          });
      }

      await this.sessionStore.appendMessage(sessionId, "tool", toolContent);
      response = await this.gemini.createResponse(
        await this.sessionStore.getHistory(sessionId)
      );
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

  private async ensureSession(sessionId?: string): Promise<string> {
    if (sessionId) {
      if (sessionId !== this.currentSessionId) {
        this.currentReceptionistSessionId = undefined;
      }
      this.currentSessionId = sessionId;
      return sessionId;
    }
    if (this.currentSessionId) return this.currentSessionId;
    return await this.startPhoneCall();
  }
}
