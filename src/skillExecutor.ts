import type { Menu } from "./menu.ts";
import type { OrderStore } from "./orders.ts";
import { getSkillRegistryEntry, messageRequiresSkill } from "./skillRegistry.ts";

export class SkillExecutor {
  private readonly menu: Menu;
  private readonly orderStore: OrderStore;

  constructor(menu: Menu, orderStore: OrderStore) {
    this.menu = menu;
    this.orderStore = orderStore;
  }

  execute(name: string, input: Record<string, unknown>): Record<string, unknown> {
    const registryEntry = getSkillRegistryEntry(name);
    if (!registryEntry) throw new Error(`No trusted handler exists for skill: ${name}`);
    return registryEntry.execute({ menu: this.menu, orderStore: this.orderStore }, input);
  }

  requiresSkill(message: string): boolean {
    return messageRequiresSkill(message);
  }
}
