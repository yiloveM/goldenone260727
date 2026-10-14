import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadWranglerVars } from './load-wrangler-vars.mjs';
const args = process.argv.slice(2);
const option = name => { const index = args.indexOf('--' + name); return index >= 0 ? args[index + 1] : ''; };
const target = option('url');
if (!target) {
  console.log('No live check performed. Use npm run check:forms -- --url <this-site-url> [--preview].');
  process.exit(0);
}
const base = new URL(target);
assert.ok(base.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(base.hostname), 'Use HTTPS for a deployed site.');
const preview = args.includes('--preview');
const settings = JSON.parse(await readFile('src/data/form-verification.json', 'utf8'));
const downloads = JSON.parse(await readFile('src/data/catalog-downloads.json', 'utf8'));
const provider = settings.turnstileEnabled === true ? 'turnstile' : 'signed-captcha';
const configured = loadWranglerVars(process.cwd(), preview ? 'preview' : undefined);
const get = pathname => fetch(new URL(pathname, base), { headers: { accept: 'application/json,text/html' }, signal: AbortSignal.timeout(20000) });
const checkApi = async action => {
  const response = await get('/api/' + action);
  assert.equal(response.status, 200, action + ' public verification configuration unavailable');
  assert.match(response.headers.get('cache-control') || '', /no-store/i);
  const config = await response.json();
  assert.equal(config.provider, provider);
  assert.equal(config.action, action);
  assert.equal(config.secret, undefined);
  if (provider === 'turnstile') {
    assert.ok(config.sitekey && configured.TURNSTILE_SITEKEY);
    assert.equal(config.sitekey, configured.TURNSTILE_SITEKEY);
    assert.equal(config.code, undefined);
  } else {
    assert.match(config.code, /^[A-Z0-9]{4}$/);
    assert.ok(config.token && Number.isFinite(Date.parse(config.expiresAt)));
  }
};
await checkApi('contact');
const contact = await get(option('contact-path') || '/contact/');
assert.equal(contact.status, 200, 'Contact page unavailable');
assert.ok((await contact.text()).includes('data-provider="' + provider + '"'), 'Rendered contact verifier differs from API/owner setting');
if (downloads.enabled === true && Array.isArray(downloads.documents) && downloads.documents.length) {
  await checkApi('download');
  const response = await get(option('download-path') || '/downloads/');
  assert.equal(response.status, 200, 'Download page unavailable');
  const html = await response.text();
  assert.ok(html.includes('data-provider="' + provider + '"'));
  for (const document of downloads.documents) if (document.url) assert.ok(!html.includes(document.url), 'Protected PDF URL leaked in initial HTML');
} else assert.equal((await get('/api/download')).status, 404);
console.log('Read-only rendered-page/API audit passed: ' + provider + '. No POST, Secret access, D1 or mail write. Actual widget challenge and successful backend/replay acceptance remain separate checks.');
