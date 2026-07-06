import { HoldedClient } from '../holded-client.js';
import { normalizeV2List, cursorParams } from '../utils/v2-pagination.js';
import {
  listProjectTimesSchema,
  projectTimesSchema,
  projectTimeIdSchema,
  withValidation,
} from '../validation.js';

/**
 * Time-tracking tools backed by the Holded **Projects API v2**
 * (`https://api.holded.com/api/v2`). These are read-only: they expose
 * the hours logged in Holded so they can be reconciled or booked elsewhere
 * (e.g. into an external time sheet). No mutating endpoints are provided.
 *
 * v2 returns a **flat cursor-paginated list** of time entries at
 * `GET /project-times`. The nested `project.timeTracking[]` shape from v1
 * no longer exists. Date-range and approved-only filters are applied
 * client-side on the returned cursor page because the v2 `/project-times`
 * endpoint does not document those as query parameters.
 */

/** A single time-tracking entry as returned by the Holded Projects v2 API. */
interface HoldedTimeEntry extends Record<string, unknown> {
  /** Duration of the entry in seconds. */
  duration?: number;
  /** Day of the entry as a Unix timestamp (seconds, local midnight). */
  date?: number;
  /** 1 when the entry has been approved, 0 otherwise. */
  approved?: number;
}

/**
 * Format a Unix timestamp (seconds) as a `YYYY-MM-DD` calendar date using the
 * host's local timezone.
 *
 * Holded stores each entry's `date` as **local midnight** expressed in Unix
 * seconds. Because the MCP runs on the user's machine (same timezone the hours
 * were logged in), local extraction reproduces the intended calendar day —
 * whereas UTC extraction can be off by one near the date boundary.
 *
 * @param unixSeconds - Unix timestamp in seconds.
 * @returns The calendar date as `YYYY-MM-DD`.
 */
export function unixToLocalISODate(unixSeconds: number): string {
  const d = new Date(unixSeconds * 1000);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Decide whether a single time entry passes the optional client-side filters.
 *
 * @param entry - The time entry to test.
 * @param filters - Optional `startDate`/`endDate` (inclusive, `YYYY-MM-DD`) and
 *   `approvedOnly` flag.
 * @returns `true` when the entry should be kept.
 */
function entryMatches(
  entry: HoldedTimeEntry,
  filters: { startDate?: string; endDate?: string; approvedOnly?: boolean }
): boolean {
  if (filters.approvedOnly && entry.approved !== 1) {
    return false;
  }
  if ((filters.startDate || filters.endDate) && typeof entry.date === 'number') {
    const entryDate = unixToLocalISODate(entry.date);
    if (filters.startDate && entryDate < filters.startDate) {
      return false;
    }
    if (filters.endDate && entryDate > filters.endDate) {
      return false;
    }
  }
  return true;
}

export function getTimeTrackingTools(client: HoldedClient) {
  return {
    // List time tracking across all projects (v2 flat cursor-paginated list)
    list_project_times: {
      description:
        'List time-tracking entries across all Holded projects (Projects API v2). Returns a cursor-paginated flat list of entries; pass the previous `nextCursor` as `cursor` to fetch the next page. Each entry contains timeId, duration (seconds), date (Unix seconds), approved (0/1), projectId, and projectName. ' +
        'The approvedOnly, startDate, and endDate filters are applied client-side on the current page — use pagination to iterate over the full dataset. Read-only.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          limit: {
            type: 'number',
            description: 'Max items per cursor page (default: 50)',
          },
          cursor: {
            type: 'string',
            description: 'Cursor token from a previous response nextCursor to fetch the next page',
          },
          startDate: {
            type: 'string',
            description:
              'Keep only entries on or after this date (YYYY-MM-DD, inclusive) — applied client-side on the returned page',
          },
          endDate: {
            type: 'string',
            description:
              'Keep only entries on or before this date (YYYY-MM-DD, inclusive) — applied client-side on the returned page',
          },
          approvedOnly: {
            type: 'boolean',
            description:
              'Keep only approved entries (approved === 1) — applied client-side on the returned page. Default: false',
          },
        },
        required: [],
      },
      readOnlyHint: true,
      handler: withValidation(listProjectTimesSchema, async (args) => {
        const { startDate, endDate, approvedOnly, limit, cursor } = args;
        const params = cursorParams({ limit, cursor });
        const raw = await client.get('/project-times', params);
        const normalized = normalizeV2List(raw);
        if (startDate || endDate || approvedOnly) {
          const filteredItems = normalized.items.filter((item) =>
            entryMatches(item as HoldedTimeEntry, { startDate, endDate, approvedOnly })
          );
          return { ...normalized, items: filteredItems };
        }
        return normalized;
      }),
    },

    // List time tracking for a single project (v2)
    list_project_times_by_project: {
      description:
        'List time-tracking entries for a single Holded project (Projects API v2). Returns a cursor-paginated flat list of entries for the given projectId. Pass the previous `nextCursor` as `cursor` to fetch the next page. ' +
        'The approvedOnly, startDate, and endDate filters are applied client-side on the current page. Read-only.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          projectId: {
            type: 'string',
            description: 'The Holded project ID',
          },
          limit: {
            type: 'number',
            description: 'Max items per cursor page (default: 50)',
          },
          cursor: {
            type: 'string',
            description: 'Cursor token from a previous response nextCursor to fetch the next page',
          },
          startDate: {
            type: 'string',
            description:
              'Keep only entries on or after this date (YYYY-MM-DD, inclusive) — applied client-side on the returned page',
          },
          endDate: {
            type: 'string',
            description:
              'Keep only entries on or before this date (YYYY-MM-DD, inclusive) — applied client-side on the returned page',
          },
          approvedOnly: {
            type: 'boolean',
            description:
              'Keep only approved entries (approved === 1) — applied client-side on the returned page. Default: false',
          },
        },
        required: ['projectId'],
      },
      readOnlyHint: true,
      handler: withValidation(projectTimesSchema, async (args) => {
        const { projectId, startDate, endDate, approvedOnly, limit, cursor } = args;
        const params = cursorParams({ limit, cursor });
        const raw = await client.get(`/projects/${projectId}/times`, params);
        const normalized = normalizeV2List(raw);
        if (startDate || endDate || approvedOnly) {
          const filteredItems = normalized.items.filter((item) =>
            entryMatches(item as HoldedTimeEntry, { startDate, endDate, approvedOnly })
          );
          return { ...normalized, items: filteredItems };
        }
        return normalized;
      }),
    },

    // Get a single time-tracking entry (v2)
    get_project_time: {
      description:
        'Get a single time-tracking entry by project ID and time-tracking ID (Projects API v2). Read-only.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          projectId: {
            type: 'string',
            description: 'The Holded project ID',
          },
          timeTrackingId: {
            type: 'string',
            description: 'The time-tracking entry ID (timeId)',
          },
        },
        required: ['projectId', 'timeTrackingId'],
      },
      readOnlyHint: true,
      handler: withValidation(projectTimeIdSchema, async (args) => {
        return client.get(`/projects/${args.projectId}/times/${args.timeTrackingId}`, undefined);
      }),
    },
  };
}
