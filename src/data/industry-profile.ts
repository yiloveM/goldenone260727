import profile from './industry-profile.json';

export type IndustryProfile = typeof profile;

const clean = (value: unknown) => String(value || '').trim();
const list = (value: unknown) =>
  Array.isArray(value) ? value.map(item => clean(item)).filter(Boolean) : [];

const isHexColor = (value: string) => /^#[0-9a-f]{6}$/i.test(value);
const color = (value: unknown, fallback: string) => {
  const candidate = clean(value);
  return isHexColor(candidate) ? candidate : fallback;
};

export const industryProfile = profile as IndustryProfile;
export const isTemplateProfile = industryProfile.lifecycle === 'template';
export const coreKeywords = list(industryProfile.seo.coreKeywords);
export const longTailKeywords = list(industryProfile.seo.longTailKeywords);
export const entityTopics = list(industryProfile.seo.entityTopics);
export const primaryKeyword = coreKeywords[0] || clean(industryProfile.market.industry) || 'specialist B2B solutions';
export const industryName = clean(industryProfile.market.industry) || 'Your industry';

export const visualTokens = {
  accent: color(industryProfile.visual.accentColor, '#0f766e'),
  accentStrong: color(industryProfile.visual.accentColorStrong, '#075985'),
  accentSoft: color(industryProfile.visual.accentColorSoft, '#ccfbf1'),
};

export const publicSiteCopy = {
  heroEyebrow: `${industryName} / International B2B`,
  heroTitle: `${primaryKeyword} for buyers who need confidence before they specify.`,
  heroDescription: clean(industryProfile.brand.description) || clean(industryProfile.market.positioning),
  positioning: clean(industryProfile.market.positioning) || 'A trusted specialist partner for international B2B buyers.',
  catalogDescription: `Explore ${industryName.toLowerCase()} offerings with buyer-facing detail, applications, and quotation support.`,
  insightDescription: `Practical guidance for evaluating, specifying, and operating ${industryName.toLowerCase()} solutions.`,
};

export const profileKeywords = (extra: string[] = []) =>
  Array.from(new Set([...coreKeywords, ...longTailKeywords, ...entityTopics, ...extra].map(item => clean(item)).filter(Boolean)));
