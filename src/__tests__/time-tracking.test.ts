import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMockClient } from './mock-client.js';
import { getTimeTrackingTools, unixToLocalISODate } from '../tools/time-tracking.js';

// Unix timestamp for local midnight on the given calendar day in the test host's timezone.
function localMidnightUnix(year: number, month: number, day: number): number {
  return Math.floor(new Date(year, month - 1, day).getTime() / 1000);
}

describe('Time Tracking Tools (v2)', () => {
  let client: ReturnType<typeof createMockClient>;
  let tools: ReturnType<typeof getTimeTrackingTools>;

  const day1 = localMidnightUnix(2026, 6, 1);
  const day2 = localMidnightUnix(2026, 6, 2);
  const day3 = localMidnightUnix(2026, 6, 3);

  /** Flat v2 time entries (no nested project structure). */
  const flatItems = [
    {
      timeId: 't1',
      duration: 28800,
      date: day1,
      approved: 1,
      projectId: 'project-1',
      projectName: 'SAP',
    },
    {
      timeId: 't2',
      duration: 28800,
      date: day2,
      approved: 0,
      projectId: 'project-1',
      projectName: 'SAP',
    },
    {
      timeId: 't3',
      duration: 9000,
      date: day3,
      approved: 1,
      projectId: 'project-1',
      projectName: 'SAP',
    },
  ];

  /** Simulate a v2 envelope with cursor. */
  const v2Page = { items: flatItems, cursor: 'page:2' };

  beforeEach(() => {
    vi.clearAllMocks();
    client = createMockClient();
    tools = getTimeTrackingTools(client);
  });

  describe('list_project_times', () => {
    it('calls /project-times on the v2 API base', async () => {
      await tools.list_project_times.handler({});
    });

    it('passes limit and cursor as query params', async () => {
      await tools.list_project_times.handler({ limit: 10, cursor: 'page:3' });
    });

    it('returns a normalizeV2List envelope with items and nextCursor', async () => {
      vi.mocked(client.get).mockResolvedValueOnce(v2Page);
      const result = await tools.list_project_times.handler({});
      expect(Array.isArray(result.items)).toBe(true);
      expect(result.items).toHaveLength(3);
      expect(result.nextCursor).toBe('page:2');
    });

    it('filters approved-only client-side on the returned page', async () => {
      vi.mocked(client.get).mockResolvedValueOnce(v2Page);
      const result = await tools.list_project_times.handler({ approvedOnly: true });
      const ids = (result.items as Array<{ timeId: string }>).map((e) => e.timeId);
      expect(ids).toEqual(['t1', 't3']);
    });

    it('filters by inclusive date range client-side on the returned page', async () => {
      vi.mocked(client.get).mockResolvedValueOnce(v2Page);
      const result = await tools.list_project_times.handler({
        startDate: '2026-06-02',
        endDate: '2026-06-02',
      });
      const ids = (result.items as Array<{ timeId: string }>).map((e) => e.timeId);
      expect(ids).toEqual(['t2']);
    });
  });

  describe('list_project_times_by_project', () => {
    it('calls /projects/{id}/times on the v2 API base', async () => {
      vi.mocked(client.get).mockResolvedValueOnce({ items: [] });
      await tools.list_project_times_by_project.handler({ projectId: 'project-1' });
    });

    it('passes limit and cursor as query params', async () => {
      vi.mocked(client.get).mockResolvedValueOnce({ items: [] });
      await tools.list_project_times_by_project.handler({
        projectId: 'project-1',
        limit: 5,
        cursor: 'abc',
      });
    });

    it('returns normalized v2 list and applies approvedOnly client-side', async () => {
      vi.mocked(client.get).mockResolvedValueOnce(v2Page);
      const result = await tools.list_project_times_by_project.handler({
        projectId: 'project-1',
        approvedOnly: true,
      });
      const ids = (result.items as Array<{ timeId: string }>).map((e) => e.timeId);
      expect(ids).toEqual(['t1', 't3']);
    });
  });

  describe('get_project_time', () => {
    it('calls /projects/{id}/times/{timeId} on the v2 API base', async () => {
      await tools.get_project_time.handler({ projectId: 'project-1', timeTrackingId: 't1' });
    });
  });

  describe('unixToLocalISODate', () => {
    it('formats a local-midnight timestamp to its calendar day', () => {
      expect(unixToLocalISODate(day2)).toBe('2026-06-02');
    });
  });
});
