import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMockClient } from './mock-client.js';
import { getTreasuryV2Tools } from '../tools/treasury-v2.js';

describe('Treasury v2 Tools — bank accounts & movements', () => {
  let client: ReturnType<typeof createMockClient>;
  let tools: ReturnType<typeof getTreasuryV2Tools>;

  beforeEach(() => {
    vi.clearAllMocks();
    client = createMockClient();
    tools = getTreasuryV2Tools(client);
  });

  it('list_bank_accounts lists on v2', async () => {
    (client.get as any).mockResolvedValue({ items: [{ id: 'a1' }], nextCursor: 'n1' });
    const result = await tools.list_bank_accounts.handler({});
    expect(client.get).toHaveBeenCalledWith('/treasury/accounts', {}, 'v2');
    expect(result).toEqual({ items: [{ id: 'a1' }], nextCursor: 'n1' });
  });

  it('bank account CRUD and archive hit the right routes', async () => {
    await tools.get_bank_account.handler({ accountId: 'a1' });
    expect(client.get).toHaveBeenCalledWith('/treasury/accounts/a1', undefined, 'v2');

    const data = { name: 'BBVA operativa' };
    await tools.create_bank_account.handler({ data });
    expect(client.post).toHaveBeenCalledWith('/treasury/accounts', data, 'v2');

    await tools.update_bank_account.handler({ accountId: 'a1', data });
    expect(client.put).toHaveBeenCalledWith('/treasury/accounts/a1', data, 'v2');

    await tools.delete_bank_account.handler({ accountId: 'a1' });
    expect(client.delete).toHaveBeenCalledWith('/treasury/accounts/a1', 'v2');

    await tools.archive_bank_account.handler({ accountId: 'a1' });
    expect(client.post).toHaveBeenCalledWith('/treasury/accounts/a1/archive', undefined, 'v2');
  });

  it('movement tools address the account subresources', async () => {
    (client.get as any).mockResolvedValue([{ id: 'm1' }]);
    const bankMovementsResult = await tools.list_bank_movements.handler({
      accountId: 'a1',
      limit: 50,
    });
    expect(client.get).toHaveBeenCalledWith(
      '/treasury/accounts/a1/bank-movements',
      { limit: 50 },
      'v2'
    );
    expect(bankMovementsResult).toEqual({ items: [{ id: 'm1' }] });

    const data = { amount: -120.5, concept: 'AWS June' };
    await tools.create_bank_movement.handler({ accountId: 'a1', data });
    expect(client.post).toHaveBeenCalledWith('/treasury/accounts/a1/bank-movements', data, 'v2');

    await tools.reconcile_bank_movement.handler({ accountId: 'a1', movementId: 'm1', data: {} });
    expect(client.post).toHaveBeenCalledWith(
      '/treasury/accounts/a1/bank-movements/m1/reconcile',
      {},
      'v2'
    );

    (client.get as any).mockResolvedValue({ items: [] });
    const cashMovementsResult = await tools.list_cash_movements.handler({ accountId: 'a1' });
    expect(client.get).toHaveBeenCalledWith('/treasury/accounts/a1/cash-movements', {}, 'v2');
    expect(cashMovementsResult).toEqual({ items: [] });
  });
});

describe('Treasury v2 Tools — invoicing forecasts', () => {
  let client: ReturnType<typeof createMockClient>;
  let tools: ReturnType<typeof getTreasuryV2Tools>;

  beforeEach(() => {
    vi.clearAllMocks();
    client = createMockClient();
    tools = getTreasuryV2Tools(client);
  });

  const BASE = '/treasury/cashflow/invoicing-forecasts';

  it('forecast CRUD hits the cashflow routes', async () => {
    (client.get as any).mockResolvedValue({ items: [] });
    await tools.list_invoicing_forecasts.handler({});
    expect(client.get).toHaveBeenCalledWith(BASE, {}, 'v2');

    await tools.get_invoicing_forecast.handler({ forecastId: 'f1' });
    expect(client.get).toHaveBeenCalledWith(`${BASE}/f1`, undefined, 'v2');

    const data = { amount: 5000, date: '2026-08-01' };
    await tools.create_invoicing_forecast.handler({ data });
    expect(client.post).toHaveBeenCalledWith(BASE, data, 'v2');

    await tools.update_invoicing_forecast.handler({ forecastId: 'f1', data });
    expect(client.put).toHaveBeenCalledWith(`${BASE}/f1`, data, 'v2');

    await tools.delete_invoicing_forecast.handler({ forecastId: 'f1' });
    expect(client.delete).toHaveBeenCalledWith(`${BASE}/f1`, 'v2');
  });
});
