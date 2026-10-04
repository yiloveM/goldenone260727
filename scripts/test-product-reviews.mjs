import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import ts from 'typescript';
import YAML from 'yaml';
import { serializeJsonLd } from '../src/lib/json-ld.mjs';
import {
  normalizeReviewRecords,
  productReviewStructuredData,
  productReviewSummary,
  resolveProductReviews,
  storedProductReviews,
  validateProductRating,
  validateProductReviews,
  validateReviewInput,
} from '../src/lib/product-reviews.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
test('review text cannot escape a JSON-LD script and ratings reject non-numeric types', () => {
  const text = '</script><script>alert(1)</script>';
  const markup = productReviewStructuredData(true, [{ buyerLabel: 'Buyer', quote: text, rating: 3 }]);
  const serialized = serializeJsonLd(markup);
  assert.equal(serialized.includes('<'), false);
  assert.equal(JSON.parse(serialized).review[0].reviewBody, text);
  for (const rating of [true, false, [], [5], {}]) {
    assert.equal(normalizeReviewRecords([{ rating }])[0].rating, 0);
  }
});
const review = { buyerLabel: 'A Buyer', rating: '2', quote: 'Useful product feedback.', date: '', published: true };

const loadTs = async (file, data) => {
  const absolute = path.join(root, file);
  let source = await readFile(absolute, 'utf8');
  if (data !== undefined) source = source.replace("import reviewData from './customer-reviews.json';", `const reviewData = ${JSON.stringify(data)};`);
  source = source.replace(/from (['"])(\.\.?\/[^'"]+)\1/g, (_, quote, relative) => `from ${quote}${pathToFileURL(path.resolve(path.dirname(absolute), relative)).href}${quote}`);
  source = source.replace("from '@keystatic/core'", `from '${import.meta.resolve('@keystatic/core')}'`);
  const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);
};

test('empty home summary does not gate product reviews or their JSON-LD', async () => {
  const system = await loadTs('src/data/customerReviews.ts', { enabled: true, summary: { rating: '', reviewCount: 0 }, reviews: [] });
  const records = system.reviewsForProduct('sample-product', [review]);
  assert.equal(records.length, 1);
  assert.equal(system.customerReviewSummary.rating, 0);
  const schema = productReviewStructuredData(system.reviewSystemEnabled, records);
  assert.equal(schema.review[0].reviewRating.ratingValue, 2);
  assert.equal(schema.aggregateRating.ratingCount, 1);
  assert.equal('datePublished' in schema.review[0], false);
});

test('the global switch omits all public review and rating data without clearing stored records', async () => {
  const system = await loadTs('src/data/customerReviews.ts', { enabled: false, reviews: [{ ...review, productSlugs: ['sample-product'] }] });
  assert.deepEqual(system.reviewsForProduct('sample-product', [review]), []);
  assert.equal(system.allCustomerReviews.length, 1);
  assert.deepEqual(productReviewStructuredData(false, [review], '5', 50), {});
  assert.deepEqual(system.reviewSummaryForProduct('sample-product', [review], '5', 50), { rating: 0, reviewCount: 0 });
});

test('Keystatic hides the entire product field when off while retaining its storage schema', async () => {
  const fields = await loadTs('src/keystatic/review-fields.ts');
  const disabled = fields.productReviewFields(false);
  const enabled = fields.productReviewFields(true);
  assert.equal(disabled.kind, 'array');
  assert.equal(disabled.Input(), null);
  assert.equal(enabled.Input, undefined);
  assert.equal(enabled.element.fields.id.Input(), null);
  assert.equal(enabled.element.fields.sourceUrl.Input(), null);
  assert.equal(enabled.element.fields.rating.reader.parse('1'), '1');
  assert.equal(disabled.element.fields.id.reader.parse('kept-id'), 'kept-id');
});

test('legacy kind and SEO flags do not classify or gate an owner-entered review', () => {
  const value = { ...review, kind: 'demo', seoEligible: false, productSlugs: ['sample-product'] };
  const records = resolveProductReviews('sample-product', undefined, [value]);
  assert.equal(productReviewStructuredData(true, records).review.length, 1);
  assert.equal(validateReviewInput(value).rating, '2');
});

test('ratings 1 through 5 are retained, and invalid values never become 5', () => {
  for (const rating of [1, 2, 3, 4, 5]) assert.equal(normalizeReviewRecords([{ ...review, rating }])[0].rating, rating);
  for (const rating of ['', 'bad', 0, 6, null, 4.5]) {
    assert.equal(normalizeReviewRecords([{ ...review, rating }])[0].rating, 0);
    assert.throws(() => validateProductReviews([{ ...review, rating }]));
  }
  assert.throws(() => validateReviewInput({ ...review, date: '2026-02-30' }));
  assert.equal(validateReviewInput({ ...review, date: '' }).date, '');
});

test('general feedback and reviews of other products cannot become this product review', () => {
  const legacy = [{ ...review, productSlugs: [] }, { ...review, productSlugs: ['other-product'] }];
  assert.deepEqual(resolveProductReviews('sample-product', undefined, legacy), []);
  assert.deepEqual(resolveProductReviews('sample-product', [], [{ ...review, productSlugs: ['sample-product'] }]), []);
  assert.equal(resolveProductReviews('sample-product', [review], [{ ...review, productSlugs: ['sample-product'] }]).length, 1);
});

test('hidden reviews remain available to editors but are not counted or marked up', () => {
  const records = [review, { ...review, rating: '5', published: false }];
  assert.equal(storedProductReviews('sample-product', records).length, 2);
  assert.deepEqual(productReviewSummary(records), { rating: 2, reviewCount: 1 });
  assert.equal(productReviewStructuredData(true, records).review.length, 1);
});

test('an optional product aggregate is independent of the home aggregate', () => {
  assert.deepEqual(productReviewSummary([], '4.8', 73), { rating: 4.8, reviewCount: 73 });
  const schema = productReviewStructuredData(true, [], '4.8', 73);
  assert.equal(schema.aggregateRating.ratingValue, 4.8);
  assert.equal(schema.aggregateRating.ratingCount, 73);
  assert.equal('review' in schema, false);
  assert.deepEqual(validateProductRating({}), {});
  assert.throws(() => validateProductRating({ aggregateRatingCount: 1.5 }));
});

test('Manager accepts minimal product and home review data and preserves missing old-draft fields', async () => {
  const manager = await loadTs('src/lib/manager/d1.ts');
  const product = { productSlug: 'sample-product', title: 'Sample Product', description: 'Description', category: 'Equipment', series: 'Sample' };
  assert.equal('reviews' in manager.normalizeProductDraftPayload(product), false);
  const payload = manager.normalizeProductDraftPayload({ ...product, reviews: [review] });
  assert.equal(payload.reviews[0].rating, '2');
  const home = manager.normalizeReviewDraftPayload(review);
  assert.match(home.id, /^review-[a-z0-9-]+$/);
  assert.equal(home.rating, '2');
  assert.equal(home.source, '');
});

test('Keystatic owns classification, Manager normalization keeps old missing keys intact', async () => {
  const { resolveProductEditorPolicy, enforceProductEditorPolicy } = await import('../src/lib/product-editor.mjs');
  const settings = { offeringType: 'service', modelStrategy: 'not-applicable' };
  const product = { offeringType: 'solution', modelStrategy: 'configurable' };
  assert.deepEqual(resolveProductEditorPolicy(settings), settings);
  assert.deepEqual(resolveProductEditorPolicy(settings, product), product);
  assert.deepEqual(enforceProductEditorPolicy({ title: 'Keep', offeringType: 'physical-product', modelStrategy: 'series' }, settings, product), { title: 'Keep', ...product });
  const manager = await loadTs('src/lib/manager/d1.ts');
  const old = manager.normalizeProductDraftPayload({ productSlug: 'sample-product', title: 'Title', description: 'Description', category: 'Category' });
  assert.equal('offeringType' in old, false);
  assert.equal('modelStrategy' in old, false);
  assert.equal(old.series, '');
  const native = await loadTs('src/keystatic/product-editor-fields.ts');
  const fields = native.productClassificationFields(settings);
  assert.equal(fields.offeringType.defaultValue(), 'service');
  assert.equal(fields.modelStrategy.defaultValue(), 'not-applicable');
});

test('the browser and save endpoint enforce the owner policy without editing public pages', async () => {
  const manager = await readFile(path.join(root, 'src/pages/manager/index.astro'), 'utf8');
  assert.match(manager, /id="offeringType"[^>]*disabled/);
  assert.match(manager, /id="modelStrategy"[^>]*disabled/);
  assert.match(manager, /productEditorFields\.map/);
  const api = await readFile(path.join(root, 'src/pages/api/manager/product-drafts.ts'), 'utf8');
  assert.match(api, /getCollection\('products'\)/);
  assert.match(api, /enforceProductEditorPolicy\(body\.payload, productEditorSettings, product\?\.data\)/);
});

test('an older product draft cannot overwrite a newer Keystatic policy; new products use owner defaults', async () => {
  const cwd = await sandbox();
  const directory = path.join(cwd, 'src', 'content', 'products');
  await mkdir(directory, { recursive: true });
  await mkdir(path.join(cwd, 'src', 'data'), { recursive: true });
  await writeFile(path.join(cwd, 'src/data/product-editor-settings.json'), JSON.stringify({ offeringType: 'service', modelStrategy: 'not-applicable' }));
  const file = path.join(directory, 'sample-product.mdoc');
  await writeFile(file, `---\n${YAML.stringify({ title: 'Title', description: 'Description', category: 'Category', series: '', offeringType: 'solution', modelStrategy: 'configurable', customerField: 'keep' })}---\nOriginal body.\n`);
  const payload = { productSlug: 'sample-product', title: 'Title', description: 'Description', category: 'Category', offeringType: 'physical-product', modelStrategy: 'series' };
  const apply = value => runWriteback('apply-manager-product-draft.mjs', cwd, { MANAGER_PRODUCT_DRAFT_PAYLOAD: Buffer.from(JSON.stringify(value)).toString('base64'), MANAGER_PRODUCT_DRAFT_ID: 'test-draft' });
  const stored = async slug => YAML.parse((await readFile(path.join(directory, `${slug}.mdoc`), 'utf8')).split(/^---\s*$/m)[1]);
  apply(payload);
  assert.equal((await stored('sample-product')).offeringType, 'solution');
  assert.equal((await stored('sample-product')).modelStrategy, 'configurable');
  assert.equal((await stored('sample-product')).customerField, 'keep');
  apply({ ...payload, productSlug: 'new-product' });
  assert.equal((await stored('new-product')).offeringType, 'service');
  assert.equal((await stored('new-product')).modelStrategy, 'not-applicable');
});

test('the OFF switch hides inputs and retains unpublished draft reviews until explicitly edited', async () => {
  const { productDraftReviewFields, retainUneditedProductReviews } = await import('../src/lib/product-editor.mjs');
  const input = { productSlug: 'sample-product', title: 'Keep', reviews: [review], aggregateRatingValue: '2', aggregateRatingCount: 1 };
  assert.deepEqual(productDraftReviewFields(input, false), { productSlug: 'sample-product', title: 'Keep' });
  assert.deepEqual(productDraftReviewFields(input, true), input);
  assert.equal(input.reviews.length, 1);
  const hidden = productDraftReviewFields(input, false);
  assert.deepEqual(retainUneditedProductReviews(hidden, input), input);
  assert.deepEqual(retainUneditedProductReviews({ ...hidden, reviews: [] }, input).reviews, []);
  assert.equal('reviews' in retainUneditedProductReviews({ productSlug: 'other-product' }, input), false);
  const api = await readFile(path.join(root, 'src/pages/api/manager/product-drafts.ts'), 'utf8');
  assert.match(api, /productDraftReviewFields/);
  assert.match(api, /reviewSystemEnabled/);
});

const sandbox = async () => {
  const directory = path.join(root, '.sandbox', 'product-review-tests');
  await mkdir(directory, { recursive: true });
  return mkdtemp(path.join(directory, 'case-'));
};

const runWriteback = (script, cwd, variables) => {
  const result = spawnSync(process.execPath, [path.join(root, 'scripts', script)], { cwd, env: { ...process.env, ...variables }, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
};

test('product write-back preserves reviews on old drafts and writes explicit edits and deletions', async () => {
  const cwd = await sandbox();
  const directory = path.join(cwd, 'src', 'content', 'products');
  await mkdir(directory, { recursive: true });
  const file = path.join(directory, 'sample-product.mdoc');
  await writeFile(file, `---\n${YAML.stringify({ title: 'Sample Product', description: 'Description', category: 'Equipment', series: 'Sample', reviews: [review], aggregateRatingValue: '2', aggregateRatingCount: 1, customerField: 'preserve' })}---\nOriginal product description.\n`);
  const payload = { productSlug: 'sample-product', title: 'Sample Product', description: 'Description', category: 'Equipment', series: 'Sample' };
  const apply = value => runWriteback('apply-manager-product-draft.mjs', cwd, { MANAGER_PRODUCT_DRAFT_PAYLOAD: Buffer.from(JSON.stringify(value)).toString('base64'), MANAGER_PRODUCT_DRAFT_ID: 'test-draft' });
  const stored = async () => YAML.parse((await readFile(file, 'utf8')).split(/^---\s*$/m)[1]);
  apply(payload);
  assert.equal((await stored()).reviews[0].rating, '2');
  assert.equal((await stored()).customerField, 'preserve');
  apply({ ...payload, reviews: [{ ...review, rating: '1' }] });
  assert.equal((await stored()).reviews[0].rating, '1');
  apply({ ...payload, reviews: [] });
  assert.deepEqual((await stored()).reviews, []);
  assert.match(await readFile(file, 'utf8'), /Original product description\./);
});

test('home review write-back automatically associates internal IDs and retains legacy data', async () => {
  const cwd = await sandbox();
  const directory = path.join(cwd, 'src', 'data');
  await mkdir(directory, { recursive: true });
  const file = path.join(directory, 'customer-reviews.json');
  const initial = { ...review, source: 'Existing source', country: 'DE', kind: 'demo', seoEligible: false };
  const id = normalizeReviewRecords([initial])[0].id;
  await writeFile(file, JSON.stringify({ enabled: true, summary: { rating: '', reviewCount: 0 }, reviews: [initial] }));
  const payload = { ...review, id, rating: '1', operation: 'upsert' };
  runWriteback('apply-manager-review-draft.mjs', cwd, { MANAGER_REVIEW_DRAFT_PAYLOAD: Buffer.from(JSON.stringify(payload)).toString('base64'), MANAGER_REVIEW_ID: id });
  const data = JSON.parse(await readFile(file, 'utf8'));
  assert.equal(data.reviews.length, 1);
  assert.equal(data.reviews[0].source, 'Existing source');
  assert.equal(data.reviews[0].country, 'DE');
  assert.equal(data.reviews[0].rating, '1');
  assert.equal(data.summary.rating, '');
});
