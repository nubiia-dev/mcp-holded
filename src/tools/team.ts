import { HoldedClient } from '../holded-client.js';
import { normalizeV2List, cursorParams } from '../utils/v2-pagination.js';

const DOC_URL = 'https://www.holded.com/es/desarrolladores/referencia-api';

/**
 * Team & HR tools backed by the Holded API v2 (Bearer auth, cursor
 * pagination). Registered only when a v2 API key is configured.
 */
export function getTeamTools(client: HoldedClient) {
  return {
    list_employees: {
      description:
        'List employees (Holded API v2, section Equipo y RRHH). Cursor-paginated: pass the previous response `nextCursor` as `cursor` to fetch the next page.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          limit: { type: 'number', description: 'Max items per page' },
          cursor: { type: 'string', description: 'Cursor from a previous response nextCursor' },
        },
        required: [],
      },
      readOnlyHint: true,
      handler: async (args: { limit?: number; cursor?: string } = {}) =>
        normalizeV2List(await client.get('/employees', cursorParams(args), 'v2')),
    },

    get_employee: {
      description: 'Get a single employee by ID (Holded API v2).',
      inputSchema: {
        type: 'object' as const,
        properties: {
          employeeId: { type: 'string', description: 'Employee ID (24-char hex ObjectId)' },
        },
        required: ['employeeId'],
      },
      readOnlyHint: true,
      handler: async (args: { employeeId: string }) =>
        client.get(`/employees/${args.employeeId}`, undefined, 'v2'),
    },

    create_employee: {
      description:
        `WRITE: creates a real employee record in Holded (API v2). ` +
        `\`data\` is sent verbatim as the request body — see ${DOC_URL} (Empleados → Crear) for the payload fields (name, email, etc.).`,
      inputSchema: {
        type: 'object' as const,
        properties: {
          data: { type: 'object', description: 'Employee payload, sent verbatim as body' },
        },
        required: ['data'],
      },
      handler: async (args: { data: Record<string, unknown> }) =>
        client.post('/employees', args.data, 'v2'),
    },

    update_employee: {
      description:
        `WRITE: updates a real employee record in Holded (API v2). ` +
        `\`data\` is sent verbatim as the request body — see ${DOC_URL} (Empleados → Actualizar).`,
      inputSchema: {
        type: 'object' as const,
        properties: {
          employeeId: { type: 'string', description: 'Employee ID' },
          data: { type: 'object', description: 'Fields to update, sent verbatim as body' },
        },
        required: ['employeeId', 'data'],
      },
      handler: async (args: { employeeId: string; data: Record<string, unknown> }) =>
        client.put(`/employees/${args.employeeId}`, args.data, 'v2'),
    },

    delete_employee: {
      description:
        'DESTRUCTIVE: permanently deletes an employee record in Holded (API v2). This cannot be undone.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          employeeId: { type: 'string', description: 'Employee ID' },
        },
        required: ['employeeId'],
      },
      handler: async (args: { employeeId: string }) =>
        client.delete(`/employees/${args.employeeId}`, 'v2'),
    },

    get_employee_contract: {
      description: 'Get the contract details of an employee (Holded API v2).',
      inputSchema: {
        type: 'object' as const,
        properties: {
          employeeId: { type: 'string', description: 'Employee ID' },
        },
        required: ['employeeId'],
      },
      readOnlyHint: true,
      handler: async (args: { employeeId: string }) =>
        client.get(`/employees/${args.employeeId}/contract`, undefined, 'v2'),
    },

    update_employee_contract: {
      description:
        `WRITE: updates an employee's contract in Holded (API v2) — affects real HR/payroll data. ` +
        `\`data\` is sent verbatim as the request body — see ${DOC_URL} (Empleados → Actualizar contrato).`,
      inputSchema: {
        type: 'object' as const,
        properties: {
          employeeId: { type: 'string', description: 'Employee ID' },
          data: { type: 'object', description: 'Contract payload, sent verbatim as body' },
        },
        required: ['employeeId', 'data'],
      },
      handler: async (args: { employeeId: string; data: Record<string, unknown> }) =>
        client.put(`/employees/${args.employeeId}/contract`, args.data, 'v2'),
    },

    clock_in_employee: {
      description:
        'WRITE: registers a clock-in for an employee in Holded time tracking (API v2). Affects real working-time records.',
      inputSchema: {
        type: 'object' as const,
        properties: { employeeId: { type: 'string', description: 'Employee ID' } },
        required: ['employeeId'],
      },
      handler: async (args: { employeeId: string }) =>
        client.post(`/employees/${args.employeeId}/clock-in`, undefined, 'v2'),
    },

    clock_out_employee: {
      description: 'WRITE: registers a clock-out for an employee in Holded time tracking (API v2).',
      inputSchema: {
        type: 'object' as const,
        properties: { employeeId: { type: 'string', description: 'Employee ID' } },
        required: ['employeeId'],
      },
      handler: async (args: { employeeId: string }) =>
        client.post(`/employees/${args.employeeId}/clock-out`, undefined, 'v2'),
    },

    pause_employee: {
      description:
        'WRITE: starts a pause in the current working session of an employee (Holded API v2).',
      inputSchema: {
        type: 'object' as const,
        properties: { employeeId: { type: 'string', description: 'Employee ID' } },
        required: ['employeeId'],
      },
      handler: async (args: { employeeId: string }) =>
        client.post(`/employees/${args.employeeId}/pause`, undefined, 'v2'),
    },

    unpause_employee: {
      description: 'WRITE: ends the current pause of an employee working session (Holded API v2).',
      inputSchema: {
        type: 'object' as const,
        properties: { employeeId: { type: 'string', description: 'Employee ID' } },
        required: ['employeeId'],
      },
      handler: async (args: { employeeId: string }) =>
        client.post(`/employees/${args.employeeId}/unpause`, undefined, 'v2'),
    },

    list_employee_times: {
      description:
        'List time-tracking records (Holded API v2). Without `employeeId` lists all records (/employee-times); with `employeeId` lists only that employee (/employees/{id}/times). Cursor-paginated.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          employeeId: { type: 'string', description: 'Optional employee ID to scope the list' },
          limit: { type: 'number', description: 'Max items per page' },
          cursor: { type: 'string', description: 'Cursor from a previous response nextCursor' },
        },
        required: [],
      },
      readOnlyHint: true,
      handler: async (args: { employeeId?: string; limit?: number; cursor?: string } = {}) => {
        const endpoint = args.employeeId
          ? `/employees/${args.employeeId}/times`
          : '/employee-times';
        return normalizeV2List(await client.get(endpoint, cursorParams(args), 'v2'));
      },
    },

    get_employee_time: {
      description: 'Get a single time-tracking record by ID (Holded API v2).',
      inputSchema: {
        type: 'object' as const,
        properties: { timeId: { type: 'string', description: 'Time record ID' } },
        required: ['timeId'],
      },
      readOnlyHint: true,
      handler: async (args: { timeId: string }) =>
        client.get(`/employee-times/${args.timeId}`, undefined, 'v2'),
    },

    create_employee_time: {
      description:
        `WRITE: creates a manual time-tracking record for an employee (Holded API v2). ` +
        `\`data\` is sent verbatim as the request body — see ${DOC_URL} (Control horario → Crear registro).`,
      inputSchema: {
        type: 'object' as const,
        properties: {
          employeeId: { type: 'string', description: 'Employee ID' },
          data: { type: 'object', description: 'Time record payload, sent verbatim as body' },
        },
        required: ['employeeId', 'data'],
      },
      handler: async (args: { employeeId: string; data: Record<string, unknown> }) =>
        client.post(`/employees/${args.employeeId}/times`, args.data, 'v2'),
    },

    update_employee_time: {
      description:
        `WRITE: updates a time-tracking record (Holded API v2). ` +
        `\`data\` is sent verbatim as the request body — see ${DOC_URL} (Control horario → Actualizar).`,
      inputSchema: {
        type: 'object' as const,
        properties: {
          timeId: { type: 'string', description: 'Time record ID' },
          data: { type: 'object', description: 'Fields to update, sent verbatim as body' },
        },
        required: ['timeId', 'data'],
      },
      handler: async (args: { timeId: string; data: Record<string, unknown> }) =>
        client.put(`/employee-times/${args.timeId}`, args.data, 'v2'),
    },

    delete_employee_time: {
      description:
        'DESTRUCTIVE: permanently deletes a time-tracking record in Holded (API v2). This cannot be undone.',
      inputSchema: {
        type: 'object' as const,
        properties: { timeId: { type: 'string', description: 'Time record ID' } },
        required: ['timeId'],
      },
      handler: async (args: { timeId: string }) =>
        client.delete(`/employee-times/${args.timeId}`, 'v2'),
    },
  };
}
