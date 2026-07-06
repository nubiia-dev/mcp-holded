import { describe, it, expect } from 'vitest';
import { normalizeV2List, cursorParams } from '../utils/v2-pagination.js';

describe('normalizeV2List', () => {
  it('normalizes the real v2 envelope { items, cursor, has_more }', () => {
    expect(normalizeV2List({ items: [{ id: 1 }], cursor: 'page:2', has_more: true })).toEqual({
      items: [{ id: 1 }],
      nextCursor: 'page:2',
      hasMore: true,
    });
  });

  it('omits nextCursor when cursor is null and reports hasMore false', () => {
    const result = normalizeV2List({ items: [], cursor: null, has_more: false });
    expect(result).toEqual({ items: [], hasMore: false });
    expect(result).not.toHaveProperty('nextCursor');
  });

  it('wraps bare arrays in { items }', () => {
    expect(normalizeV2List([{ id: 1 }])).toEqual({ items: [{ id: 1 }] });
  });

  it('still accepts legacy fallback shapes', () => {
    expect(normalizeV2List({ items: [1], nextCursor: 'abc' }).nextCursor).toBe('abc');
    expect(normalizeV2List({ data: [1], next: 'abc' }).nextCursor).toBe('abc');
  });

  it('tolerates null/undefined responses', () => {
    expect(normalizeV2List(null)).toEqual({ items: [] });
    expect(normalizeV2List(undefined)).toEqual({ items: [] });
  });

  it('strips raw cursor fields from the passthrough', () => {
    const result = normalizeV2List({ items: [1], cursor: 'page:2', has_more: true, extra: 'x' });
    expect(result).not.toHaveProperty('cursor');
    expect(result).not.toHaveProperty('has_more');
    expect(result.extra).toBe('x');
  });
});

describe('cursorParams', () => {
  it('builds query params from limit and cursor, skipping undefined', () => {
    expect(cursorParams({})).toEqual({});
    expect(cursorParams({ limit: 50 })).toEqual({ limit: 50 });
    expect(cursorParams({ limit: 50, cursor: 'abc' })).toEqual({ limit: 50, cursor: 'abc' });
  });
});
