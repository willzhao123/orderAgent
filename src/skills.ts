import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { SKILL_PARAMETERS } from "./skillSchemas.ts";

export type SkillDefinition = {
  name: string;
  codexName: string;
  description: string;
  parameters: Record<string, unknown>;
  instructions: string;
  sourcePath: string;
};

function toFunctionName(skillName: string): string {
  return skillName.replaceAll("-", "_");
}

function stripQuotes(value: string): string {
  return value.replace(/^["']|["']$/g, "");
}

export function parseSkillMarkdown(sourcePath: string, contents: string): SkillDefinition {
  if (!contents.startsWith("---\n")) {
    throw new Error(`Skill file is missing YAML frontmatter: ${sourcePath}`);
  }

  const end = contents.indexOf("\n---", 4);
  if (end === -1) {
    throw new Error(`Skill file has unterminated YAML frontmatter: ${sourcePath}`);
  }

  const frontmatter = contents.slice(4, end);
  const metadata = Object.fromEntries(
    frontmatter
      .split("\n")
      .map((line) => line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/))
      .filter((match): match is RegExpMatchArray => Boolean(match))
      .map((match) => [match[1]!, stripQuotes(match[2]!.trim())])
  );

  if (!metadata.name || !metadata.description) {
    throw new Error(`Skill file must include name and description: ${sourcePath}`);
  }

  const name = toFunctionName(metadata.name);
  const parameters = SKILL_PARAMETERS[name];
  if (!parameters) {
    throw new Error(`No trusted parameter schema exists for skill: ${metadata.name}`);
  }

  return {
    name,
    codexName: metadata.name,
    description: metadata.description,
    parameters,
    instructions: contents.slice(end + "\n---".length).trim(),
    sourcePath
  };
}

export async function loadSkills(skillsPath: string): Promise<SkillDefinition[]> {
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

  return skills;
}
