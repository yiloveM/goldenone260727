import { fields } from '@keystatic/core';

export const reviewFieldVisibility = <T extends { kind: string }>(field: T, enabled: boolean): T =>
  enabled ? field : { ...field, Input: () => null };

export const reviewFields = (required = true) => fields.object({
  buyerLabel: fields.text({ label: '评价人', validation: { isRequired: required } }),
  rating: fields.select({
    label: '星级',
    options: [5, 4, 3, 2, 1].map(value => ({ label: `${value} 星`, value: String(value) })),
    defaultValue: '5',
  }),
  quote: fields.text({ label: '评价内容', multiline: true, validation: { isRequired: required } }),
  date: fields.text({ label: '评价日期（选填）', description: 'YYYY-MM-DD' }),
  published: fields.checkbox({ label: '显示该评价', defaultValue: true }),
  // Keep legacy data round-trippable without exposing old workflow fields.
  id: reviewFieldVisibility(fields.text({ label: 'Internal ID' }), false),
  kind: reviewFieldVisibility(fields.text({ label: 'Legacy kind' }), false),
  seoEligible: reviewFieldVisibility(fields.checkbox({ label: 'Legacy flag' }), false),
  source: reviewFieldVisibility(fields.text({ label: 'Legacy source' }), false),
  sourceUrl: reviewFieldVisibility(fields.text({ label: 'Legacy source URL' }), false),
  country: reviewFieldVisibility(fields.text({ label: 'Legacy country' }), false),
  projectType: reviewFieldVisibility(fields.text({ label: 'Legacy project' }), false),
  productSlugs: reviewFieldVisibility(fields.array(fields.text({ label: 'Legacy product' }), { label: 'Legacy associations' }), false),
});

export const productReviewFields = (enabled: boolean) => reviewFieldVisibility(
  fields.array(reviewFields(enabled), {
    label: '产品评价',
    itemLabel: props => props.fields.buyerLabel.value || '评价',
  }),
  enabled,
);
