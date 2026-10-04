import { validateProductRating, validateProductReviews } from './product-reviews.mjs';

export const productOfferingTypes = ['physical-product', 'service', 'solution'];
export const productModelStrategies = ['single-model', 'series', 'configurable', 'not-applicable'];
export const productEditorDefaults = { offeringType: 'physical-product', modelStrategy: 'series' };

export const productEditorFields = [
  { name: 'title', kind: 'text' },
  { name: 'description', kind: 'text' },
  { name: 'category', kind: 'value' },
  { name: 'series', kind: 'text' },
  { name: 'sortOrder', kind: 'number' },
  { name: 'published', kind: 'checkbox' },
  { name: 'image', kind: 'text' },
  { name: 'featured', kind: 'checkbox' },
];

const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const text = value => String(value ?? '').trim();

export const resolveProductEditorPolicy = (settings = {}, product = {}) => {
  const defaults = object(settings);
  const source = object(product);
  const offeringType = source.offeringType ?? defaults.offeringType ?? productEditorDefaults.offeringType;
  const modelStrategy = source.modelStrategy ?? defaults.modelStrategy ?? productEditorDefaults.modelStrategy;
  if (!productOfferingTypes.includes(offeringType)) throw new Error('Invalid owner product type.');
  if (!productModelStrategies.includes(modelStrategy)) throw new Error('Invalid owner model strategy.');
  return { offeringType, modelStrategy };
};

export const enforceProductEditorPolicy = (payload, settings, product) => ({
  ...object(payload),
  ...resolveProductEditorPolicy(settings, product),
});

export const productDraftReviewFields = (payload, enabled) => {
  const result = { ...object(payload) };
  if (!enabled) {
    for (const key of ['reviews', 'aggregateRatingValue', 'aggregateRatingCount']) delete result[key];
  }
  return result;
};

export const retainUneditedProductReviews = (payload, previous) => {
  const result = { ...payload };
  if (previous?.productSlug !== payload.productSlug) return result;
  for (const key of ['reviews', 'aggregateRatingValue', 'aggregateRatingCount']) {
    if (!Object.hasOwn(payload, key) && Object.hasOwn(previous, key)) result[key] = previous[key];
  }
  return result;
};

export const normalizeProductEditorPayload = (value, normalizers) => {
  const body = object(value);
  const productSlug = text(body.productSlug);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(productSlug)) throw new Error('A valid product slug is required.');
  for (const field of ['title', 'description', 'category']) {
    if (!text(body[field])) throw new Error(`Product ${field} is required.`);
  }

  const sortOrder = Number(body.sortOrder);
  const normalized = {
    productSlug,
    title: text(body.title),
    description: text(body.description),
    category: text(body.category),
    series: text(body.series),
    sortOrder: Number.isFinite(sortOrder) ? Math.max(1, Math.round(sortOrder)) : 9999,
    published: body.published !== false,
    image: text(body.image),
    featured: body.featured === true,
    galleryImages: normalizers.normalizeStringArray(body.galleryImages),
    detailImages: normalizers.normalizeDetailImages(body.detailImages),
    applications: normalizers.normalizeStringArray(body.applications),
    specs: normalizers.normalizeSpecs(body.specs),
    specTables: normalizers.normalizeSpecTables(body.specTables),
    highlights: normalizers.normalizeStringArray(body.highlights),
    faqs: normalizers.normalizeFaqs(body.faqs),
  };
  // Missing historical keys remain missing until the owner policy resolves them.
  for (const [key, values] of [['offeringType', productOfferingTypes], ['modelStrategy', productModelStrategies]]) {
    if (Object.hasOwn(body, key)) {
      if (!values.includes(body[key])) throw new Error(`A valid ${key} is required.`);
      normalized[key] = body[key];
    }
  }
  if (Object.hasOwn(body, 'content')) normalized.content = text(body.content);
  if (Object.hasOwn(body, 'reviews')) normalized.reviews = validateProductReviews(body.reviews);
  Object.assign(normalized, validateProductRating(body));
  return normalized;
};
