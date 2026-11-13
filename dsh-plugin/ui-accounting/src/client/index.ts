/**
 * MicroBalance accounting pages, browser half.
 *
 * Registers the dashboard and statement panels, their sidebar entries, and the
 * MicroBalance brand identity. Each page talks to microbalance-core over its
 * stable ai-intent endpoint.
 */
import './fonts.css'
import type { JSX } from 'react'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
// Type-only: pulls the ui-layout `main` keyed slot and ui-sidebar's panellist
// declaration into the SlotMap, and the renderer-owned slots service.
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import { MicroBalanceMark, MicroBalanceName } from './Brand.tsx'
import { BalanceSheetPage } from './BalanceSheet.tsx'
import { ChartOfAccountsPage } from './ChartOfAccounts.tsx'
import { DashboardPage } from './Dashboard.tsx'
import { ManualJournalPage } from './ManualJournal.tsx'
import { ProfitLossPage } from './ProfitLoss.tsx'
import { TrialBalancePage } from './TrialBalance.tsx'
import {
  BookOpenIcon,
  HomeIcon,
  LandmarkIcon,
  ListIcon,
  ScaleIcon,
  TrendingUpIcon,
} from './icons.tsx'

/** Required client service: the slot registry. */
export const inject = ['slots']

interface PanelDefinition {
  readonly id: MainPanelId
  readonly label: string
  readonly order: number
  readonly Page: () => JSX.Element
  readonly Icon: (props: { size?: number }) => JSX.Element
}

const PANELS: readonly PanelDefinition[] = [
  {
    id: 'dashboard' as MainPanelId,
    label: 'Dashboard',
    order: -100,
    Page: DashboardPage,
    Icon: HomeIcon,
  },
  {
    id: 'accounts' as MainPanelId,
    label: 'General Ledger::Chart of Accounts',
    order: 20,
    Page: ChartOfAccountsPage,
    Icon: ListIcon,
  },
  {
    id: 'journals' as MainPanelId,
    label: 'General Ledger::Manual Journal',
    order: 30,
    Page: ManualJournalPage,
    Icon: BookOpenIcon,
  },
  {
    id: 'trial-balance' as MainPanelId,
    label: 'General Ledger::Trial Balance',
    order: 40,
    Page: TrialBalancePage,
    Icon: ScaleIcon,
  },
  {
    id: 'profit-loss' as MainPanelId,
    label: 'Financial Statements::Profit & Loss',
    order: 50,
    Page: ProfitLossPage,
    Icon: TrendingUpIcon,
  },
  {
    id: 'balance-sheet' as MainPanelId,
    label: 'Financial Statements::Balance Sheet',
    order: 60,
    Page: BalanceSheetPage,
    Icon: LandmarkIcon,
  },
]

/**
 * Register the accounting panels, their sidebar entries, and the brand.
 * @param ctx - browser plugin context with the slot registry.
 */
export function apply(ctx: ClientContext): void {
  ctx.slots.inject('sidebar.brand.mark', () =>
    ctx.slots.inject('sidebar.brand.name', function* () {
      yield ctx.slots.register({ name: 'sidebar.brand.mark' }, MicroBalanceMark)
      yield ctx.slots.register({ name: 'sidebar.brand.name' }, MicroBalanceName)
    }))

  for (const panel of PANELS) {
    ctx.slots.inject('main', () =>
      ctx.slots.register(
        { name: 'main', key: panel.id },
        panel.Page,
      ),
    )

    ctx.slots.inject('sidebar.panellist', () =>
      ctx.slots.register(
        {
          name: 'sidebar.panellist',
          id: panel.id,
          order: panel.order,
          label: panel.label,
        },
        panel.Icon,
      ),
    )
  }
}
