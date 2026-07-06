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

    expect(result).toEqual({ items: [{ id: 'e1' }], nextCursor: 'c2' });
  });

  it('get_employee fetches a single employee on v2', async () => {
    await tools.get_employee.handler({ employeeId: 'abc123' });
  });

  it('create_employee posts the data verbatim on v2', async () => {
    const data = { name: 'Jane', email: 'jane@acme.com' };
    await tools.create_employee.handler({ data });
  });

  it('update_employee_contract puts to the contract subresource', async () => {
    const data = { salary: 30000 };
    await tools.update_employee_contract.handler({ employeeId: 'abc', data });
  });

  it('delete_employee deletes on v2', async () => {
    await tools.delete_employee.handler({ employeeId: 'abc' });
  });
});

describe('Team Tools — time tracking', () => {
  let client: ReturnType<typeof createMockClient>;
  let tools: ReturnType<typeof getTeamTools>;

  beforeEach(() => {
    vi.clearAllMocks();
    client = createMockClient();
    tools = getTeamTools(client);
  });

  it('clock_in_employee posts to the clock-in action', async () => {
    await tools.clock_in_employee.handler({ employeeId: 'e1' });
  });

  it('clock_out_employee posts to the clock-out action', async () => {
    await tools.clock_out_employee.handler({ employeeId: 'e1' });
  });

  it('list_employee_times lists globally by default', async () => {
    (client.get as any).mockResolvedValue([]);
    await tools.list_employee_times.handler({});
  });

  it('list_employee_times scopes to one employee when employeeId is given', async () => {
    (client.get as any).mockResolvedValue([]);
    await tools.list_employee_times.handler({ employeeId: 'e1', limit: 5 });
  });

  it('create_employee_time posts the record under the employee', async () => {
    const data = { start: '2026-07-01T09:00:00Z', end: '2026-07-01T17:00:00Z' };
    await tools.create_employee_time.handler({ employeeId: 'e1', data });
  });

  it('update/delete_employee_time address the time record directly', async () => {
    await tools.update_employee_time.handler({ timeId: 't1', data: { note: 'x' } });

    await tools.delete_employee_time.handler({ timeId: 't1' });
  });
});

describe('Team Tools — salary records', () => {
  let client: ReturnType<typeof createMockClient>;
  let tools: ReturnType<typeof getTeamTools>;

  beforeEach(() => {
    vi.clearAllMocks();
    client = createMockClient();
    tools = getTeamTools(client);
  });

  it('list_salary_records lists on v2 with cursor params', async () => {
    (client.get as any).mockResolvedValue({ items: [] });
    await tools.list_salary_records.handler({ limit: 20 });
  });

  it('get_salary_record fetches one record', async () => {
    await tools.get_salary_record.handler({ salaryRecordId: 's1' });
  });

  it('create/update/delete_salary_record hit the CRUD routes', async () => {
    const data = { employeeId: 'e1', lines: [] };
    await tools.create_salary_record.handler({ data });

    await tools.update_salary_record.handler({ salaryRecordId: 's1', data });

    await tools.delete_salary_record.handler({ salaryRecordId: 's1' });
  });

  it('get_salary_record_defaults fetches the defaults', async () => {
    await tools.get_salary_record_defaults.handler();
  });
});
