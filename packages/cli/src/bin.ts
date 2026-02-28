#!/usr/bin/env node
import { defineCommand, runMain } from 'citty';
import { generate } from './commands/generate.js';

const main = defineCommand({
  meta: {
    name: 'goodie',
    description: 'CLI for goodie-ts compile-time dependency injection',
  },
  subCommands: {
    generate,
  },
});

runMain(main);
