import type { Menu } from "./menu.ts";
import type { OrderService, OrderServiceContext } from "./orderService.ts";
import { getSkillRegistryEntry, messageRequiresSkill } from "./skillRegistry.ts";

export class SkillExecutor {
  private readonly menu: Menu;
  private readonly orderService: OrderService;
  private readonly defaultOrderContext: OrderServiceContext;

  constructor(menu: Menu, orderService: OrderService, defaultOrderContext: OrderServiceContext) {
    this.menu = menu;
    this.orderService = orderService;
    this.defaultOrderContext = defaultOrderContext;
  }

  execute(
    name: string,
    input: Record<string, unknown>,
    orderContext: Partial<OrderServiceContext> = {}
  ): Record<string, unknown> {
    const registryEntry = getSkillRegistryEntry(name);
    if (!registryEntry) throw new Error(`No trusted handler exists for skill: ${name}`);
    return registryEntry.execute({
      menu: this.menu,
      orderService: this.orderService,
      orderContext: {
        ...this.defaultOrderContext,
        ...orderContext
      }
    }, input);
  }

  requiresSkill(message: string): boolean {
    return messageRequiresSkill(message);
  }
}
