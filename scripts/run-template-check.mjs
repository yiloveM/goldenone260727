import { spawn } from 'node:child_process';
import process from 'node:process';

const production = process.argv.includes('--production');

const run = args => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, args, { cwd: process.cwd(), stdio: 'inherit' });
  child.once('error', reject);
  child.once('exit', code => {
    if (code === 0) resolve();
    else reject(new Error(`node ${args.join(' ')} exited with ${code ?? 'an unknown error'}.`));
  });
});

try {
  await run(['scripts/run-wrangler-types.mjs', '--check']);
  await run(['scripts/check-admin-portal-rewrite.mjs']);
  await run(['scripts/audit-template-readiness.mjs', ...(production ? ['--production'] : [])]);
  await run(['scripts/audit-feature-continuity.mjs']);
  await run(['scripts/audit-product-seo.mjs']);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
