function normalize(value: string): string {
  return value.toLowerCase().trim();
}

export class SkillExecutor {
  private readonly menu: string[];

  constructor(menu: string[]) {
    this.menu = menu;
  }

  execute(name: string, input: Record<string, unknown>): Record<string, unknown> {
    if (name === "check_menu_item") {
      return this.checkMenuItem(input);
    }

    if (name === "list_food") {
      return { items: this.menu };
    }

    throw new Error(`No trusted handler exists for skill: ${name}`);
  }

  private checkMenuItem(input: Record<string, unknown>): Record<string, unknown> {
    const itemName = String(input.item_name ?? "");
    const normalizedItemName = normalize(itemName);
    const match = this.menu.find((item) => normalize(item) === normalizedItemName)
      ?? this.menu.find((item) => normalize(item).includes(normalizedItemName));

    return match
      ? { found: true, item: match }
      : { found: false, item: itemName, approvedMenu: this.menu };
  }
}
