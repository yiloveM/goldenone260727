import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const file = path.join(root, 'src', 'data', 'customer-reviews.json');
const encoded = String(process.env.MANAGER_REVIEW_DRAFT_PAYLOAD || '').trim();
const expectedId = String(process.env.MANAGER_REVIEW_ID || '').trim();
if (!encoded) throw new Error('MANAGER_REVIEW_DRAFT_PAYLOAD is required.');

const payload = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
if (payload.id !== expectedId) throw new Error('Review ID does not match the workflow input.');
if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(payload.id)) throw new Error('Invalid review ID.');
if (payload.seoEligible && (payload.kind !== 'verified' || !payload.date || !payload.sourceUrl || !payload.productSlugs?.length)) {
  throw new Error('SEO reviews must be verified and include date, source URL, and product slugs.');
}

const data = JSON.parse(await readFile(file, 'utf8'));
const index = data.reviews.findIndex(review => review.id === payload.id);
if (payload.operation === 'delete') {
  if (index >= 0) data.reviews.splice(index, 1);
} else {
  const { operation: _operation, ...review } = payload;
  if (index >= 0) data.reviews[index] = review;
  else data.reviews.push(review);
}
await writeFile(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
