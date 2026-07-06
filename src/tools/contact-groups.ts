import { HoldedClient } from '../holded-client.js';
import { normalizeV2List, cursorParams } from '../utils/v2-pagination.js';

export function getContactGroupTools(client: HoldedClient) {
  return {
    // List Contact Groups
    list_contact_groups: {
      description:
        'List contact groups (Holded API v2). Cursor-paginated: pass the previous response nextCursor as cursor. Response fields are snake_case; amounts are strings with decimal comma.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          limit: {
            type: 'number',
            description: 'Max items per page (server-paginated; use limit to control page size)',
          },
          cursor: {
            type: 'string',
            description: 'Cursor from a previous response nextCursor',
          },
          summary: {
            type: 'boolean',
            description: 'Return only count and pagination metadata without items (default: false)',
          },
          fields: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Project only these fields per item (e.g. ["id", "name"]). Reduces response size.',
          },
        },
        required: [],
      },
      readOnlyHint: true,
      handler: async (
        args: { limit?: number; cursor?: string; summary?: boolean; fields?: string[] } = {}
      ) => {
        const result = normalizeV2List(await client.get('/contact-groups', cursorParams(args)));

        if (args.fields?.length) {
          result.items = (result.items as Array<Record<string, unknown>>).map((item) => {
            const picked: Record<string, unknown> = {};
            for (const f of args.fields as string[]) if (f in item) picked[f] = item[f];
            return picked;
          });
        }

        if (args.summary) {
          const out: Record<string, unknown> = { count: result.items.length };
          if (result.nextCursor) out.nextCursor = result.nextCursor;
          if (result.hasMore !== undefined) out.hasMore = result.hasMore;
          return out;
        }

        return result;
      },
    },

    // Create Contact Group
    create_contact_group: {
      description: 'Create a new contact group (Holded API v2)',
      inputSchema: {
        type: 'object' as const,
        properties: {
          name: {
            type: 'string',
            description: 'Contact group name',
          },
        },
        required: ['name'],
      },
      destructiveHint: true,
      handler: async (args: Record<string, unknown>) => {
        return client.post('/contact-groups', args);
      },
    },

    // Get Contact Group
    get_contact_group: {
      description: 'Get a specific contact group by ID (Holded API v2)',
      inputSchema: {
        type: 'object' as const,
        properties: {
          groupId: {
            type: 'string',
            description: 'Contact group ID',
          },
        },
        required: ['groupId'],
      },
      readOnlyHint: true,
      handler: async (args: { groupId: string }) => {
        return client.get(`/contact-groups/${args.groupId}`, undefined);
      },
    },

    // Update Contact Group
    update_contact_group: {
      description: 'Update an existing contact group (Holded API v2)',
      inputSchema: {
        type: 'object' as const,
        properties: {
          groupId: {
            type: 'string',
            description: 'Contact group ID to update',
          },
          name: {
            type: 'string',
            description: 'Contact group name',
          },
        },
        required: ['groupId'],
      },
      destructiveHint: true,
      handler: async (args: { groupId: string; [key: string]: unknown }) => {
        const { groupId, ...body } = args;
        return client.put(`/contact-groups/${groupId}`, body);
      },
    },

    // Delete Contact Group
    delete_contact_group: {
      description: 'Delete a contact group (Holded API v2)',
      inputSchema: {
        type: 'object' as const,
        properties: {
          groupId: {
            type: 'string',
            description: 'Contact group ID to delete',
          },
        },
        required: ['groupId'],
      },
      destructiveHint: true,
      handler: async (args: { groupId: string }) => {
        return client.delete(`/contact-groups/${args.groupId}`);
      },
    },
  };
}
