import { readFile } from "node:fs/promises";

export type SkillSettings = {
  order: boolean;
};

export const DEFAULT_SKILL_SETTINGS: SkillSettings = {
  order: true
};

function readOrderSkillToggle(
  skills: Record<string, unknown>,
  sourcePath: string
): boolean {
  const value = skills.order;
  if (value === undefined) return DEFAULT_SKILL_SETTINGS.order;
  if (typeof value !== "boolean") {
    throw new Error(
      `Skill setting "order" must be true or false: ${sourcePath}`
    );
  }
  return value;
}

export function parseSkillSettings(
  sourcePath: string,
  contents: string
): SkillSettings {
  let parsed: unknown;
  try {
    parsed = JSON.parse(contents) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid skill settings JSON in ${sourcePath}: ${message}`);
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Skill settings must be a JSON object: ${sourcePath}`);
  }

  const skills = (parsed as Record<string, unknown>).skills;
  if (!skills || typeof skills !== "object" || Array.isArray(skills)) {
    throw new Error(
      `Skill settings must include a "skills" object: ${sourcePath}`
    );
  }

  const skillValues = skills as Record<string, unknown>;
  const unknownCategories = Object.keys(skillValues)
    .filter((category) => category !== "order");
  if (unknownCategories.length > 0) {
    throw new Error(
      `Unknown skill setting${unknownCategories.length === 1 ? "" : "s"} ` +
      `${unknownCategories.map((category) => `"${category}"`).join(", ")}: ${sourcePath}`
    );
  }

  return {
    order: readOrderSkillToggle(skillValues, sourcePath)
  };
}

export async function loadSkillSettings(
  settingsPath: string
): Promise<SkillSettings> {
  return parseSkillSettings(settingsPath, await readFile(settingsPath, "utf8"));
}
