import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import process from 'node:process';

const projectRoot = process.cwd();
const args = process.argv.slice(2);
if (!args.length) throw new Error('Usage: node scripts/run-wrangler.mjs <wrangler-command> [...args]');

const result = spawnSync(
  process.execPath,
  [resolve(projectRoot, 'node_modules', 'wrangler', 'bin', 'wrangler.js'), ...args],
  {
    cwd: projectRoot,
    env: {
      ...process.env,
      // Keep local Worker state and logs in an ignored project directory.
      XDG_CONFIG_HOME: resolve(projectRoot, '.wrangler-config'),
    },
    stdio: 'inherit',
  },
);

if (result.error) throw result.error;
process.exit(result.status ?? 1);
