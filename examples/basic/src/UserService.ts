import { Singleton } from '@goodie/decorators';
import { User } from './model.js';
import type { Repository } from './Repository.js';

@Singleton()
export class UserService {
  constructor(private userRepo: Repository<User>) {}

  addUser(id: string, name: string): void {
    this.userRepo.add(new User(id, name));
  }

  listUsers(): User[] {
    return this.userRepo.findAll();
  }
}
