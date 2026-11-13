# microbalance-core

Backend engine for a conversational AI financial OS for SMEs. It turns business
documents (invoices, bills, bank transactions) into **journal proposals** that a
human or an AI agent can inspect and approve before they touch the ledger.

## Stack

- Node.js 24 + TypeScript (strict, ESM, `NodeNext`)
- Fastify 5
- Prisma 6 + SQLite (local dev)
- Zod for request validation
- All monetary math via `Prisma.Decimal` — no floats anywhere

## Setup

```bash
pnpm install
npx prisma generate
npx prisma db push
npx prisma db seed
pnpm dev            # http://localhost:3001
```

Environment (`.env`):

```dotenv
DATABASE_URL="file:./dev.db"
PORT=3001
HOST="0.0.0.0"
```

## Architecture

```
src/
  index.ts               Fastify bootstrap + error mapping
  routes/api.ts          /api/ai-intent, /api/journals/:id/approve, /api/health
  engine/
    errors.ts            LedgerError (VALIDATION | NOT_FOUND | STATE)
    money.ts             Decimal conversion/precision helpers
    dates.ts             date parsing helpers
    LedgerEngine.ts      double-entry validation, proposals, posting, reports
    ErpService.ts        invoices, payments, bills, reconciliation, aging
  domain/types.ts        application-level enums (see note below)
prisma/
  schema.prisma          data model
  seed.ts                chart of accounts + master data
```

### Ledger invariants

- Journals are created as `PENDING`. Account balances do not move until
  `postJournal()` runs.
- `postJournal()` claims the entry with
  `updateMany({ where: { id, status: 'PENDING' } })`; a second concurrent call
  gets `count === 0` and a `STATE` error, so an entry can never post twice.
- Normal-signed balance math:
  - `ASSET`, `EXPENSE`: `debit - credit`
  - `LIABILITY`, `EQUITY`, `REVENUE`: `credit - debit`
- A journal is valid only if it has at least one line, debits equal credits, all
  values are non-negative, at most 2 decimal places, and no line has both a
  debit and a credit.

### Enums on SQLite

Prisma 6 supports enums on SQLite: the values are stored as `TEXT` and enforced
by the generated client, so `AccountType`, `JournalStatus`, `InvoiceStatus`,
`BillStatus`, `BankTxnStatus` and `BankTxnType` are declared natively in
`prisma/schema.prisma`. `src/domain/types.ts` re-exports the generated unions so
the engine and API share one source of truth.

## API

`POST /api/ai-intent` body: `{ "action": "...", "payload": { ... } }`

| Action | Payload |
| --- | --- |
| `GET_TRIAL_BALANCE` | `{}` |
| `PROPOSE_JOURNAL` | `{ date?, memo?, lines: [{ accountId, debit?, credit? }] }` |
| `CREATE_INVOICE` | `{ customerId, date, dueDate?, items: [{ itemId?, description?, quantity, unitPrice? }] }` |
| `RECORD_INVOICE_PAYMENT` | `{ invoiceId, amount, bankAccountId, date? }` |
| `CREATE_BILL` | `{ vendorId, date, dueDate?, items: [{ description, quantity, unitCost }] }` |
| `GET_AR_AGING` | `{ asOf? }` |
| `GET_AP_AGING` | `{ asOf? }` |
| `GET_UNRECONCILED_TRANSACTIONS` | `{}` |
| `RECONCILE_TRANSACTION` | `{ transactionId, matchedId, matchedType: "INVOICE" \| "BILL" }` |
| `GET_PROFIT_AND_LOSS` | `{ from?, to? }` |
| `GET_BALANCE_SHEET` | `{ asOf? }` |
| `GET_GENERAL_LEDGER` | `{ accountId?, from?, to?, status? }` |

`POST /api/journals/:id/approve` posts a pending journal.
`GET /api/health` returns service status.

Errors are returned as `{ "error": "...", "code": "VALIDATION|NOT_FOUND|STATE" }`
mapped to HTTP `400 | 404 | 409`.
