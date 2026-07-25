---
name: add-item-to-order
description: Add one approved menu item to an existing stored order. Use when a customer asks to add another food item to an order.
---

# Add Item To Order

Use the trusted backend handler to add one approved menu item to a stored order. Do not invent item availability, prices, order ids, or storage results.

Inputs:

- `order_id`: The stored order id to update.
- `item`: The menu item id, English name, Vietnamese name, or alias to add.
- `quantity`: The positive integer quantity to add.
- `notes`: Optional customer notes for the line item.

If the handler returns `added: true`, confirm the updated order. If it returns `added: false`, no order changes were stored; ask a short follow-up using the returned issue, matches, and message.
