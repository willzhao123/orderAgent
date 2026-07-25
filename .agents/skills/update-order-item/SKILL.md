---
name: update-order-item
description: Update the quantity or notes for one item already in an existing stored order. Use when a customer asks to change an order item.
---

# Update Order Item

Use the trusted backend handler to update one existing order line. Do not invent order contents, prices, order ids, or storage results.

Inputs:

- `order_id`: The stored order id to update.
- `item`: The order item id or name to update.
- `quantity`: Optional replacement positive integer quantity.
- `notes`: Optional replacement customer notes for the line item.

If the handler returns `updated: true`, confirm the updated order. If the item or order is not found, use the returned message and order items to ask a short follow-up.
