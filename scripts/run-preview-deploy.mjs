import { readFile } from 'node:fs/promises';
import { spawn, spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import process from 'node:process';

const root = process.cwd();
const args = process.argv.slice(2);
const option = name => {
  const index = args.indexOf('--' + name);
  return index >= 0 ? String(args[index + 1] || '').trim() : '';
};
const runGit = commandArgs =>
  spawnSync('git', commandArgs, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

const currentBranchResult = runGit(['branch', '--show-current']);
const branch =
  option('branch') ||
  String(process.env.GITHUB_REF_NAME || process.env.WORKERS_CI_BRANCH || '').trim() ||
  String(currentBranchResult.stdout || '').trim();
if (!branch) {
  console.error('Preview deployment requires --branch, GITHUB_REF_NAME, or a checked-out branch.');
  process.exit(1);
}
if (branch === 'main') {
  console.error('Refusing preview deployment from main. Production remains owned by site-publish.yml.');
  process.exit(1);
}

const mode = option('mode') || String(process.env.PREVIEW_DEPLOYMENT_MODE || 'alias').trim().toLowerCase();
if (!['current', 'alias'].includes(mode)) {
  console.error('Preview deployment mode must be current or alias.');
  process.exit(1);
}

const remote = option('remote') || 'origin';
const remoteCheck = runGit(['ls-remote', '--exit-code', '--heads', remote, 'refs/heads/' + branch]);
if (remoteCheck.status !== 0 || !String(remoteCheck.stdout || '').trim()) {
  console.error('Preview branch does not exist on ' + remote + ': ' + branch);
  process.exit(2);
}

const wranglerText = await readFile(resolve(root, 'wrangler.toml'), 'utf8');
const productionName = wranglerText.match(/^name\s*=\s*"([^"]+)"/m)?.[1]?.trim();
if (!productionName) {
  console.error('Could not read the production Worker name from wrangler.toml.');
  process.exit(1);
}
const workerName = option('worker') || productionName + '-preview';
if (workerName === productionName || !workerName.endsWith('-preview')) {
  console.error('Preview Worker name must differ from production and end with -preview.');
  process.exit(1);
}

const sanitizeAlias = value => {
  const normalized = value
    .toLowerCase()
    .replace(/^preview[\/-]+/, '')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const prefixed = /^[a-z]/.test(normalized) ? normalized : 'preview-' + (normalized || 'branch');
  const maxLength = 63 - workerName.length - 1;
  if (maxLength < 1) throw new Error('Preview Worker name is too long for a preview alias URL.');
  return prefixed.slice(0, maxLength).replace(/-+$/g, '') || 'preview';
};

const previewAlias = sanitizeAlias(option('alias') || String(process.env.PREVIEW_ALIAS || '').trim() || branch);
const wranglerEntry = resolve(root, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const commonArgs = ['--name', workerName, '--var', 'DEPLOYMENT_CONTEXT:preview', '--keep-vars'];
const wranglerArgs =
  mode === 'current'
    ? ['deploy', ...commonArgs]
    : [
        'versions',
        'upload',
        ...commonArgs,
        '--preview-alias',
        previewAlias,
        '--message',
        'Branch preview ' + branch + ' at ' + String(process.env.GITHUB_SHA || 'local').trim(),
      ];

const nonRetryable =
  /authentication error|invalid (?:api )?token|not authorized|permission denied|does not have permission|code:\s*(?:10000|10001|9109)|(?:binding|database|bucket|namespace).*not found|configuration.*(?:invalid|error)|must match the name/i;
const transient =
  /\b(?:ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENETUNREACH|EAI_AGAIN|ENOTFOUND)\b|fetch failed|network error|socket hang up|temporar(?:y|ily)|internal server error|service unavailable|bad gateway|gateway timeout|rate limit|too many requests|\b(?:429|500|502|503|504)\b/i;
const wait = milliseconds => new Promise(resolveWait => setTimeout(resolveWait, milliseconds));

const runWrangler = () =>
  new Promise(resolveRun => {
    const child = spawn(process.execPath, [wranglerEntry, ...wranglerArgs], {
      cwd: root,
      env: {
        ...process.env,
        XDG_CONFIG_HOME: resolve(root, '.wrangler-config'),
      },
      stdio: ['inherit', 'pipe', 'pipe'],
    });
    let output = '';
    const forward = (chunk, target) => {
      target.write(chunk);
      if (output.length < 250_000) output += chunk.toString();
    };
    child.stdout.on('data', chunk => forward(chunk, process.stdout));
    child.stderr.on('data', chunk => forward(chunk, process.stderr));
    child.on('error', error => resolveRun({ status: 1, output: output + '\n' + error.message }));
    child.on('close', status => resolveRun({ status: status ?? 1, output }));
  });

console.log('Publishing ' + branch + ' to ' + workerName + ' in ' + mode + ' preview mode.');
if (mode === 'alias') console.log('Stable preview alias: ' + previewAlias);

for (let attempt = 1; attempt <= 3; attempt += 1) {
  if (attempt > 1) console.warn('Retrying preview upload (' + attempt + '/3).');
  const result = await runWrangler();
  if (result.status === 0) process.exit(0);
  const retryable = transient.test(result.output) && !nonRetryable.test(result.output);
  if (!retryable || attempt === 3) {
    if (!retryable) console.error('Preview upload failed with a non-transient error.');
    else console.error('Preview upload failed after three attempts.');
    process.exit(result.status);
  }
  await wait(attempt * 20_000);
}
