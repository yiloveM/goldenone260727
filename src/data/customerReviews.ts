export interface CustomerReview {
  id: string;
  rating: 4 | 5;
  quote: string;
  source: 'Alibaba.com';
  sourceUrl: string;
  buyerLabel?: string;
  country?: string;
  date?: string;
  projectType?: string;
  productSlugs?: string[];
  seoEligible?: boolean;
}

export const customerReviewSummary = {
  rating: 4.9,
  reviewCount: 240,
  source: 'Alibaba.com',
  profileUrl: 'https://goldenone.en.alibaba.com/company_profile/feedback.html',
  checkedOn: '2026-08-12',
};

/**
 * Add only verbatim, traceable Alibaba buyer feedback here. The public Alibaba
 * page loads review text dynamically, so no buyer quote is committed until its
 * wording and source URL have been checked against an order or review page.
 * See README.md -> Customer review system for the maintenance walkthrough.
 */
export const customerReviews: CustomerReview[] = [];

export const reviewsForProduct = (slug?: string) => {
  if (!slug) return customerReviews;
  const matched = customerReviews.filter(review => review.productSlugs?.includes(slug));
  return matched.length > 0 ? matched : customerReviews;
};

export const seoReviewsForProduct = (slug: string) =>
  customerReviews.filter(review =>
    review.seoEligible === true &&
    review.productSlugs?.includes(slug) &&
    Boolean(review.buyerLabel && review.date && review.sourceUrl)
  );
