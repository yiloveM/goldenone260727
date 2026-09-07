import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';

const root = process.cwd();
const read = file => readFile(resolve(root, file), 'utf8');
const errors = [];
const requireMarkers = (file, text, markers) => {
  for (const marker of markers) {
    if (!text.includes(marker)) errors.push(file + ' is missing required preview marker: ' + marker);
  }
};

const [workflow, publishWorkflow, worker, deployScript, wrangler] = await Promise.all([
  read('.github/workflows/site-preview.yml'),
  read('.github/workflows/site-publish.yml'),
  read('src/worker.ts'),
  read('scripts/run-preview-deploy.mjs'),
  read('wrangler.toml'),
]);

requireMarkers('.github/workflows/site-preview.yml', workflow, [
  "'preview/**'",
  "github.ref_name != 'main'",
  'npm run check:preview',
  'npm run check',
  'npm run check:visual',
  'npm run check:class-names',
  'npm run check:template',
  'npm run build',
  'npm run preview:deploy',
  'CLOUDFLARE_API_TOKEN',
]);
requireMarkers('scripts/run-preview-deploy.mjs', deployScript, [
  "branch === 'main'",
  "mode === 'current'",
  "'versions'",
  "'upload'",
  "'--preview-alias'",
  "'DEPLOYMENT_CONTEXT:preview'",
  "workerName.endsWith('-preview')",
]);
requireMarkers('src/worker.ts', worker, [
  'DEPLOYMENT_CONTEXT',
  'previewMutationBlocked',
  'securePreviewResponse',
  "'x-robots-tag': 'noindex, nofollow, noarchive, nosnippet'",
  '(previewRuntime || !isLoopbackHost(hostname))',
  'if (!previewRuntime)',
]);
if (!/^preview_urls\s*=\s*true$/m.test(wrangler)) errors.push('wrangler.toml must enable preview_urls.');
if (!/branches:\s*\r?\n\s*- main/m.test(publishWorkflow)) errors.push('site-publish.yml must continue to target main.');
for (const forbidden of ['preview/**', 'run-preview-deploy', 'versions upload']) {
  if (publishWorkflow.includes(forbidden)) errors.push('site-publish.yml must not own preview deployment: ' + forbidden);
}

if (errors.length) {
  console.error('Preview deployment audit: ' + errors.length + ' error(s).');
  for (const error of errors) console.error('- ' + error);
  process.exit(1);
}

console.log('Preview deployment audit passed: separate Worker, branch aliases, noindex, and write isolation verified.');
