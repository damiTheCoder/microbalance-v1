/**
 * Module 2 smoke test: create a customer, create an invoice, and confirm the
 * engine proposed a PENDING journal (Debit AR, Credit Sales Revenue).
 *
 * Usage: pnpm exec tsx src/test-sales.ts (core must be running on :3001)
 */
const BASE = process.env.CORE_API_URL ?? 'http://127.0.0.1:3001';

async function intent<T>(action: string, payload: unknown = {}): Promise<T> {
  const response = await fetch(`${BASE}/api/ai-intent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, payload }),
  });
  const body = (await response.json()) as { data?: T; error?: string };
  if (!response.ok) {
    throw new Error(`${action} failed: ${body.error ?? `HTTP ${response.status}`}`);
  }
  return body.data as T;
}

interface Customer {
  id: string;
  name: string;
}

interface InvoiceResult {
  invoice: { id: string; invoiceNumber: string; totalAmount: string };
  journal: { id: string; status: string };
}

const today = new Date().toISOString().slice(0, 10);

const customer = await intent<Customer>('CREATE_CUSTOMER', {
  name: 'Sales Test Customer',
  email: 'sales-test@example.com',
  phone: '+234 800 000 0000',
});
console.log(`customer ${customer.id} (${customer.name})`);

const customers = await intent<Customer[]>('GET_CUSTOMERS');
if (!customers.some((row) => row.id === customer.id)) {
  throw new Error('GET_CUSTOMERS did not include the created customer');
}
console.log(`GET_CUSTOMERS returned ${customers.length} customer(s)`);

const result = await intent<InvoiceResult>('CREATE_INVOICE', {
  customerId: customer.id,
  date: today,
  items: [{ description: 'Consulting services', quantity: 2, unitPrice: 25_000 }],
});
console.log(
  `invoice ${result.invoice.invoiceNumber} total ${result.invoice.totalAmount} journal ${result.journal.id} status ${result.journal.status}`,
);

if (result.journal.status !== 'PENDING') {
  throw new Error(`Expected PENDING journal, got ${result.journal.status}`);
}
console.log('OK: invoice journal is PENDING');
