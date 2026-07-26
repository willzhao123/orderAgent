import type { Menu, MenuCategory, MenuItem } from "./menu.ts";

export type MenuResolveResult = {
  item?: MenuItem;
  issue?: Record<string, unknown>;
};

function normalize(value: string): string {
  return value.toLowerCase().trim().replace(/\s+/g, " ");
}

function tokens(value: string): string[] {
  return normalize(value)
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 1);
}

function summarizeModifier(modifier: unknown): unknown {
  if (!modifier || typeof modifier !== "object") return modifier;
  const { confidence: _confidence, ...customerFacingModifier } = modifier as Record<string, unknown>;
  return customerFacingModifier;
}

export class MenuService {
  private readonly menu: Menu;

  constructor(menu: Menu) {
    this.menu = menu;
  }

  listCategories(): Record<string, unknown>[] {
    return this.menu.categories.map((category) => this.summarizeCategory(category));
  }

  listCategoryItems(categoryQuery: string): Record<string, unknown> {
    const exactMatches = this.menu.categories.filter((category) =>
      this.categoryMatches(category, categoryQuery)
    );

    if (exactMatches.length === 1) {
      return {
        found: true,
        ambiguous: false,
        category: this.summarizeCategoryItems(exactMatches[0]!)
      };
    }

    if (exactMatches.length > 1) {
      return {
        found: false,
        ambiguous: true,
        query: categoryQuery,
        categories: exactMatches.map((category) => this.summarizeCategoryCandidate(category)),
        message: "Multiple categories match that request. Ask which category they mean."
      };
    }

    const containedMatches = this.menu.categories.filter((category) =>
      this.categoryContains(category, categoryQuery)
    );
    if (containedMatches.length === 1) {
      return {
        found: true,
        ambiguous: false,
        category: this.summarizeCategoryItems(containedMatches[0]!)
      };
    }

    return {
      found: false,
      ambiguous: containedMatches.length > 1,
      query: categoryQuery,
      categories: (containedMatches.length > 0
        ? containedMatches
        : this.menu.categories.slice(0, 6)
      ).map((category) => this.summarizeCategoryCandidate(category)),
      message: containedMatches.length > 1
        ? "Several categories match that request. Ask which one they want."
        : "No matching category was found. Offer the available category options."
    };
  }

  getItemDetails(itemQuery: string): Record<string, unknown> {
    const exactMatches = this.exactItemMatches(itemQuery);

    if (exactMatches.length === 1) {
      return {
        found: true,
        ambiguous: false,
        item: this.summarizeItemDetails(exactMatches[0]!)
      };
    }

    if (exactMatches.length > 1) {
      return {
        found: false,
        ambiguous: true,
        query: itemQuery,
        matches: this.topCandidates(exactMatches),
        message: "Multiple menu items match that name. Ask the customer which one they mean."
      };
    }

    const containedMatches = this.containedItemMatches(itemQuery);
    if (containedMatches.length === 1) {
      return {
        found: true,
        ambiguous: false,
        item: this.summarizeItemDetails(containedMatches[0]!)
      };
    }

    return {
      found: false,
      ambiguous: containedMatches.length > 1,
      query: itemQuery,
      matches: this.topCandidates(containedMatches.length > 0
        ? containedMatches
        : this.findCloseMatches(itemQuery)),
      message: containedMatches.length > 1
        ? "Several items match that request. Ask which one they mean."
        : "No matching item was found. Offer close matches if present."
    };
  }

  checkMenuItem(itemQuery: string): Record<string, unknown> {
    const exactMatches = this.exactItemMatches(itemQuery);

    if (exactMatches.length === 1) {
      return { found: true, ambiguous: false, item: this.summarizeItem(exactMatches[0]!) };
    }

    if (exactMatches.length > 1) {
      return {
        found: false,
        ambiguous: true,
        query: itemQuery,
        matches: this.topCandidates(exactMatches),
        message: "Multiple menu items match that name. Ask the customer which one they mean."
      };
    }

    const containedMatches = this.containedItemMatches(itemQuery);
    if (containedMatches.length === 1) {
      return { found: true, ambiguous: false, item: this.summarizeItem(containedMatches[0]!) };
    }

    if (containedMatches.length > 1) {
      return {
        found: false,
        ambiguous: true,
        query: itemQuery,
        matches: this.topCandidates(containedMatches),
        message: "Several menu items match that request. Offer the top candidates and ask a follow-up."
      };
    }

    return {
      found: false,
      ambiguous: false,
      query: itemQuery,
      matches: this.topCandidates(this.findCloseMatches(itemQuery)),
      categories: this.menu.categories.slice(0, 6).map((category) => category.name),
      message: "No exact item was found. Offer close matches if present, otherwise ask which category they want."
    };
  }

  resolveMenuItem(itemQuery: string): MenuResolveResult {
    const exactMatches = this.exactItemMatches(itemQuery);
    if (exactMatches.length === 1) return { item: exactMatches[0] };
    if (exactMatches.length > 1) {
      return {
        issue: {
          item: itemQuery,
          reason: "ambiguous",
          matches: this.topCandidates(exactMatches),
          message: "Multiple menu items match that order item. Ask which one they mean."
        }
      };
    }

    const containedMatches = this.containedItemMatches(itemQuery);
    if (containedMatches.length === 1) return { item: containedMatches[0] };
    if (containedMatches.length > 1) {
      return {
        issue: {
          item: itemQuery,
          reason: "ambiguous",
          matches: this.topCandidates(containedMatches),
          message: "Several menu items match that order item. Ask which one they mean."
        }
      };
    }

    return {
      issue: {
        item: itemQuery,
        reason: "not_found",
        matches: this.topCandidates(this.findCloseMatches(itemQuery)),
        message: "That order item is not on the approved menu. Offer close matches if present."
      }
    };
  }

  findCloseMatches(itemQuery: string): MenuItem[] {
    const queryTokens = new Set(tokens(itemQuery));
    if (queryTokens.size === 0) return [];

    return this.menu.items
      .map((item) => {
        const itemTokens = item.aliases.flatMap((alias) => tokens(alias));
        const score = itemTokens.filter((token) => queryTokens.has(token)).length;
        return { item, score };
      })
      .filter(({ score }) => score > 0)
      .sort((left, right) => right.score - left.score)
      .map(({ item }) => item);
  }

  summarizeItem(item: MenuItem): Record<string, unknown> {
    const summary: Record<string, unknown> = {
      id: item.id,
      name: item.name,
      category: item.category
    };

    for (const key of ["vietnamese_name", "description", "price", "prices", "serving"]) {
      if (item[key] !== undefined) summary[key] = item[key];
    }

    return summary;
  }

  summarizeCategory(category: MenuCategory): Record<string, unknown> {
    return {
      id: category.id,
      name: category.name,
      ...(category.menuHeading ? { menuHeading: category.menuHeading } : {}),
      ...(category.categoryDescription
        ? { description: category.categoryDescription }
        : {}),
      itemCount: category.items.length,
      examples: category.items.slice(0, 3).map((item) => ({
        id: item.id,
        name: item.name,
        ...(item.price !== undefined ? { price: item.price } : {}),
        ...(item.prices !== undefined ? { prices: item.prices } : {})
      }))
    };
  }

  private exactItemMatches(query: string): MenuItem[] {
    const normalizedQuery = normalize(query);
    return this.menu.items.filter((item) =>
      item.id === normalizedQuery ||
      item.aliases.some((alias) => normalize(alias) === normalizedQuery)
    );
  }

  private containedItemMatches(query: string): MenuItem[] {
    const normalizedQuery = normalize(query);
    return this.menu.items.filter((item) =>
      item.aliases.some((alias) => normalize(alias).includes(normalizedQuery))
    );
  }

  private topCandidates(items: MenuItem[], limit = 5): Record<string, unknown>[] {
    return items.slice(0, limit).map((item) => this.summarizeItem(item));
  }

  private summarizeItemDetails(item: MenuItem): Record<string, unknown> {
    const summary = this.summarizeItem(item);
    const category = this.menu.categories.find((candidate) => candidate.id === item.categoryId);

    if (item.ingredients !== undefined) summary.ingredients = item.ingredients;
    if (category?.modifiers) {
      summary.availableModifiers = category.modifiers.map(summarizeModifier);
    }

    return summary;
  }

  private summarizeCategoryCandidate(category: MenuCategory): Record<string, unknown> {
    return {
      id: category.id,
      name: category.name,
      itemCount: category.items.length
    };
  }

  private summarizeCategoryItems(category: MenuCategory): Record<string, unknown> {
    return {
      id: category.id,
      name: category.name,
      ...(category.menuHeading ? { menuHeading: category.menuHeading } : {}),
      ...(category.categoryDescription
        ? { description: category.categoryDescription }
        : {}),
      ...(category.modifiers ? { modifiers: category.modifiers.map(summarizeModifier) } : {}),
      items: category.items.map((item) => this.summarizeItem(item))
    };
  }

  private categoryMatches(category: MenuCategory, query: string): boolean {
    const normalizedQuery = normalize(query);
    return category.id === normalizedQuery ||
      normalize(category.name) === normalizedQuery ||
      Boolean(category.menuHeading && normalize(category.menuHeading) === normalizedQuery);
  }

  private categoryContains(category: MenuCategory, query: string): boolean {
    const normalizedQuery = normalize(query);
    return category.id.includes(normalizedQuery) ||
      normalize(category.name).includes(normalizedQuery) ||
      Boolean(category.menuHeading && normalize(category.menuHeading).includes(normalizedQuery));
  }
}
