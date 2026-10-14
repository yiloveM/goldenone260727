import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import ts from 'typescript';
import * as managed from '../src/lib/turnstile.mjs';

const env = { SITE_URL: 'https://shop.example.com', TURNSTILE_SITEKEY: 'test-public-key',
  TURNSTILE_SECRET: 'test-only-secret', RESEND_API_KEY: 'test-mail', CONTACT_FROM_EMAIL: 'test@example.com', CONTACT_TO_EMAIL: 'sales@example.com' };
const request = new Request('https://shop.example.com/api/contact');
const good = { success: true, action: 'contact', hostname: 'shop.example.com' };
const load = (file, imports = {}) => {
  const source = readFileSync(file, 'utf8').replaceAll('import.meta.env.PROD', 'true');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  const module = { exports: {} };
  new Function('require', 'module', 'exports', outputText)(name => {
    if (!(name in imports)) throw new Error('Unexpected test import: ' + name);
    return imports[name];
  }, module, module.exports);
  return module.exports;
};
const secret = 'test-only-signed-secret';
const captcha = load('src/lib/form-captcha.ts', { './runtime-secret': { getScopedRuntimeSecret: async () => secret } });
const policy = enabled => load('src/lib/form-verification.ts', {
  '../data/formVerification': { turnstileEnabled: enabled }, './form-captcha': captcha, './turnstile.mjs': managed,
});
const off = policy(false);
const on = policy(true);

test('public configuration contains only selected public key, provider and action', async () => {
  assert.deepEqual(await on.publicFormVerification(env, 'contact', request), { provider: 'turnstile', sitekey: env.TURNSTILE_SITEKEY, action: 'contact' });
  for (const changes of [{ TURNSTILE_SECRET: '' }, { TURNSTILE_SITEKEY: '' }, { SITE_URL: '' }, { SITE_URL: 'https://other.example.com' }]) {
    assert.equal(await on.publicFormVerification({ ...env, ...changes }, 'contact', request), null);
  }
  assert.equal(managed.turnstileConfiguration(env, 'unknown', request), null);
});
test('Siteverify strictly matches success, action and trusted request hostname', async () => {
  for (const result of [good, { ...good, success: false }, { ...good, success: 'true' }, { ...good, action: 'download' }, { ...good, hostname: 'other.example.com' }]) {
    const verified = await managed.verifyTurnstile(env, 'contact', request, 'token', async (_url, options) => {
      assert.equal(options.method, 'POST');
      assert.equal(options.body.get('secret'), env.TURNSTILE_SECRET);
      assert.equal(options.body.get('response'), 'token');
      return Response.json(result);
    });
    assert.equal(verified.ok, result === good);
  }
});
test('missing, oversize, expired/replayed token and upstream failures fail closed', async () => {
  for (const token of ['', null, 'x'.repeat(2049)]) {
    assert.equal((await managed.verifyTurnstile(env, 'contact', request, token, () => { throw new Error('Must not call'); })).ok, false);
  }
  for (const send of [async () => { throw new Error('Offline'); }, async () => new Response('Offline', { status: 503 }), async () => new Response('not JSON'), async () => Response.json({ success: false, 'error-codes': ['timeout-or-duplicate'] })]) {
    assert.equal((await managed.verifyTurnstile(env, 'contact', request, 'token', send)).ok, false);
  }
});
test('read-only preview exposes config but rejects validation before any Siteverify call', async () => {
  const preview = { ...env, DEPLOYMENT_CONTEXT: 'preview' };
  assert.ok(managed.turnstilePublicConfiguration(preview, 'contact', new Request('https://preview.example.com/api/contact')));
  assert.equal((await managed.verifyTurnstile(preview, 'contact', request, 'token', () => { throw new Error('No preview writes'); })).status, 403);
  assert.equal((await off.verifyPublicForm(preview, 'contact', request, new FormData())).status, 403);
});
test('OFF preserves signed protocol; ON cannot accept a signed code or client-selected provider', async () => {
  const config = await off.publicFormVerification(env, 'contact', request);
  assert.equal(config.provider, 'signed-captcha');
  const form = new FormData();
  form.set('captcha', config.code); form.set('captchaToken', config.token); form.set('provider', 'signed-captcha');
  assert.equal((await off.verifyPublicForm(env, 'contact', request, form)).ok, true);
  assert.equal((await on.verifyPublicForm(env, 'contact', request, form)).ok, false);
});
const api = (action, enabled = true, downloads = true) => {
  const writes = [];
  const document = { id: 'catalogue', title: 'Product catalogue', fileName: 'catalogue.pdf', url: 'https://cdn.example.com/catalogue.pdf' };
  const storage = load('src/lib/public-form-submissions.ts');
  const imports = {
    'astro:content': { getCollection: async () => [] },
    '../../data/inquiryCart': { getProductModelCodes: () => [], INQUIRY_CART_MAX_ITEMS: 30, INQUIRY_CART_MAX_QUANTITY: 999999 },
    '../../data/productCategories': { isProductPublished: () => true },
    '../../data/catalogDownloads': { catalogDownloadsAvailable: downloads, catalogDownloadById: id => id === document.id ? document : undefined },
    '../../data/site': { siteInfo: { name: 'Test company', email: 'sales@example.com' } },
    '../../lib/runtime-env': { getRuntimeEnv: () => env, getEnvString: (runtime, key) => typeof runtime?.[key] === 'string' ? runtime[key] : '' },
    '../../lib/form-verification': policy(enabled),
    '../../lib/public-form-submissions': { ...storage,
      createPublicFormSubmission: async (_runtime, submission) => { writes.push({ kind: 'save', submission }); return 'test-id'; },
      markPublicFormDelivery: async (_runtime, _id, status) => { writes.push({ kind: 'delivery', status }); },
    },
  };
  const module = load('src/pages/api/' + action + '.ts', imports);
  return { writes, document, get: req => action === 'contact' ? module.GET({ locals: {}, request: req }) : module.handleDownloadRequest(req, env),
    post: req => action === 'contact' ? module.POST({ locals: {}, request: req }) : module.handleDownloadRequest(req, env) };
};
const submission = (action, token = 'valid-token', extra = {}) => {
  const form = new FormData();
  for (const [key, value] of Object.entries({ name: 'Test Buyer', email: 'buyer@example.com', country: 'Test Country', message: 'Project request',
    phoneWhatsapp: '+1 202 555 0100', documentId: 'catalogue', inquiryItems: '[]', 'cf-turnstile-response': token, ...extra })) form.set(key, value);
  return new Request('https://shop.example.com/api/' + action, { method: 'POST', body: form, headers: { origin: 'https://shop.example.com' } });
};
for (const action of ['contact', 'download']) {
  test(action + ' API verifies before original D1/mail and rejects replay with no second lead', async () => {
    const handler = api(action);
    const originalFetch = globalThis.fetch;
    const used = new Set();
    let emails = 0;
    globalThis.fetch = async (url, options) => {
      if (String(url).includes('siteverify')) {
        const token = options.body.get('response');
        const duplicate = used.has(token); used.add(token);
        return Response.json(duplicate ? { success: false } : { ...good, action });
      }
      assert.equal(url, 'https://api.resend.com/emails');
      assert.equal(handler.writes[0]?.kind, 'save');
      emails++;
      return Response.json({ id: 'test-email' });
    };
    try {
      const publicConfig = await handler.get(new Request('https://shop.example.com/api/' + action));
      assert.equal((await publicConfig.json()).provider, 'turnstile');
      assert.equal((await handler.post(submission(action))).status, 200);
      assert.equal(handler.writes[1].status, 'sent');
      assert.equal((await handler.post(submission(action))).status, 400);
      assert.equal(handler.writes.length, 2);
      assert.equal(emails, 1);
    } finally { globalThis.fetch = originalFetch; }
  });
  test(action + ' API invalid token and missing Secret cannot persist or send', async () => {
    const handler = api(action);
    assert.equal((await handler.post(submission(action, ''))).status, 400);
    const before = env.TURNSTILE_SECRET;
    env.TURNSTILE_SECRET = '';
    try { assert.equal((await handler.post(submission(action))).status, 503); }
    finally { env.TURNSTILE_SECRET = before; }
    assert.equal(handler.writes.length, 0);
  });
}
test('download OFF rejects both methods; no client override enables it', async () => {
  const handler = api('download', true, false);
  assert.equal((await handler.get(new Request('https://shop.example.com/api/download'))).status, 404);
  assert.equal((await handler.post(submission('download'))).status, 404);
  assert.equal(handler.writes.length, 0);
});
test('real owner setting and every existing form consume the shared verifier without replacing customer UI', () => {
  const settings = readFileSync('keystatic.config.ts', 'utf8');
  assert.ok(settings.includes("path: 'src/data/form-verification'"));
  assert.ok(readFileSync('.github/workflows/site-publish.yml', 'utf8').includes("'src/data/form-verification.json'"));
  for (const file of ['InquiryForm.astro', 'CatalogDownloadGate.astro', 'ContactAction.astro', 'ArtworkBriefForm.astro']) {
    if (!existsSync('src/components/' + file)) continue;
    const source = readFileSync('src/components/' + file, 'utf8');
    assert.ok(source.includes('<FormVerification'), file);
    assert.ok(source.includes('verificationchange'), file);
    assert.ok(source.includes('verification?.ready'), file);
  }
  const component = readFileSync('src/components/FormVerification.astro', 'utf8');
  assert.ok(component.includes('<slot />'));
  assert.ok(component.includes('data-verification-widget'));
  const client = readFileSync('src/lib/form-verification-client.ts', 'utf8');
  assert.ok(client.includes("'details[data-contact-action]'"));
});
