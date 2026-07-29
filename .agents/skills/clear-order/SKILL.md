---
name: clear-order
description: Remove every item from an existing stored order. Use when a customer asks to clear, empty, start over, or cancel the current order contents.
---

# Clear Order

Use the trusted backend handler to clear all line items from a stored order. Do not invent order ids or storage results.

Inputs:

- `order_id`: The stored order id to clear.

If the handler returns `cleared: true`, confirm in one short sentence that the order is empty. Do not repeat the removed items or order id unless the customer asks. If the order is not found, explain that plainly without mentioning the handler or storage.
