import assert from "node:assert/strict";
import test from "node:test";
import { parseSkillMarkdown } from "../src/skills.ts";

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
