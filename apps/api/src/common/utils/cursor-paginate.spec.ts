import { cursorPaginate } from './cursor-paginate';

describe('cursorPaginate', () => {
  function createMockModel(data: Array<{ id: string }>, total: number) {
    return {
      findMany: jest.fn().mockResolvedValue(data),
      count: jest.fn().mockResolvedValue(total),
    };
  }

  it('should return data with meta on the first page', async () => {
    const items = [{ id: '1' }, { id: '2' }];
    const model = createMockModel(items, 2);

    const result = await cursorPaginate(
      model,
      { orgId: 'o1' },
      { createdAt: 'desc' },
      { take: 10 },
    );

    expect(result.data).toEqual(items);
    expect(result.meta.total).toBe(2);
    expect(result.meta.hasMore).toBe(false);
    expect(result.meta.nextCursor).toBeNull();
  });

  it('should detect hasMore when more items than take', async () => {
    const items = [{ id: '1' }, { id: '2' }, { id: '3' }];
    const model = createMockModel(items, 10);

    const result = await cursorPaginate(model, {}, { createdAt: 'desc' }, { take: 2 });

    expect(result.data).toHaveLength(2);
    expect(result.meta.hasMore).toBe(true);
    expect(result.meta.nextCursor).toBe('2');
  });

  it('should skip count on subsequent pages (cursor provided)', async () => {
    const items = [{ id: 'b' }];
    const model = createMockModel(items, -1);

    const result = await cursorPaginate(model, {}, { id: 'asc' }, { cursor: 'a', take: 10 });

    expect(model.count).not.toHaveBeenCalled();
    expect(result.meta.total).toBe(-1);
    expect(result.data).toEqual([{ id: 'b' }]);
  });

  it('should pass cursor and skip to findMany', async () => {
    const model = createMockModel([], 0);

    await cursorPaginate(model, { org: '1' }, { id: 'asc' }, { cursor: 'abc', take: 5 });

    expect(model.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        cursor: { id: 'abc' },
        skip: 1,
        take: 6,
      }),
    );
  });

  it('should pass include option to findMany', async () => {
    const model = createMockModel([], 0);

    await cursorPaginate(model, {}, { id: 'asc' }, { take: 10, include: { lines: true } });

    expect(model.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ include: { lines: true } }),
    );
  });

  it('should default take to 50', async () => {
    const model = createMockModel([], 0);

    await cursorPaginate(model, {}, { id: 'asc' });

    expect(model.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 51 }));
  });
});
