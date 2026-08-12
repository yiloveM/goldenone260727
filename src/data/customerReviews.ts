import reviewData from './customer-reviews.json';

export interface CustomerReview {
  id: string;
  published: boolean;
  kind: 'verified' | 'demo';
  rating: 4 | 5;
  quote: string;
  source: string;
  sourceUrl: string;
  buyerLabel?: string;
  country?: string;
  date?: string;
  projectType?: string;
  productSlugs?: string[];
  seoEligible?: boolean;
}

const toRating = (value: unknown): 4 | 5 => Number(value) === 4 ? 4 : 5;

export const reviewSystemEnabled = reviewData.enabled === true;

export const customerReviewSummary = {
  rating: Number(reviewData.summary.rating || 0),
  reviewCount: Number(reviewData.summary.reviewCount || 0),
  source: reviewData.summary.source,
  profileUrl: reviewData.summary.profileUrl,
  checkedOn: reviewData.summary.checkedOn,
};

export const customerReviews: CustomerReview[] = reviewData.reviews
  .map(review => ({
    ...review,
    kind: review.kind === 'verified' ? 'verified' as const : 'demo' as const,
    rating: toRating(review.rating),
    productSlugs: Array.isArray(review.productSlugs) ? review.productSlugs : [],
  }))
  .filter(review => review.published === true && review.quote.trim());

export const reviewsForProduct = (slug?: string) => {
  if (!reviewSystemEnabled) return [];
  if (!slug) return customerReviews;
  const matched = customerReviews.filter(review => review.productSlugs?.includes(slug));
  return matched.length > 0 ? matched : customerReviews;
};

export const seoReviewsForProduct = (slug: string) => {
  if (!reviewSystemEnabled) return [];
  return customerReviews.filter(review =>
    review.kind === 'verified' &&
    review.seoEligible === true &&
    review.productSlugs?.includes(slug) &&
    Boolean(review.buyerLabel && review.date && review.sourceUrl)
  );
};
