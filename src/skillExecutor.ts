import type { MenuService } from "./menuService.ts";
import type { OrderService, OrderServiceContext } from "./orderService.ts";
import type { RestaurantFaqService } from "./restaurantFaqService.ts";
import { getSkillRegistryEntry, messageRequiresSkill } from "./skillRegistry.ts";

export class SkillExecutor {
  private readonly menuService: MenuService;
  private readonly orderService: OrderService;
  private readonly restaurantFaqService: RestaurantFaqService;
  private readonly defaultOrderContext: OrderServiceContext;

  constructor(
    menuService: MenuService,
    orderService: OrderService,
    restaurantFaqService: RestaurantFaqService,
    defaultOrderContext: OrderServiceContext
  ) {
    this.menuService = menuService;
    this.orderService = orderService;
    this.restaurantFaqService = restaurantFaqService;
    this.defaultOrderContext = defaultOrderContext;
  }

  async execute(
    name: string,
    input: Record<string, unknown>,
    orderContext: Partial<OrderServiceContext> = {}
  ): Promise<Record<string, unknown>> {
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
    return messageRequiresSkill(message);
  }
}
