import { Goodie } from '@goodie-ts/core';
import { createHonoRouter } from '@goodie-ts/hono';
import { buildDefinitions } from './__generated__/context.js';

const ctx = await Goodie.build(buildDefinitions()).start();
const router = createHonoRouter(ctx);

export default router;
