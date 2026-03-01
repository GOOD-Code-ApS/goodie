import { Singleton } from '@goodie-ts/decorators';
import { Log } from '@goodie-ts/logging';
import { Timeout } from '@goodie-ts/resilience';
import type { TodoRepository } from './TodoRepository.js';

@Singleton()
export class TodoService {
  constructor(private todoRepository: TodoRepository) {}

  @Log()
  @Timeout(5000)
  async findAll() {
    return this.todoRepository.findAll();
  }

  @Log()
  @Timeout(5000)
  async findById(id: string) {
    return this.todoRepository.findById(id);
  }

  @Log()
  @Timeout(5000)
  async create(title: string) {
    if (!title.trim()) {
      throw new Error('Title must not be empty');
    }
    return this.todoRepository.create(title.trim());
  }

  @Log()
  @Timeout(5000)
  async update(id: string, data: { title?: string; completed?: boolean }) {
    return this.todoRepository.update(id, data);
  }

  @Log()
  @Timeout(5000)
  async delete(id: string) {
    return this.todoRepository.delete(id);
  }
}
