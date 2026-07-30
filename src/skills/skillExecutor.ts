import type { MenuService } from "../catalog/menuService.ts";
import type { RestaurantFaqService } from "../catalog/restaurantFaqService.ts";
import type { OrderService, OrderServiceContext } from "../orders/orderService.ts";
import {
  SKILL_REGISTRY,
  getSkillRegistryEntry,
  messageRequiresSkill
} from "./skillRegistry.ts";

export class SkillExecutor {
  private readonly menuService: MenuService;
  private readonly orderService: OrderService;
  private readonly restaurantFaqService?: RestaurantFaqService;
  private readonly defaultOrderContext: OrderServiceContext;
  private readonly enabledSkillNames: Set<string>;

  constructor(
    menuService: MenuService,
    orderService: OrderService,
    restaurantFaqService: RestaurantFaqService | undefined,
    defaultOrderContext: OrderServiceContext,
    enabledSkillNames?: Iterable<string>
  ) {
    this.menuService = menuService;
    this.orderService = orderService;
    this.restaurantFaqService = restaurantFaqService;
    this.defaultOrderContext = defaultOrderContext;
    this.enabledSkillNames = new Set(
      enabledSkillNames ?? Object.keys(SKILL_REGISTRY)
    );
  }

  async execute(
    name: string,
    input: Record<string, unknown>,
    orderContext: Partial<OrderServiceContext> = {}
  ): Promise<Record<string, unknown>> {
    if (!this.enabledSkillNames.has(name)) {
      throw new Error(`Skill is disabled: ${name}`);
    }
    const registryEntry = getSkillRegistryEntry(name);
    if (!registryEntry) throw new Error(`No trusted handler exists for skill: ${name}`);
    return await registryEntry.execute({
      menuService: this.menuService,
      orderService: this.orderService,
      restaurantFaqService: this.restaurantFaqService,
      orderContext: {
        ...this.defaultOrderContext,
        ...orderContext
      }
    }, input);
  }

  requiresSkill(message: string): boolean {
    return messageRequiresSkill(message, this.enabledSkillNames);
  }
}
