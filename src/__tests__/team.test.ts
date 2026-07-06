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
    expect(client.post).toHaveBeenCalledWith('/employees/e1/clock-in', undefined, 'v2');
  });

  it('clock_out_employee posts to the clock-out action', async () => {
    await tools.clock_out_employee.handler({ employeeId: 'e1' });
    expect(client.post).toHaveBeenCalledWith('/employees/e1/clock-out', undefined, 'v2');
  });

  it('list_employee_times lists globally by default', async () => {
    (client.get as any).mockResolvedValue([]);
    await tools.list_employee_times.handler({});
    expect(client.get).toHaveBeenCalledWith('/employee-times', {}, 'v2');
  });

  it('list_employee_times scopes to one employee when employeeId is given', async () => {
    (client.get as any).mockResolvedValue([]);
    await tools.list_employee_times.handler({ employeeId: 'e1', limit: 5 });
    expect(client.get).toHaveBeenCalledWith('/employees/e1/times', { limit: 5 }, 'v2');
  });

  it('create_employee_time posts the record under the employee', async () => {
    const data = { start: '2026-07-01T09:00:00Z', end: '2026-07-01T17:00:00Z' };
    await tools.create_employee_time.handler({ employeeId: 'e1', data });
    expect(client.post).toHaveBeenCalledWith('/employees/e1/times', data, 'v2');
  });

  it('update/delete_employee_time address the time record directly', async () => {
    await tools.update_employee_time.handler({ timeId: 't1', data: { note: 'x' } });
    expect(client.put).toHaveBeenCalledWith('/employee-times/t1', { note: 'x' }, 'v2');

    await tools.delete_employee_time.handler({ timeId: 't1' });
    expect(client.delete).toHaveBeenCalledWith('/employee-times/t1', 'v2');
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
    expect(client.get).toHaveBeenCalledWith('/salary-records', { limit: 20 }, 'v2');
  });

  it('get_salary_record fetches one record', async () => {
    await tools.get_salary_record.handler({ salaryRecordId: 's1' });
    expect(client.get).toHaveBeenCalledWith('/salary-records/s1', undefined, 'v2');
  });

  it('create/update/delete_salary_record hit the CRUD routes', async () => {
    const data = { employeeId: 'e1', lines: [] };
    await tools.create_salary_record.handler({ data });
    expect(client.post).toHaveBeenCalledWith('/salary-records', data, 'v2');

    await tools.update_salary_record.handler({ salaryRecordId: 's1', data });
    expect(client.put).toHaveBeenCalledWith('/salary-records/s1', data, 'v2');

    await tools.delete_salary_record.handler({ salaryRecordId: 's1' });
    expect(client.delete).toHaveBeenCalledWith('/salary-records/s1', 'v2');
  });

  it('get_salary_record_defaults fetches the defaults', async () => {
    await tools.get_salary_record_defaults.handler();
    expect(client.get).toHaveBeenCalledWith('/salary-records/form-data', undefined, 'v2');
  });
});
