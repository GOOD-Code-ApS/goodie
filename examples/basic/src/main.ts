import { App_Name_Token, app } from './AppContext.generated.js';
import { OrderService } from './OrderService.js';
import { UserService } from './UserService.js';

async function main() {
  const ctx = await app.start();

  const appName = ctx.get(App_Name_Token);
  console.log(`Application: ${appName}`);

  const userService = ctx.get(UserService);
  userService.addUser('1', 'Alice');
  userService.addUser('2', 'Bob');
  console.log('Users:', userService.listUsers());

  const orderService = ctx.get(OrderService);
  orderService.placeOrder('o1', '1', 42.0);
  console.log('Orders:', orderService.listOrders());

  await ctx.close();
}

main().catch(console.error);
