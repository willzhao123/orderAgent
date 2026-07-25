---
name: create-order
description: Create and store a customer order using only approved menu items. Use when a customer asks to place, create, start, submit, or add food to an order.
---

# Create Order

Use the trusted backend handler to create an order from approved menu items. Do not invent item availability, prices, order ids, or storage results.

Inputs:

- `items`: A non-empty array of requested order lines.
- `items[].item`: The item id, English name, Vietnamese name, or alias the customer wants.
- `items[].quantity`: The positive integer quantity requested.
- `items[].notes`: Optional customer notes for that line item.

If the handler returns `created: true`, confirm the order id, items, and subtotal. If the handler returns `created: false`, no order was stored; ask a short follow-up using the returned issues, matches, and messages.
