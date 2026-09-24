import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'parse5';

const visit = function* (node) {
  yield node;
  for (const child of node.childNodes || []) yield* visit(child);
};

const attribute = (node, name) => node?.attrs?.find(item => item.name === name)?.value || '';
const scriptText = node => (node.childNodes || []).map(child => child.value || '').join('');
const visibleText = node => {
  if (node.nodeName === 'script' || node.nodeName === 'style') return '';
  if (node.nodeName === '#text') return node.value || '';
  return (node.childNodes || []).map(visibleText).join(' ');
};
const isAbsoluteUrl = value => {
  try {
    return ['http:', 'https:'].includes(new URL(String(value)).protocol);
  } catch {
    return false;
  }
};
const flatten = (value, context) => {
  if (Array.isArray(value)) return value.flatMap(item => flatten(item, context));
  if (!value || typeof value !== 'object') return [];
  const inheritedContext = value['@context'] || context;
  return value['@graph'] ? flatten(value['@graph'], inheritedContext) : [{ ...value, '@context': inheritedContext }];
};

export const auditJsonLdHtml = (html, label = 'page') => {
  const document = parse(html);
  const nodes = [...visit(document)];
  const body = nodes.find(node => node.nodeName === 'body');
  const bodyText = visibleText(body || document).replace(/\s+/g, ' ');
  const canonical = nodes.find(node => node.nodeName === 'link' && attribute(node, 'rel') === 'canonical');
  const canonicalUrl = canonical ? attribute(canonical, 'href') : '';
  const robots = nodes.find(node => node.nodeName === 'meta' && attribute(node, 'name').toLowerCase() === 'robots');
  const noindex = /(?:^|[\s,])noindex(?:[\s,]|$)/i.test(attribute(robots, 'content'));
  const scripts = nodes.filter(node => node.nodeName === 'script' && attribute(node, 'type').toLowerCase() === 'application/ld+json');
  const errors = [];
  let productCount = 0;
  let ineligibleProducts = 0;
  const ids = new Set();

  for (const [index, script] of scripts.entries()) {
    let roots;
    try {
      roots = flatten(JSON.parse(scriptText(script)));
    } catch (error) {
      errors.push(label + ': JSON-LD script ' + (index + 1) + ' is invalid JSON: ' + error.message);
      continue;
    }
    for (const node of roots) {
      const type = node['@type'];
      const types = Array.isArray(type) ? type : [type];
      if (!['https://schema.org', 'https://schema.org/'].includes(node['@context'])) {
        errors.push(label + ': ' + (type || 'unknown') + ' has no Schema.org context');
      }
      if (!types.every(item => typeof item === 'string' && item)) {
        errors.push(label + ': JSON-LD node has no valid @type');
        continue;
      }
      if (node['@id']) {
        if (ids.has(node['@id'])) errors.push(label + ': duplicate JSON-LD @id ' + node['@id']);
        ids.add(node['@id']);
      }
      if (node.url && !isAbsoluteUrl(node.url)) errors.push(label + ': ' + type + ' has a non-absolute URL');
      if (!noindex && types.some(item => item === 'WebPage' || item === 'CollectionPage') && canonicalUrl && node.url !== canonicalUrl) {
        errors.push(label + ': page URL differs from canonical');
      }
      if (types.some(item => ['Product', 'ProductGroup', 'Service', 'Organization', 'WebSite', 'WebPage', 'CollectionPage'].includes(item))
        && !String(node.name || '').trim()) {
        errors.push(label + ': ' + type + ' is missing its name');
      }
      if (types.includes('Article') && !String(node.headline || '').trim()) {
        errors.push(label + ': Article is missing its headline');
      }
      if (types.includes('BreadcrumbList') && !Array.isArray(node.itemListElement)) {
        errors.push(label + ': BreadcrumbList has no list items');
      }
      if (!types.some(item => item === 'Product' || item === 'ProductGroup')) continue;

      productCount += 1;
      const offers = node.offers ? (Array.isArray(node.offers) ? node.offers : [node.offers]) : [];
      const rating = node.aggregateRating;
      const reviews = node.review ? (Array.isArray(node.review) ? node.review : [node.review]) : [];
      if (!offers.length && !rating && !reviews.length) ineligibleProducts += 1;
      for (const offer of offers) {
        const price = Number(offer.price ?? offer.priceSpecification?.price);
        const currency = offer.priceCurrency ?? offer.priceSpecification?.priceCurrency;
        if (!Number.isFinite(price) || price < 0) errors.push(label + ': Product Offer has no valid price');
        if (!/^[A-Z]{3}$/.test(String(currency || ''))) errors.push(label + ': Product Offer has no valid currency');
        if (Number.isFinite(price) && !bodyText.includes(String(price))) {
          errors.push(label + ': Product Offer price is not visible in page text');
        }
      }
      if (rating) {
        const value = Number(rating.ratingValue);
        const count = Number(rating.ratingCount ?? rating.reviewCount);
        if (!(value >= 1 && value <= 5 && Number.isInteger(count) && count > 0)) {
          errors.push(label + ': Product AggregateRating has invalid value or count');
        }
        if (!bodyText.includes(String(rating.ratingValue)) || !bodyText.includes(String(count))) {
          errors.push(label + ': Product AggregateRating is not visible in page text');
        }
      }
    }
  }
  return { errors, scriptCount: scripts.length, productCount, ineligibleProducts };
};

const htmlFiles = async directory => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async entry => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return htmlFiles(fullPath);
    return entry.isFile() && entry.name.endsWith('.html') ? [fullPath] : [];
  }));
  return files.flat();
};

export const auditJsonLdBuild = async root => {
  const files = await htmlFiles(root);
  if (!files.length) throw new Error('No built HTML files found in ' + root);
  const totals = { files: files.length, scripts: 0, products: 0, ineligibleProducts: 0, errors: [] };
  for (const file of files) {
    const result = auditJsonLdHtml(await readFile(file, 'utf8'), path.relative(root, file));
    totals.scripts += result.scriptCount;
    totals.products += result.productCount;
    totals.ineligibleProducts += result.ineligibleProducts;
    totals.errors.push(...result.errors);
  }
  return totals;
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(process.argv[2] || 'dist/client');
  try {
    const result = await auditJsonLdBuild(root);
    for (const error of result.errors) console.error(error);
    console.log('JSON-LD audit: ' + result.files + ' HTML files, ' + result.scripts + ' scripts, ' + result.products + ' Product nodes, ' + result.ineligibleProducts + ' without rich-result inputs, ' + result.errors.length + ' errors.');
    if (result.errors.length) process.exitCode = 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
