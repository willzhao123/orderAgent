import type { Menu } from "./menu.ts";
import { getSkillRegistryEntry, messageRequiresSkill } from "./skillRegistry.ts";

export class SkillExecutor {
  private readonly menu: Menu;

  constructor(menu: Menu) {
    this.menu = menu;
  }

  execute(name: string, input: Record<string, unknown>): Record<string, unknown> {
    const registryEntry = getSkillRegistryEntry(name);
    if (!registryEntry) throw new Error(`No trusted handler exists for skill: ${name}`);
    return registryEntry.execute({ menu: this.menu }, input);
  }

  requiresSkill(message: string): boolean {
    return messageRequiresSkill(message);
  }
}
