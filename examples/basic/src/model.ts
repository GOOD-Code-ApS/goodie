/** Simple data class representing a user. */
export class User {
  constructor(
    public readonly id: string,
    public readonly name: string,
  ) {}
}

/** Simple data class representing an order. */
export class Order {
  constructor(
    public readonly id: string,
    public readonly userId: string,
    public readonly total: number,
  ) {}
}
