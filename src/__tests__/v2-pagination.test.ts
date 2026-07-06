import { describe, it, expect } from 'vitest';
import { normalizeV2List, cursorParams } from '../utils/v2-pagination.js';

describe('normalizeV2List', () => {
  it('wraps bare arrays in { items }', () => {
    expect(normalizeV2List([{ id: 1 }])).toEqual({ items: [{ id: 1 }] });
  });

  it('passes through items and surfaces nextCursor from common field names', () => {
    expect(normalizeV2List({ items: [1], nextCursor: 'abc' })).toEqual({
      items: [1],
      nextCursor: 'abc',
    });
    expect(normalizeV2List({ data: [1], next: 'abc' }).nextCursor).toBe('abc');
    expect(normalizeV2List({ items: [1], cursor: { next: 'abc' } }).nextCursor).toBe('abc');
    expect(normalizeV2List({ items: [1], pagination: { nextCursor: 'abc' } }).nextCursor).toBe(
      'abc'
    );
  });

  it('omits nextCursor when there is no next page', () => {
    const result = normalizeV2List({ items: [1] });
    expect(result.items).toEqual([1]);
    expect(result).not.toHaveProperty('nextCursor');
  });

  it('tolerates null/undefined responses', () => {
    expect(normalizeV2List(null)).toEqual({ items: [] });
  });
});

describe('cursorParams', () => {
  it('builds query params from limit and cursor, skipping undefined', () => {
    expect(cursorParams({})).toEqual({});
    expect(cursorParams({ limit: 50 })).toEqual({ limit: 50 });
    expect(cursorParams({ limit: 50, cursor: 'abc' })).toEqual({ limit: 50, cursor: 'abc' });
  });
});
