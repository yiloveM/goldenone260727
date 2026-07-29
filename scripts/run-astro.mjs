import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import process from 'node:process';
import { loadWranglerVars } from './load-wrangler-vars.mjs';

const projectRoot = process.cwd();
const astroEntry = resolve(projectRoot, 'node_modules', 'astro', 'bin', 'astro.mjs');
const keystaticBuildCheck = resolve(projectRoot, 'scripts', 'verify-keystatic-build.mjs');
const wranglerVars = loadWranglerVars(projectRoot);
const configuredWranglerVars = Object.fromEntries(
  Object.entries(wranglerVars).filter(([, value]) => value.trim())
);
const sharedOptions = {
  cwd: projectRoot,
  env: {
    ...process.env,
    // Non-empty committed values override any legacy dashboard build variables.
    ...configuredWranglerVars,
    // Astro 6 uses workerd through the Cloudflare adapter. Keep its local state ignored.
    XDG_CONFIG_HOME: resolve(projectRoot, '.wrangler-config'),
  },
  stdio: 'inherit',
};

const run = args => {
  const result = spawnSync(process.execPath, [astroEntry, ...args], sharedOptions);
  if (result.error) throw result.error;
  return result.status ?? 1;
};

const [command, ...args] = process.argv.slice(2);
if (!command) throw new Error('Usage: node scripts/run-astro.mjs <dev|check|build|preview|verified-build> [...args]');

if (command === 'verified-build') {
  const checkStatus = run(['check']);
  if (checkStatus !== 0) process.exit(checkStatus);
  const buildStatus = run(['build', ...args]);
  if (buildStatus !== 0) process.exit(buildStatus);
  const verifyStatus = spawnSync(process.execPath, [keystaticBuildCheck], sharedOptions);
  if (verifyStatus.error) throw verifyStatus.error;
  process.exit(verifyStatus.status ?? 1);
}

process.exit(run([command, ...args]));
