import { Singleton } from '@goodie-ts/decorators';
import { Transactional } from '@goodie-ts/kysely';
import { Log } from '@goodie-ts/logging';
import type { TodoRepository } from './TodoRepository.js';

@Singleton()
export class TodoService {
  constructor(private todoRepository: TodoRepository) {}

  @Log()
  async findAll() {
    return this.todoRepository.findAll();
  }

  @Log()
  async findById(id: string) {
    return this.todoRepository.findById(id);
  }

  @Log()
  @Transactional()
  async create(title: string) {
    if (!title.trim()) {
      throw new Error('Title must not be empty');
    }
    return this.todoRepository.create(title.trim());
  }

  @Log()
  @Transactional()
  async update(id: string, data: { title?: string; completed?: boolean }) {
    return this.todoRepository.update(id, data);
  }

  @Log()
  @Transactional()
  async delete(id: string) {
    return this.todoRepository.delete(id);
  }
}
