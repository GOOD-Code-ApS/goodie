import { Cacheable, CacheEvict } from '@goodie-ts/cache';
import { Singleton } from '@goodie-ts/decorators';
import { Transactional } from '@goodie-ts/kysely';
import { LoggerFactory } from '@goodie-ts/logging';
import { Timeout } from '@goodie-ts/resilience';
import type { TodoRepository } from './TodoRepository.js';

@Singleton()
export class TodoService {
  private static readonly log = LoggerFactory.getLogger(TodoService);

  constructor(private todoRepository: TodoRepository) {}

  @Timeout(5000)
  @Cacheable('todos')
  async findAll() {
    return this.todoRepository.findAll();
  }

  @Timeout(5000)
  async findById(id: string) {
    return this.todoRepository.findById(id);
  }

  @Timeout(5000)
  @CacheEvict('todos')
  @Transactional()
  async create(title: string) {
    if (!title.trim()) {
      TodoService.log.warn('Attempted to create todo with empty title');
      throw new Error('Title must not be empty');
    }
    const todo = await this.todoRepository.create(title.trim());
    TodoService.log.info('Created todo', { id: todo.id, title: todo.title });
    return todo;
  }

  @Timeout(5000)
  @Transactional()
  async update(id: string, data: { title?: string; completed?: boolean }) {
    const todo = await this.todoRepository.update(id, data);
    if (todo) {
      TodoService.log.info('Updated todo', { id });
    }
    return todo;
  }

  @Timeout(5000)
  @CacheEvict('todos')
  @Transactional()
  async delete(id: string) {
    const todo = await this.todoRepository.delete(id);
    if (todo) {
      TodoService.log.info('Deleted todo', { id });
    }
    return todo;
  }
}
