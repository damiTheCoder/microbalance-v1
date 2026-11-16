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
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import { MicroBalanceMark, MicroBalanceName } from './Brand.tsx'
import { BalanceSheetPage } from './BalanceSheet.tsx'
import { ChartOfAccountsPage } from './ChartOfAccounts.tsx'
import { DashboardPage } from './Dashboard.tsx'
import { ManualJournalPage } from './ManualJournal.tsx'
import { ProfitLossPage } from './ProfitLoss.tsx'
import { ArAgingPage, CustomersPage, InvoicesPage } from './Sales.tsx'
import { BankReconPage, PaymentsPage } from './Banking.tsx'
import { ApprovalsPage } from './Approvals.tsx'
import { ApAgingPage, BillsPage, VendorsPage } from './Purchases.tsx'
import { ProductsPage, StockOverviewPage } from './Inventory.tsx'
import { TaxDashboardPage } from './Tax.tsx'
import { EmployeesPage, PayrollPage } from './Payroll.tsx'
import { ExpenseCategoriesPage, ExpensesPage } from './Expenses.tsx'
import { AssetRegisterPage, DepreciationPage } from './FixedAssets.tsx'
import { BudgetVsActualPage, BudgetsPage } from './Budgets.tsx'
import { BusinessProfilePage } from './Settings.tsx'
import { withAuth } from './AuthGate.tsx'
import { DocumentCentrePage } from './Documents.tsx'
import { AuditTrailPage, PeriodLockPage } from './Audit.tsx'
import { LensButton } from './Lens.tsx'
import { EquityPage, LoansPage } from './EquityLoans.tsx'
import { ProjectsPage, ProjectProfitabilityPage } from './Projects.tsx'
import { TrialBalancePage } from './TrialBalance.tsx'
import {
  BarChartIcon,
  BookOpenIcon,
  BuildingIcon,
  CalendarIcon,
  CheckCircleIcon,
  FileTextIcon,
  HomeIcon,
  HourglassIcon,
  LandmarkIcon,
  LayoutGridIcon,
  LinkIcon,
  ListIcon,
  PackageIcon,
  PercentIcon,
  ReceiptIcon,
  ScaleIcon,
  SettingsIcon,
  TargetIcon,
  TrendingDownIcon,
  TrendingUpIcon,
  TruckIcon,
  UsersIcon,
  WalletIcon,
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
    id: 'approvals' as MainPanelId,
    label: 'General Ledger::Journal Approvals',
    order: 35,
    Page: ApprovalsPage,
    Icon: CheckCircleIcon,
  },
  {
    id: 'trial-balance' as MainPanelId,
    label: 'General Ledger::Trial Balance',
    order: 40,
    Page: TrialBalancePage,
    Icon: ScaleIcon,
  },
  {
    id: 'customers' as MainPanelId,
    label: 'Sales & Receivables::Customers',
    order: 45,
    Page: CustomersPage,
    Icon: UsersIcon,
  },
  {
    id: 'invoices' as MainPanelId,
    label: 'Sales & Receivables::Invoices',
    order: 46,
    Page: InvoicesPage,
    Icon: ReceiptIcon,
  },
  {
    id: 'ar-aging' as MainPanelId,
    label: 'Sales & Receivables::AR Aging',
    order: 47,
    Page: ArAgingPage,
    Icon: HourglassIcon,
  },
  {
    id: 'payments' as MainPanelId,
    label: 'Banking::Payments',
    order: 48,
    Page: PaymentsPage,
    Icon: WalletIcon,
  },
  {
    id: 'bank-recon' as MainPanelId,
    label: 'Banking::Bank Recon',
    order: 49,
    Page: BankReconPage,
    Icon: LinkIcon,
  },
  {
    id: 'vendors' as MainPanelId,
    label: 'Purchases & Payables::Vendors',
    order: 50,
    Page: VendorsPage,
    Icon: BuildingIcon,
  },
  {
    id: 'bills' as MainPanelId,
    label: 'Purchases & Payables::Bills',
    order: 51,
    Page: BillsPage,
    Icon: FileTextIcon,
  },
  {
    id: 'ap-aging' as MainPanelId,
    label: 'Purchases & Payables::AP Aging',
    order: 52,
    Page: ApAgingPage,
    Icon: HourglassIcon,
  },
  {
    id: 'products' as MainPanelId,
    label: 'Inventory::Products',
    order: 53,
    Page: ProductsPage,
    Icon: PackageIcon,
  },
  {
    id: 'stock-overview' as MainPanelId,
    label: 'Inventory::Stock Overview',
    order: 54,
    Page: StockOverviewPage,
    Icon: LayoutGridIcon,
  },
  {
    id: 'tax-dashboard' as MainPanelId,
    label: 'Tax & Compliance::Tax Dashboard',
    order: 55,
    Page: TaxDashboardPage,
    Icon: PercentIcon,
  },
  {
    id: 'employees' as MainPanelId,
    label: 'Payroll::Employees',
    order: 56,
    Page: EmployeesPage,
    Icon: UsersIcon,
  },
  {
    id: 'payroll' as MainPanelId,
    label: 'Payroll::Run Payroll',
    order: 57,
    Page: PayrollPage,
    Icon: CalendarIcon,
  },
  {
    id: 'expenses' as MainPanelId,
    label: 'Expenses::All Expenses',
    order: 58,
    Page: ExpensesPage,
    Icon: WalletIcon,
  },
  {
    id: 'expense-categories' as MainPanelId,
    label: 'Expenses::Expense Categories',
    order: 59,
    Page: ExpenseCategoriesPage,
    Icon: ListIcon,
  },
  {
    id: 'assets' as MainPanelId,
    label: 'Fixed Assets::Asset Register',
    order: 60,
    Page: AssetRegisterPage,
    Icon: TruckIcon,
  },
  {
    id: 'depreciation' as MainPanelId,
    label: 'Fixed Assets::Run Depreciation',
    order: 61,
    Page: DepreciationPage,
    Icon: TrendingDownIcon,
  },
  {
    id: 'budgets' as MainPanelId,
    label: 'Budgeting::Budgets',
    order: 62,
    Page: BudgetsPage,
    Icon: TargetIcon,
  },
  {
    id: 'budget-vs-actual' as MainPanelId,
    label: 'Budgeting::Budget vs Actual',
    order: 63,
    Page: BudgetVsActualPage,
    Icon: BarChartIcon,
  },
  {
    id: 'business-profile' as MainPanelId,
    label: 'Settings::Business Profile',
    order: 64,
    Page: BusinessProfilePage,
    Icon: SettingsIcon,
  },
  {
    id: 'document-centre' as MainPanelId,
    label: 'Documents::Document Centre',
    order: 65,
    Page: DocumentCentrePage,
    Icon: FileTextIcon,
  },
  {
    id: 'audit-trail' as MainPanelId,
    label: 'Audit & Compliance::Audit Trail',
    order: 66,
    Page: AuditTrailPage,
    Icon: CheckCircleIcon,
  },
  {
    id: 'period-lock' as MainPanelId,
    label: 'Audit & Compliance::Period Lock',
    order: 67,
    Page: PeriodLockPage,
    Icon: HourglassIcon,
  },
  {
    id: 'equity' as MainPanelId,
    label: 'Equity & Financing::Equity',
    order: 68,
    Page: EquityPage,
    Icon: BuildingIcon,
  },
  {
    id: 'loans' as MainPanelId,
    label: 'Equity & Financing::Loans',
    order: 69,
    Page: LoansPage,
    Icon: LandmarkIcon,
  },
  {
    id: 'projects' as MainPanelId,
    label: 'Projects::Project List',
    order: 70,
    Page: ProjectsPage,
    Icon: TargetIcon,
  },
  {
    id: 'project-profitability' as MainPanelId,
    label: 'Projects::Profitability',
    order: 71,
    Page: ProjectProfitabilityPage,
    Icon: BarChartIcon,
  },
  {
    id: 'profit-loss' as MainPanelId,
    label: 'Financial Statements::Profit & Loss',
    order: 70,
    Page: ProfitLossPage,
    Icon: TrendingUpIcon,
  },
  {
    id: 'balance-sheet' as MainPanelId,
    label: 'Financial Statements::Balance Sheet',
    order: 80,
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

  // Dual-action lens in the chat composer (next to the voice control).
  ctx.slots.inject('conversation.input.right', () =>
    ctx.slots.register({ name: 'conversation.input.right', id: 'lens', order: 90 }, LensButton))

  for (const panel of PANELS) {
    ctx.slots.inject('main', () =>
      ctx.slots.register(
        { name: 'main', key: panel.id },
        withAuth(panel.Page),
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
