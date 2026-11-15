/**
 * Local smoke check for the plugin. It does not need a live Cordis host:
 * `defineTool` validates every schema at import time, `apply()` is driven with
 * a recording context, and read-only tools call the live core engine on :3001.
 *
 * Run from the plugin directory: `pnpm smoke`
 * Override the engine URL with `MICROBALANCE_CORE_URL`.
 */

import type { Context } from '@deepseek-ai/cordis'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import { apply, inject, name } from '../src/index.ts'
import { isCoreError } from '../src/render.ts'
import { microbalanceTools } from '../src/tools.ts'
import type { CoreError, TrialBalanceResult } from '../src/types.ts'

type CallOptions = {
  name: string
  args: Record<string, unknown>
}

const registered: string[] = []
const sections: Array<{
  name: string
  order: number
  text: string
  interpolate?: boolean
}> = []

const fakeContext = {
  tools: {
    register(tool: ToolDefinition): () => void {
      registered.push(tool.name)
      return () => undefined
    },
  },
  systemPrompt: {
    section(section: {
      name: string
      order: number
      text: string
      interpolate?: boolean
    }): () => void {
      sections.push(section)
      return () => undefined
    },
  },
}

function byName(toolName: string): ToolDefinition {
  const tool = microbalanceTools.find((candidate) => candidate.name === toolName)
  if (tool === undefined) throw new Error(`missing tool: ${toolName}`)
  return tool
}

async function invoke({ name: toolName, args }: CallOptions): Promise<unknown> {
  return byName(toolName).execute(args, {} as never)
}

function describe(value: unknown): string {
  if (isCoreError(value)) return `ERROR [${value.code}]: ${value.error}`
  return JSON.stringify(value).slice(0, 180)
}

function expectError(value: unknown, label: string): CoreError {
  if (!isCoreError(value)) {
    throw new Error(`${label}: expected a CoreError, got ${describe(value)}`)
  }
  return value
}

async function main(): Promise<void> {
  console.log(`plugin: ${name}`);
  console.log(`inject: ${inject.join(', ')}`)

  apply(fakeContext as unknown as Context)

  if (registered.length !== 23) {
    throw new Error(`expected 23 registrations, got ${registered.length}`)
  }
  if (sections.length !== 1) {
    throw new Error(`expected 1 prompt section, got ${sections.length}`)
  }

  const section = sections[0]
  if (section === undefined) throw new Error('prompt section missing')
  console.log(`tools: ${registered.join(', ')}`)
  console.log(
    `section: ${section.name} @ ${section.order} (${section.text.length} chars)`,
  )

  const trialBalance = await invoke({ name: 'get_trial_balance', args: {} })
  if (isCoreError(trialBalance)) throw new Error(describe(trialBalance))
  const accounts = (trialBalance as TrialBalanceResult).accounts
  console.log(
    `get_trial_balance: ${accounts.length} accounts, balanced=${(trialBalance as TrialBalanceResult).balanced}`,
  )

  const accountId = accounts[0]?.accountId
  if (accountId === undefined) throw new Error('trial balance returned no accounts')

  const reports: CallOptions[] = [
    { name: 'get_ar_aging', args: {} },
    { name: 'get_ap_aging', args: {} },
    { name: 'get_customers', args: {} },
    { name: 'get_vendors', args: {} },
    { name: 'get_items', args: {} },
    { name: 'get_bills', args: {} },
    { name: 'get_tax_summary', args: {} },
    { name: 'get_pending_journals', args: {} },
    { name: 'get_unreconciled_bank_transactions', args: {} },
    {
      name: 'get_profit_and_loss',
      args: { startDate: '2026-01-01', endDate: '2026-12-31' },
    },
    { name: 'get_balance_sheet', args: { asOfDate: '2026-12-31' } },
    { name: 'get_general_ledger', args: { accountId } },
  ]

  for (const call of reports) {
    const value = await invoke(call)
    if (isCoreError(value)) throw new Error(`${call.name}: ${describe(value)}`)
    console.log(`${call.name}: ok (${describe(value)})`)
  }

  const unbalanced = await invoke({
    name: 'propose_journal_entry',
    args: {
      memo: 'smoke test: deliberately unbalanced',
      lines: [{ accountId, debit: '1.00' }],
    },
  })
  const validation = expectError(unbalanced, 'unbalanced journal')
  console.log(`error path (journal): ${validation.code} — ${validation.error}`)

  const missing = await invoke({
    name: 'approve_journal',
    args: { journalId: 'smoke-test-missing-journal' },
  })
  const notFound = expectError(missing, 'missing journal')
  console.log(`error path (approve): ${notFound.code} — ${notFound.error}`)

  console.log('smoke check passed')
}

main().catch((error: unknown) => {
  console.error('smoke check failed:', error)
  process.exitCode = 1
})
