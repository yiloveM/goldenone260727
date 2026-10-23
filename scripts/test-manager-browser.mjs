import { openManagerTab, expandManagerEditor, setManagerTheme } from './manager-test-navigation.mjs';
import { checkManagerUx } from './manager-ux-browser-checks.mjs';
import { checkAdminWorkflow } from './admin-workflow-browser-checks.mjs';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { buildManagerFixture, managerBackend } from './manager-browser-fixture.mjs';
import { checkManagerImages } from './manager-image-browser-checks.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const base = resolve(root, '.sandbox/manager-browser');
await mkdir(base, { recursive: true });
const output = await mkdtemp(resolve(base, 'run-'));
process.env.TEMP = output;
process.env.TMP = output;
process.env.ASTRO_TELEMETRY_DISABLED = '1';
const executablePath = process.env.MANAGER_BROWSER_EXECUTABLE || (process.platform === 'win32'
  ? [resolve(process.env['ProgramFiles(x86)'] || 'C:/Program Files (x86)', 'Microsoft/Edge/Application/msedge.exe'), resolve(process.env.ProgramFiles || 'C:/Program Files', 'Google/Chrome/Application/chrome.exe')].find(existsSync) : undefined);
const dist = await buildManagerFixture(root, output, true);
const backend = await managerBackend(root, output);
const server = await backend.start(dist);
const browser = await chromium.launch({ executablePath, headless: true, env: { ...process.env, TEMP: output, TMP: output } });
const checks = [];
const check = async (name, fn) => { await fn(); checks.push(name); console.log('PASS ' + name); };
let page;
const faults = [];
const forbidden = [];
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN', timezoneId: 'UTC', reducedMotion: 'reduce' });
  context.setDefaultTimeout(20000);
  context.setDefaultNavigationTimeout(30000);
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1') return route.continue();
    forbidden.push(url.origin); return route.abort();
  });
  context.on('page', current => current.on('pageerror', error => faults.push(error.message)));
  page = await context.newPage();
  page.on('dialog', async dialog => { faults.push('Unexpected native browser dialog'); await dialog.dismiss(); });
  await page.addInitScript(() => { new MutationObserver(() => { if(window.__manualDialogs)return;const dialog=document.querySelector('dialog.bw-dialog[open]');if(!dialog)return;const input=dialog.querySelector('input');if(input)input.value='new-folder';dialog.querySelector('form').requestSubmit(); }).observe(document,{childList:true,subtree:true,attributes:true,attributeFilter:['open']}); });
  await page.goto(server.url);
  await page.waitForFunction(() => document.querySelectorAll('[data-product-select]').length > 0 || document.querySelectorAll('.manager-product-row').length > 0);
  const tab = name => openManagerTab(page, name);
  const fill = async (id, value) => {
    while(await page.locator('.section.is-active .manager-view.is-visible details.editor-group:not([open])>summary').count())await page.locator('.section.is-active .manager-view.is-visible details.editor-group:not([open])>summary').first().click();
    if(id==='translationSlug'){await page.locator(`#translationSourcePicker option[value$=":${value}"]`).waitFor({state:'attached'});return page.locator('#translationSourcePicker').selectOption({value:`${await page.locator('#translationSourceType').inputValue()}:${value}`});}
    return page.locator('#' + id).fill(value);
  };
  const waitText = (id, value) => page.waitForFunction(({ id, value }) => document.getElementById(id)?.textContent.includes(value), { id, value });
  await check('same portal, global reminder, owner policy and review controls', async () => {
    await waitText('publicationGuidanceText','统一更新');
    assert.match(await page.locator('.publication-guidance').innerText(), /统一更新/);
    assert.equal(await page.locator('#offeringType').isDisabled(), true);
    assert.equal(await page.locator('#modelStrategy').isDisabled(), true);
    assert.equal(await page.locator('[data-tab="reviews"]').count(), 1);
    assert.ok((await page.locator('#managerAnalyticsLink').getAttribute('href')).endsWith('/analytics'));
    assert.equal(backend.requests.filter(item => item.path.endsWith('/products')).length, 1, 'duplicate initialization must not bind or bootstrap twice');
    const publicPage = await context.newPage(); await publicPage.goto(new URL('/index.html', server.url).href);
    assert.equal(await publicPage.locator('body').evaluate(node => getComputedStyle(node).margin), '8px', 'Manager CSS must not affect public pages');
    assert.equal(await publicPage.locator('.publication-guidance').count(), 0);
    await publicPage.close();
  });
  const snapshot = await page.evaluate(() => ({
    elements: [...document.querySelectorAll('.admin-layout [id], .admin-layout [data-tab], .admin-layout [data-panel]')].map(node => [node.tagName, node.id, node.getAttribute('data-tab'), node.getAttribute('data-panel')]),
    labels: [...document.querySelectorAll('.sidebar button')].map(node => node.textContent.trim()),
    style: ['.sidebar', '.content-area', '.publication-guidance', '.manager-product-row'].map(selector => {
      const value = getComputedStyle(document.querySelector(selector)); return [selector, value.display, value.padding, value.backgroundColor, value.fontSize];
    }),
  }));
  await writeFile(resolve(output, 'ui-contract.json'), JSON.stringify(snapshot, null, 2));
  if (process.env.MANAGER_COMPARE_BASELINE) assert.deepEqual(snapshot, JSON.parse(await readFile(resolve(process.env.MANAGER_COMPARE_BASELINE, 'ui-contract.json'), 'utf8')));
  await page.screenshot({ path: resolve(output, 'desktop.png'), fullPage: true });
  await check('search, filtering and product pagination', async () => {
    await tab('products');
    await fill('searchInput', 'Website design');
    assert.equal(await page.locator('.manager-product-row').count(), 1);
    await fill('searchInput', '');
    await page.locator('#categoryFilter').selectOption('Support');
    assert.equal(await page.locator('.manager-product-row').count(), 7);
    await page.locator('#categoryFilter').selectOption('');
    await page.locator('[data-product-page="next"]').click();
    assert.equal(await page.locator('.manager-product-row').count(), 2);
    await page.locator('[data-product-page="first"]').click();
  });
  await check('edit service, rich text, specifications, images and product reviews', async () => {
    await page.locator('.manager-product-title[data-slug="sample-service"]').click();
    assert.equal(await page.locator('#offeringType').inputValue(), 'service');
    assert.equal(await page.locator('#modelStrategy').inputValue(), 'not-applicable');
    await fill('title', 'Website design updated');
    await fill('description', 'Updated description for international buyers.');
    await page.locator('[data-rich-editor="productContent"] .rich-editor__surface').fill('Edited service body with clear requirements.');
    await page.locator('#productForm [data-action="specs:add"]').click();
    await page.locator('#specsList input').nth(0).fill('Scope');
    await page.locator('#specsList input').nth(1).fill('Multilingual');
    await page.locator('[data-image-list="galleryImages"]').first().click();
    await page.locator('[data-picker-select]').first().click();
    assert.equal(await page.locator('#image').inputValue(), '/fixture-image.svg');
    await page.locator('[data-action="reviews:add"]').click();
    await page.locator('#productReviewList [data-field="buyerLabel"]').last().fill('New buyer');
    await page.locator('#productReviewList [data-field="quote"]').last().fill('Easy to maintain.');
    await page.locator('#saveDraftButton').click();
    await waitText('statusText', '草稿已保存');
    const draft = backend.productDrafts().find(item => item.productSlug === 'sample-service');
    assert.equal(draft.payload.title, 'Website design updated');
    assert.match(draft.payload.content, /Edited service body/);
    assert.equal(draft.payload.specs[0].value, 'Multilingual');
    assert.equal(draft.payload.reviews.at(-1).buyerLabel, 'New buyer');
    await page.reload(); await tab('products');
    await page.waitForSelector('.manager-product-title[data-slug="sample-service"]');
    await page.locator('.manager-product-title[data-slug="sample-service"]').click();
    await page.locator('[data-apply]').first().click();
    await waitText('statusText', '已提交');
    const saved = await readFile(resolve(output, 'write-back/src/content/products/sample-service.mdoc'), 'utf8');
    assert.match(saved, /customerField: preserve/);
    assert.match(saved, /Website design updated/);
    assert.match(saved, /Edited service body/);
  });
  await check('failed saves keep editing data and can be retried', async () => {
    await fill('title', 'Retry preserved title');
    backend.failNextSave();
    await page.locator('#saveDraftButton').click();
    await waitText('statusText', '重试');
    assert.equal(await page.locator('#title').inputValue(), 'Retry preserved title');
    await page.locator('#saveDraftButton').click(); await waitText('statusText', '草稿已保存');
    assert.equal(await page.locator('#saveDraftButton').isEnabled(), true);
  });
  await check('duplicate save clicks submit only once and unlock after completion', async () => {
    const before = backend.requests.filter(item => item.path.endsWith('/product-drafts') && item.method === 'POST').length;
    await page.locator('#saveDraftButton').evaluate(button => { button.click(); button.click(); });
    await waitText('statusText', '草稿已保存');
    assert.equal(backend.requests.filter(item => item.path.endsWith('/product-drafts') && item.method === 'POST').length - before, 1);
    assert.equal(await page.locator('#saveDraftButton').isEnabled(), true);
  });
  await check('new service and order draft', async () => {
    await page.locator('#productBackButton').click();
    await page.locator('#newProductButton').click();
    await fill('productSlug', 'new-service'); await fill('title', 'New service'); await fill('description', 'Description.');
    await page.locator('#saveDraftButton').click(); await waitText('statusText', '草稿已保存');
    assert.ok(backend.productDrafts().some(item => item.productSlug === 'new-service'));
    await tab('product-order');
    const input = page.locator('#orderGrid input').first(); await input.fill('77'); await input.dispatchEvent('input');
    await page.locator('#orderSaveButton').click(); await waitText('orderStatus', '草稿');
    assert.ok(backend.orderGroups.some(group=>group.values.some(item=>item.sortOrder===77)));
  });
  await check('article editing and saved draft read-back', async () => {
    await tab('blog'); await page.locator('[data-blog-slug="sample-article"]').click();
    await fill('blogTitle', 'Article updated');
    await page.locator('[data-rich-editor="blogBody"] .rich-editor__surface').fill('Updated article body.');
    await page.locator('#saveBlogDraftButton').click(); await waitText('blogStatus', '草稿已保存');
    assert.ok(backend.db.prepare('SELECT payload_json FROM manager_blog_drafts').all().some(row => row.payload_json.includes('Article updated')));
  });
  await check('media upload, folder creation and deletion stay in the fixture', async () => {
    await tab('images'); await waitText('assetStatus', '已加载');
    await page.locator('#assetUploadInput').setInputFiles({ name: 'uploaded.png', mimeType: 'image/png', buffer: Buffer.from('fixture-image') });
    await waitText('assetStatus', '已上传'); assert.ok(backend.assets.has('uploaded.png'));
    await page.locator('#assetNewFolderButton').click(); await waitText('assetStatus', '已加载');
    await page.locator('[data-delete="uploaded.png"]').click(); await page.locator('[data-delete="uploaded.png"]').waitFor({state:'hidden'}); await waitText('assetStatus', '已加载');
    assert.equal(backend.assets.has('uploaded.png'), false);
  });
  await check('translation selection, draft editing and approval', async () => {
    await tab('translation'); await page.waitForSelector('#localeGrid input');
    await page.locator('#translationLocaleSelectAll').uncheck();
    await page.locator('#localeGrid input[value="es"]').check();
    await page.locator('#translationSourceType').selectOption('products');
    await fill('translationSlug', 'sample-service');
    await page.locator('#translationSubmitButton').click(); await waitText('translationStatus', '已提交');
    await page.locator('#translationStatusButton').click();
    await tab('product-drafts');
    await page.locator('[data-translation-edit="product:es--sample-service"]').click();
    await waitText('translationEditorStatus', '草稿已加载');
    const [popup] = await Promise.all([page.waitForEvent('popup'), page.locator('#translationEditorPreviewLink').click()]);
    await popup.waitForSelector('h1');
    assert.equal(await popup.locator('h1').innerText(), 'Translated draft'); await popup.close();
    await fill('translationEditTitle', 'Diseño actualizado');
    await page.locator('#translationEditorSaveButton').click(); await waitText('translationEditorStatus', '草稿已保存');
    assert.equal(backend.translationDrafts[0].data.title, 'Diseño actualizado');
    await page.locator('#translationEditorCloseButton').click();
    await page.locator('[data-translation-draft="product:es--sample-service"]').check();
    await page.locator('#productDraftApproveButton').click();
    await page.waitForFunction(() => !document.querySelector('[data-translation-draft="product:es--sample-service"]'));
    assert.equal(backend.translationDrafts[0].published, true);
  });
  await check('publish failure, explicit retry, completed history and deletion', async () => {
    await tab('publish'); await waitText('publishStatus', '已读取');
    await page.locator('#publishButton').click(); await waitText('publishStatus', '重试');
    await page.locator('#publishButton').click(); await waitText('publishStatus', '已读取');
    assert.equal(backend.requests.filter(item => item.path.endsWith('/deploy/site') && item.method === 'POST').length, 2);
    await page.locator('[data-publish-record]').first().check(); await page.locator('#publishDeleteButton').click();
    await page.waitForFunction(() => !document.querySelector('[data-publish-record]'));
    assert.equal(backend.records.length, 0);
  });
  await check('empty search and empty catalog keep navigation and creation usable', async () => {
    await tab('products');
    await fill('searchInput', 'no-match-exists'); assert.equal(await page.locator('.manager-product-row').count(), 0);
    await fill('searchInput', '');
    const saved = backend.products.splice(0); await page.reload(); await tab('products');
    await waitText('productBrowserStatus', '当前筛选 0');
    assert.equal(await page.locator('#newProductButton').isVisible(), true);
    backend.products.push(...saved); await page.reload(); await tab('products'); await page.waitForSelector('.manager-product-title[data-slug="sample-service"]');
  });
  await check('publication toggles create one draft and recover on failed save', async () => {
    const toggle = page.locator('[data-product-published="sample-service"]');
    backend.failNextSave(); await toggle.uncheck(); await waitText('productBrowserStatus', '重试');
    assert.equal(await toggle.isChecked(), true);
    await toggle.uncheck(); await waitText('productBrowserStatus', '下线草稿');
    assert.equal(await toggle.isChecked(), false);
    await toggle.check(); await waitText('productBrowserStatus', '上线草稿');
  });
  await check('rich-text image selection and table row/column edits round-trip into a draft', async () => {
    await page.locator('.manager-product-title[data-slug="sample-service"]').click();
    await page.locator('#productEditorView .editor-section-nav button').filter({hasText:'详细内容'}).click();
    const editor = page.locator('[data-rich-editor="productContent"]');
    const surface = editor.locator('.rich-editor__surface');
    await surface.fill('Rich editor test.'); await surface.click(); await page.keyboard.press('End');
    await editor.locator('[data-rich-command="table"]').click();
    const cell = surface.locator('tbody td').first(); await cell.click();
    await editor.locator('[data-rich-command="tableRowAdd"]').click();
    assert.equal(await surface.locator('tr').count(), 4);
    await cell.click(); await editor.locator('[data-rich-command="tableColumnAdd"]').click();
    assert.equal(await surface.locator('thead th').count(), 4);
    await cell.click(); await editor.locator('[data-rich-command="tableColumnDelete"]').click();
    assert.equal(await surface.locator('thead th').count(), 3);
    await cell.click(); await editor.locator('[data-rich-command="tableRowDelete"]').click();
    assert.equal(await surface.locator('tr').count(), 3);
    await surface.locator('p').last().click(); await editor.locator('[data-rich-command="image"]').click();
    await page.locator('[data-picker-select]').first().click();
    await surface.locator('figure img').click();
    assert.equal(await surface.locator('figure[data-rich-selected="true"]').count(), 1);
    await page.locator('#saveDraftButton').click(); await waitText('statusText', '草稿已保存');
    const payload = backend.productDrafts().find(item => item.productSlug === 'sample-service').payload;
    assert.match(payload.content, /Header/); assert.match(payload.content, /fixture-image/);
  });
  await check('product builders retain gallery, features, FAQ and merged table headings', async () => {
    const action = async name => { await expandManagerEditor(page); await page.locator(`#productForm [data-action="${name}"]`).first().click(); };
    await action('highlights:add'); await page.locator('#productForm [data-list="highlights"]').last().fill('Maintainable websites');
    await action('applications:add'); await page.locator('#productForm [data-list="applications"]').last().fill('International business');
    await action('gallery:add'); await page.locator('#productForm [data-list="galleryImages"]').last().fill('/fixture-image.svg');
    await action('faqs:add'); await page.locator('#productForm [data-faq-index="0"][data-field="question"]').fill('How do we start?');
    await page.locator('#productForm [data-faq-index="0"][data-field="answer"]').fill('Send your requirements.');
    await action('tables:add'); await action('table:header-row:add');
    await page.locator('#productForm [data-header-row="0"][data-field="text"]').first().fill('Scope');
    await page.locator('#productForm [data-header-row="0"][data-field="colspan"]').first().fill('2');
    await action('table:row:add'); await action('table:column:add'); await action('table:column:remove');
    await page.locator('#saveDraftButton').click(); await waitText('statusText', '草稿已保存');
    const payload = backend.productDrafts().find(item => item.productSlug === 'sample-service').payload;
    assert.equal(payload.highlights.at(-1), 'Maintainable websites'); assert.equal(payload.applications.at(-1), 'International business');
    assert.equal(payload.faqs[0].question, 'How do we start?'); assert.equal(payload.galleryImages.at(-1), '/fixture-image.svg');
    assert.equal(payload.specTables[0].headerRows[0].cells[0].colspan, 2);
    await action('highlights:remove'); await page.locator('#saveDraftButton').click(); await waitText('statusText', '草稿已保存');
    assert.deepEqual(backend.productDrafts().find(item => item.productSlug === 'sample-service').payload.highlights, []);
  });
  await check('image preview Escape closes only the top overlay and restores scroll', async () => {
    await page.locator('[data-image-list="galleryImages"]').first().click();
    await page.locator('[data-picker-preview]').first().click();
    assert.equal(await page.locator('#imagePreview').getAttribute('aria-hidden'), 'false');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#imagePreview').getAttribute('aria-hidden'), 'true');
    assert.equal(await page.locator('#imagePicker').getAttribute('aria-hidden'), 'false');
    assert.equal(await page.locator('body').evaluate(node => node.classList.contains('has-modal')), true);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#imagePicker').getAttribute('aria-hidden'), 'true');
    assert.equal(await page.locator('body').evaluate(node => node.classList.contains('has-modal')), false);
  });
  await check('article apply uses real write-back and preserves customer metadata', async () => {
    await tab('blog'); await page.locator('[data-blog-slug="sample-article"]').click();
    await fill('blogTitle', 'Article with updated copy');
    await page.locator('#saveBlogDraftButton').click(); await waitText('blogStatus', '草稿已保存');
    await page.locator('[data-blog-apply]').first().click(); await waitText('blogStatus', '已提交');
    const saved = await readFile(resolve(output, 'write-back/src/content/blog/sample-article.mdoc'), 'utf8');
    assert.match(saved, /Article with updated copy/); assert.match(saved, /customerField: preserve/);
  });
  await check('saved product and article drafts resume after reload and update the same record', async () => {
    await tab('products'); await page.locator('.manager-product-title[data-slug="sample-service"]').click();
    await page.locator('[data-product-draft-edit]').first().click();
    await fill('title', 'Continued product draft'); await page.locator('#saveDraftButton').click(); await waitText('statusText', '草稿已保存');
    const product = backend.productDrafts().find(item => item.productSlug === 'sample-service');
    const count = backend.productDrafts().length;
    await page.reload(); await tab('products'); await page.waitForSelector('.manager-product-title[data-slug="sample-service"]');
    await page.locator('.manager-product-title[data-slug="sample-service"]').click();
    await page.locator(`[data-product-draft-edit="${product.id}"]`).click();
    assert.equal(await page.locator('#title').inputValue(), 'Continued product draft');
    await fill('title', 'Continued again'); await page.locator('#saveDraftButton').click(); await waitText('statusText', '草稿已保存');
    assert.equal(backend.productDrafts().length, count);
    await tab('blog'); await page.locator('[data-blog-slug="sample-article"]').click();
    await page.locator('#blogWorkShowHistory').check();
    await page.locator('[data-blog-draft-edit]').first().click();
    assert.equal(await page.locator('#blogTitle').inputValue(), 'Article with updated copy');
    const articles = backend.db.prepare('SELECT COUNT(*) AS count FROM manager_blog_drafts').get().count;
    await fill('blogTitle', 'Continued article draft'); await page.locator('#saveBlogDraftButton').click(); await waitText('blogStatus', '草稿已保存');
    assert.equal(backend.db.prepare('SELECT COUNT(*) AS count FROM manager_blog_drafts').get().count, articles);
  });
  await check('removing a table heading preserves its body and deleting the last column removes only the table', async () => {
    await tab('products'); await page.locator('.manager-product-title[data-slug="sample-service"]').click();
    await page.locator('#productEditorView .editor-section-nav button').filter({hasText:'详细内容'}).click();
    const editor = page.locator('[data-rich-editor="productContent"]');
    const surface = editor.locator('.rich-editor__surface'); await surface.fill('Keep this paragraph.'); await surface.click(); await page.keyboard.press('End');
    await editor.locator('[data-rich-command="table"]').click();
    await surface.locator('th').first().click(); await editor.locator('[data-rich-command="tableRowDelete"]').click();
    assert.equal(await surface.locator('tbody tr').count(), 2);
    for (let index = 0; index < 3; index++) {
      await surface.locator('td').first().click(); await editor.locator('[data-rich-command="tableColumnDelete"]').click();
    }
    assert.equal(await surface.locator('table').count(), 0); assert.match(await surface.innerText(), /Keep this paragraph/);
  });
  await check('store reviews create, edit, apply and delete without owner-only switches', async () => {
    await tab('reviews'); await page.locator('#newReviewButton').click();
    await fill('reviewBuyerLabel', 'Fixture buyer'); await fill('reviewQuote', 'Clear editing workflow.');
    await page.locator('#saveReviewDraftButton').click(); await waitText('reviewStatus', '评价草稿已保存');
    await page.locator('[data-review-draft-apply]').last().click(); await waitText('reviewStatus', '审核已提交');
    let saved = JSON.parse(await readFile(resolve(output, 'write-back/src/data/customer-reviews.json'), 'utf8'));
    assert.equal(saved.reviews[0].buyerLabel, 'Fixture buyer');
    await page.locator('[data-review-id]').first().click();
    await page.locator('#deleteReviewDraftButton').click(); await waitText('reviewStatus', '删除草稿已保存');
    const deletion = backend.db.prepare('SELECT id, payload_json FROM manager_review_drafts').all()
      .find(row => JSON.parse(row.payload_json).operation === 'delete');
    assert.ok(deletion, 'Select the actual deletion draft, not its time-dependent list position.');
    await page.locator(`[data-review-draft-apply="${deletion.id}"]`).click(); await waitText('reviewStatus', '审核已提交');
    saved = JSON.parse(await readFile(resolve(output, 'write-back/src/data/customer-reviews.json'), 'utf8'));
    assert.equal(saved.reviews.length, 0);
    assert.equal(await page.locator('#reviewPublished').count(), 1);
    assert.equal(await page.locator('#reviewWorkShowHistory').count(), 1);
  });
  await check('media folder navigation, cut/paste and API retry work without losing content', async () => {
    await tab('images'); await waitText('assetStatus', '已加载');
    backend.failNextApi('/api/manager/r2/assets'); await page.locator('#assetRefreshButton').click(); await waitText('assetStatus', '重试');
    await page.locator('#assetRefreshButton').click(); await waitText('assetStatus', '已加载');
    await page.locator('[data-asset-check="product.png"]').check(); await page.locator('#assetCutButton').click();
    await page.locator('[data-folder="images/"]').click(); await waitText('assetPath', 'images/');
    await page.locator('#assetPasteButton').click(); await waitText('assetStatus', '已加载');
    assert.equal(backend.assets.has('product.png'), false); assert.equal(backend.assets.has('images/product.png'), true);
    await page.locator('#assetBackButton').click(); await waitText('assetPath', '根目录');
  });
  await check('translations support inverse selection and preserve no-selection feedback', async () => {
    await tab('translation'); await page.locator('#translationLocaleSelectAll').uncheck();
    await page.locator('#translationSubmitButton').click(); await waitText('translationStatus', '语言');
    await page.locator('#translationLocaleInvert').click();
    assert.equal(await page.locator('#localeGrid input:checked').count(), 2);
  });
  await tab('publish'); await waitText('publishStatus', '已读取');
  await check('mobile and dark theme preserve reminder and single-backend navigation', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await setManagerTheme(page,'dark');
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: resolve(output, 'mobile-dark.png'), fullPage: true });
  });
  await check('all primary panels fit mobile and tablet widths including resumed draft controls', async () => {
    for (const width of [360, 768]) {
      await page.setViewportSize({ width, height: 900 });
      for (const name of ['products', 'product-order', 'blog', 'reviews', 'images', 'translation', 'product-drafts', 'blog-drafts', 'publish']) {
        await tab(name);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${name} overflows ${width}px`);
      }
      await tab('products'); await page.locator('.manager-product-title[data-slug="sample-service"]').click();
      await page.locator('[data-product-draft-edit]').first().click();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `product editor overflows ${width}px`);
    }
    await page.screenshot({ path: resolve(output, 'tablet-product-editor.png'), fullPage: true });
    await page.setViewportSize({ width: 1440, height: 900 });
  });
  await check('new product drafts can resume and apply to a newly created content file', async () => {
    await page.locator('#productBackButton').click(); await page.locator('#newProductButton').click();
    const draft = backend.productDrafts().find(item => item.productSlug === 'new-service');
    await page.locator(`[data-product-draft-edit="${draft.id}"]`).click();
    assert.equal(await page.locator('#title').inputValue(), 'New service');
    await page.locator(`[data-apply="${draft.id}"]`).click(); await waitText('statusText', '已提交');
    assert.match(await readFile(resolve(output, 'write-back/src/content/products/new-service.mdoc'), 'utf8'), /New service/);
  });
  await check('content titles are escaped rather than executed in product lists', async () => {
    const original = backend.products[0].title;
    const title = '<img src=x onerror="window.injected=true">'; backend.products[0].title = title;
    await page.reload(); await tab('products'); await page.waitForSelector('.manager-product-title[data-slug="sample-service"]');
    assert.equal(await page.locator('.manager-product-title[data-slug="sample-service"]').innerText(), title);
    assert.equal(await page.locator('.manager-product-row img[src="x"]').count(), 0);
    assert.equal(await page.evaluate(() => window.injected), undefined);
    backend.products[0].title = original; await page.reload(); await tab('products'); await page.waitForSelector('.manager-product-title[data-slug="sample-service"]');
  });
  const offDist = await buildManagerFixture(root, output, false, undefined, 'off', false);
  await tab('products'); await page.locator('.manager-product-title[data-slug="sample-service"]').click();
  await page.locator('[data-product-draft-edit]').first().click();
  await expandManagerEditor(page);
  await page.locator('[data-action="reviews:add"]').click();
  await page.locator('#productReviewList [data-field="buyerLabel"]').last().fill('Unpublished pending buyer');
  await page.locator('#productReviewList [data-field="quote"]').last().fill('Keep this while reviews are disabled.');
  await page.locator('#saveDraftButton').click(); await waitText('statusText', '草稿已保存');
  const pendingReviewDraft = backend.productDrafts().find(item => item.productSlug === 'sample-service').id;
  backend.setReviews(false);
  const offServer = await backend.start(offDist);
  try {
    await check('Keystatic OFF hides review editing while preserving old unpublished reviews', async () => {
      const off = await context.newPage(); await off.goto(offServer.url); await openManagerTab(off,'products'); await off.waitForSelector('.manager-product-title[data-slug="sample-service"]');
      assert.equal(await off.locator('[data-tab="reviews"]').count(), 0);
      assert.equal(await off.locator('#managerAnalyticsLink').count(), 0);
      await off.locator('.manager-product-title[data-slug="sample-service"]').click();
      await off.locator(`[data-product-draft-edit="${pendingReviewDraft}"]`).click();
      assert.equal(await off.locator('#productReviewList').count(), 0);
      await off.locator('#title').fill('OFF state title'); await off.locator('#saveDraftButton').click();
      await off.waitForFunction(() => document.getElementById('statusText').textContent.includes('草稿已保存'));
      assert.ok(backend.productDrafts().some(item => item.productSlug === 'sample-service' && item.payload.reviews?.length));
      await off.close();
    });
  } finally { await offServer.stop(); }
  await check('re-enabling reviews restores preserved draft fields without data re-entry', async () => {
    backend.setReviews(true);
    const enabled = await context.newPage(); await enabled.goto(server.url);
    await openManagerTab(enabled,'products');
    await enabled.waitForSelector('.manager-product-title[data-slug="sample-service"]');
    await enabled.locator('.manager-product-title[data-slug="sample-service"]').click();
    await enabled.locator(`[data-product-draft-edit="${pendingReviewDraft}"]`).click();
    await expandManagerEditor(enabled);
    assert.ok((await enabled.locator('#productReviewList [data-field="buyerLabel"]').evaluateAll(nodes => nodes.map(node => node.value))).includes('Unpublished pending buyer'));
    await enabled.close();
  });
  await check('physical-product policy also controls the same content editor', async () => {
    const policy = { offeringType: 'physical-product', modelStrategy: 'series' };
    const physicalDist = await buildManagerFixture(root, output, true, policy, 'physical');
    backend.setPolicy(policy); const physicalServer = await backend.start(physicalDist);
    try {
      const physical = await context.newPage(); await physical.goto(physicalServer.url);
      await openManagerTab(physical,'products');
      await physical.waitForSelector('#newProductButton'); await physical.locator('#newProductButton').click();
      assert.equal(await physical.locator('#offeringType').inputValue(), 'physical-product');
      assert.equal(await physical.locator('#modelStrategy').inputValue(), 'series');
      assert.equal(await physical.locator('#modelStrategy').isDisabled(), true);
      await physical.close();
    } finally { await physicalServer.stop(); }
  });
  await checkManagerImages({ page, backend, check, output });
  await checkAdminWorkflow({page,backend,check,output});
  await checkManagerUx({page,backend,check,output});
  assert.deepEqual(faults, []); assert.deepEqual(forbidden, []);
  assert.ok(backend.requests.every(item => item.path.startsWith('/api/manager/')));
  await writeFile(resolve(output, 'result.json'), JSON.stringify({ checks, requests: backend.requests, cloudWrites: 'NONE', realAuthentication: 'NOT_TESTED', output }, null, 2));
  console.log(JSON.stringify({ passed: checks.length, output, network: 'LOOPBACK_ONLY', realCloudWrites: 'NONE' }));
  await context.close();
} catch (error) {
  if (page && !page.isClosed()) await page.screenshot({ path: resolve(output, 'failure.png'), fullPage: true });
  const overflow = page && !page.isClosed() ? await page.evaluate(() => [...document.querySelectorAll('body *')].filter(node => node.getBoundingClientRect().right > innerWidth + 1 && !node.closest('.table-scroll,.rich-editor__surface')).slice(0, 40).map(node => ({ tag: node.tagName, id: node.id, class: node.className, width: node.getBoundingClientRect().width }))) : [];
  await writeFile(resolve(output, 'failure.json'), JSON.stringify({ error: error.message, faults, overflow, requests: backend.requests }, null, 2));
  console.error('Manager fixture diagnostics: ' + output);
  throw error;
} finally { await browser.close(); await server.stop(); backend.db.close(); }
