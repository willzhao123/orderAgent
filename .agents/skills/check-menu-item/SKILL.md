---
name: check-menu-item
description: Check whether a specific food item is on the restaurant's approved menu. Use when a user asks if the restaurant has, serves, offers, or can provide a named food item.
---

# Check Menu Item

Use the trusted backend handler to check the approved menu. Do not answer from memory or invent menu items.

Inputs:

- `item_name`: The food item the user is asking about.

If the item is found, answer yes directly and use its customer-facing name. Include price, description, or other details only if the customer asked for them.

If the request is ambiguous, mention no more than three returned matches and ask one short clarifying question. If it is not found, say so plainly and offer no more than two close returned matches. Never read a full category or menu in response.
