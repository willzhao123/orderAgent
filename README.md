# orderAgent

This experiment tests a small backend skill loop:

1. The backend agent loads Codex-style skills from `.agents/skills`.
2. It loads the approved menu from `data/menu.json` and restaurant FAQs from
   `data/restaurant-faq.json`.
3. It tells you which skills it has.
4. During chat, it discovers and calls the right skill.
5. It stores chat sessions, Gemini history, draft orders, and order items in
   local Postgres.

The approved menu remains in `data/menu.json`; menu data is not stored in
Postgres.

Restaurant FAQ answers remain in `data/restaurant-faq.json`; FAQ data is not
stored in Postgres. Add entries with an `id`, `question`, `answer`, and optional
`category`, `aliases`, and `keywords`.

The Codex skills are:

- `check-menu-item`
- `answer-restaurant-faq`
- `list-food`
- `list-category-items`
- `get-item-details`
- `create-order`
- `add-item-to-order`
- `update-order-item`
- `remove-order-item`
- `clear-order`
- `summarize-order`
- `quote-order-total`

The backend exposes them to Gemini as function tools such as `check_menu_item`,
`answer_restaurant_faq`, `list_food`, `create_order`, and `quote_order_total`.

## Run

Requires Node.js 22.6 or newer.

```bash
cp .env.example .env
```

Put your API key in `.env`:

```text
GEMINI_API_KEY=your_real_key
GEMINI_MODEL=gemini-3.6-flash
DATABASE_URL=postgresql://localhost:5432/order_agent
```

Create the local database if needed, then apply the schema:

```bash
createdb order_agent
psql "$DATABASE_URL" -f db/schema.sql
```

Then run:

```bash
npm test
npm run chat
```

If `node` or `npm` is not installed in your normal shell, the Codex workspace
runtime can start the chat directly:

```bash
./run-chat.sh
```

Try these messages:

```text
What skills can you do?
What kind of cuisine do you serve?
What food do you have?
Do you have beef pho?
Do you have Singapore noodles?
I want 2 egg rolls and one chicken pho.
Add 2 spring rolls to order <the UUID returned by create_order>.
What is the total for order <the UUID returned by create_order>?
```

When the model selects a skill, the terminal prints:

```text
[discovered skill: check_menu_item]
```

The implementation uses Gemini function calling:

```text
user message
  -> backend loads .agents/skills/*/SKILL.md
  -> backend loads data/menu.json
  -> backend loads data/restaurant-faq.json
  -> backend reconstructs this session's Gemini history from Postgres
  -> model sees the skills as function tools
  -> model calls a trusted skill such as answer_restaurant_faq, check_menu_item, or create_order
  -> local handler returns the FAQ/menu result or Postgres-backed draft order
  -> model gives the final reply
  -> user, model, and tool messages are appended to Postgres
```

Official reference:

- https://ai.google.dev/gemini-api/docs/generate-content/function-calling
