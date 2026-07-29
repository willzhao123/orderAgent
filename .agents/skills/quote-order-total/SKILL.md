---
name: quote-order-total
description: Quote the current subtotal for an existing stored order. Use when a customer asks for the order total, subtotal, quote, cost, or amount.
---

# Quote Order Total

Use the trusted backend handler to quote the stored subtotal for an order. Do not invent prices, totals, order ids, taxes, fees, or storage results.

Inputs:

- `order_id`: The stored order id to quote.

If the handler returns `found: true`, state the subtotal and currency in one natural sentence. Do not call it a final total or imply that taxes and fees are included.

If any items are unpriced, briefly name them and say they are excluded from the subtotal. If the order is not found, explain that plainly without mentioning storage.

Never include the order id, line-item ids, or menu item ids in the customer-facing reply.
