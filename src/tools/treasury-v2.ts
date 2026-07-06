import { HoldedClient } from '../holded-client.js';
import { normalizeV2List, cursorParams } from '../utils/v2-pagination.js';

const DOC_URL = 'https://www.holded.com/es/desarrolladores/referencia-api';

/**
 * Official treasury tools backed by the Holded API v2 (bank accounts,
 * movements, reconciliation, invoicing forecasts). Supersedes the
 * experimental internal-API banking tools (banking.ts), which are kept as-is
 * for now. Registered only when a v2 API key is configured.
 */
export function getTreasuryV2Tools(client: HoldedClient) {
  return {
    list_bank_accounts: {
      description:
        'List treasury bank accounts (Holded API v2, official endpoint). Cursor-paginated.',
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
        normalizeV2List(await client.get('/treasury/accounts', cursorParams(args))),
    },

    get_bank_account: {
      description: 'Get a treasury bank account by ID (Holded API v2).',
      inputSchema: {
        type: 'object' as const,
        properties: { accountId: { type: 'string', description: 'Bank account ID' } },
        required: ['accountId'],
      },
      readOnlyHint: true,
      handler: async (args: { accountId: string }) =>
        client.get(`/treasury/accounts/${args.accountId}`, undefined),
    },

    create_bank_account: {
      description:
        `WRITE: creates a real treasury bank account in Holded (API v2). ` +
        `\`data\` is sent verbatim as the request body — see ${DOC_URL} (Tesorería → Crear cuenta).`,
      inputSchema: {
        type: 'object' as const,
        properties: {
          data: { type: 'object', description: 'Bank account payload, sent verbatim as body' },
        },
        required: ['data'],
      },
      handler: async (args: { data: Record<string, unknown> }) =>
        client.post('/treasury/accounts', args.data),
    },

    update_bank_account: {
      description:
        `WRITE: updates a treasury bank account in Holded (API v2). ` +
        `\`data\` is sent verbatim as the request body — see ${DOC_URL} (Tesorería → Actualizar cuenta).`,
      inputSchema: {
        type: 'object' as const,
        properties: {
          accountId: { type: 'string', description: 'Bank account ID' },
          data: { type: 'object', description: 'Fields to update, sent verbatim as body' },
        },
        required: ['accountId', 'data'],
      },
      handler: async (args: { accountId: string; data: Record<string, unknown> }) =>
        client.put(`/treasury/accounts/${args.accountId}`, args.data),
    },

    delete_bank_account: {
      description:
        'DESTRUCTIVE: permanently deletes a treasury bank account in Holded (API v2). Prefer archive_bank_account to keep history. This cannot be undone.',
      inputSchema: {
        type: 'object' as const,
        properties: { accountId: { type: 'string', description: 'Bank account ID' } },
        required: ['accountId'],
      },
      handler: async (args: { accountId: string }) =>
        client.delete(`/treasury/accounts/${args.accountId}`),
    },

    archive_bank_account: {
      description:
        'WRITE: archives a treasury bank account in Holded (API v2). Reversible alternative to delete_bank_account.',
      inputSchema: {
        type: 'object' as const,
        properties: { accountId: { type: 'string', description: 'Bank account ID' } },
        required: ['accountId'],
      },
      handler: async (args: { accountId: string }) =>
        client.post(`/treasury/accounts/${args.accountId}/archive`, undefined),
    },

    list_bank_movements: {
      description:
        'List bank movements of a treasury account (Holded API v2, official endpoint — replaces the experimental internal banking tools). Cursor-paginated.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          accountId: { type: 'string', description: 'Bank account ID' },
          limit: { type: 'number', description: 'Max items per page' },
          cursor: { type: 'string', description: 'Cursor from a previous response nextCursor' },
        },
        required: ['accountId'],
      },
      readOnlyHint: true,
      handler: async (args: { accountId: string; limit?: number; cursor?: string }) =>
        normalizeV2List(
          await client.get(
            `/treasury/accounts/${args.accountId}/bank-movements`,
            cursorParams(args)
          )
        ),
    },

    create_bank_movement: {
      description:
        `WRITE: creates a real bank movement in a treasury account (Holded API v2). ` +
        `\`data\` is sent verbatim as the request body — see ${DOC_URL} (Tesorería → Crear movimiento).`,
      inputSchema: {
        type: 'object' as const,
        properties: {
          accountId: { type: 'string', description: 'Bank account ID' },
          data: { type: 'object', description: 'Movement payload, sent verbatim as body' },
        },
        required: ['accountId', 'data'],
      },
      handler: async (args: { accountId: string; data: Record<string, unknown> }) =>
        client.post(`/treasury/accounts/${args.accountId}/bank-movements`, args.data),
    },

    reconcile_bank_movement: {
      description:
        `WRITE: reconciles a bank movement against documents/entries (Holded API v2, official endpoint — replaces the experimental reconcile_bank_transaction from the internal API when v2 is enabled). ` +
        `\`data\` is sent verbatim as the request body — see ${DOC_URL} (Tesorería → Conciliar).`,
      inputSchema: {
        type: 'object' as const,
        properties: {
          accountId: { type: 'string', description: 'Bank account ID' },
          movementId: { type: 'string', description: 'Bank movement ID' },
          data: { type: 'object', description: 'Reconciliation payload, sent verbatim as body' },
        },
        required: ['accountId', 'movementId', 'data'],
      },
      handler: async (args: {
        accountId: string;
        movementId: string;
        data: Record<string, unknown>;
      }) =>
        client.post(
          `/treasury/accounts/${args.accountId}/bank-movements/${args.movementId}/reconcile`,
          args.data
        ),
    },

    list_cash_movements: {
      description:
        'List cash movements of a treasury account (Holded API v2). Cursor-paginated. ' +
        'This endpoint applies to cash-type treasury accounts only; bank and card account types return 404.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          accountId: { type: 'string', description: 'Treasury account ID' },
          limit: { type: 'number', description: 'Max items per page' },
          cursor: { type: 'string', description: 'Cursor from a previous response nextCursor' },
        },
        required: ['accountId'],
      },
      readOnlyHint: true,
      handler: async (args: { accountId: string; limit?: number; cursor?: string }) =>
        normalizeV2List(
          await client.get(
            `/treasury/accounts/${args.accountId}/cash-movements`,
            cursorParams(args)
          )
        ),
    },

    list_invoicing_forecasts: {
      description: 'List cashflow invoicing forecasts (Holded API v2). Cursor-paginated.',
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
        normalizeV2List(
          await client.get('/treasury/cashflow/invoicing-forecasts', cursorParams(args))
        ),
    },

    get_invoicing_forecast: {
      description: 'Get a cashflow invoicing forecast by ID (Holded API v2).',
      inputSchema: {
        type: 'object' as const,
        properties: { forecastId: { type: 'string', description: 'Forecast ID' } },
        required: ['forecastId'],
      },
      readOnlyHint: true,
      handler: async (args: { forecastId: string }) =>
        client.get(`/treasury/cashflow/invoicing-forecasts/${args.forecastId}`, undefined),
    },

    create_invoicing_forecast: {
      description:
        `WRITE: creates an invoicing forecast in Holded cashflow (API v2). ` +
        `\`data\` is sent verbatim as the request body — see ${DOC_URL} (Tesorería → Previsiones).`,
      inputSchema: {
        type: 'object' as const,
        properties: {
          data: { type: 'object', description: 'Forecast payload, sent verbatim as body' },
        },
        required: ['data'],
      },
      handler: async (args: { data: Record<string, unknown> }) =>
        client.post('/treasury/cashflow/invoicing-forecasts', args.data),
    },

    update_invoicing_forecast: {
      description:
        `WRITE: updates an invoicing forecast in Holded cashflow (API v2). ` +
        `\`data\` is sent verbatim as the request body — see ${DOC_URL} (Tesorería → Previsiones).`,
      inputSchema: {
        type: 'object' as const,
        properties: {
          forecastId: { type: 'string', description: 'Forecast ID' },
          data: { type: 'object', description: 'Fields to update, sent verbatim as body' },
        },
        required: ['forecastId', 'data'],
      },
      handler: async (args: { forecastId: string; data: Record<string, unknown> }) =>
        client.put(`/treasury/cashflow/invoicing-forecasts/${args.forecastId}`, args.data),
    },

    delete_invoicing_forecast: {
      description:
        'DESTRUCTIVE: permanently deletes an invoicing forecast in Holded cashflow (API v2).',
      inputSchema: {
        type: 'object' as const,
        properties: { forecastId: { type: 'string', description: 'Forecast ID' } },
        required: ['forecastId'],
      },
      handler: async (args: { forecastId: string }) =>
        client.delete(`/treasury/cashflow/invoicing-forecasts/${args.forecastId}`),
    },
  };
}
