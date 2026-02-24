import { Singleton } from '@goodie-ts/decorators';
import type { TodoRepository } from './TodoRepository.js';

@Singleton()
export class TodoService {
  constructor(private todoRepository: TodoRepository) {}

  async findAll() {
    return this.todoRepository.findAll();
  }

  async findById(id: string) {
    return this.todoRepository.findById(id);
  }

  async create(title: string) {
    if (!title.trim()) {
      throw new Error('Title must not be empty');
    }
    return this.todoRepository.create(title.trim());
  }

  async update(id: string, data: { title?: string; completed?: boolean }) {
    return this.todoRepository.update(id, data);
  }

  async delete(id: string) {
    return this.todoRepository.delete(id);
  }
}
