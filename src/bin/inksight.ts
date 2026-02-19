#!/usr/bin/env node
/**
 * InkSight CLI entry point
 *
 * Compiled to dist/bin/inksight.js by TypeScript.
 * Registered as the `inksight` binary in package.json.
 */

import { InkSightCLI } from '../cli/cli.js';

const cli = new InkSightCLI();
cli.run(process.argv).catch((err) => {
  console.error('Fatal error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
