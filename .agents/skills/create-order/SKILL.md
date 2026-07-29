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

If the handler returns `created: true`, give a compact, natural confirmation containing:

- The quantities and customer-facing item names.
- Customer notes only when present.
- The subtotal.

Use a list only when the order is too long to confirm clearly in one or two sentences. Never include the order id, line-item ids, menu item ids, raw fields, or other internal data in the customer-facing reply.

If the handler returns `created: false`, say the order needs clarification and focus on one unresolved item at a time. Offer no more than three returned matches and ask one short question. Do not imply that an order was created.
