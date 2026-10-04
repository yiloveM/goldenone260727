import reviewData from './customer-reviews.json';
import {
  normalizeReviewRecords,
  productReviewSummary,
  publicReviewUrl,
  resolveProductReviews,
  validRating,
  visibleReviewRecords,
} from '../lib/product-reviews.mjs';

export interface CustomerReview {
  id: string;
  published: boolean;
  rating: number;
  quote: string;
  source: string;
  sourceUrl: string;
  buyerLabel: string;
  country: string;
  date: string;
  projectType: string;
  productSlugs: string[];
}

interface CustomerReviewData {
  enabled?: boolean;
  summary?: {
    rating?: unknown;
    reviewCount?: unknown;
    source?: unknown;
    profileUrl?: unknown;
  };
  reviews?: unknown[];
}

const customerReviewData = reviewData as CustomerReviewData;
const rawSummary = customerReviewData.summary ?? {};

export const reviewSystemEnabled = customerReviewData.enabled === true;

export const allCustomerReviews: CustomerReview[] = normalizeReviewRecords(customerReviewData.reviews);
export const customerReviews: CustomerReview[] = visibleReviewRecords(allCustomerReviews)
  .filter(review => !review.productSlugs.length);
const configuredCount = Number(rawSummary.reviewCount);

export const customerReviewSummary = {
  rating: validRating(rawSummary.rating) ? Number(rawSummary.rating) : 0,
  reviewCount: Number.isInteger(configuredCount) && configuredCount >= 0 ? configuredCount : customerReviews.length,
  source: String(rawSummary.source || ''),
  profileUrl: publicReviewUrl(rawSummary.profileUrl),
};

export const reviewsForProduct = (slug?: string, productReviews?: unknown): CustomerReview[] => {
  if (!reviewSystemEnabled) return [];
  if (!slug) return customerReviews;
  return resolveProductReviews(slug, productReviews, allCustomerReviews);
};

export const seoReviewsForProduct = (slug: string, productReviews?: unknown) =>
  reviewsForProduct(slug, productReviews).filter(review => review.buyerLabel);

export const reviewSummaryForProduct = (slug: string, productReviews?: unknown, rating?: unknown, count?: unknown) =>
  reviewSystemEnabled
    ? productReviewSummary(reviewsForProduct(slug, productReviews), rating, count)
    : { rating: 0, reviewCount: 0 };
