---
name: quote-order-total
description: Quote the current subtotal for an existing stored order. Use when a customer asks for the order total, subtotal, quote, cost, or amount.
---

# Quote Order Total

Use the trusted backend handler to quote the stored subtotal for an order. Do not invent prices, totals, order ids, taxes, fees, or storage results.

Inputs:

- `order_id`: The stored order id to quote.

If the handler returns `found: true`, return the subtotal and currency. If any items are unpriced, explain that the subtotal excludes those items using the returned `unpricedItems`.
