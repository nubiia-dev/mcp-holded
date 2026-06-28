import { HoldedClient } from '../holded-client.js';
import { reconcileBankTransactionSchema, withValidation } from '../validation.js';

/**
 * EXPERIMENTAL bank-feed tools backed by Holded's UNDOCUMENTED internal API
 * (`https://api.holded.com/api/internal/banking/...`).
 *
 * These endpoints are not part of Holded's public, versioned API. They have not
 * been verified against a live account in this fork, the exact request/response
 * shapes are not guaranteed, and Holded may change or remove them without
 * notice. Every tool here is marked clearly as experimental and returns a
 * `_warnings` note so callers always double-check the result in the Holded UI.
 */
export function getBankingTools(client: HoldedClient) {
  return {
    // Reconcile a bank-feed transaction (EXPERIMENTAL — internal API)
    reconcile_bank_transaction: {
      description:
        "EXPERIMENTAL / UNVERIFIED. Reconcile (match) a single bank-feed transaction against its accounting entry via Holded's UNDOCUMENTED internal API (POST /internal/banking/accounts/{accountId}/transactions/{transactionId}/reconcile). This endpoint is NOT part of the public API, has not been verified against a live account, and may change or fail without notice. Always re-check the reconciliation in the Holded UI afterwards.",
      inputSchema: {
        type: 'object' as const,
        properties: {
          accountId: {
            type: 'string',
            description: 'Holded bank account id (the bank-feed account, not a treasury id)',
          },
          transactionId: {
            type: 'string',
            description: 'Bank-feed transaction id to reconcile',
          },
          entryId: {
            type: 'string',
            description: 'Optional accounting entry / document id to match the transaction against',
          },
        },
        required: ['accountId', 'transactionId'],
      },
      destructiveHint: true,
      handler: withValidation(reconcileBankTransactionSchema, async (args) => {
        const { accountId, transactionId, ...body } = args;
        const result = await client.post(
          `/internal/banking/accounts/${accountId}/transactions/${transactionId}/reconcile`,
          body,
          'internal'
        );
        // Holded frequently returns HTTP 200 with `{ status: 0, message }` to signal
        // a logical failure. Surface that as an error instead of a false success.
        if (
          result &&
          typeof result === 'object' &&
          !Array.isArray(result) &&
          (result as Record<string, unknown>).status === 0
        ) {
          const message = (result as Record<string, unknown>).message ?? 'no message';
          throw new Error(
            `Reconciliation failed (status: 0): ${message}. This is an undocumented internal endpoint — verify the transaction in the Holded UI.`
          );
        }
        const warning =
          'reconcile_bank_transaction uses an undocumented internal Holded endpoint and is unverified. Confirm the reconciliation in the Holded UI.';
        if (result && typeof result === 'object' && !Array.isArray(result)) {
          return { ...(result as object), _warnings: [warning] };
        }
        return { result, _warnings: [warning] };
      }),
    },
  };
}
