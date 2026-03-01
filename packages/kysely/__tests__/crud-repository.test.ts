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

function createMockConnection() {
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
});
