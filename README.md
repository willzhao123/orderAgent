# orderAgent

This experiment tests a small backend skill loop:

1. The backend agent loads Codex-style skills from `.agents/skills`.
2. It loads the approved menu from `data/menu.json`.
3. It tells you which skills it has.
4. During chat, it discovers and calls the right skill.
5. When an order is created, it stores it in `data/orders.json`.

The Codex skills are:

- `check-menu-item`
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
`list_food`, `create_order`, and `quote_order_total`.

## Run

Requires Node.js 22.6 or newer.

```bash
cp .env.example .env
```

Put your API key in `.env`:

```text
GEMINI_API_KEY=your_real_key
GEMINI_MODEL=gemini-3.6-flash
```

Then:

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
What food do you have?
Do you have beef pho?
Do you have Singapore noodles?
I want 2 egg rolls and one chicken pho.
Add 2 spring rolls to order_0001.
What is the total for order_0001?
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
  -> model sees the skills as function tools
  -> model calls a trusted skill such as check_menu_item or create_order
  -> local handler returns the menu result or stored order
  -> model gives the final reply
```

Official reference:

- https://ai.google.dev/gemini-api/docs/generate-content/function-calling
