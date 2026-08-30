import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import process from 'node:process';

const projectRoot = process.cwd();
const run = args => {
  const result = spawnSync(process.execPath, [resolve(projectRoot, 'scripts', args[0]), ...args.slice(1)], {
    cwd: projectRoot,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  return result.status ?? 1;
};

const buildStatus = run(['run-astro.mjs', 'verified-build']);
process.exit(buildStatus === 0 ? run(['run-wrangler-deploy-with-retry.mjs']) : buildStatus);
