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

If the handler returns `added: true`, briefly confirm the quantity, item name, and any customer note. Do not recap the full order or subtotal unless the customer asks.

If it returns `added: false`, explain only the unresolved item. Offer no more than three returned matches and ask one short clarifying question.
