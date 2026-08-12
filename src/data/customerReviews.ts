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

interface CustomerReviewData {
  enabled?: boolean;
  summary?: {
    rating?: unknown;
    source?: unknown;
    profileUrl?: unknown;
    checkedOn?: unknown;
  };
  reviews?: Array<{
    id?: unknown;
    published?: boolean;
    kind?: unknown;
    rating?: unknown;
    quote?: unknown;
    source?: unknown;
    sourceUrl?: unknown;
    buyerLabel?: unknown;
    country?: unknown;
    date?: unknown;
    projectType?: unknown;
    productSlugs?: unknown;
    seoEligible?: boolean;
  }>;
}

const customerReviewData = reviewData as CustomerReviewData;
const rawReviews = Array.isArray(customerReviewData.reviews) ? customerReviewData.reviews : [];
const rawSummary = customerReviewData.summary ?? {};

export const reviewSystemEnabled = customerReviewData.enabled === true;

export const customerReviews: CustomerReview[] = rawReviews
  .map(review => ({
    id: String(review.id || ''),
    published: review.published === true,
    kind: review.kind === 'verified' ? 'verified' as const : 'demo' as const,
    rating: toRating(review.rating),
    quote: String(review.quote || ''),
    source: String(review.source || ''),
    sourceUrl: String(review.sourceUrl || ''),
    buyerLabel: typeof review.buyerLabel === 'string' ? review.buyerLabel : undefined,
    country: typeof review.country === 'string' ? review.country : undefined,
    date: typeof review.date === 'string' ? review.date : undefined,
    projectType: typeof review.projectType === 'string' ? review.projectType : undefined,
    productSlugs: Array.isArray(review.productSlugs)
      ? review.productSlugs.filter((slug): slug is string => typeof slug === 'string')
      : [],
    seoEligible: review.seoEligible === true,
  }))
  .filter(review => review.published === true && review.quote.trim());

export const customerReviewSummary = {
  rating: Number(rawSummary.rating || 0),
  reviewCount: rawReviews.length,
  source: String(rawSummary.source || ''),
  profileUrl: String(rawSummary.profileUrl || ''),
  checkedOn: String(rawSummary.checkedOn || ''),
};

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
