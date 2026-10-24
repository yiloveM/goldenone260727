import {sitePolicyFixture} from './site-policy-test-fixture.mjs';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, mkdtemp, cp } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build as bundle } from 'esbuild';
import { build } from 'astro';
import { createReader } from '@keystatic/core/reader';
import { chromium } from 'playwright';
import { managerBackend } from './manager-browser-fixture.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const base = resolve(root, '.sandbox/control-tests');
await mkdir(base, { recursive: true });
const output = await mkdtemp(resolve(base, 'run-'));
process.env.TEMP = output;
process.env.TMP = output;
const checks = [];
const check = async (name, run) => { await run(); checks.push(name); console.log('PASS ' + name); };
const json = async file => JSON.parse(await readFile(resolve(root, file), 'utf8'));
const write = async (file, source) => { await mkdir(dirname(file), { recursive: true }); await writeFile(file, source); };
const snapshot = {};
for (const file of ['src/data/customer-reviews.json', 'src/data/site-language-settings.json', 'src/data/form-verification.json', 'src/data/catalog-downloads.json', 'src/data/product-editor-settings.json', 'src/keystatic/analytics-dashboard.json', 'src/data/industry-profile.json', 'wrangler.toml']) snapshot[file] = await readFile(resolve(root, file), 'utf8');

await check('real Keystatic schemas read all existing values and expose owner policy navigation', async () => {
  const file = resolve(output, 'keystatic-config.mjs');
  await bundle({ plugins:[sitePolicyFixture()],entryPoints: [resolve(root, 'keystatic.config.ts')], bundle: true, packages: 'external', platform: 'node', format: 'esm', outfile: file, define: { 'import.meta.env': '{}' }, logLevel: 'error' });
  const config = (await import(pathToFileURL(file).href)).default;
  const reader = createReader(root, config);
  const profile = await json('src/data/industry-profile.json');
  assert.deepEqual(await reader.singletons.siteFoundation.read(), { ...profile, governance: { contentOwner: '', ...profile.governance } });
  assert.deepEqual(await reader.singletons.productEditorSettings.read(), await json('src/data/product-editor-settings.json'));
  assert.equal((await reader.singletons.formVerification.read()).turnstileEnabled, (await json('src/data/form-verification.json')).turnstileEnabled);
  assert.equal((await reader.singletons.catalogDownloads.read()).enabled, (await json('src/data/catalog-downloads.json')).enabled);
  assert.equal((await reader.singletons.customerReviews.read()).enabled, (await json('src/data/customer-reviews.json')).enabled);
  assert.equal((await reader.singletons.analyticsDashboard.read()).managerVisible, (await json('src/keystatic/analytics-dashboard.json')).managerVisible);
  const navigation = Object.values(config.ui.navigation).flat();
  for (const key of ['siteFoundation', 'productEditorSettings', 'formVerification', 'catalogDownloads', 'customerReviews', 'siteLanguages']) assert.ok(navigation.includes(key), 'Missing owner navigation: ' + key);
});

const executablePath = process.env.MANAGER_BROWSER_EXECUTABLE || (process.platform === 'win32'
  ? ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync) : undefined);
const browser = await chromium.launch({ executablePath, headless: true, env: { ...process.env, TEMP: output, TMP: output } });
const backend = await managerBackend(root, output);
let failures = [];
try {
  for (const state of [{ label: 'on', reviews: true, turnstile: true, downloads: true, empty: false }, { label: 'off', reviews: false, turnstile: false, downloads: false, empty: false }, { label: 'empty', reviews: true, turnstile: true, downloads: true, empty: true }]) {
    const fixture = resolve(output, state.label);
    for (const directory of ['src/data', 'src/lib', 'src/config', 'src/components', 'src/styles']) await cp(resolve(root, directory), resolve(fixture, directory), { recursive: true });
    await cp(resolve(root,'src/keystatic/analytics-dashboard.json'),resolve(fixture,'src/keystatic/analytics-dashboard.json'),{recursive:true});
    const central=await json('src/data/site-config.json');central.features.reviews.enabled=state.reviews;central.features.verification.provider=state.turnstile?'turnstile':'signed-captcha';central.features.downloads.mode=state.downloads?'protected':'disabled';await write(resolve(fixture,'src/data/site-config.json'),JSON.stringify(central));
    await write(resolve(fixture, 'src/data/customer-reviews.json'), JSON.stringify({ enabled: state.reviews, summary: {}, reviews: [] }));
    await write(resolve(fixture, 'src/data/form-verification.json'), JSON.stringify({ turnstileEnabled: state.turnstile }));
    await write(resolve(fixture, 'src/data/catalog-downloads.json'), JSON.stringify({ enabled: state.downloads, documents: state.empty ? [] : [{ id: 'catalogue', fileName: 'catalogue.pdf', title: 'Custom gifts catalogue', description: '', url: 'https://cdn.example.test/catalogue.pdf' }] }));
    await write(resolve(fixture, 'src/content.config.ts'), `import { defineCollection } from 'astro:content'; export const collections = { products: defineCollection({ loader: async () => [] }) };`);
    await write(resolve(fixture, 'src/pages/controls.astro'), `---
import InquiryForm from '../components/InquiryForm.astro';
import CatalogDownloadGate from '../components/CatalogDownloadGate.astro';
import CustomerReviews from '../components/CustomerReviews.astro';
import ArtworkBriefForm from '../components/ArtworkBriefForm.astro';
import ContactAction from '../components/ContactAction.astro';
import { getLocaleFromPathname } from '../data/i18n';
import { productReviewStructuredData } from '../lib/product-reviews.mjs';
import { reviewSystemEnabled, reviewsForProduct } from '../data/customerReviews';
import { serializeJsonLd } from '../lib/json-ld.mjs';
import '../styles/global.css';
import '../styles/goldenone-redesign.css';
const locale = getLocaleFromPathname(Astro.url.pathname);
const records = ${JSON.stringify(state.empty ? [] : [{ buyerLabel: 'Regression buyer', rating: '5', quote: 'Custom gifts feedback.', published: true }])};
const schema = productReviewStructuredData(reviewSystemEnabled, reviewsForProduct('control-product', records));
---
<!doctype html><html lang="en"><body><main class="container">
<CustomerReviews productSlug="control-product" productReviews={records} />
<script type="application/ld+json" is:inline set:html={serializeJsonLd(schema)}></script>
<InquiryForm locale={locale} labels={{name:'Name', email:'Email', company:'Company', country:'Country', message:'Message', sendInquiry:'Send inquiry'}} />
<ArtworkBriefForm />
<CatalogDownloadGate />
<ContactAction whatsapp="https://wa.me/10000000000" email="fixture@example.test" />
</main></body></html>`);
    const english = await readFile(resolve(fixture, 'src/pages/controls.astro'), 'utf8');
    await write(resolve(fixture, 'src/pages/ar/controls.astro'), english
      .replaceAll("from '../", "from '../../").replaceAll("import '../styles", "import '../../styles")
      .replace('<html lang="en">', '<html lang="ar" dir="rtl">'));
    const dist = resolve(fixture, 'dist');
    await build({ root: fixture, configFile: false, output: 'static', logLevel: 'error', outDir: dist, cacheDir: resolve(fixture, '.astro-cache') });
    const server = await backend.start(dist);
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    context.setDefaultTimeout(20000);
    let unavailable = state.empty;
    let failSubmission = true;
    const submissions = [];
    await context.addInitScript(() => {
      const widgets = new Map();
      let sequence = 0;
      window.turnstile = {
        render(container, options) { const id = String(++sequence); widgets.set(id, options); container.textContent = 'Local verification fixture'; setTimeout(() => options.callback('local-token'), 0); return id; },
        reset(id) { setTimeout(() => widgets.get(id)?.callback('local-token'), 0); },
        remove(id) { widgets.delete(id); },
      };
    });
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (/\/api\/(contact|download)$/.test(url.pathname)) {
        const action = url.pathname.split('/').at(-1);
        if (route.request().method() === 'POST') {
          const request = route.request();
          const form = await new Request(request.url(), { method: 'POST', headers: { 'content-type': request.headers()['content-type'] }, body: request.postDataBuffer() }).formData();
          submissions.push(Object.fromEntries(form));
          const failed = failSubmission; failSubmission = false;
          return route.fulfill({ status: failed ? 503 : 200, json: failed ? { error: 'Local test failure' } : { ok: true } });
        }
        return route.fulfill({ status: unavailable ? 503 : 200, json: unavailable ? { error: 'Not configured' } : state.turnstile ? { provider: 'turnstile', sitekey: 'fixture-key', action } : { provider: 'signed-captcha', code: 'A2B3', token: 'fixture-signed', action, expiresAt: new Date(Date.now() + 600000).toISOString() } });
      }
      if (url.hostname === '127.0.0.1') return route.continue();
      if (route.request().resourceType() === 'image') return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"/>' });
      failures.push('Unexpected network: ' + url.origin); return route.abort();
    });
    const page = await context.newPage(); page.on('pageerror', error => failures.push(error.message));
    try {
      await page.goto(server.url + '/controls/index.html');
      await check(state.label + ': actual public components follow review/download/CAPTCHA switches', async () => {
        assert.equal(await page.locator('.customer-ratings').count(), state.reviews && !state.empty ? 1 : 0);
        assert.equal(await page.locator('[data-download-form]').count(), state.downloads && !state.empty ? 1 : 0);
        const schema = JSON.parse(await page.locator('script[type="application/ld+json"]').textContent());
        assert.equal(Boolean(schema.review), state.reviews && !state.empty);
        for (const node of await page.locator('form-verification').all()) assert.equal(await node.getAttribute('data-provider'), state.turnstile ? 'turnstile' : 'signed-captcha');
        if (state.turnstile && !unavailable) await page.waitForFunction(() => document.querySelector('form-verification').ready);
        if (!state.turnstile) {
          await page.waitForFunction(() => document.querySelector('[name="captchaToken"]').value === 'fixture-signed');
          await page.locator('[data-inquiry-form] [name="captcha"]').fill('A2B3');
          assert.equal(await page.locator('form-verification').first().evaluate(node => node.ready), true);
        }
        assert.equal((await page.content()).includes('https://cdn.example.test/catalogue.pdf'), false);
      });
      if (state.empty) await check('missing setup fails closed and recovers without changing selected provider', async () => {
        await page.waitForFunction(() => !document.querySelector('[data-verification-status]').hidden);
        assert.equal(await page.locator('form-verification').first().evaluate(node => node.ready), false);
        assert.equal(await page.locator('[name="captcha"]').count(), 0);
        unavailable = false; await page.locator('[data-verification-refresh]').first().click();
        await page.waitForFunction(() => document.querySelector('form-verification').ready);
      });
      if (!state.empty) await check(state.label + ': actual artwork form preserves attachment, failed submission and explicit retry', async () => {
        const form = page.locator('[data-artwork-brief]');
        await form.locator('[name="name"]').fill('Regression buyer');
        await form.locator('[name="email"]').fill('buyer@example.test');
        await form.locator('[name="phone"]').fill('+12025550123');
        await form.locator('[name="artwork"]').setInputFiles({ name: 'design.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 test fixture') });
        await form.locator('[name="artworkDescription"]').fill('Preserve this custom design brief.');
        if (!state.turnstile) await form.locator('[name="captcha"]').fill('A2B3');
        await form.locator('[data-submit]').click();
        await page.waitForFunction(() => document.querySelector('[data-artwork-brief] [data-form-status]').dataset.state === 'error');
        assert.equal(await form.locator('[name="name"]').inputValue(), 'Regression buyer');
        assert.equal(await form.locator('[data-artwork-file-label]').innerText(), 'design.pdf');
        if (!state.turnstile) await form.locator('[name="captcha"]').fill('A2B3');
        await form.locator('[data-submit]').click();
        await page.waitForFunction(() => document.querySelector('[data-artwork-brief] [data-form-status]').dataset.state === 'success');
        assert.equal(submissions.length, 2);
        assert.equal(submissions[1].formType, 'artwork-brief');
        assert.equal(submissions[1].artwork.name, 'design.pdf');
        assert.equal(submissions[1].artwork.size, Buffer.byteLength('%PDF-1.4 test fixture'));
        assert.equal(state.turnstile ? submissions[1]['cf-turnstile-response'] : submissions[1].captchaToken, state.turnstile ? 'local-token' : 'fixture-signed');
      });
      if (!state.empty) await check(state.label + ': Contact us keeps form, direct links and cart/Escape interaction', async () => {
        await page.locator('[data-contact-action-trigger]').click();
        const form = page.locator('[data-contact-action-form]');
        await page.waitForFunction(() => document.querySelector('[data-contact-action-form] [data-contact-action-submit]').disabled === false || document.querySelector('[data-contact-action-form] [name="captchaToken"]')?.value);
        await form.locator('[name="name"]').fill('Regression buyer');
        await form.locator('[name="email"]').fill('buyer@example.test');
        await form.locator('[name="message"]').fill('Custom pins enquiry.');
        if (!state.turnstile) await form.locator('[name="captcha"]').fill('A2B3');
        await form.locator('[data-contact-action-submit]').click();
        await page.waitForFunction(() => document.querySelector('[data-contact-action-status]').dataset.state === 'success');
        assert.equal(submissions.at(-1).formType, 'quick-contact');
        assert.equal(await page.locator('.contact-action-option').count(), 2);
        await page.evaluate(() => window.dispatchEvent(new CustomEvent('businessweb:inquiry-cart-open')));
        assert.equal(await page.locator('[data-contact-action-trigger]').getAttribute('aria-expanded'), 'false');
        await page.locator('[data-contact-action-trigger]').click(); await page.keyboard.press('Escape');
        assert.equal(await page.locator('[data-contact-action-trigger]').getAttribute('aria-expanded'), 'false');
      });
      if (state.downloads && !state.empty) await check('protected download opens its actual verification dialog and suspends on close', async () => {
        await page.locator('[data-download-id]').click();
        assert.equal(await page.locator('[data-download-dialog]').evaluate(node => node.open), true);
        await page.waitForFunction(() => document.querySelector('[data-download-form] form-verification').ready);
        assert.equal(await page.locator('[data-document-id]').inputValue(), 'catalogue');
        await page.locator('[data-download-close]').click();
        assert.equal(await page.locator('[data-download-dialog]').evaluate(node => node.open), false);
      });
      await page.screenshot({ path: resolve(output, state.label + '-public.png'), fullPage: true });
      await check(state.label + ': desktop/mobile/RTL layouts retain complete verification controls', async () => {
        for (const locale of ['en', 'ar']) for (const width of [1440, 390, 360]) {
          await page.setViewportSize({ width, height: 900 });
          await page.goto(server.url + (locale === 'ar' ? '/ar' : '') + '/controls/index.html');
          if (state.turnstile) await page.waitForFunction(() => document.querySelector('form-verification').ready);
          else await page.waitForFunction(() => document.querySelector('[name="captchaToken"]').value === 'fixture-signed');
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, state.label + '/' + locale + '/' + width);
          assert.equal(await page.locator('[data-download-form]').count(), state.downloads && !state.empty ? 1 : 0);
          if (locale === 'ar') assert.equal(await page.locator('html').getAttribute('dir'), 'rtl');
        }
        await page.screenshot({ path: resolve(output, state.label + '-rtl-mobile.png'), fullPage: true });
      });
    } finally { await context.close(); await server.stop(); }
  }
  await check('tests leave every real customer setting and Wrangler unchanged', async () => {
    for (const [file, content] of Object.entries(snapshot)) assert.equal(await readFile(resolve(root, file), 'utf8'), content, file);
  });
  assert.deepEqual(failures, []);
  await write(resolve(output, 'result.json'), JSON.stringify({ checks, output, cloudWrites: 'NONE', turnstileAndMedia: 'MOCKED' }, null, 2));
  console.log(JSON.stringify({ passed: checks.length, output }));
} finally { await browser.close(); backend.db.close(); }
