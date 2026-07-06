import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMockClient } from './mock-client.js';
import { getTeamTools } from '../tools/team.js';

describe('Team Tools — employees', () => {
  let client: ReturnType<typeof createMockClient>;
  let tools: ReturnType<typeof getTeamTools>;

  beforeEach(() => {
    vi.clearAllMocks();
    client = createMockClient();
    tools = getTeamTools(client);
  });

  it('list_employees calls the v2 group with cursor params and normalizes', async () => {
    (client.get as any).mockResolvedValue({ items: [{ id: 'e1' }], nextCursor: 'c2' });

    const result = await tools.list_employees.handler({ limit: 10, cursor: 'c1' });

    expect(client.get).toHaveBeenCalledWith('/employees', { limit: 10, cursor: 'c1' }, 'v2');
    expect(result).toEqual({ items: [{ id: 'e1' }], nextCursor: 'c2' });
  });

  it('get_employee fetches a single employee on v2', async () => {
    await tools.get_employee.handler({ employeeId: 'abc123' });
    expect(client.get).toHaveBeenCalledWith('/employees/abc123', undefined, 'v2');
  });

  it('create_employee posts the data verbatim on v2', async () => {
    const data = { name: 'Jane', email: 'jane@acme.com' };
    await tools.create_employee.handler({ data });
    expect(client.post).toHaveBeenCalledWith('/employees', data, 'v2');
  });

  it('update_employee_contract puts to the contract subresource', async () => {
    const data = { salary: 30000 };
    await tools.update_employee_contract.handler({ employeeId: 'abc', data });
    expect(client.put).toHaveBeenCalledWith('/employees/abc/contract', data, 'v2');
  });

  it('delete_employee deletes on v2', async () => {
    await tools.delete_employee.handler({ employeeId: 'abc' });
    expect(client.delete).toHaveBeenCalledWith('/employees/abc', 'v2');
  });
});
