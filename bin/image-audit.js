#!/usr/bin/env node
import { run } from '../src/cli.js';

run(process.argv.slice(2)).catch((err) => {
  console.error(err.message || err);
  // 2 = runtime error; 1 is reserved for "issues found"
  process.exitCode = 2;
});
