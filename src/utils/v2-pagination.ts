/**
 * Helpers for Holded API v2 cursor pagination.
 *
 * The exact response envelope of v2 list endpoints is not yet pinned down by
 * the public docs, so normalizeV2List accepts the shapes we may encounter
 * (bare array, { items }, { data }, cursor under several names) and always
 * returns { items, nextCursor? } so MCP clients get a stable contract.
 */

export interface V2ListResult {
  items: unknown[];
  nextCursor?: string;
  [key: string]: unknown;
}

export function normalizeV2List(response: unknown): V2ListResult {
  if (Array.isArray(response)) {
    return { items: response };
  }

  const obj = (response ?? {}) as Record<string, unknown>;
  const items = Array.isArray(obj.items) ? obj.items : Array.isArray(obj.data) ? obj.data : [];

  const cursorObj = obj.cursor as Record<string, unknown> | undefined;
  const paginationObj = obj.pagination as Record<string, unknown> | undefined;
  const candidates = [
    obj.nextCursor,
    obj.next,
    cursorObj?.next,
    paginationObj?.nextCursor,
    paginationObj?.next,
  ];
  const nextCursor = candidates.find((c) => typeof c === 'string' && c.length > 0) as
    string | undefined;

  const rest: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (key !== 'cursor' && key !== 'pagination' && key !== 'data') {
      rest[key] = value;
    }
  }
  const result: V2ListResult = { ...rest, items };
  if (nextCursor) {
    result.nextCursor = nextCursor;
  }
  return result;
}

export function cursorParams(args: {
  limit?: number;
  cursor?: string;
}): Record<string, string | number> {
  const params: Record<string, string | number> = {};
  if (args.limit !== undefined) {
    params.limit = args.limit;
  }
  if (args.cursor !== undefined) {
    params.cursor = args.cursor;
  }
  return params;
}
