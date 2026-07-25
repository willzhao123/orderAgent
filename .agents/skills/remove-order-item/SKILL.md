---
name: remove-order-item
description: Remove one item from an existing stored order. Use when a customer asks to remove, delete, or take off an item.
---

# Remove Order Item

Use the trusted backend handler to remove one line from a stored order. Do not invent order contents, order ids, or storage results.

Inputs:

- `order_id`: The stored order id to update.
- `item`: The order item id or name to remove.

If the handler returns `removed: true`, confirm the updated order. If the item or order is not found, use the returned message and order items to ask a short follow-up.
