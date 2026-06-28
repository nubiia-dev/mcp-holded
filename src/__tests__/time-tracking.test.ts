import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMockClient } from './mock-client.js';
import { getTimeTrackingTools, unixToLocalISODate } from '../tools/time-tracking.js';

// Unix timestamp for local midnight on 2026-06-02 in the test host's timezone.
function localMidnightUnix(year: number, month: number, day: number): number {
  return Math.floor(new Date(year, month - 1, day).getTime() / 1000);
}

describe('Time Tracking Tools', () => {
  let client: ReturnType<typeof createMockClient>;
  let tools: ReturnType<typeof getTimeTrackingTools>;

  const day1 = localMidnightUnix(2026, 6, 1);
  const day2 = localMidnightUnix(2026, 6, 2);
  const day3 = localMidnightUnix(2026, 6, 3);

  const sampleProjects = [
    {
      id: 'project-1',
      name: 'SAP',
      timeTracking: [
        { timeId: 't1', duration: 28800, date: day1, approved: 1 },
        { timeId: 't2', duration: 28800, date: day2, approved: 0 },
        { timeId: 't3', duration: 9000, date: day3, approved: 1 },
      ],
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    client = createMockClient();
    tools = getTimeTrackingTools(client);
  });

  describe('list_project_times', () => {
    it('targets the projects API base, not invoicing', async () => {
      await tools.list_project_times.handler({});
      expect(client.get).toHaveBeenCalledWith('/projects/times', undefined, 'projects');
    });

    it('returns the nested per-project structure unchanged when no filters given', async () => {
      vi.mocked(client.get).mockResolvedValueOnce(sampleProjects);
      const result = (await tools.list_project_times.handler({})) as typeof sampleProjects;
      expect(result[0].timeTracking).toHaveLength(3);
    });

    it('keeps only approved entries when approvedOnly is set', async () => {
      vi.mocked(client.get).mockResolvedValueOnce(sampleProjects);
      const result = (await tools.list_project_times.handler({
        approvedOnly: true,
      })) as typeof sampleProjects;
      expect(result[0].timeTracking.map((e) => e.timeId)).toEqual(['t1', 't3']);
    });

    it('filters by inclusive date range', async () => {
      vi.mocked(client.get).mockResolvedValueOnce(sampleProjects);
      const result = (await tools.list_project_times.handler({
        startDate: '2026-06-02',
        endDate: '2026-06-02',
      })) as typeof sampleProjects;
      expect(result[0].timeTracking.map((e) => e.timeId)).toEqual(['t2']);
    });

    it('flattens entries and computes hours', async () => {
      vi.mocked(client.get).mockResolvedValueOnce(sampleProjects);
      const result = (await tools.list_project_times.handler({
        flatten: true,
        approvedOnly: true,
      })) as Array<{ timeId: string; hours: number; projectName: string }>;
      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({ timeId: 't1', hours: 8, projectName: 'SAP' });
      expect(result[1]).toMatchObject({ timeId: 't3', hours: 2.5 });
    });
  });

  describe('list_project_times_by_project', () => {
    it('requests the project-scoped endpoint on the projects API', async () => {
      vi.mocked(client.get).mockResolvedValueOnce(sampleProjects[0]);
      await tools.list_project_times_by_project.handler({ projectId: 'project-1' });
      expect(client.get).toHaveBeenCalledWith('/projects/project-1/times', undefined, 'projects');
    });

    it('applies filters to a single project response', async () => {
      vi.mocked(client.get).mockResolvedValueOnce(sampleProjects[0]);
      const result = (await tools.list_project_times_by_project.handler({
        projectId: 'project-1',
        approvedOnly: true,
      })) as Array<{ timeTracking: Array<{ timeId: string }> }>;
      expect(result[0].timeTracking.map((e) => e.timeId)).toEqual(['t1', 't3']);
    });
  });

  describe('get_project_time', () => {
    it('requests a single entry on the projects API', async () => {
      await tools.get_project_time.handler({
        projectId: 'project-1',
        timeTrackingId: 't1',
      });
      expect(client.get).toHaveBeenCalledWith(
        '/projects/project-1/times/t1',
        undefined,
        'projects'
      );
    });
  });

  describe('unixToLocalISODate', () => {
    it('formats a local-midnight timestamp to its calendar day', () => {
      expect(unixToLocalISODate(day2)).toBe('2026-06-02');
    });
  });
});
