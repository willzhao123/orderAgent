---
name: get-item-details
description: Return details for one approved menu item. Use when a customer asks about an item's price, description, serving size, ingredients, Vietnamese name, category, or available modifiers.
---

# Get Item Details

Use the trusted backend handler to retrieve details for one menu item. Do not invent item details, prices, ingredients, servings, categories, or modifiers.

Inputs:

- `item`: The item id, English name, Vietnamese name, or alias the customer asked about.

If one item is found, answer only what the customer asked about and choose its name using the conversation language rules. Omit unrelated fields, alternate-language names, item ids, and raw field names unless the customer specifically asks for an alternate name. If the item is ambiguous or not found, mention only the most relevant returned candidates and ask one short follow-up.
