import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { normalizeReviewRecords, validateReviewInput } from '../src/lib/product-reviews.mjs';

const file = path.join(process.cwd(), 'src', 'data', 'customer-reviews.json');
const encoded = String(process.env.MANAGER_REVIEW_DRAFT_PAYLOAD || '').trim();
const expectedId = String(process.env.MANAGER_REVIEW_ID || '').trim();
if (!encoded) throw new Error('MANAGER_REVIEW_DRAFT_PAYLOAD is required.');

const payload = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
if (payload.id !== expectedId) throw new Error('Review ID does not match the workflow input.');
if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(payload.id)) throw new Error('Invalid review ID.');

const data = JSON.parse(await readFile(file, 'utf8'));
data.reviews = Array.isArray(data.reviews) ? data.reviews : [];
const normalized = normalizeReviewRecords(data.reviews);
data.reviews = data.reviews.map((review, index) => ({ ...review, id: normalized[index].id }));
const index = data.reviews.findIndex(review => review.id === payload.id);
if (payload.operation === 'delete') {
  if (index >= 0) data.reviews.splice(index, 1);
} else {
  const { operation: _operation, ...review } = validateReviewInput(payload);
  if (index >= 0) data.reviews[index] = { ...data.reviews[index], ...review };
  else data.reviews.push(review);
}
await writeFile(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
