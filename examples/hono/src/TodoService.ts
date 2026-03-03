import { Singleton } from '@goodie-ts/decorators';
import { Transactional } from '@goodie-ts/kysely';
import { LoggerFactory } from '@goodie-ts/logging';
import type { TodoRepository } from './TodoRepository.js';

@Singleton()
export class TodoService {
  private static readonly log = LoggerFactory.getLogger(TodoService);

  constructor(private todoRepository: TodoRepository) {}

  async findAll() {
    return this.todoRepository.findAll();
  }

  async findById(id: string) {
    return this.todoRepository.findById(id);
  }

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

  @Transactional()
  async update(id: string, data: { title?: string; completed?: boolean }) {
    const todo = await this.todoRepository.update(id, data);
    if (todo) {
      TodoService.log.info('Updated todo', { id });
    }
    return todo;
  }

  @Transactional()
  async delete(id: string) {
    const todo = await this.todoRepository.delete(id);
    if (todo) {
      TodoService.log.info('Deleted todo', { id });
    }
    return todo;
  }
}
