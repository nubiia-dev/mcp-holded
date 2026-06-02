import { HoldedClient } from '../holded-client.js';
import {
  listProjectTimesSchema,
  projectTimesSchema,
  projectTimeIdSchema,
  withValidation,
} from '../validation.js';

/**
 * Time-tracking tools backed by the Holded **Projects** API
 * (`https://api.holded.com/api/projects/v1`). These are read-only: they expose
 * the hours logged in Holded so they can be reconciled or booked elsewhere
 * (e.g. into an external time sheet). No mutating endpoints are provided.
 */

/** A single time-tracking entry as returned by the Holded Projects API. */
interface HoldedTimeEntry extends Record<string, unknown> {
  /** Duration of the entry in seconds. */
  duration?: number;
  /** Day of the entry as a Unix timestamp (seconds, local midnight). */
  date?: number;
  /** 1 when the entry has been approved, 0 otherwise. */
  approved?: number;
}

/** A project with its nested time-tracking entries. */
interface HoldedProjectTimes extends Record<string, unknown> {
  id?: string;
  name?: string;
  timeTracking?: HoldedTimeEntry[];
}

/** A flattened entry: the raw entry plus the project it belongs to. */
type FlattenedTimeEntry = HoldedTimeEntry & {
  projectId?: string;
  projectName?: string;
  /** Convenience: `duration` expressed in hours (`duration / 3600`). */
  hours?: number;
};

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

/**
 * Apply the optional filters to a list of projects, returning either the
 * nested per-project structure (with non-matching entries removed) or a flat
 * list of enriched entries.
 *
 * @param projects - Projects with their `timeTracking` arrays.
 * @param args - Filter + shape options.
 * @returns Filtered projects, or a flat entry array when `flatten` is set.
 */
function shapeProjectTimes(
  projects: HoldedProjectTimes[],
  args: { startDate?: string; endDate?: string; approvedOnly?: boolean; flatten?: boolean }
): HoldedProjectTimes[] | FlattenedTimeEntry[] {
  if (args.flatten) {
    const flat: FlattenedTimeEntry[] = [];
    for (const project of projects) {
      for (const entry of project.timeTracking ?? []) {
        if (entryMatches(entry, args)) {
          flat.push({
            ...entry,
            projectId: project.id,
            projectName: project.name,
            hours: typeof entry.duration === 'number' ? entry.duration / 3600 : undefined,
          });
        }
      }
    }
    return flat;
  }

  return projects.map((project) => ({
    ...project,
    timeTracking: (project.timeTracking ?? []).filter((entry) => entryMatches(entry, args)),
  }));
}

export function getTimeTrackingTools(client: HoldedClient) {
  return {
    // List time tracking across all projects
    list_project_times: {
      description:
        'List time-tracking entries across all Holded projects (Projects API). Each project includes a timeTracking[] array of entries with duration (seconds), date (Unix seconds), user, and approved (0/1). Optionally filter by date range (YYYY-MM-DD, inclusive) and approved-only, and flatten into a single entry list with hours pre-computed. Read-only.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          startDate: {
            type: 'string',
            description: 'Keep only entries on or after this date (YYYY-MM-DD, inclusive)',
          },
          endDate: {
            type: 'string',
            description: 'Keep only entries on or before this date (YYYY-MM-DD, inclusive)',
          },
          approvedOnly: {
            type: 'boolean',
            description: 'Keep only approved entries (approved === 1). Default: false',
          },
          flatten: {
            type: 'boolean',
            description:
              'Return a flat array of entries (each with projectId, projectName, and hours = duration/3600) instead of the nested per-project structure. Default: false',
          },
        },
        required: [],
      },
      readOnlyHint: true,
      handler: withValidation(listProjectTimesSchema, async (args) => {
        const projects = (await client.get(
          '/projects/times',
          undefined,
          'projects'
        )) as HoldedProjectTimes[];
        return shapeProjectTimes(projects, args);
      }),
    },

    // List time tracking for a single project
    list_project_times_by_project: {
      description:
        "List time-tracking entries for a single Holded project (Projects API). Returns the project's timeTracking[] array. Supports the same date-range, approved-only, and flatten filters as list_project_times. Read-only.",
      inputSchema: {
        type: 'object' as const,
        properties: {
          projectId: {
            type: 'string',
            description: 'The Holded project ID',
          },
          startDate: {
            type: 'string',
            description: 'Keep only entries on or after this date (YYYY-MM-DD, inclusive)',
          },
          endDate: {
            type: 'string',
            description: 'Keep only entries on or before this date (YYYY-MM-DD, inclusive)',
          },
          approvedOnly: {
            type: 'boolean',
            description: 'Keep only approved entries (approved === 1). Default: false',
          },
          flatten: {
            type: 'boolean',
            description:
              'Return a flat array of entries (each with projectId, projectName, and hours = duration/3600) instead of the nested structure. Default: false',
          },
        },
        required: ['projectId'],
      },
      readOnlyHint: true,
      handler: withValidation(projectTimesSchema, async (args) => {
        const { projectId, ...filters } = args;
        const project = (await client.get(
          `/projects/${projectId}/times`,
          undefined,
          'projects'
        )) as HoldedProjectTimes;
        // Normalize to the same shape as list_project_times for consistent filtering.
        const normalized: HoldedProjectTimes = Array.isArray(project)
          ? { id: projectId, timeTracking: project as unknown as HoldedTimeEntry[] }
          : project;
        return shapeProjectTimes([normalized], filters);
      }),
    },

    // Get a single time-tracking entry
    get_project_time: {
      description:
        'Get a single time-tracking entry by project ID and time-tracking ID (Projects API). Read-only.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          projectId: {
            type: 'string',
            description: 'The Holded project ID',
          },
          timeTrackingId: {
            type: 'string',
            description: 'The time-tracking entry ID (the entry timeId)',
          },
        },
        required: ['projectId', 'timeTrackingId'],
      },
      readOnlyHint: true,
      handler: withValidation(projectTimeIdSchema, async (args) => {
        return client.get(
          `/projects/${args.projectId}/times/${args.timeTrackingId}`,
          undefined,
          'projects'
        );
      }),
    },
  };
}
