# `@microbalance/dsh-tool-microbalance-tools`

A self-contained DeepSeek Harness (DSH) Cordis plugin that exposes the
MicroBalance double-entry accounting engine as 13 model-callable tools.

The plugin is a standard namespace plugin:

```ts
export const name = 'microbalance-tools'
export const inject = ['tools', 'systemPrompt']
export function apply(ctx: Context): void
```

Both registrations are attached to the plugin's Cordis effect scope, so
unloading the plugin removes the tools and the prompt section together.

## Tools

| Tool | Core action |
| --- | --- |
| `get_trial_balance` | `GET_TRIAL_BALANCE` |
| `propose_journal_entry` | `PROPOSE_JOURNAL` |
| `approve_journal` | `POST /api/journals/:id/approve` |
| `create_invoice` | `CREATE_INVOICE` |
| `record_invoice_payment` | `RECORD_INVOICE_PAYMENT` |
| `get_ar_aging` | `GET_AR_AGING` |
| `create_bill` | `CREATE_BILL` |
| `get_ap_aging` | `GET_AP_AGING` |
| `get_unreconciled_bank_transactions` | `GET_UNRECONCILED_TRANSACTIONS` |
| `reconcile_bank_transaction` | `RECONCILE_TRANSACTION` |
| `get_profit_and_loss` | `GET_PROFIT_AND_LOSS` |
| `get_balance_sheet` | `GET_BALANCE_SHEET` |
| `get_general_ledger` | `GET_GENERAL_LEDGER` |

The parameter schemas and descriptions are unchanged from the earlier
`microbalance-ai` Gemini service.

## Engine URL

The client reads, in order:

1. `MICROBALANCE_CORE_URL`
2. `CORE_API_URL`
3. `http://localhost:3001`

Requests go to `POST {base}/api/ai-intent` with `{ action, payload }`; approvals
go to `POST {base}/api/journals/:id/approve`. One call has a 30-second budget.

## Error contract

Tool bodies never throw. Every engine failure — HTTP 4xx/5xx, timeout,
unreachable host, malformed envelope — is returned as:

```json
{ "isError": true, "error": "Journal is unbalanced: debits 1.00 != credits 0.00", "code": "VALIDATION" }
```

`output.render` projects that value as:

```text
ERROR [VALIDATION]: Journal is unbalanced: debits 1.00 != credits 0.00
```

DSH's built-in failure path is a thrown `HarnessError`; this plugin deliberately
does not use it. The returned JSON is therefore a successful tool call whose
content is an explicit rejection, and the system prompt tells the model to fix
the input and retry rather than presenting it as success.

## System prompt

`apply()` registers one section:

```ts
ctx.systemPrompt.section({
  name: 'tool:microbalance',
  order: 400,
  text: MICROBALANCE_PROMPT_TEXT,
  interpolate: false,
})
```

DSH's `PromptSection` contract is `{ name, order, text }`. The section also
includes the accounting rules and the Naira currency contract:

> The business operates in Naira (₦). When you report amounts from tool
> results, format them as ₦X,XXX.XX. Never use $.

## Copy into the harness

```sh
mkdir -p /path/to/deepseek-harness/packages/plugins
cp -R packages/plugins/microbalance-tools \
  /path/to/deepseek-harness/packages/plugins/microbalance-tools
```

Then add it to the composition (package mode):

```yaml
- name: '@deepseek-ai/dsh-system-prompt'
- name: '@deepseek-ai/dsh-tools'
- name: '@microbalance/dsh-tool-microbalance-tools'
```

or source mode:

```yaml
- name: './packages/plugins/microbalance-tools/src/index.ts'
```

`tsconfig.json` extends `../../../tsconfig.base.json`, exactly like the
harness's own `packages/lsp/tool-lsp/tsconfig.json`, so the relative path is
correct both here and at `packages/plugins/microbalance-tools` inside DSH.

The package expects the harness's workspace versions of:

- `@deepseek-ai/cordis`
- `@deepseek-ai/dsh-tools`
- `@deepseek-ai/dsh-system-prompt`
- `@deepseek-ai/dsh-util-values` (type-only)

## Local development

```sh
pnpm install
pnpm typecheck   # tsc --noEmit equivalent, strict + exactOptionalPropertyTypes
pnpm build       # emits lib/index.js and lib/types/*.d.ts
pnpm smoke       # registers against a fake ctx and calls the live core
```

`pnpm smoke` requires the core engine on `http://localhost:3001` (or
`MICROBALANCE_CORE_URL`). It exercises every read-only report and both error
paths (unbalanced journal, missing journal) without mutating the ledger.

## File structure

```text
microbalance-tools/
├── package.json
├── tsconfig.json          # DSH-compatible project config
├── tsconfig.build.json    # standalone JS + declaration emit
├── tsconfig.check.json    # strict noEmit check (src + scripts)
├── scripts/
│   └── smoke.ts
└── src/
    ├── index.ts           # name / inject / apply
    ├── tools.ts           # 13 defineTool definitions
    ├── core-client.ts     # fetch client, no-throw error mapping
    ├── prompt.ts          # system-prompt section text
    ├── render.ts          # JSON + ERROR [CODE] projection
    └── types.ts           # type aliases for payloads/results
```
