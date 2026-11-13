# MicroBalance

A conversational accounting stack for small businesses: an IFRS-style ledger
engine, an AI service that turns natural language into ledger intents, a mock
AI server for local testing, and the DeepSeek Harness UI plugin that renders the
accounting workspace.

## Layout

| Path | Package | Port | Purpose |
| --- | --- | --- | --- |
| `microbalance-core/` | `microbalance-core` | 3001 | Prisma + SQLite double-entry ledger engine and HTTP API |
| `microbalance-ai/` | `microbalance-ai` | 3002 | Fastify service that maps chat to ledger tool calls (Gemini) |
| `microbalance-mock-ai/` | `microbalance-mock-ai` | 4000 | OpenAI/Anthropic-compatible mock AI server for offline testing |
| `dsh-plugin/ui-accounting/` | `@microbalance/dsh-client-ui-accounting` | — | DeepSeek Harness Web UI pages (dashboard, ledgers, statements) |

## Quick start

Each service is an independent pnpm package with its own lockfile.

```bash
# Core engine
cd microbalance-core
pnpm install
cp .env.example .env
pnpm db:generate
pnpm db:push
pnpm db:seed
pnpm dev

# AI service (new terminal)
cd microbalance-ai
pnpm install
cp .env.example .env   # add GEMINI_API_KEY
pnpm dev

# Mock AI server (new terminal, optional)
cd microbalance-mock-ai
pnpm install
pnpm dev
```

The core API listens on `http://127.0.0.1:3001`, the AI service on
`http://127.0.0.1:3002`, and the mock AI server on `http://127.0.0.1:4000`.

## DeepSeek Harness plugin

`dsh-plugin/ui-accounting` is not a standalone app: it imports the host
packages (`@deepseek-ai/dsh-client-ui-primitives`, `...-ui-slots`, and
`...-ui-theme`). Install it inside a DeepSeek Harness checkout:

```bash
cp -R dsh-plugin/ui-accounting <dsh-checkout>/packages/client/ui-accounting
cd <dsh-checkout>/packages/client/ui-accounting
pnpm exec tsc -p tsconfig.json
pnpm exec tsdown
```

Then load it from the harness profile patch (`~/.dsh/profiles/web/cordis.patch.yml`):

```yaml
- insert:
    - id: ui-microbalance-accounting
      name: '<dsh-checkout>/packages/client/ui-accounting/lib/index.js'
```

## Development notes

- Currency is Nigerian Naira (NGN) throughout the UI and engine.
- The core uses Prisma enums and a full IFRS chart of accounts (codes 1000–6700).
- The AI prompt is capped below 250 tokens, keeps six history turns, and runs
  with `temperature: 0` for deterministic tool selection.
- `.env` files are intentionally git-ignored; copy the provided `.env.example`
  files and fill in local secrets.
