---
name: list-category-items
description: List the approved menu items in one requested category. Use after list-food when the customer chooses a category, or when a user asks what items are in a category such as salads, pho, appetizers, soups, or rice plates.
---

# List Category Items

Use the trusted backend handler to list items for a requested menu category. Do not invent categories, items, prices, or descriptions.

Inputs:

- `category`: The category id or category name the customer selected.

If the category is found, return that category's items with item ids and customer-facing details. If the category is ambiguous or not found, use the candidate categories returned by the handler and ask a short follow-up.
