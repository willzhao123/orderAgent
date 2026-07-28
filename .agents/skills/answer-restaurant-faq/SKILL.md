---
name: answer-restaurant-faq
description: Answer restaurant fact, logistics, service, and policy questions from the approved static FAQ store. Use when a customer asks about cuisine, hours, location, reservations, parking, delivery, pickup, accessibility, payment, or other non-menu restaurant information.
---

# Answer Restaurant FAQ

Call the trusted backend handler with the customer's complete question.

- Use only the returned FAQ answer; do not infer or invent restaurant details.
- If `found` is false, say the stored FAQs do not provide the requested information.
- If `ambiguous` is true, use the returned matches to ask one short clarifying question.
- Use menu skills instead for menu availability, item details, and prices.
