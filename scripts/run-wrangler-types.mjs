import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import process from 'node:process';

const projectRoot = process.cwd();
const wranglerEntry = resolve(projectRoot, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const result = spawnSync(process.execPath, [wranglerEntry, 'types', '--include-runtime=false', ...process.argv.slice(2)], {
  cwd: projectRoot,
  env: {
    ...process.env,
    // Keep Wrangler logs and local state in an ignored project directory.
    XDG_CONFIG_HOME: resolve(projectRoot, '.wrangler-config'),
  },
  stdio: 'inherit',
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
