# orderAgent

This experiment tests a small backend skill loop:

1. The backend agent loads Codex-style skills from `.agents/skills`.
2. It loads the approved menu from `data/menu.json`. The voice deployment
   bundles static FAQs from `data/faq.json`; backend FAQ lookup is opt-in.
3. It tells you which skills it has.
4. During chat, it discovers and calls the right skill.
5. It stores chat sessions, Gemini history, draft orders, and order items in
   local Postgres.

The approved menu remains in `data/menu.json`; menu data is not stored in
Postgres.

`data/faq.json` is the single handwritten source of truth for static FAQs. It
contains a schema version, semantic content version, stable FAQ and category
IDs, question variations, and approved voice answers. Do not maintain a second
FAQ copy in the voice agent.

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

## Order skill setting

Menu skills are always registered. Order skills can be turned on or off in
`data/settings.json`:

```json
{
  "skills": {
    "order": false
  }
}
```

`true` registers all seven order skills; `false` removes them from the skills
shown to Gemini and from local skill enforcement and execution. If `order` is
omitted, it defaults to `true`. Restart the chat or HTTP service after changing
the file.

## Static FAQ bundle

Build the validated FAQ artifact directly into a voice deployment:

```bash
npm run bundle:faq -- /path/to/voice-build/faq.json
```

The bundle command validates and copies the canonical `data/faq.json`; its
output is generated deployment material, not another maintained source. The
voice agent should match FAQ questions locally and speak only
`approved_answer`. Successful lookup results include the FAQ content version,
stable FAQ ID, category, and concise answer.

Static FAQs must not contain current prices, item availability, temporary
closures, orders, payments, or customer information. Those remain dynamic or
transactional and must use backend skills.

Backend FAQ handling is an optional fallback and is disabled by default. Enable
it only when needed:

```text
BACKEND_FAQ_FALLBACK_ENABLED=true
```

When disabled, `answer_restaurant_faq` is not registered with Gemini and the
backend does not load the FAQ file.

## Source layout

The two runnable entry points stay at the top of `src`; implementation code is
grouped by responsibility:

```text
src/
├── chat.ts                 # interactive CLI
├── server.ts               # HTTP service
├── agent/                  # conversation orchestration
├── catalog/                # menu and restaurant FAQ data/services
├── domain/                 # shared business contracts
├── gemini/                 # Gemini client, types, and response policy
├── http/                   # Fastify transport
├── orders/                 # order application and Postgres storage
├── persistence/            # database, sessions, and JSON repositories
└── skills/                 # skill loading, registry, and execution
```

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
PORT=3000
BACKEND_BEARER_TOKEN=replace_with_a_long_random_token
BACKEND_FAQ_FALLBACK_ENABLED=false
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

`npm run chat` preserves the interactive CLI. To run the authenticated HTTP API
for `voice-agent`, use:

```bash
npm start
```

The service binds to `0.0.0.0` on `PORT` (default `3000`). Configure
`voice-agent` with this service's URL as `BACKEND_AGENT_URL` and send the same
value as `BACKEND_BEARER_TOKEN` in its bearer authorization header.

## HTTP API

`GET /health` reports that the HTTP process is running. `GET /ready` also checks
that Postgres accepts a query, returning `503` while that dependency is
unavailable. These two endpoints do not require authentication.

`POST /v1/chat` requires:

```text
Authorization: Bearer <BACKEND_BEARER_TOKEN>
Content-Type: application/json
```

Example:

```bash
curl http://localhost:3000/v1/chat \
  -H "Authorization: Bearer $BACKEND_BEARER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Do you have beef pho?",
    "sessionId": "voice-session-id",
    "callSid": "optional Twilio call SID"
  }'
```

The response contract consumed by `voice-agent` is unchanged:

```json
{
  "response": "Yes, beef pho is available."
}
```

Each external `sessionId` is persistently and uniquely mapped to one internal
Postgres chat session. Reusing it restores the Gemini conversation history and
draft-order context; different external session IDs remain isolated. `callSid`
is optional and is stored as the provider call ID when supplied.

The current order workflow creates **draft orders only**. Confirming or
submitting an order, choosing a fulfillment type, and collecting the customer's
phone number are separate future work.

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

The voice-first FAQ path has no runtime backend dependency:

```text
voice deployment build
  -> validates and bundles data/faq.json
caller asks a static FAQ
  -> voice agent matches the bundled question variations
  -> voice agent speaks the approved answer
```

Dynamic and transactional requests continue through Gemini function calling:

```text
caller request
  -> backend loads .agents/skills/*/SKILL.md and data/menu.json
  -> backend reconstructs this session's Gemini history from Postgres
  -> model sees the skills as function tools
  -> model calls a trusted skill such as check_menu_item or create_order
  -> local handler returns the menu result or Postgres-backed draft order
  -> model gives the final reply
  -> user, model, and tool messages are appended to Postgres
```

If backend FAQ fallback is explicitly enabled, it reads that same
`data/faq.json`; no separate FAQ content is maintained.

Official reference:

- https://ai.google.dev/gemini-api/docs/generate-content/function-calling
