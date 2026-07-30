---
name: answer-restaurant-faq
description: Optionally answer stable restaurant fact, logistics, service, and policy questions from the approved static FAQ bundle when the voice agent needs backend fallback. Do not use for prices, item availability, temporary closures, orders, payments, or customer information.
---

# Answer Restaurant FAQ

Call the trusted backend handler with the customer's complete question.

- Use only the returned approved answer; do not infer or invent restaurant details.
- If `found` is true, answer directly in one or two natural sentences. Do not introduce the answer with phrases such as "the FAQ says."
- If `found` is false, plainly say you do not have that information. Do not mention FAQ storage or internal lookup results.
- If `ambiguous` is true, use the returned matches to ask one short clarifying question.
- Use menu and transactional backend skills instead for current prices, item availability, temporary closures, orders, payments, and customer information.
