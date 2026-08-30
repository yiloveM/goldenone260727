import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import process from 'node:process';

const projectRoot = process.cwd();
const wranglerEntry = resolve(projectRoot, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const deployArgs = ['deploy', ...process.argv.slice(2)];
const maxAttempts = 3;

const nonRetryable = /authentication error|invalid (?:api )?token|build token.*(?:deleted|rolled)|not authorized|permission denied|does not have permission|code:\s*(?:10000|10001|9109)|(?:binding|database|bucket|namespace).*not found|configuration.*(?:invalid|error)|must match the name/i;
const transient = /\b(?:ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENETUNREACH|EAI_AGAIN|ENOTFOUND)\b|fetch failed|network error|socket hang up|temporar(?:y|ily)|internal server error|service unavailable|bad gateway|gateway timeout|rate limit|too many requests|\b(?:429|500|502|503|504)\b/i;

const wait = milliseconds => new Promise(resolveWait => setTimeout(resolveWait, milliseconds));

const runDeploy = () =>
  new Promise(resolveDeploy => {
    const child = spawn(process.execPath, [wranglerEntry, ...deployArgs], {
      cwd: projectRoot,
      env: {
        ...process.env,
        XDG_CONFIG_HOME: resolve(projectRoot, '.wrangler-config'),
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
    child.on('error', error => {
      process.stderr.write(`${error.stack || error.message}\n`);
      resolveDeploy({ status: 1, output: `${output}\n${error.message}` });
    });
    child.on('close', status => resolveDeploy({ status: status ?? 1, output }));
  });

for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
  if (attempt > 1) console.warn(`Retrying Wrangler deployment (${attempt}/${maxAttempts}).`);
  const result = await runDeploy();
  if (result.status === 0) process.exit(0);

  const retryable = transient.test(result.output) && !nonRetryable.test(result.output);
  if (!retryable || attempt === maxAttempts) {
    if (!retryable) console.error('Deployment failed with a non-transient error; no automatic retry was attempted.');
    else console.error(`Deployment failed after ${maxAttempts} attempts.`);
    process.exit(result.status);
  }

  const delaySeconds = attempt * 20;
  console.warn(`Transient deployment failure detected; waiting ${delaySeconds} seconds before retry.`);
  await wait(delaySeconds * 1000);
}
