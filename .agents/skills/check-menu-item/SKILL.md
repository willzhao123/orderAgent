---
name: check-menu-item
description: Check whether a specific food item is on the restaurant's approved menu. Use when a user asks if the restaurant has, serves, offers, or can provide a named food item.
---

# Check Menu Item

Use the trusted backend handler to check the approved menu. Do not answer from memory or invent menu items.

Inputs:

- `item_name`: The food item the user is asking about.

Return whether the item was found. If it was not found, include the approved menu returned by the handler.
