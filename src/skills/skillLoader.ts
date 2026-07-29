import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { parse } from "yaml";
import {
  getSkillRegistryEntry,
  type SkillCategory
} from "./skillRegistry.ts";
import {
  DEFAULT_SKILL_SETTINGS,
  type SkillSettings
} from "./skillSettings.ts";

export type SkillDefinition = {
  name: string;
  codexName: string;
  category: SkillCategory;
  description: string;
  parameters: Record<string, unknown>;
  instructions: string;
  sourcePath: string;
};

/** Convert a Codex skill directory name to Gemini's function naming convention. */
function toFunctionName(skillName: string): string {
  return skillName.replaceAll("-", "_");
}

function splitFrontmatter(sourcePath: string, contents: string): {
  frontmatter: string;
  instructions: string;
} {
  const match = contents.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/);
  if (!match) {
    throw new Error(`Skill file is missing or has unterminated YAML frontmatter: ${sourcePath}`);
  }

  return {
    frontmatter: match[1]!,
    instructions: match[2]!.trim()
  };
}

function readStringMetadata(
  metadata: unknown,
  key: string,
  sourcePath: string
): string {
  if (!metadata || typeof metadata !== "object") {
    throw new Error(`Skill file frontmatter must be a YAML object: ${sourcePath}`);
  }

  const value = (metadata as Record<string, unknown>)[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Skill file must include a non-empty string ${key}: ${sourcePath}`);
  }

  return value.trim();
}

export function parseSkillMarkdown(sourcePath: string, contents: string): SkillDefinition {
  const { frontmatter, instructions } = splitFrontmatter(sourcePath, contents);
  const metadata = parse(frontmatter) as unknown;
  const codexName = readStringMetadata(metadata, "name", sourcePath);
  const description = readStringMetadata(metadata, "description", sourcePath);

  const name = toFunctionName(codexName);
  const registryEntry = getSkillRegistryEntry(name);
  if (!registryEntry) {
    throw new Error(`No trusted registry entry exists for skill: ${codexName}`);
  }

  return {
    name,
    codexName,
    category: registryEntry.category,
    description,
    parameters: registryEntry.parameters,
    instructions,
    sourcePath
  };
}

export async function loadSkills(
  skillsPath: string,
  settings: SkillSettings = DEFAULT_SKILL_SETTINGS
): Promise<SkillDefinition[]> {
  const entries = await readdir(skillsPath, { withFileTypes: true });
  const skills = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const sourcePath = join(skillsPath, entry.name, "SKILL.md");
        return parseSkillMarkdown(sourcePath, await readFile(sourcePath, "utf8"));
      })
  );

  if (skills.length === 0) {
    throw new Error("This experiment expects at least 1 skill; found 0.");
  }

  return skills.filter(
    (skill) => skill.category !== "order" || settings.order
  );
}
