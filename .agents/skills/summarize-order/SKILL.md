---
name: summarize-order
description: Summarize the current contents of an existing stored order. Use when a customer asks what is in their order or wants to review it.
---

# Summarize Order

Use the trusted backend handler to retrieve the current stored order contents. Do not invent order contents, prices, order ids, or storage results.

Inputs:

- `order_id`: The stored order id to summarize.

If the handler returns `found: true`, summarize the items, quantities, notes, and subtotal. If the order is empty or missing, use the returned message.
