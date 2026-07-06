import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMockClient } from './mock-client.js';
import { getLedgerTools } from '../tools/ledger.js';

describe('Ledger Tools (api v2)', () => {
  let client: ReturnType<typeof createMockClient>;
  let tools: ReturnType<typeof getLedgerTools>;

  beforeEach(() => {
    vi.clearAllMocks();
    client = createMockClient();
    tools = getLedgerTools(client);
  });

  it('list_ledger_entries lists on v2 with cursor params', async () => {
    (client.get as any).mockResolvedValue({ items: [{ id: '1' }], nextCursor: 'abc' });
    const result = await tools.list_ledger_entries.handler({ limit: 100 });
    expect(result).toEqual({ items: [{ id: '1' }], nextCursor: 'abc' });
  });

  it('list_ledger_entries forwards start_date and end_date as query params', async () => {
    (client.get as any).mockResolvedValue({ items: [] });
    await tools.list_ledger_entries.handler({ start_date: '2025-01-01', end_date: '2025-12-31' });
    expect(client.get).toHaveBeenCalledWith('/ledger-entries', {
      start_date: '2025-01-01',
      end_date: '2025-12-31',
    });
  });

  it('create_ledger_entry posts the entry verbatim', async () => {
    (client.post as any).mockResolvedValue({ id: 'le1' });
    const data = { date: '2026-06-30', lines: [{ account: '6400000000', debit: 100 }] };
    const result = await tools.create_ledger_entry.handler({ data });
    expect(result).toEqual({ id: 'le1' });
  });

  it('list_accounting_accounts lists on v2', async () => {
    (client.get as any).mockResolvedValue([{ id: 'acc1' }]);
    const result = await tools.list_accounting_accounts.handler({});
    expect(result).toEqual({ items: [{ id: 'acc1' }] });
  });

  it('create_accounting_account posts on v2', async () => {
    const data = { num: '6290000001', name: 'Otros servicios' };
    await tools.create_accounting_account.handler({ data });
  });
});
