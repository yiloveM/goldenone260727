const text = value => String(value ?? '').trim();
const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};

export const validRating = value => {
  if (!['number', 'string'].includes(typeof value) || text(value) === '') return false;
  const rating = Number(value);
  return Number.isFinite(rating) && rating >= 1 && rating <= 5;
};

export const validReviewDate = value => {
  const date = text(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
};

export const publicReviewUrl = value => {
  try {
    const url = new URL(text(value));
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
};

const reviewId = (review, index) => {
  let hash = 2166136261;
  for (const character of `${review.buyerLabel}|${review.quote}|${review.date}|${index}`) {
    hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  }
  return `review-${(hash >>> 0).toString(36)}`;
};

export const normalizeReviewRecords = value => (Array.isArray(value) ? value : []).map((item, index) => {
  const input = object(item);
  const review = {
    ...input,
    published: input.published !== false,
    rating: validRating(input.rating) && Number.isInteger(Number(input.rating)) ? Number(input.rating) : 0,
    quote: text(input.quote),
    buyerLabel: text(input.buyerLabel),
    date: text(input.date),
    country: text(input.country),
    projectType: text(input.projectType),
    source: text(input.source),
    sourceUrl: publicReviewUrl(input.sourceUrl),
    productSlugs: Array.isArray(input.productSlugs) ? input.productSlugs.map(text).filter(Boolean) : [],
  };
  return { ...review, id: text(input.id) || reviewId(review, index) };
});

export const validateReviewInput = value => {
  const input = object(value);
  if (!validRating(input.rating) || !Number.isInteger(Number(input.rating))) {
    throw new Error('Review rating must be a whole number from 1 to 5.');
  }
  if (!text(input.buyerLabel)) throw new Error('Reviewer name is required.');
  if (!text(input.quote)) throw new Error('Review text is required.');
  if (text(input.date) && !validReviewDate(input.date)) throw new Error('Review date must use a valid YYYY-MM-DD date.');
  return {
    ...input,
    published: input.published !== false,
    rating: String(Number(input.rating)),
    buyerLabel: text(input.buyerLabel),
    quote: text(input.quote),
    date: text(input.date),
  };
};

export const validateProductReviews = value => {
  if (!Array.isArray(value)) throw new Error('Product reviews must be a list.');
  return value.map(validateReviewInput);
};

export const validateProductRating = value => {
  const input = object(value);
  const result = {};
  if (Object.hasOwn(input, 'aggregateRatingValue')) {
    const rating = text(input.aggregateRatingValue);
    if (rating && !validRating(rating)) throw new Error('Product rating must be between 1 and 5.');
    result.aggregateRatingValue = rating;
  }
  if (Object.hasOwn(input, 'aggregateRatingCount')) {
    const count = Number(input.aggregateRatingCount);
    if (!Number.isInteger(count) || count < 0) throw new Error('Product rating count must be a non-negative whole number.');
    result.aggregateRatingCount = count;
  }
  return result;
};

export const visibleReviewRecords = value => normalizeReviewRecords(value)
  .filter(review => review.published && review.quote && validRating(review.rating));

// An explicit empty product list means the editor removed the product's reviews.
export const storedProductReviews = (slug, productReviews, legacyReviews = []) =>
  productReviews === undefined
    ? normalizeReviewRecords(legacyReviews).filter(review => review.productSlugs.includes(slug))
    : normalizeReviewRecords(productReviews);

export const resolveProductReviews = (slug, productReviews, legacyReviews = []) =>
  visibleReviewRecords(storedProductReviews(slug, productReviews, legacyReviews));

export const productReviewSummary = (reviews, rating, count) => {
  const records = visibleReviewRecords(reviews);
  const configuredCount = Number(count);
  if (validRating(rating) && Number.isInteger(configuredCount) && configuredCount > 0) {
    return { rating: Number(rating), reviewCount: configuredCount };
  }
  return {
    rating: records.length ? Number((records.reduce((sum, review) => sum + review.rating, 0) / records.length).toFixed(2)) : 0,
    reviewCount: records.length,
  };
};

export const productReviewStructuredData = (enabled, reviews, rating, count) => {
  if (!enabled) return {};
  const records = visibleReviewRecords(reviews);
  const eligible = records.filter(review => review.buyerLabel);
  const summary = productReviewSummary(records, rating, count);
  return {
    ...(eligible.length ? {
      review: eligible.map(review => ({
        '@type': 'Review',
        reviewBody: review.quote,
        author: { '@type': 'Person', name: review.buyerLabel },
        reviewRating: { '@type': 'Rating', ratingValue: review.rating, bestRating: 5, worstRating: 1 },
        ...(validReviewDate(review.date) ? { datePublished: review.date } : {}),
      })),
    } : {}),
    ...(summary.rating && summary.reviewCount ? {
      aggregateRating: {
        '@type': 'AggregateRating',
        ratingValue: summary.rating,
        ratingCount: summary.reviewCount,
        bestRating: 5,
        worstRating: 1,
      },
    } : {}),
  };
};
