---
name: list-category-items
description: List the approved menu items in one requested category. Use after list-food when the customer chooses a category, or when a user asks what items are in a category such as salads, pho, appetizers, soups, or rice plates.
---

# List Category Items

Use the trusted backend handler to list items for a requested menu category. Do not invent categories, items, prices, or descriptions.

Inputs:

- `category`: The category id or category name the customer selected.

If the category is found:

- By default, mention up to four item names in one natural sentence, then ask whether the customer wants more options.
- If the customer explicitly asks for every option, give every item name concisely.
- Choose one name for each item using the conversation language rules. Treat a Vietnamese-language request as a reason to use returned Vietnamese names. Do not append English and Vietnamese names together unless the customer asks.
- Include prices, descriptions, shared accompaniments, and modifiers only when the customer asks for those details.
- Never read item ids or raw field names aloud.
- Do not use a heading, bullets, or numbering unless the customer explicitly asks for a list.

If the category is ambiguous or not found, use the returned candidate categories and ask one short clarifying question.
