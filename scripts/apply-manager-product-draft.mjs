import fs from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';

const cwd = process.cwd();
const payloadBase64 = process.env.MANAGER_PRODUCT_DRAFT_PAYLOAD || '';
const draftId = process.env.MANAGER_PRODUCT_DRAFT_ID || '';
const inputSlug = process.env.MANAGER_PRODUCT_SLUG || '';

const fail = message => {
  console.error(message);
  process.exit(1);
};

if (!payloadBase64) fail('MANAGER_PRODUCT_DRAFT_PAYLOAD is required.');
if (!draftId) fail('MANAGER_PRODUCT_DRAFT_ID is required.');

let payload;
try {
  payload = JSON.parse(Buffer.from(payloadBase64, 'base64').toString('utf8'));
} catch (error) {
  fail(`Cannot decode manager product draft payload: ${error instanceof Error ? error.message : String(error)}`);
}

const productSlug = String(payload.productSlug || inputSlug || '').trim();
if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(productSlug)) {
  fail(`Invalid product slug: ${productSlug}`);
}

const requiredTextFields = ['title', 'description', 'category', 'series'];
for (const field of requiredTextFields) {
  if (!String(payload[field] || '').trim()) {
    fail(`Product draft is missing ${field}.`);
  }
}

const productPath = path.join(cwd, 'src', 'content', 'products', `${productSlug}.mdoc`);
let source;
let isNewProduct = false;
try {
  source = await fs.readFile(productPath, 'utf8');
} catch {
  isNewProduct = true;
  source = `---
title: ""
description: ""
offeringType: physical-product
modelStrategy: series
category: ""
series: ""
sortOrder: 9999
published: false
image: ""
galleryImages: []
detailImages: []
applications: []
specs: []
specTables: []
highlights: []
faqs: []
featured: false
---
`;
}

const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---/);
if (!match) {
  fail(`Product file is missing frontmatter: ${productPath}`);
}

const frontmatter = match[1];
const body = source.slice(match[0].length);
const document = YAML.parseDocument(frontmatter);

document.set('title', String(payload.title).trim());
document.set('description', String(payload.description).trim());
document.set('offeringType', normalizeOfferingType(payload.offeringType));
document.set('modelStrategy', normalizeModelStrategy(payload.modelStrategy));
document.set('category', String(payload.category).trim());
document.set('series', String(payload.series).trim());
document.set('sortOrder', Number.isFinite(Number(payload.sortOrder)) ? Math.max(1, Math.round(Number(payload.sortOrder))) : 9999);
document.set('published', payload.published !== false);
document.set('image', String(payload.image || '').trim());
document.set('galleryImages', normalizeStringArray(payload.galleryImages));
document.set('detailImages', normalizeDetailImages(payload.detailImages));
document.set('applications', normalizeStringArray(payload.applications));
document.set('specs', normalizeSpecs(payload.specs));
document.set('specTables', normalizeSpecTables(payload.specTables));
document.set('highlights', normalizeStringArray(payload.highlights));
document.set('faqs', normalizeFaqs(payload.faqs));
document.set('featured', payload.featured === true);

if (isNewProduct) {
  document.set('featured', payload.featured === true);
}

const nextFrontmatter = document.toString({ lineWidth: 0 }).trimEnd();
const nextBody = typeof payload.content === 'string' ? `\n${payload.content.trim()}\n` : body;
const nextSource = `---\n${nextFrontmatter}\n---${nextBody}`;

if (nextSource === source) {
  console.log(`No changes for ${productSlug}.`);
} else {
  await fs.writeFile(productPath, nextSource, 'utf8');
  console.log(`Applied manager product draft ${draftId} to ${productPath}.`);
}

function normalizeSpecs(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map(item => ({
      label: String(item?.label || '').trim(),
      value: String(item?.value || '').trim(),
    }))
    .filter(item => item.label || item.value);
}

function normalizeOfferingType(value) {
  const normalized = String(value || 'physical-product').trim();
  return ['physical-product', 'service', 'solution'].includes(normalized) ? normalized : 'physical-product';
}

function normalizeModelStrategy(value) {
  const normalized = String(value || 'series').trim();
  return ['single-model', 'series', 'configurable', 'not-applicable'].includes(normalized) ? normalized : 'series';
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value.map(item => String(item ?? '').trim()).filter(Boolean);
}

function normalizeDetailImages(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map(item => ({
      image: String(item?.image || '').trim(),
      title: String(item?.title || '').trim(),
      caption: String(item?.caption || '').trim(),
    }))
    .filter(item => item.image || item.title || item.caption);
}

function normalizeFaqs(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map(item => ({
      question: String(item?.question || '').trim(),
      answer: String(item?.answer || '').trim(),
    }))
    .filter(item => item.question || item.answer);
}

function normalizePositiveInteger(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.max(1, Math.round(parsed)) : 1;
}

function normalizeSpecTables(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map(table => ({
      title: String(table?.title || '').trim(),
      columns: Array.isArray(table?.columns) ? table.columns.map(column => String(column ?? '').trim()) : [],
      headerRows: Array.isArray(table?.headerRows)
        ? table.headerRows.map(row => ({
            cells: Array.isArray(row?.cells)
              ? row.cells
                  .map(cell => ({
                    text: String(cell?.text || '').trim(),
                    colspan: normalizePositiveInteger(cell?.colspan),
                    rowspan: normalizePositiveInteger(cell?.rowspan),
                  }))
                  .filter(cell => cell.text)
              : [],
          }))
        : [],
      rows: Array.isArray(table?.rows)
        ? table.rows
            .map(row => (Array.isArray(row) ? row.map(cell => String(cell ?? '').trim()) : []))
            .filter(row => row.length > 0)
        : [],
    }))
    .filter(table => table.title || table.columns.length || table.rows.length);
}
