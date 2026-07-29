import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  loadSkills,
  parseSkillMarkdown
} from "../src/skills/skillLoader.ts";
import { parseSkillSettings } from "../src/skills/skillSettings.ts";

const skillsPath = fileURLToPath(new URL("../.agents/skills", import.meta.url));

test("parseSkillMarkdown supports richer YAML frontmatter", () => {
  const skill = parseSkillMarkdown("/tmp/check-menu-item/SKILL.md", `---
# Metadata can grow beyond single-line key/value pairs.
name: check-menu-item
description: >
  Check whether a specific food item is on the
  restaurant's approved menu.
tags:
  - menu
  - validation
---

# Check Menu Item

Use the approved menu only.
`);

  assert.equal(skill.name, "check_menu_item");
  assert.equal(skill.codexName, "check-menu-item");
  assert.equal(
    skill.description,
    "Check whether a specific food item is on the restaurant's approved menu."
  );
  assert.equal(skill.instructions, "# Check Menu Item\n\nUse the approved menu only.");
});

test("parseSkillMarkdown rejects non-string required metadata", () => {
  assert.throws(
    () => parseSkillMarkdown("/tmp/check-menu-item/SKILL.md", `---
name: check-menu-item
description:
  - not
  - a string
---

# Check Menu Item
`),
    /non-empty string description/
  );
});

test("order settings disable only order skills", async () => {
  const enabledSkills = await loadSkills(skillsPath, { order: true });
  const disabledSkills = await loadSkills(skillsPath, { order: false });

  assert.equal(enabledSkills.length, 12);
  assert.equal(disabledSkills.length, 5);
  assert.deepEqual(
    new Set(disabledSkills.map((skill) => skill.category)),
    new Set(["faq", "menu"])
  );
  assert.equal(
    disabledSkills.some((skill) => skill.name === "answer_restaurant_faq"),
    true
  );
  assert.equal(
    disabledSkills.some((skill) => skill.name === "check_menu_item"),
    true
  );
  assert.equal(
    disabledSkills.some((skill) => skill.name === "create_order"),
    false
  );
});

test("parseSkillSettings defaults order on and validates its toggle", () => {
  assert.deepEqual(
    parseSkillSettings("/tmp/settings.json", '{"skills":{}}'),
    { order: true }
  );
  assert.deepEqual(
    parseSkillSettings("/tmp/settings.json", '{"skills":{"order":false}}'),
    { order: false }
  );
  assert.throws(
    () => parseSkillSettings(
      "/tmp/settings.json",
      '{"skills":{"order":"off"}}'
    ),
    /must be true or false/
  );
  assert.throws(
    () => parseSkillSettings(
      "/tmp/settings.json",
      '{"skills":{"faq":false}}'
    ),
    /Unknown skill setting "faq"/
  );
});
