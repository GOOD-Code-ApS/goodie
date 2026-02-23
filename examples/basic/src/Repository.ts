/**
 * Generic in-memory repository.
 * Not decorated — instances are provided via @Module / @Provides.
 */
export class Repository<T> {
  private readonly items: T[] = [];

  add(item: T): void {
    this.items.push(item);
  }

  findAll(): T[] {
    return [...this.items];
  }
}
