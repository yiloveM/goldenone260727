import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { parse } from 'yaml';

const root = process.cwd();
const productsDir = path.join(root, 'src', 'content', 'products');
const translationsDir = path.join(root, 'src', 'content', 'productTranslations');
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const modelHeaderPattern = /(^|\b)(model|item|code|sku|product\s*code)(\b|$)/i;
const unsupportedClaimPattern = /\b(best|world[- ]class|revolutionary|perfect|number\s*one|no\.\s*1)\b/i;
const offeringTypes = new Set(['physical-product', 'service', 'solution']);
const modelStrategies = new Set(['single-model', 'series', 'configurable', 'not-applicable']);
const strictRichResults = process.argv.includes('--rich-results');
const strictMerchantListings = process.argv.includes('--merchant-listings');

const findings = [];
const summaries = [];
let productGroupCount = 0;
let nestedModelProductCount = 0;
let singleModelProductCount = 0;
let productsWithoutModelRows = 0;
const addFinding = (severity, file, message) => findings.push({ severity, file, message });

const readSource = file => readFile(path.join(root, file), 'utf8');

const seoSource = await readSource('src/data/seo.ts');
const productPageSource = await readSource('src/pages/products/[slug].astro');
const localizedTableScriptSource = await readSource('src/components/ProductTableScrollerScript.astro');

const structuralChecks = [
  [/export const productEntitiesEnabled = true;/.test(seoSource), 'src/data/seo.ts', 'Product/ProductGroup entity output must remain enabled'],
  [!/price\s*:\s*['"]?0(?:\.0+)?['"]?/i.test(seoSource), 'src/data/seo.ts', 'Quote-only templates must not emit fake zero-price offers'],
  [/baseProduct\.hasVariant\s*=/.test(seoSource), 'src/data/seo.ts', 'ProductGroup output must expose model Products through hasVariant'],
  [/variants\.length\s*===\s*1/.test(seoSource), 'src/data/seo.ts', 'Single-model products must expose their model identity and row specifications'],
  [!/Array\.from\(variants\.values\(\)\)\.slice\(/.test(seoSource), 'src/data/seo.ts', 'Structured data must not silently truncate published model variants'],
  [/partitionVariantProperties/.test(seoSource), 'src/data/seo.ts', 'Series-wide table properties must be separated from model-specific parameters'],
  [/const variantId\s*=/.test(seoSource), 'src/data/seo.ts', 'Every model Product must receive a stable @id'],
  [/sku:\s*model/.test(seoSource) && /mpn:\s*model/.test(seoSource), 'src/data/seo.ts', 'Every model Product must expose sku and mpn identifiers'],
  [/url:\s*variantUrl/.test(seoSource), 'src/data/seo.ts', 'Every model Product must expose a directly addressable variant URL'],
  [/inProductGroupWithID:\s*groupId/.test(seoSource), 'src/data/seo.ts', 'Every model Product must identify its parent product group'],
  [/isVariantOf:\s*\{\s*'@id'/.test(seoSource), 'src/data/seo.ts', 'Every model Product must link back to its ProductGroup'],
  [/additionalProperty:\s*propertyValues/.test(seoSource), 'src/data/seo.ts', 'Every model Product must expose model parameters as PropertyValue data'],
  [/\.get\(['"]model['"]\)/.test(productPageSource) && /data-model/.test(productPageSource), 'src/pages/products/[slug].astro', 'Variant URLs must select and reveal matching model rows'],
  [/\.get\(['"]model['"]\)/.test(localizedTableScriptSource) && /data-model/.test(localizedTableScriptSource), 'src/components/ProductTableScrollerScript.astro', 'Localized variant URLs must select and reveal matching model rows'],
];

for (const [valid, file, message] of structuralChecks) {
  if (!valid) addFinding('error', file, message);
}

const parseDocument = async filePath => {
  const source = (await readFile(filePath, 'utf8')).replace(/^\uFEFF/, '');
  const match = source.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/);
  if (!match) throw new Error('Missing YAML frontmatter');
  return { data: parse(match[1]) || {}, body: source.slice(match[0].length).trim() };
};

const listMdocFiles = async dir =>
  (await readdir(dir, { withFileTypes: true }))
    .filter(entry => entry.isFile() && entry.name.endsWith('.mdoc') && !entry.name.startsWith('placeholder-'))
    .map(entry => entry.name)
    .sort();

const productFiles = await listMdocFiles(productsDir);
const productSlugs = new Set(productFiles.map(file => file.replace(/\.mdoc$/, '')));

for (const file of productFiles) {
  const relativeFile = path.posix.join('src/content/products', file);
  const slug = file.replace(/\.mdoc$/, '');
  let document;
  try {
    document = await parseDocument(path.join(productsDir, file));
  } catch (error) {
    addFinding('error', relativeFile, `Cannot parse frontmatter: ${error.message}`);
    continue;
  }

  const { data, body } = document;
  const title = String(data.title || '').trim();
  const description = String(data.description || '').trim();
  const series = String(data.series || '').trim();
  const category = String(data.category || '').trim();
  const offeringType = String(data.offeringType || 'physical-product').trim();
  const modelStrategy = String(data.modelStrategy || 'series').trim();
  summaries.push({ slug, title, description, series, category });

  if (!slugPattern.test(slug)) addFinding('error', relativeFile, `Invalid slug format: ${slug}`);
  if (slug.length > 100) addFinding('warning', relativeFile, `Slug is ${slug.length} characters; review for avoidable repetition`);
  if (!title) addFinding('error', relativeFile, 'Missing product title');
  if (title.length > 90) addFinding('warning', relativeFile, `Title is ${title.length} characters`);
  if (/^businessweb\b/i.test(title)) addFinding('warning', relativeFile, 'Title repeats the template brand placeholder');
  if (!description) addFinding('error', relativeFile, 'Missing product description');
  if (description.length < 80) addFinding('warning', relativeFile, `Description is only ${description.length} characters`);
  if (description.length > 320) addFinding('warning', relativeFile, `Description is ${description.length} characters`);
  if (unsupportedClaimPattern.test(`${title} ${description}`)) {
    addFinding('warning', relativeFile, 'Title or description contains an unsupported superlative claim');
  }
  if (!offeringTypes.has(offeringType)) addFinding('error', relativeFile, `Unknown offeringType: ${offeringType}`);
  if (!modelStrategies.has(modelStrategy)) addFinding('error', relativeFile, `Unknown modelStrategy: ${modelStrategy}`);
  if (offeringType === 'physical-product' && !series) addFinding('error', relativeFile, 'Physical products require a series or model identity');
  if (offeringType !== 'physical-product' && modelStrategy !== 'not-applicable') {
    addFinding('warning', relativeFile, 'Services and solutions normally use modelStrategy: not-applicable unless they genuinely have selectable models');
  }
  if (!category) addFinding('error', relativeFile, 'Missing category');
  if (!Array.isArray(data.highlights) || data.highlights.length < 2) addFinding('warning', relativeFile, 'Fewer than two series-level highlights');
  if (!Array.isArray(data.applications) || data.applications.length === 0) addFinding('warning', relativeFile, 'No visible application guidance');

  const ratingValue = String(data.aggregateRatingValue || '').trim();
  const ratingCount = Number(data.aggregateRatingCount || 0);
  if ((ratingValue && ratingCount <= 0) || (!ratingValue && ratingCount > 0)) {
    addFinding('error', relativeFile, 'Aggregate rating value and rating count must be supplied together');
  }
  if (ratingValue && (!Number.isFinite(Number(ratingValue)) || Number(ratingValue) < 1 || Number(ratingValue) > 5)) {
    addFinding('error', relativeFile, 'Aggregate rating value must be between 1 and 5');
  }
  const hasValidAggregateRating = Boolean(ratingValue && ratingCount > 0);
  if (strictRichResults && offeringType === 'physical-product' && !hasValidAggregateRating) {
    addFinding('error', relativeFile, 'Product rich-result eligibility requires a genuine visible Offer, Review, or AggregateRating');
  }
  if (strictMerchantListings && offeringType === 'physical-product') {
    addFinding('error', relativeFile, 'Merchant-listing eligibility requires a genuine visible active Offer price');
  }
  if (body.length < 80) addFinding('warning', relativeFile, 'Product body lacks a substantial buyer-facing overview');

  if (offeringType !== 'physical-product') continue;

  const specs = Array.isArray(data.specs) ? data.specs : [];
  const seenSpecLabels = new Set();
  specs.forEach((spec, index) => {
    const label = String(spec?.label || '').trim();
    const key = label.toLowerCase();
    if (!label || !String(spec?.value || '').trim()) addFinding('error', relativeFile, `Incomplete series spec at index ${index}`);
    if (key && seenSpecLabels.has(key)) addFinding('warning', relativeFile, `Duplicate series spec label: ${label}`);
    seenSpecLabels.add(key);
  });

  const tables = Array.isArray(data.specTables) ? data.specTables : [];
  const modelParameterCounts = new Map();
  tables.forEach((table, tableIndex) => {
    const columns = Array.isArray(table?.columns) ? table.columns.map(value => String(value || '').trim()) : [];
    const rows = Array.isArray(table?.rows) ? table.rows : [];
    const label = String(table?.title || `table ${tableIndex + 1}`).trim();
    if (columns.length < 2) addFinding('error', relativeFile, `${label} has fewer than two columns`);
    if (columns.some(column => !column)) addFinding('error', relativeFile, `${label} has an empty machine-readable column name`);

    const seenModels = new Set();
    const seenRows = new Set();
    rows.forEach((row, rowIndex) => {
      if (!Array.isArray(row)) {
        addFinding('error', relativeFile, `${label} row ${rowIndex + 1} is not an array`);
        return;
      }
      if (row.length !== columns.length) addFinding('error', relativeFile, `${label} row ${rowIndex + 1} has ${row.length} cells for ${columns.length} columns`);
      const rowKey = row.map(value => String(value || '').trim().toLowerCase()).join('|');
      if (seenRows.has(rowKey)) addFinding('error', relativeFile, `${label} repeats row ${rowIndex + 1}`);
      seenRows.add(rowKey);
      if (modelHeaderPattern.test(columns[0] || '')) {
        const model = String(row[0] || '').trim();
        const key = model.toLowerCase();
        if (!model) addFinding('error', relativeFile, `${label} row ${rowIndex + 1} has no model code`);
        const parameterCount = row.slice(1).filter(value => String(value || '').trim()).length;
        if (key) modelParameterCounts.set(key, Math.max(modelParameterCounts.get(key) || 0, parameterCount));
        const repeatedRowMessage = `${label} contains multiple rows for model ${model}`;
        if (key && seenModels.has(key) && !findings.some(item => item.file === relativeFile && item.message === repeatedRowMessage)) {
          addFinding('warning', relativeFile, repeatedRowMessage);
        }
        seenModels.add(key);
      }
    });
  });

  if (modelParameterCounts.size > 1) {
    productGroupCount += 1;
    nestedModelProductCount += modelParameterCounts.size;
    modelParameterCounts.forEach((parameterCount, model) => {
      if (parameterCount === 0) addFinding('error', relativeFile, `Model ${model} has no machine-readable differentiating parameters`);
    });
  } else if (modelParameterCounts.size === 1) {
    singleModelProductCount += 1;
  } else {
    productsWithoutModelRows += 1;
  }

  if (modelStrategy === 'series' && modelParameterCounts.size < 2) {
    addFinding('warning', relativeFile, 'Series-level product has fewer than two model rows; use single-model or configurable when that better reflects the offer');
  }
  if (modelStrategy === 'single-model' && modelParameterCounts.size > 1) {
    addFinding('error', relativeFile, 'single-model product contains multiple model rows; classify it as series instead');
  }
  if (modelStrategy === 'not-applicable') {
    addFinding('error', relativeFile, 'Physical products must use single-model, series, or configurable modelStrategy');
  }
}

const translationFiles = await listMdocFiles(translationsDir);
const productSummaryBySlug = new Map(summaries.map(item => [item.slug, item]));

for (const file of translationFiles) {
  const relativeFile = path.posix.join('src/content/productTranslations', file);
  try {
    const { data } = await parseDocument(path.join(translationsDir, file));
    const sourceSlug = String(data.sourceSlug || '').trim();
    const sourceTitle = String(data.sourceTitle || '').trim();
    if (!sourceSlug) addFinding('error', relativeFile, 'Missing sourceSlug');
    else if (!productSlugs.has(sourceSlug)) addFinding('error', relativeFile, `sourceSlug does not match a product: ${sourceSlug}`);
    else if (sourceTitle && sourceTitle !== productSummaryBySlug.get(sourceSlug)?.title) {
      addFinding('warning', relativeFile, `sourceTitle is stale for ${sourceSlug}`);
    }
  } catch (error) {
    addFinding('error', relativeFile, `Cannot parse frontmatter: ${error.message}`);
  }
}

const errors = findings.filter(item => item.severity === 'error');
const warnings = findings.filter(item => item.severity === 'warning');
if (process.argv.includes('--report')) {
  console.log('SLUG\tTITLE\tSERIES\tCATEGORY\tDESCRIPTION');
  summaries.forEach(item => console.log(`${item.slug}\t${item.title}\t${item.series}\t${item.category}\t${item.description}`));
  console.log('');
}
for (const finding of findings) {
  const marker = finding.severity === 'error' ? 'ERROR' : 'WARN ';
  console.log(`${marker} ${finding.file}: ${finding.message}`);
}
console.log(`\nAudited ${productFiles.length} products and ${translationFiles.length} product translations: ${errors.length} errors, ${warnings.length} warnings.`);
console.log(
  `Model entity coverage: ${productGroupCount} ProductGroups with ${nestedModelProductCount} nested model Products, ` +
  `${singleModelProductCount} single-model Products, ${productsWithoutModelRows} Products without published model rows.`
);
if (strictRichResults) console.log('Strict rich-result mode follows Google Product snippet eligibility gates.');
if (strictMerchantListings) console.log('Merchant-listing mode requires real visible active Offer prices.');
if (errors.length) process.exitCode = 1;
