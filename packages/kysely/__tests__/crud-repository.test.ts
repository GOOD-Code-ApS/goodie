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

function createSelectChain(data: {
  rows?: TestEntity[];
  first?: TestEntity | undefined;
}) {
  return {
    selectAll: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    execute: vi.fn().mockResolvedValue(data.rows ?? []),
    executeTakeFirst: vi.fn().mockResolvedValue(data.first),
    executeTakeFirstOrThrow: vi.fn().mockResolvedValue(data.first),
  };
}

function createInsertChain(result: {
  first?: unknown;
  returningRow?: TestEntity;
}) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {
    values: vi.fn().mockReturnThis(),
    returningAll: vi.fn().mockReturnThis(),
    executeTakeFirstOrThrow: vi
      .fn()
      .mockResolvedValue(result.first ?? result.returningRow),
  };
  return chain;
}

function createDeleteChain(result: {
  returningFirst?: TestEntity | undefined;
}) {
  return {
    where: vi.fn().mockReturnThis(),
    returningAll: vi.fn().mockReturnThis(),
    execute: vi.fn().mockResolvedValue([]),
    executeTakeFirst: vi.fn().mockResolvedValue(result.returningFirst),
  };
}

function createMockConnection(opts: {
  supportsReturning: boolean;
  selectData?: { rows?: TestEntity[]; first?: TestEntity | undefined };
  insertResult?: { first?: unknown; returningRow?: TestEntity };
  deleteResult?: { returningFirst?: TestEntity | undefined };
}) {
  const selectChain = createSelectChain(
    opts.selectData ?? {
      rows: [
        { id: '1', name: 'Alice' },
        { id: '2', name: 'Bob' },
      ],
      first: { id: '1', name: 'Alice' },
    },
  );
  const insertChain = createInsertChain(
    opts.insertResult ?? { returningRow: { id: '1', name: 'Alice' } },
  );
  const deleteChain = createDeleteChain(
    opts.deleteResult ?? { returningFirst: { id: '1', name: 'Alice' } },
  );

  const connection = {
    selectFrom: vi.fn().mockReturnValue(selectChain),
    insertInto: vi.fn().mockReturnValue(insertChain),
    deleteFrom: vi.fn().mockReturnValue(deleteChain),
    transaction: vi.fn().mockReturnValue({
      execute: vi.fn((fn: (trx: unknown) => Promise<unknown>) => {
        // Simulate transaction by calling fn with a trx that delegates to the same mocks
        const trx = {
          selectFrom: vi.fn().mockReturnValue(selectChain),
          deleteFrom: vi.fn().mockReturnValue(deleteChain),
        };
        return fn(trx);
      }),
    }),
  };

  const tm = {
    getConnection: vi.fn().mockReturnValue(connection),
    supportsReturning: opts.supportsReturning,
    runInTransaction: vi.fn((fn: () => Promise<unknown>) => fn()),
  } as unknown as TransactionManager;

  return { tm, connection, selectChain, insertChain, deleteChain };
}

describe('CrudRepository', () => {
  it('should call selectFrom with correct table name for findAll', async () => {
    const { tm, connection, selectChain } = createMockConnection({
      supportsReturning: true,
      selectData: {
        rows: [
          { id: '1', name: 'Alice' },
          { id: '2', name: 'Bob' },
        ],
      },
    });
    const repo = new TestRepository(tm);

    const result = await repo.findAll();

    expect(connection.selectFrom).toHaveBeenCalledWith('test_table');
    expect(selectChain.selectAll).toHaveBeenCalled();
    expect(result).toEqual([
      { id: '1', name: 'Alice' },
      { id: '2', name: 'Bob' },
    ]);
  });

  it('should call where with id column for findById', async () => {
    const { tm, connection, selectChain } = createMockConnection({
      supportsReturning: true,
      selectData: { first: { id: '1', name: 'Alice' } },
    });
    const repo = new TestRepository(tm);

    const result = await repo.findById('1');

    expect(connection.selectFrom).toHaveBeenCalledWith('test_table');
    expect(selectChain.where).toHaveBeenCalledWith('id', '=', '1');
    expect(result).toEqual({ id: '1', name: 'Alice' });
  });

  it('should call insertInto for save', async () => {
    const { tm, connection } = createMockConnection({
      supportsReturning: true,
      insertResult: { returningRow: { id: '1', name: 'Charlie' } },
    });
    const repo = new TestRepository(tm);

    const result = await repo.save({ name: 'Charlie' });

    expect(connection.insertInto).toHaveBeenCalledWith('test_table');
    expect(result).toEqual({ id: '1', name: 'Charlie' });
  });

  it('should call deleteFrom for deleteById', async () => {
    const { tm, connection, deleteChain } = createMockConnection({
      supportsReturning: true,
      deleteResult: { returningFirst: { id: '1', name: 'Alice' } },
    });
    const repo = new TestRepository(tm);

    const result = await repo.deleteById('1');

    expect(connection.deleteFrom).toHaveBeenCalledWith('test_table');
    expect(deleteChain.where).toHaveBeenCalledWith('id', '=', '1');
    expect(result).toEqual({ id: '1', name: 'Alice' });
  });

  it('should use getConnection from TransactionManager', async () => {
    const { tm } = createMockConnection({ supportsReturning: true });
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

    const { tm, selectChain } = createMockConnection({
      supportsReturning: true,
      selectData: { first: { id: 'abc', name: 'Alice' } },
    });
    const repo = new CustomIdRepo(tm);

    await repo.findById('abc');

    expect(selectChain.where).toHaveBeenCalledWith('custom_id', '=', 'abc');
  });

  describe('returning dialect (PostgreSQL)', () => {
    it('save should use returningAll()', async () => {
      const { tm, insertChain } = createMockConnection({
        supportsReturning: true,
        insertResult: { returningRow: { id: '1', name: 'Charlie' } },
      });
      const repo = new TestRepository(tm);

      await repo.save({ name: 'Charlie' });

      expect(insertChain.returningAll).toHaveBeenCalled();
      expect(insertChain.executeTakeFirstOrThrow).toHaveBeenCalled();
    });

    it('deleteById should use returningAll()', async () => {
      const { tm, deleteChain } = createMockConnection({
        supportsReturning: true,
        deleteResult: { returningFirst: { id: '1', name: 'Alice' } },
      });
      const repo = new TestRepository(tm);

      await repo.deleteById('1');

      expect(deleteChain.returningAll).toHaveBeenCalled();
      expect(deleteChain.executeTakeFirst).toHaveBeenCalled();
    });
  });

  describe('non-returning dialect (MySQL/SQLite)', () => {
    it('save should INSERT then re-fetch by entity id', async () => {
      const insertResult = {
        insertId: undefined,
        numInsertedOrUpdatedRows: 1n,
      };
      const refetchedEntity = { id: 'new-id', name: 'Charlie' };
      const { tm, connection, selectChain, insertChain } = createMockConnection(
        {
          supportsReturning: false,
          insertResult: { first: insertResult },
          selectData: { first: refetchedEntity },
        },
      );
      // Override: first call returns insert result, second call returns entity
      insertChain.executeTakeFirstOrThrow.mockResolvedValue(insertResult);

      const repo = new TestRepository(tm);

      const result = await repo.save({ id: 'new-id', name: 'Charlie' });

      expect(insertChain.returningAll).not.toHaveBeenCalled();
      expect(connection.insertInto).toHaveBeenCalledWith('test_table');
      expect(connection.selectFrom).toHaveBeenCalledWith('test_table');
      expect(selectChain.where).toHaveBeenCalledWith('id', '=', 'new-id');
      expect(result).toEqual(refetchedEntity);
    });

    it('save should fall back to insertId when entity has no id', async () => {
      const insertResult = { insertId: 42n, numInsertedOrUpdatedRows: 1n };
      const refetchedEntity = { id: '42', name: 'Charlie' };
      const { tm, connection, selectChain, insertChain } = createMockConnection(
        {
          supportsReturning: false,
          selectData: { first: refetchedEntity },
        },
      );
      insertChain.executeTakeFirstOrThrow.mockResolvedValue(insertResult);

      const repo = new TestRepository(tm);

      const result = await repo.save({ name: 'Charlie' });

      expect(connection.insertInto).toHaveBeenCalledWith('test_table');
      expect(connection.selectFrom).toHaveBeenCalledWith('test_table');
      expect(selectChain.where).toHaveBeenCalledWith('id', '=', 42n);
      expect(result).toEqual(refetchedEntity);
    });

    it('save should throw when neither entity id nor insertId is available', async () => {
      const insertResult = {
        insertId: undefined,
        numInsertedOrUpdatedRows: 1n,
      };
      const { tm, insertChain } = createMockConnection({
        supportsReturning: false,
      });
      insertChain.executeTakeFirstOrThrow.mockResolvedValue(insertResult);

      const repo = new TestRepository(tm);

      await expect(repo.save({ name: 'Charlie' })).rejects.toThrow(
        /Cannot re-fetch inserted row/,
      );
    });

    it('deleteById should SELECT then DELETE via runInTransaction', async () => {
      const existing = { id: '1', name: 'Alice' };
      const { tm, connection } = createMockConnection({
        supportsReturning: false,
        selectData: { first: existing },
        deleteResult: { returningFirst: undefined },
      });
      const repo = new TestRepository(tm);

      const result = await repo.deleteById('1');

      // Should use runInTransaction (REQUIRED propagation), not db.transaction()
      expect(tm.runInTransaction).toHaveBeenCalled();
      expect(connection.transaction).not.toHaveBeenCalled();
      expect(connection.selectFrom).toHaveBeenCalledWith('test_table');
      expect(connection.deleteFrom).toHaveBeenCalledWith('test_table');
      expect(result).toEqual(existing);
    });

    it('deleteById should return undefined when entity not found', async () => {
      const { tm, connection } = createMockConnection({
        supportsReturning: false,
        selectData: { first: undefined },
      });
      const repo = new TestRepository(tm);

      const result = await repo.deleteById('nonexistent');

      expect(tm.runInTransaction).toHaveBeenCalled();
      expect(connection.transaction).not.toHaveBeenCalled();
      expect(result).toBeUndefined();
    });

    it('deleteById should work when already inside a @Transactional context', async () => {
      const existing = { id: '1', name: 'Alice' };
      const selectChain = createSelectChain({ first: existing });
      const deleteChain = createDeleteChain({ returningFirst: undefined });

      const connection = {
        selectFrom: vi.fn().mockReturnValue(selectChain),
        insertInto: vi.fn(),
        deleteFrom: vi.fn().mockReturnValue(deleteChain),
        // Simulate Kysely's Transaction — calling transaction() on a Transaction throws
        transaction: vi.fn().mockImplementation(() => {
          throw new Error(
            'calling the transaction method for a Transaction is not supported',
          );
        }),
      };

      // runInTransaction with REQUIRED propagation reuses the existing transaction
      // (i.e. just calls fn directly), which is the real behavior inside @Transactional
      const tm = {
        getConnection: vi.fn().mockReturnValue(connection),
        supportsReturning: false,
        runInTransaction: vi.fn((fn: () => Promise<unknown>) => fn()),
      } as unknown as TransactionManager;

      const repo = new TestRepository(tm);

      // This should succeed because deleteById uses runInTransaction (not db.transaction())
      const result = await repo.deleteById('1');

      expect(tm.runInTransaction).toHaveBeenCalled();
      // db.transaction() must NOT be called — it would throw on a Transaction object
      expect(connection.transaction).not.toHaveBeenCalled();
      expect(connection.selectFrom).toHaveBeenCalledWith('test_table');
      expect(connection.deleteFrom).toHaveBeenCalledWith('test_table');
      expect(result).toEqual(existing);
    });
  });
});
