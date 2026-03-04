import { describe, expect, it, vi } from 'vitest';
import { CrudRepository } from '../src/crud-repository.js';
import type { TransactionManager } from '../src/transaction-manager.js';

interface TestEntity {
  id: string;
  name: string;
}

/** Concrete test subclass. */
class TestRepository extends CrudRepository<TestEntity> {
  constructor(tm: TransactionManager) {
    super('test_table', tm);
  }
}

function createMockConnection(supportsReturning = true) {
  const rows = [
    { id: '1', name: 'Alice' },
    { id: '2', name: 'Bob' },
  ];

  const chainable = {
    selectAll: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returningAll: vi.fn().mockReturnThis(),
    execute: vi.fn().mockResolvedValue(rows),
    executeTakeFirst: vi.fn().mockResolvedValue(rows[0]),
    executeTakeFirstOrThrow: vi.fn().mockResolvedValue(rows[0]),
  };

  const connection = {
    selectFrom: vi.fn().mockReturnValue(chainable),
    insertInto: vi.fn().mockReturnValue(chainable),
    deleteFrom: vi.fn().mockReturnValue(chainable),
    getExecutor: vi.fn().mockReturnValue({
      adapter: { supportsReturning },
    }),
    _chainable: chainable,
  };

  const tm = {
    getConnection: vi.fn().mockReturnValue(connection),
  } as unknown as TransactionManager;

  return { tm, connection, chainable };
}

describe('CrudRepository', () => {
  it('should call selectFrom with correct table name for findAll', async () => {
    const { tm, connection } = createMockConnection();
    const repo = new TestRepository(tm);

    const result = await repo.findAll();

    expect(connection.selectFrom).toHaveBeenCalledWith('test_table');
    expect(result).toEqual([
      { id: '1', name: 'Alice' },
      { id: '2', name: 'Bob' },
    ]);
  });

  it('should call where with id column for findById', async () => {
    const { tm, connection, chainable } = createMockConnection();
    const repo = new TestRepository(tm);

    const result = await repo.findById('1');

    expect(connection.selectFrom).toHaveBeenCalledWith('test_table');
    expect(chainable.where).toHaveBeenCalledWith('id', '=', '1');
    expect(result).toEqual({ id: '1', name: 'Alice' });
  });

  it('should call insertInto for save', async () => {
    const { tm, connection } = createMockConnection();
    const repo = new TestRepository(tm);

    const result = await repo.save({ name: 'Charlie' });

    expect(connection.insertInto).toHaveBeenCalledWith('test_table');
    expect(result).toEqual({ id: '1', name: 'Alice' }); // mock returns first row
  });

  it('should call deleteFrom for deleteById', async () => {
    const { tm, connection, chainable } = createMockConnection();
    const repo = new TestRepository(tm);

    const result = await repo.deleteById('1');

    expect(connection.deleteFrom).toHaveBeenCalledWith('test_table');
    expect(chainable.where).toHaveBeenCalledWith('id', '=', '1');
    expect(result).toEqual({ id: '1', name: 'Alice' });
  });

  it('should use getConnection from TransactionManager', async () => {
    const { tm } = createMockConnection();
    const repo = new TestRepository(tm);

    await repo.findAll();

    expect(tm.getConnection).toHaveBeenCalled();
  });

  it('should support custom id column', async () => {
    class CustomIdRepo extends CrudRepository<TestEntity> {
      constructor(tm: TransactionManager) {
        super('custom_table', tm, 'custom_id');
      }
    }

    const { tm, chainable } = createMockConnection();
    const repo = new CustomIdRepo(tm);

    await repo.findById('abc');

    expect(chainable.where).toHaveBeenCalledWith('custom_id', '=', 'abc');
  });

  describe('returning dialect (PostgreSQL)', () => {
    it('save should use returningAll()', async () => {
      const { tm, chainable } = createMockConnection(true);
      const repo = new TestRepository(tm);

      await repo.save({ name: 'Charlie' });

      expect(chainable.returningAll).toHaveBeenCalled();
      expect(chainable.executeTakeFirstOrThrow).toHaveBeenCalled();
    });

    it('deleteById should use returningAll()', async () => {
      const { tm, chainable } = createMockConnection(true);
      const repo = new TestRepository(tm);

      await repo.deleteById('1');

      expect(chainable.returningAll).toHaveBeenCalled();
      expect(chainable.executeTakeFirst).toHaveBeenCalled();
    });
  });

  describe('non-returning dialect (MySQL/SQLite)', () => {
    it('save should INSERT then re-fetch by entity id', async () => {
      const { tm, connection, chainable } = createMockConnection(false);
      const repo = new TestRepository(tm);

      const result = await repo.save({ id: 'new-id', name: 'Charlie' });

      // Should NOT use returningAll
      expect(chainable.returningAll).not.toHaveBeenCalled();
      // First call: insertInto
      expect(connection.insertInto).toHaveBeenCalledWith('test_table');
      // Second call: selectFrom to re-fetch
      expect(connection.selectFrom).toHaveBeenCalledWith('test_table');
      expect(chainable.where).toHaveBeenCalledWith('id', '=', 'new-id');
      expect(result).toEqual({ id: '1', name: 'Alice' }); // mock returns first row
    });

    it('save should fall back to insertId when entity has no id', async () => {
      const insertResult = { insertId: 42n, numInsertedOrUpdatedRows: 1n };
      const { tm, connection, chainable } = createMockConnection(false);
      // Override executeTakeFirstOrThrow to return insert result first, then entity
      let callCount = 0;
      chainable.executeTakeFirstOrThrow.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return Promise.resolve(insertResult);
        return Promise.resolve({ id: '42', name: 'Charlie' });
      });

      const repo = new TestRepository(tm);

      const result = await repo.save({ name: 'Charlie' });

      expect(connection.insertInto).toHaveBeenCalledWith('test_table');
      expect(connection.selectFrom).toHaveBeenCalledWith('test_table');
      expect(chainable.where).toHaveBeenCalledWith('id', '=', 42n);
      expect(result).toEqual({ id: '42', name: 'Charlie' });
    });

    it('deleteById should SELECT first then DELETE', async () => {
      const { tm, connection, chainable } = createMockConnection(false);
      const repo = new TestRepository(tm);

      const result = await repo.deleteById('1');

      // Should NOT use returningAll
      expect(chainable.returningAll).not.toHaveBeenCalled();
      // Should SELECT first (findById) then DELETE
      expect(connection.selectFrom).toHaveBeenCalledWith('test_table');
      expect(connection.deleteFrom).toHaveBeenCalledWith('test_table');
      expect(result).toEqual({ id: '1', name: 'Alice' });
    });

    it('deleteById should return undefined when entity not found', async () => {
      const { tm, chainable } = createMockConnection(false);
      // findById returns undefined
      chainable.executeTakeFirst.mockResolvedValue(undefined);
      const repo = new TestRepository(tm);

      const result = await repo.deleteById('nonexistent');

      expect(chainable.returningAll).not.toHaveBeenCalled();
      // Should not call deleteFrom if entity not found
      expect(result).toBeUndefined();
    });
  });
});
