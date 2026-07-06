import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HoldedClient } from '../holded-client.js';
import { getTeamTools } from '../tools/team.js';

// Mock node-fetch so no real network calls are made
vi.mock('node-fetch', () => ({
  default: vi.fn(),
}));

describe('v2 tool registration — config error surfaced on v1-only tenant', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('surfaces HOLDED_API_KEY_V2 config error when a v2 tool is called on a v1-only tenant', async () => {
    // A client without a v2 key — simulates a tenant that only has HOLDED_API_KEY set
    const v1OnlyClient = new HoldedClient('v1-key');

    // Tools are registered unconditionally in the CallTool handler
    const tools = getTeamTools(v1OnlyClient);

    // Calling a v2 tool must reject with the config error, not "Unknown tool"
    await expect(tools.list_employees.handler({})).rejects.toThrow(/HOLDED_API_KEY_V2/);
  });
});
