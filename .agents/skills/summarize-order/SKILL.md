---
name: summarize-order
description: Summarize the current contents of an existing stored order. Use when a customer asks what is in their order or wants to review it.
---

# Summarize Order

Use the trusted backend handler to retrieve the current stored order contents. Do not invent order contents, prices, order ids, or storage results.

Inputs:

- `order_id`: The stored order id to summarize.

If the handler returns `found: true`, summarize customer-facing item names, quantities, notes, and subtotal in natural spoken language. Use one or two sentences for a short order and a compact list only when needed for clarity. Do not read line-item ids, raw fields, or empty values.

If the order is empty or missing, say so in one short sentence without mentioning the handler or storage.

Never include the order id, line-item ids, or menu item ids in the customer-facing reply.
