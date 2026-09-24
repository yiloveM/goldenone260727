import test from 'node:test';
import assert from 'node:assert/strict';
import { serializeJsonLd } from '../src/lib/json-ld.mjs';
import { auditJsonLdHtml } from './audit-jsonld.mjs';

const page = (schema, body = '', head = '') =>
  '<html><head><link rel="canonical" href="https://example.com/product">' + head + '</head><body>' +
  body + '<script type="application/ld+json">' + schema + '</script></body></html>';

test('JSON-LD serialization blocks script breakout and preserves content', () => {
  const value = { '@context': 'https://schema.org', '@type': 'Product', name: "</script><script>alert('x')</script> &" };
  const serialized = serializeJsonLd(value);
  assert.equal(serialized.includes('<'), false);
  assert.deepEqual(JSON.parse(serialized), value);
  assert.equal(auditJsonLdHtml(page(serialized, value.name)).errors.length, 0);
});

test('malformed JSON-LD fails the generated-page audit', () => {
  assert.match(auditJsonLdHtml(page('{bad json')).errors[0], /invalid JSON/);
});

test('a quote-only Product is reported as ineligible without failing the build', () => {
  const result = auditJsonLdHtml(page(serializeJsonLd({
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: 'Sample product',
    url: 'https://example.com/product',
  })));
  assert.equal(result.ineligibleProducts, 1);
  assert.deepEqual(result.errors, []);
});

test('Offer and rating facts must be visible in page text', () => {
  const schema = serializeJsonLd({
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: 'Sample product',
    offers: { '@type': 'Offer', price: 12.5, priceCurrency: 'USD' },
    aggregateRating: { '@type': 'AggregateRating', ratingValue: 4.8, ratingCount: 12 },
  });
  assert.equal(auditJsonLdHtml(page(schema, 'USD 12.5, rated 4.8 by 12 buyers')).errors.length, 0);
  assert.equal(auditJsonLdHtml(page(schema)).errors.length, 2);
});

test('duplicate page identifiers are rejected while graph nodes inherit context', () => {
  const graph = serializeJsonLd({ '@context': 'https://schema.org', '@graph': [
    { '@type': 'WebPage', '@id': 'https://example.com/product#page', name: 'Page', url: 'https://example.com/product' },
    { '@type': 'CollectionPage', '@id': 'https://example.com/product#page', name: 'Collection', url: 'https://example.com/product' },
  ] });
  const result = auditJsonLdHtml(page(graph));
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /duplicate JSON-LD @id/);
});

test('canonical mismatch is ignored only for explicitly noindex pages', () => {
  const schema = serializeJsonLd({
    '@context': 'https://schema.org', '@type': 'CollectionPage',
    name: 'Unpublished translation', url: 'https://example.com/fr/product',
  });
  assert.match(auditJsonLdHtml(page(schema)).errors[0], /page URL differs from canonical/);
  assert.deepEqual(auditJsonLdHtml(page(schema, '', '<meta name="robots" content="noindex, nofollow">')).errors, []);
});
