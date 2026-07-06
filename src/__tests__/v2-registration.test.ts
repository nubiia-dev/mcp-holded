import { describe, it, expect } from 'vitest';
import { HoldedClient } from '../holded-client.js';
import { getTeamTools } from '../tools/team.js';

describe('v2-only client — all tools registered unconditionally', () => {
  it('constructor throws with env var guidance when api key is empty', () => {
    expect(() => new HoldedClient('')).toThrow(/HOLDED_API_KEY/);
    expect(() => new HoldedClient('')).toThrow(/HOLDED_API_KEY_V2/);
    expect(() => new HoldedClient('')).toThrow(/v2 key/);
  });

  it('team tools are registered regardless of key type', () => {
    const client = new HoldedClient('pat_test_key');
    const tools = getTeamTools(client);
    expect(tools).toHaveProperty('list_employees');
    expect(tools).toHaveProperty('get_employee');
    expect(tools).toHaveProperty('list_salary_records');
  });
});
