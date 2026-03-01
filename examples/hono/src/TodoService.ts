import { Cacheable, CacheEvict } from '@goodie-ts/cache';
import { Singleton } from '@goodie-ts/decorators';
import { Log } from '@goodie-ts/logging';
import type { TodoRepository } from './TodoRepository.js';

@Singleton()
export class TodoService {
  constructor(private todoRepository: TodoRepository) {}

  @Log()
  @Cacheable('todos')
  async findAll() {
    return this.todoRepository.findAll();
  }

  @Log()
  async findById(id: string) {
    return this.todoRepository.findById(id);
  }

  @Log()
  @CacheEvict('todos')
  async create(title: string) {
    if (!title.trim()) {
      throw new Error('Title must not be empty');
    }
    return this.todoRepository.create(title.trim());
  }

  @Log()
  async update(id: string, data: { title?: string; completed?: boolean }) {
    return this.todoRepository.update(id, data);
  }

  @Log()
  @CacheEvict('todos')
  async delete(id: string) {
    return this.todoRepository.delete(id);
  }
}
