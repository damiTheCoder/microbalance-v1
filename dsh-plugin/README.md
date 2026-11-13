# DeepSeek Harness plugin

`ui-accounting` renders the MicroBalance workspace inside the DeepSeek Harness
Web UI. It is a client plugin, not a standalone app, and expects the host
packages from a DeepSeek Harness checkout:

- `@deepseek-ai/dsh-client-ui-primitives`
- `@deepseek-ai/dsh-client-ui-slots`
- `@deepseek-ai/dsh-client-ui-theme`

## Install into a harness checkout

```bash
cp -R ui-accounting <dsh-checkout>/packages/client/ui-accounting
cd <dsh-checkout>/packages/client/ui-accounting
pnpm exec tsc -p tsconfig.json
pnpm exec tsdown
```

Register the built entry in `~/.dsh/profiles/web/cordis.patch.yml`:

```yaml
- insert:
    - id: ui-microbalance-accounting
      name: '<dsh-checkout>/packages/client/ui-accounting/lib/index.js'
```

## What it adds

- Sidebar brand mark and name ("Microbalance").
- Dashboard with KPI cards and a Recharts revenue/expense chart.
- Chart of Accounts, Manual Journal, Trial Balance, Profit & Loss, and
  Balance Sheet pages.
- Shared Naira formatting, grey card surfaces, and the Glacial Indifference
  typeface.

The plugin assumes the ledger API is reachable at the URL configured for the
harness. It consumes the core engine's trial balance and statement intents.
