#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';

const envFiles = ['.env', '.env.local', '.dev.vars', '.env.production'];
const env = { ...process.env };

function parseDotEnv(source) {
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    const value = rawValue.replace(/^['"]|['"]$/g, '');
    env[key] ??= value;
  }
}

for (const file of envFiles) {
  if (existsSync(file)) parseDotEnv(readFileSync(file, 'utf8'));
}

if (existsSync('wrangler.toml')) {
  const wrangler = readFileSync('wrangler.toml', 'utf8');
  for (const key of ['SITE_URL', 'KEYSTATIC_GITHUB_REPO', 'PUBLIC_KEYSTATIC_GITHUB_APP_SLUG']) {
    const match = wrangler.match(new RegExp(`^${key}\\s*=\\s*['\"]([^'\"]+)['\"]`, 'm'));
    if (match) env[key] ??= match[1];
  }
}

const errors = [];
const warnings = [];
const strict = env.STRICT_KEYSTATIC_ENV === '1' || env.CI === 'true';

function requireFormat(key, regex, message) {
  const value = env[key];
  if (!value) {
    const missingMessage = `${key} is not set in local files/environment. It may still be configured in Cloudflare Worker secrets.`;
    (strict ? errors : warnings).push(missingMessage);
    return;
  }
  if (!regex.test(value)) errors.push(`${key}: ${message} Current value: ${value}`);
}

requireFormat('KEYSTATIC_GITHUB_REPO', /^[^/\s]+\/[^/\s]+$/, 'must use owner/repo format.');
requireFormat('PUBLIC_KEYSTATIC_GITHUB_APP_SLUG', /^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'must be the GitHub App slug, e.g. businessweb-keystatic.');

const secret = env.KEYSTATIC_SECRET;
if (!secret) {
  const message = 'KEYSTATIC_SECRET is not set locally. Cloudflare Workers must have it as an encrypted Secret.';
  (strict ? errors : warnings).push(message);
} else if (secret.length < 32) {
  errors.push(`KEYSTATIC_SECRET must be at least 32 characters long. Current length: ${secret.length}.`);
}

for (const key of ['KEYSTATIC_GITHUB_CLIENT_ID', 'KEYSTATIC_GITHUB_CLIENT_SECRET']) {
  if (!env[key]) {
    const message = `${key} is not set locally. Cloudflare Workers must have it as an encrypted Secret.`;
    (strict ? errors : warnings).push(message);
  }
}

if (warnings.length) {
  console.warn('Keystatic environment warnings:');
  for (const warning of warnings) console.warn(`- ${warning}`);
}

if (errors.length) {
  console.error('Keystatic environment errors:');
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(strict ? 'Keystatic environment self-check passed.' : 'Keystatic environment self-check passed with non-fatal warnings allowed.');
}
