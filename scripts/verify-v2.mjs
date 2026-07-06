#!/usr/bin/env node
import { readFileSync } from 'node:fs';

const envFile = (() => {
  try {
    return readFileSync(new URL('../.env.v2.local', import.meta.url), 'utf8');
  } catch {
    return '';
  }
})();
const KEY =
  process.env.HOLDED_API_KEY_V2 ||
  envFile.match(/HOLDED_API_KEY_V2=(.+)/)?.[1]?.trim();
if (!KEY) {
  console.error('No v2 key: set HOLDED_API_KEY_V2 or create .env.v2.local');
  process.exit(2);
}

const ROUTES = [
  '/contacts', '/contact-groups', '/payments', '/payment-methods', '/taxes',
  '/services', '/sales-channels', '/expenses-accounts', '/treasury/remittances',
  '/treasury/accounts', '/products', '/warehouses', '/invoices',
  '/sales-receipts', '/credit-notes', '/receipt-notes', '/estimates',
  '/proformas', '/sales-orders', '/waybills', '/purchases', '/purchase-orders',
  '/purchase-shipments', '/project-times', '/projects', '/accounting-accounts',
  '/ledger-entries?start_date=2026-01-01&end_date=2026-01-31',
  '/employees', '/employee-times', '/salary-records',
  '/treasury/cashflow/invoicing-forecasts',
];

let failures = 0;
for (const route of ROUTES) {
  const sep = route.includes('?') ? '&' : '?';
  const res = await fetch(`https://api.holded.com/api/v2${route}${sep}limit=1`, {
    headers: { Authorization: `Bearer ${KEY}` },
  });
  let keys = '';
  try {
    const body = await res.json();
    keys = Array.isArray(body) ? '[array]' : Object.keys(body).join(',');
  } catch {
    keys = '(non-json)';
  }
  const ok = res.status === 200;
  if (!ok) failures++;
  console.log(`${ok ? 'OK ' : 'FAIL'} ${res.status} ${route} → ${keys}`);
}
process.exit(failures ? 1 : 0);
