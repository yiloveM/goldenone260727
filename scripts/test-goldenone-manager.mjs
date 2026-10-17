import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, mkdtemp, readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { chromium } from 'playwright';
import { buildManagerFixture, managerBackend } from './manager-browser-fixture.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const base = resolve(root, '.sandbox/manager-browser');
await mkdir(base, { recursive: true });
const output = await mkdtemp(resolve(base, 'goldenone-'));
process.env.TEMP = output;
process.env.TMP = output;
const policy = JSON.parse(await readFile(resolve(root, 'src/data/product-editor-settings.json'), 'utf8'));
const dist = await buildManagerFixture(root, output, true, policy, 'goldenone');
const backend = await managerBackend(root, output);
backend.setPolicy(policy);
const documents = new Map();
for (const name of await readdir(resolve(root, 'src/content/products'))) {
  if (!name.endsWith('.mdoc')) continue;
  const slug = name.slice(0, -5);
  const file = resolve(root, 'src/content/products', slug + '.mdoc');
  if (!existsSync(file)) throw new Error('Missing customer fixture: ' + slug);
  const source = (await readFile(file, 'utf8')).replace(/^\uFEFF/, '');
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  const data = YAML.parse(match[1]);
  const content = source.slice(match[0].length).trim();
  const normalized = backend.normalizeProduct({ ...data, productSlug: slug, content });
  documents.set(slug, { source, normalized, data });
  backend.products.push({ ...policy, ...normalized, slug });
  await writeFile(resolve(output, 'write-back/src/content/products', slug + '.mdoc'), source);
}
assert.ok(documents.size >= 38, 'Exercise the actual customer catalog, not just generic fixture data.');
const server = await backend.start(dist);
const executablePath = process.env.MANAGER_BROWSER_EXECUTABLE || (process.platform === 'win32'
  ? ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync) : undefined);
const browser = await chromium.launch({ executablePath, headless: true, env: { ...process.env, TEMP: output, TMP: output } });
const checks = [];
const faults = [];
const external = [];
const check = async (name, run) => { await run(); checks.push(name); console.log('PASS ' + name); };
let page;
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  context.setDefaultTimeout(20000);
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1') return route.continue();
    if (url.hostname === 'goldenone.arkalpooltech.workers.dev' && route.request().resourceType() === 'image') return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800"><rect x="100" y="100" width="600" height="600" fill="#178477"/></svg>' });
    external.push(url.origin); return route.abort();
  });
  context.on('page', current => current.on('pageerror', error => faults.push(error.message)));
  page = await context.newPage();
  await page.goto(server.url);
  const waitSaved = () => page.waitForFunction(() => document.getElementById('statusText').textContent.includes('草稿已保存'));
  await check('all real customer products retain metadata and image-group ordering through actual write-back', async () => {
    for (const [slug, { normalized, data, source }] of documents) {
      const applied = spawnSync(process.execPath, [resolve(root, 'scripts/apply-manager-product-draft.mjs')], {
        cwd: resolve(output, 'write-back'), encoding: 'utf8', env: { ...process.env,
          MANAGER_PRODUCT_DRAFT_PAYLOAD: Buffer.from(JSON.stringify(normalized)).toString('base64'), MANAGER_PRODUCT_DRAFT_ID: 'customer-regression' },
      });
      assert.equal(applied.status, 0, slug + ': ' + applied.stderr);
      const saved = await readFile(resolve(output, 'write-back/src/content/products', slug + '.mdoc'), 'utf8');
      const metadata = YAML.parse(saved.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)[1]);
      for (const key of Object.keys(data)) assert.deepEqual(metadata[key], data[key], slug + ':' + key);
      assert.equal(saved.slice(saved.indexOf('\n---', 4) + 4).trim(), normalized.content);
      await writeFile(resolve(output, 'write-back/src/content/products', slug + '.mdoc'), source);
    }
  });
  for (const [slug, { normalized }] of documents) {
    if (!['soft-enamel-pins', '3d-challenge-coins', 'custom-sports-medals'].includes(slug)) continue;
    await check(slug + ': original tables, images and features survive save/resume/write-back', async () => {
      await page.locator('#searchInput').fill(normalized.title);
      await page.locator(`.manager-product-title[data-slug="${slug}"]`).click();
      assert.equal(await page.locator('#offeringType').inputValue(), normalized.offeringType || policy.offeringType);
      assert.equal(await page.locator('#modelStrategy').inputValue(), normalized.modelStrategy || policy.modelStrategy);
      await page.locator('#title').fill(normalized.title + ' test');
      await page.locator('#saveDraftButton').click(); await waitSaved();
      const draft = backend.productDrafts().find(item => item.productSlug === slug);
      for (const key of ['specTables', 'specs', 'galleryImages', 'detailImages', 'applications', 'highlights', 'faqs']) assert.deepEqual(draft.payload[key], normalized[key], slug + ':' + key);
      await page.reload(); await page.locator('#searchInput').fill(normalized.title);
      await page.locator(`.manager-product-title[data-slug="${slug}"]`).click();
      await page.locator(`[data-product-draft-edit="${draft.id}"]`).click();
      assert.equal(await page.locator('#title').inputValue(), normalized.title + ' test');
      await page.locator('#saveDraftButton').click(); await waitSaved();
      assert.equal(backend.productDrafts().filter(item => item.productSlug === slug).length, 1);
      await page.locator(`[data-apply="${draft.id}"]`).click();
      await page.waitForFunction(() => document.getElementById('statusText').textContent.includes('已提交'));
      const saved = await readFile(resolve(output, 'write-back/src/content/products', slug + '.mdoc'), 'utf8');
      const data = YAML.parse(saved.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)[1]);
      for (const key of ['specTables', 'specs', 'galleryImages', 'detailImages', 'highlights']) assert.deepEqual(data[key], normalized[key]);
      assert.match(saved, new RegExp(normalized.content.split('\n').find(line => line.trim() && !line.startsWith('#')).slice(0, 25).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
      await page.setViewportSize({ width: 390, height: 844 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.screenshot({ path: resolve(output, slug + '-mobile.png'), fullPage: true });
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.locator('#productBackButton').click();
    });
  }
  await check('resuming an old draft displays the latest owner policy rather than stale draft policy', async () => {
    const slug = 'soft-enamel-pins';
    Object.assign(backend.products.find(item => item.slug === slug), { offeringType: 'solution', modelStrategy: 'configurable' });
    const draft = backend.productDrafts().find(item => item.productSlug === slug);
    await page.reload(); await page.locator('#searchInput').fill(documents.get(slug).normalized.title);
    await page.locator(`.manager-product-title[data-slug="${slug}"]`).click();
    await page.locator(`[data-product-draft-edit="${draft.id}"]`).click();
    assert.equal(await page.locator('#offeringType').inputValue(), 'solution');
    assert.equal(await page.locator('#modelStrategy').inputValue(), 'configurable');
    assert.equal(await page.locator('#modelStrategy').isDisabled(), true);
    await page.locator('#saveDraftButton').click(); await waitSaved();
    assert.equal(backend.productDrafts().find(item => item.id === draft.id).payload.offeringType, 'solution');
  });
  await check('enabled language list, empty selection and re-enable follow the locale API', async () => {
    const flags = JSON.parse(await readFile(resolve(root, 'src/data/site-language-settings.json'), 'utf8')).enabledLocales;
    const locales = Object.keys(flags).filter(code => flags[code]).map(value => ({ value, label: value }));
    backend.setLocales(locales);
    await page.reload(); await page.locator('[data-tab="translation"]').click();
    await page.waitForFunction(count => document.querySelectorAll('#localeGrid input').length === count, locales.length);
    assert.equal(await page.locator('#localeGrid input').count(), locales.length);
    backend.setLocales([]); await page.reload(); await page.locator('[data-tab="translation"]').click();
    await page.waitForFunction(() => document.getElementById('localeGrid').textContent.includes('尚未启用'));
    assert.equal(await page.locator('#localeGrid input').count(), 0);
    backend.setLocales(locales); await page.reload(); await page.locator('[data-tab="translation"]').click();
    await page.waitForFunction(count => document.querySelectorAll('#localeGrid input').length === count, locales.length);
  });
  await check('Golden One theme preference and PDF insertion retain their customer behavior', async () => {
    await page.locator('#themeMenuButton').click(); await page.locator('[data-theme-option="dark"]').click();
    assert.equal(await page.evaluate(() => localStorage.getItem('goldenone-manager-theme')), 'dark');
    await page.locator('[data-tab="products"]').click();
    await page.locator('#searchInput').fill(''); await page.locator('#newProductButton').click();
    const surface = page.locator('[data-rich-editor="productContent"] .rich-editor__surface');
    await surface.fill('Product documentation'); await surface.click();
    await page.locator('[data-tab="images"]').click();
    await page.locator('[data-asset-insert-document]').first().click();
    assert.equal(await surface.locator('a').last().getAttribute('href'), '/fixture.pdf');
    assert.equal(await surface.locator('a').last().getAttribute('target'), '_blank');
    assert.equal(await surface.locator('a').last().getAttribute('rel'), 'noopener');
  });
  await check('article duplicate-save protection and resumed-draft identity also hold', async () => {
    await page.locator('[data-tab="blog"]').click();
    await page.locator('[data-blog-slug="sample-article"]').click();
    await page.locator('#blogTitle').fill('Golden One article pending revision');
    const before = backend.requests.filter(item => item.path.endsWith('/blog-drafts') && item.method === 'POST').length;
    await page.locator('#saveBlogDraftButton').evaluate(button => { button.click(); button.click(); });
    await page.waitForFunction(() => document.getElementById('blogStatus').textContent.includes('草稿已保存'));
    assert.equal(backend.requests.filter(item => item.path.endsWith('/blog-drafts') && item.method === 'POST').length - before, 1);
    const draft = backend.db.prepare('SELECT id FROM manager_blog_drafts').get();
    await page.reload(); await page.locator('[data-tab="blog"]').click();
    await page.locator('[data-blog-slug="sample-article"]').click();
    await page.locator(`[data-blog-draft-edit="${draft.id}"]`).click();
    assert.equal(await page.locator('#blogTitle').inputValue(), 'Golden One article pending revision');
    await page.locator('#blogTitle').fill('Golden One article continued');
    await page.locator('#saveBlogDraftButton').click();
    await page.waitForFunction(() => document.getElementById('blogStatus').textContent.includes('草稿已保存'));
    assert.equal(backend.db.prepare('SELECT COUNT(*) AS count FROM manager_blog_drafts').get().count, 1);
  });
  await check('store review drafts resume after reload, update one record and preserve optional legacy metadata', async () => {
    await page.locator('[data-tab="reviews"]').click();
    await page.locator('#newReviewButton').click();
    await page.locator('#reviewBuyerLabel').fill('Pending custom gift buyer');
    await page.locator('#reviewQuote').fill('Careful finishing and clear communication.');
    backend.failNextApi('/api/manager/review-drafts');
    await page.locator('#saveReviewDraftButton').evaluate(button => { button.click(); button.click(); });
    await page.waitForFunction(() => document.getElementById('reviewStatus').textContent.includes('重试'));
    assert.equal(backend.db.prepare('SELECT COUNT(*) AS count FROM manager_review_drafts').get().count, 0);
    assert.equal(await page.locator('#reviewQuote').inputValue(), 'Careful finishing and clear communication.');
    const before = backend.requests.filter(item => item.path.endsWith('/review-drafts') && item.method === 'POST').length;
    await page.locator('#saveReviewDraftButton').evaluate(button => { button.click(); button.click(); });
    await page.waitForFunction(() => document.getElementById('reviewStatus').textContent.includes('草稿已保存'));
    assert.equal(backend.requests.filter(item => item.path.endsWith('/review-drafts') && item.method === 'POST').length - before, 1);
    const draft = backend.db.prepare('SELECT id FROM manager_review_drafts').get();
    const legacy = JSON.parse(backend.db.prepare('SELECT payload_json FROM manager_review_drafts').get().payload_json);
    legacy.country = 'New Zealand'; legacy.projectType = 'Custom pins';
    backend.db.prepare('UPDATE manager_review_drafts SET payload_json = ? WHERE id = ?').run(JSON.stringify(legacy), draft.id);
    await page.reload(); await page.locator('[data-tab="reviews"]').click();
    await page.locator(`[data-review-draft-edit="${draft.id}"]`).click();
    assert.equal(await page.locator('#reviewBuyerLabel').inputValue(), 'Pending custom gift buyer');
    await page.locator('#reviewQuote').fill('Updated pending review.');
    await page.locator('#saveReviewDraftButton').click();
    await page.waitForFunction(() => document.getElementById('reviewStatus').textContent.includes('草稿已保存'));
    assert.equal(backend.db.prepare('SELECT COUNT(*) AS count FROM manager_review_drafts').get().count, 1);
    assert.equal(JSON.parse(backend.db.prepare('SELECT payload_json FROM manager_review_drafts').get().payload_json).quote, 'Updated pending review.');
    assert.equal(JSON.parse(backend.db.prepare('SELECT payload_json FROM manager_review_drafts').get().payload_json).country, 'New Zealand');
  });
  await check('connection failure prevents bootstrap and recovers on a fresh session', async () => {
    const before = backend.requests.filter(item => item.path.endsWith('/products')).length;
    backend.failNextApi('/api/manager/status');
    await page.reload();
    await page.waitForFunction(() => document.getElementById('connectionDetail').textContent.includes('重试'));
    assert.equal(backend.requests.filter(item => item.path.endsWith('/products')).length, before);
    assert.equal(await page.locator('#connectionPanel').evaluate(node => node.classList.contains('is-connected')), false);
    await page.reload(); await page.waitForSelector('.manager-product-row');
    assert.equal(await page.locator('#connectionPanel').evaluate(node => node.classList.contains('is-connected')), true);
    assert.equal(await page.locator('[name="TURNSTILE_SECRET"], #turnstileEnabled, #catalogDownloadsEnabled').count(), 0);
  });
  await check('expired-session 403 cannot save and preserves input for an authorized retry', async () => {
    await page.locator('#newProductButton').click();
    await page.locator('#productSlug').fill('session-retry-product');
    await page.locator('#title').fill('Retain this pending title');
    await page.locator('#description').fill('Pending description');
    const before = backend.productDrafts().length;
    backend.setAuthenticated(false);
    await page.locator('#saveDraftButton').click();
    await page.waitForFunction(() => document.getElementById('statusText').textContent.includes('登录已过期'));
    assert.equal(backend.productDrafts().length, before);
    assert.equal(await page.locator('#title').inputValue(), 'Retain this pending title');
    assert.equal(await page.locator('#saveDraftButton').isEnabled(), true);
    backend.setAuthenticated(true);
    await page.locator('#saveDraftButton').click(); await waitSaved();
    assert.equal(backend.productDrafts().length, before + 1);
  });
  assert.deepEqual(faults, []); assert.deepEqual(external, []);
  await writeFile(resolve(output, 'result.json'), JSON.stringify({ checks, output, cloudWrites: 'NONE', media: 'MOCKED', realAuthentication: 'NOT_TESTED' }, null, 2));
  console.log(JSON.stringify({ passed: checks.length, output, cloudWrites: 'NONE' }));
  await context.close();
} catch (error) {
  if (page && !page.isClosed()) await page.screenshot({ path: resolve(output, 'failure.png'), fullPage: true });
  throw error;
} finally { await browser.close(); await server.stop(); backend.db.close(); }
