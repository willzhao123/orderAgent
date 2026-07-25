import { readFile } from "node:fs/promises";

function parseMenuItemNames(menu: unknown): string[] {
  if (Array.isArray(menu)) {
    return menu.filter(
      (item): item is string => typeof item === "string" && Boolean(item.trim())
    );
  }

  if (!menu || typeof menu !== "object") return [];
  const categories = (menu as { categories?: unknown }).categories;
  if (!Array.isArray(categories)) return [];

  return categories.flatMap((category) => {
    if (!category || typeof category !== "object") return [];
    const items = (category as { items?: unknown }).items;
    if (!Array.isArray(items)) return [];

    return items.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const name = (item as { name?: unknown }).name;
      return typeof name === "string" && name.trim() ? [name] : [];
    });
  });
}

export function parseMenu(sourcePath: string, contents: string): string[] {
  const menu = JSON.parse(contents) as unknown;
  const items = parseMenuItemNames(menu).map((item) => item.trim());
  if (items.length === 0) {
    throw new Error(
      `Menu file must contain a non-empty JSON array of strings or categories with item names: ${sourcePath}`
    );
  }

  return items;
}

export async function loadMenu(menuPath: string): Promise<string[]> {
  return parseMenu(menuPath, await readFile(menuPath, "utf8"));
}
