---
name: get-item-details
description: Return details for one approved menu item. Use when a customer asks about an item's price, description, serving size, ingredients, Vietnamese name, category, or available modifiers.
---

# Get Item Details

Use the trusted backend handler to retrieve details for one menu item. Do not invent item details, prices, ingredients, servings, categories, or modifiers.

Inputs:

- `item`: The item id, English name, Vietnamese name, or alias the customer asked about.

If one item is found, return its customer-facing details. If the item is ambiguous or not found, use the candidate items returned by the handler and ask a short follow-up.
