import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadWranglerVars } from './load-wrangler-vars.mjs';

const projectRoot = process.cwd();
const clientRoot = resolve(projectRoot, 'dist', 'client');
const vars = loadWranglerVars(projectRoot);
const repo = String(vars.PUBLIC_KEYSTATIC_GITHUB_REPO || '').trim();
const appSlug = String(vars.PUBLIC_KEYSTATIC_GITHUB_APP_SLUG || '').trim();

if (!repo || repo === 'your-org/businessweb') {
  throw new Error('Keystatic build verification requires a real PUBLIC_KEYSTATIC_GITHUB_REPO in wrangler.toml.');
}
if (!appSlug) {
  throw new Error('Keystatic build verification requires PUBLIC_KEYSTATIC_GITHUB_APP_SLUG in wrangler.toml.');
}
if (!existsSync(clientRoot)) {
  throw new Error('Keystatic build verification could not find dist/client. Run the Astro build first.');
}

const javascript = [];
const collect = directory => {
  for (const name of readdirSync(directory)) {
    const file = resolve(directory, name);
    if (statSync(file).isDirectory()) collect(file);
    else if (name.endsWith('.js')) javascript.push(readFileSync(file, 'utf8'));
  }
};
collect(clientRoot);

const clientBundle = javascript.join('\n');
if (!clientBundle.includes(repo)) {
  throw new Error(`The Keystatic browser bundle does not contain the configured repository ${repo}.`);
}
if (!clientBundle.includes(appSlug)) {
  throw new Error(`The Keystatic browser bundle does not contain the configured GitHub App slug ${appSlug}.`);
}

console.log(`Keystatic browser build verified for ${repo} with GitHub App ${appSlug}.`);
