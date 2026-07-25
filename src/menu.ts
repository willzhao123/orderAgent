import { readFile } from "node:fs/promises";

export type MenuItem = {
  name: string;
  category?: string;
  menuHeading?: string;
  categoryDescription?: string;
  [key: string]: unknown;
};

export type MenuCategory = {
  name: string;
  menuHeading?: string;
  categoryDescription?: string;
  items: MenuItem[];
  modifiers?: unknown[];
};

export type Menu = {
  categories: MenuCategory[];
  items: MenuItem[];
};

function toMenuItem(value: unknown, category?: MenuCategory): MenuItem | null {
  if (typeof value === "string" && value.trim()) {
    return { name: value.trim(), category: category?.name };
  }

  if (!value || typeof value !== "object") return null;
  const rawItem = value as { name?: unknown; [key: string]: unknown };
  if (typeof rawItem.name !== "string" || !rawItem.name.trim()) return null;

  return {
    ...rawItem,
    name: rawItem.name.trim(),
    category: category?.name,
    menuHeading: category?.menuHeading,
    categoryDescription: category?.categoryDescription
  };
}

function parseSimpleMenu(items: unknown[]): Menu {
  const menuItems = items
    .map((item) => toMenuItem(item))
    .filter((item): item is MenuItem => Boolean(item));

  return {
    categories: [{ name: "Menu", items: menuItems }],
    items: menuItems
  };
}

function parseStructuredMenu(menu: Record<string, unknown>): Menu {
  const categories = Array.isArray(menu.categories) ? menu.categories : [];
  const parsedCategories = categories.flatMap((category) => {
    if (!category || typeof category !== "object") return [];

    const rawCategory = category as {
      name?: unknown;
      menu_heading?: unknown;
      category_description?: unknown;
      items?: unknown;
      modifiers?: unknown;
    };
    const name = typeof rawCategory.name === "string" && rawCategory.name.trim()
      ? rawCategory.name.trim()
      : "Menu";
    const menuCategory: MenuCategory = {
      name,
      menuHeading: typeof rawCategory.menu_heading === "string"
        ? rawCategory.menu_heading
        : undefined,
      categoryDescription: typeof rawCategory.category_description === "string"
        ? rawCategory.category_description
        : undefined,
      items: [],
      modifiers: Array.isArray(rawCategory.modifiers) ? rawCategory.modifiers : undefined
    };

    const items = Array.isArray(rawCategory.items) ? rawCategory.items : [];
    menuCategory.items = items
      .map((item) => toMenuItem(item, menuCategory))
      .filter((item): item is MenuItem => Boolean(item));

    return menuCategory.items.length > 0 ? [menuCategory] : [];
  });

  return {
    categories: parsedCategories,
    items: parsedCategories.flatMap((category) => category.items)
  };
}

export function parseMenu(sourcePath: string, contents: string): Menu {
  const parsed = JSON.parse(contents) as unknown;
  const menu = Array.isArray(parsed)
    ? parseSimpleMenu(parsed)
    : parsed && typeof parsed === "object"
      ? parseStructuredMenu(parsed as Record<string, unknown>)
      : { categories: [], items: [] };

  if (menu.items.length === 0) {
    throw new Error(
      `Menu file must contain a non-empty JSON array of strings or categories with item names: ${sourcePath}`
    );
  }

  return menu;
}

export async function loadMenu(menuPath: string): Promise<Menu> {
  return parseMenu(menuPath, await readFile(menuPath, "utf8"));
}
