import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const args = process.argv.slice(2);
const option = name => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? String(args[index + 1] || '').trim() : '';
};
const run = (command, commandArgs, options = {}) => spawnSync(command, commandArgs, {
  cwd: root,
  encoding: 'utf8',
  stdio: options.inherit ? 'inherit' : ['ignore', 'pipe', 'pipe'],
});

const currentBranchResult = run('git', ['branch', '--show-current']);
const branch = option('branch') || String(process.env.WORKERS_CI_BRANCH || '').trim() || String(currentBranchResult.stdout || '').trim();
if (!branch) {
  console.error('Preview deployment requires --branch, WORKERS_CI_BRANCH, or a checked-out branch.');
  process.exit(1);
}
if (branch === 'main') {
  console.error('Refusing preview deployment from main. Production remains owned by GitHub Actions.');
  process.exit(1);
}

const remote = option('remote') || 'origin';
const remoteCheck = run('git', ['ls-remote', '--exit-code', '--heads', remote, `refs/heads/${branch}`]);
if (remoteCheck.status !== 0 || !String(remoteCheck.stdout || '').trim()) {
  console.error(`Preview branch does not exist on ${remote}: ${branch}`);
  console.error('No preview Worker should be built, deployed, or connected until the branch is pushed.');
  process.exit(2);
}

const wranglerText = await readFile(path.join(root, 'wrangler.toml'), 'utf8');
const productionName = wranglerText.match(/^name\s*=\s*"([^"]+)"/m)?.[1]?.trim();
if (!productionName) {
  console.error('Could not read the production Worker name from wrangler.toml.');
  process.exit(1);
}
const workerName = option('worker') || `${productionName}-preview`;
if (workerName === productionName) {
  console.error('Preview Worker name must be different from the production Worker name.');
  process.exit(1);
}

console.log(`Deploying remote branch ${branch} to isolated Worker ${workerName}.`);
const deploy = run(process.execPath, [path.join(root, 'scripts', 'run-wrangler-deploy-with-retry.mjs'), '--name', workerName], { inherit: true });
process.exit(deploy.status ?? 1);
