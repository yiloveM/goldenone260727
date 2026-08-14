import type { CollectionEntry } from 'astro:content';
import { getCategoryMeta, slugifyCategory, type ProductCategory, type ProductCategoryMeta } from './productCategories';
import { publicProductSpecs } from './productSpecs';
import { productStructuredData, articleStructuredData, absoluteUrl, siteUrl, type JsonLd } from './seo';
import { faqs as publicFaqs, siteInfo } from './site';
import { industryProfile, primaryKeyword, publicSiteCopy } from './industry-profile';
import siteLocaleConfig from './site-locales.json';
import siteLanguageSettings from './site-language-settings.json';

export const supportedLocales = ['en', 'zh', 'ar', 'hi', 'es', 'fr', 'bn', 'pt', 'ru', 'ur', 'de', 'tr', 'fil', 'ko', 'uz'] as const;
export type Locale = (typeof supportedLocales)[number];
export const defaultLocale: Locale = 'en';

export const localeMeta: Record<
  Locale,
  {
    label: string;
    shortLabel: string;
    htmlLang: string;
    dir: 'ltr' | 'rtl';
    ogLocale: string;
    flag: string;
    countryCode: string;
    regionName: string;
  }
> = {
  en: { label: 'English', shortLabel: 'EN', htmlLang: 'en', dir: 'ltr', ogLocale: 'en_US', flag: 'US', countryCode: 'US', regionName: 'United States' },
  zh: { label: 'Simplified Chinese', shortLabel: 'ZH', htmlLang: 'zh-CN', dir: 'ltr', ogLocale: 'zh_CN', flag: 'CN', countryCode: 'CN', regionName: 'China' },
  ar: { label: 'Arabic', shortLabel: 'AR', htmlLang: 'ar', dir: 'rtl', ogLocale: 'ar_AR', flag: 'SA', countryCode: 'SA', regionName: 'Arabic' },
  hi: { label: 'Hindi', shortLabel: 'HI', htmlLang: 'hi', dir: 'ltr', ogLocale: 'hi_IN', flag: 'IN', countryCode: 'IN', regionName: 'India' },
  es: { label: 'Español', shortLabel: 'ES', htmlLang: 'es', dir: 'ltr', ogLocale: 'es_ES', flag: 'ES', countryCode: 'ES', regionName: 'Spain' },
  fr: { label: 'French', shortLabel: 'FR', htmlLang: 'fr', dir: 'ltr', ogLocale: 'fr_FR', flag: 'FR', countryCode: 'FR', regionName: 'France' },
  bn: { label: 'Bengali', shortLabel: 'BN', htmlLang: 'bn', dir: 'ltr', ogLocale: 'bn_BD', flag: 'BD', countryCode: 'BD', regionName: 'Bangladesh' },
  pt: { label: 'Portuguese', shortLabel: 'PT', htmlLang: 'pt-BR', dir: 'ltr', ogLocale: 'pt_BR', flag: 'BR', countryCode: 'BR', regionName: 'Brazil' },
  ru: { label: 'Russian', shortLabel: 'RU', htmlLang: 'ru', dir: 'ltr', ogLocale: 'ru_RU', flag: 'RU', countryCode: 'RU', regionName: 'Russia' },
  ur: { label: 'Urdu', shortLabel: 'UR', htmlLang: 'ur', dir: 'rtl', ogLocale: 'ur_PK', flag: 'PK', countryCode: 'PK', regionName: 'Pakistan' },
  de: { label: 'German', shortLabel: 'DE', htmlLang: 'de', dir: 'ltr', ogLocale: 'de_DE', flag: 'DE', countryCode: 'DE', regionName: 'Germany' },
  tr: { label: 'Turkish', shortLabel: 'TR', htmlLang: 'tr', dir: 'ltr', ogLocale: 'tr_TR', flag: 'TR', countryCode: 'TR', regionName: 'Turkey' },
  fil: { label: 'Filipino', shortLabel: 'FIL', htmlLang: 'fil', dir: 'ltr', ogLocale: 'fil_PH', flag: 'PH', countryCode: 'PH', regionName: 'Philippines' },
  ko: { label: 'Korean', shortLabel: 'KO', htmlLang: 'ko', dir: 'ltr', ogLocale: 'ko_KR', flag: 'KR', countryCode: 'KR', regionName: 'Korea' },
  uz: { label: 'Uzbek', shortLabel: 'UZ', htmlLang: 'uz', dir: 'ltr', ogLocale: 'uz_UZ', flag: 'UZ', countryCode: 'UZ', regionName: 'Uzbekistan' },
};

export const isSupportedLocale = (value: string | undefined): value is Locale =>
  Boolean(value && supportedLocales.includes(value as Locale));

type SiteLocaleEntry = {
  approved?: boolean;
  phrases?: Record<string, string>;
  faqs?: Array<{ question: string; answer: string }>;
};

const siteLocaleEntries = (siteLocaleConfig.locales || {}) as Record<string, SiteLocaleEntry>;
const enabledLocaleFlags = siteLanguageSettings.enabledLocales as Record<string, boolean>;
const requiredPhraseKeys = siteLocaleConfig.requiredPhraseKeys || [];
const requiredFaqCount = Number(siteLocaleConfig.requiredFaqCount || 0);

export const selectedTargetLocales = supportedLocales.filter(
  (locale): locale is Exclude<Locale, 'en'> => locale !== defaultLocale && enabledLocaleFlags[locale] === true
);

export const isStaticLocaleReady = (locale: Locale) => {
  if (locale === defaultLocale) return true;
  const entry = siteLocaleEntries[locale];
  if (!entry || entry.approved !== true) return false;
  if (requiredPhraseKeys.some(key => !entry.phrases?.[key]?.trim())) return false;
  return Array.isArray(entry.faqs)
    && entry.faqs.length === requiredFaqCount
    && entry.faqs.every(item => item?.question?.trim() && item?.answer?.trim());
};

export const publicTargetLocales = selectedTargetLocales.filter(isStaticLocaleReady);
export const locales: readonly Locale[] = [
  defaultLocale,
  ...publicTargetLocales,
];
export const isActiveLocale = (value: string | undefined): value is Locale =>
  Boolean(value && locales.includes(value as Locale));
export const targetLocaleOptions = selectedTargetLocales.map(locale => ({
  value: locale,
  label: localeMeta[locale].label,
  publicReady: publicTargetLocales.includes(locale),
}));

export const isLocale = (value: string | undefined): value is Locale =>
  isSupportedLocale(value);

export const getLocaleFromPathname = (pathname: string): Locale => {
  const firstSegment = pathname.split('/').filter(Boolean)[0];
  return isLocale(firstSegment) ? firstSegment : defaultLocale;
};

export const stripLocaleFromPath = (path: string) => {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  const parts = normalized.split('/').filter(Boolean);
  if (isLocale(parts[0])) parts.shift();
  const clean = `/${parts.join('/')}`;
  return clean === '/' ? '/' : `${clean.replace(/\/+$/, '')}/`;
};

export const localizePath = (path: string, locale: Locale = defaultLocale) => {
  const clean = stripLocaleFromPath(path);
  if (locale === defaultLocale) return clean;
  return clean === '/' ? `/${locale}/` : `/${locale}${clean}`;
};

export const productPath = (slug: string, locale: Locale = defaultLocale) => localizePath(`/products/${slug}/`, locale);
export const categoryPath = (categoryNameOrSlug: string, locale: Locale = defaultLocale) =>
  localizePath(`/products/category/${slugifyCategory(categoryNameOrSlug)}/`, locale);
export const blogPath = (slug: string, locale: Locale = defaultLocale) => localizePath(`/blog/${slug}/`, locale);

export const alternateUrls = (pathname: string, site?: URL | string | null) => {
  const base = siteUrl(site);
  const urls = Object.fromEntries(locales.map(locale => [locale, new URL(localizePath(pathname, locale), base).toString()]));
  return {
    ...(urls as Record<Locale, string>),
    xDefault: new URL(localizePath(pathname, 'en'), base).toString(),
  };
};

const localizedPhrase = (locale: Locale, key: string, fallback: string) => {
  if (locale === defaultLocale) return fallback;
  const translated = siteLocaleEntries[locale]?.phrases?.[key];
  return typeof translated === 'string' && translated.trim() ? translated.trim() : fallback;
};

const localizeObject = <T>(value: T, locale: Locale, path: string): T => {
  if (typeof value === 'string') return localizedPhrase(locale, path, value) as T;
  if (Array.isArray(value)) return value.map((item, index) => localizeObject(item, locale, `${path}.${index}`)) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, localizeObject(item, locale, `${path}.${key}`)])
    ) as T;
  }
  return value;
};

const baseUi = {
  siteTagline: siteInfo.tagline,
  nav: {
    products: 'Products',
    engineeringNotes: 'Insights',
    faq: 'FAQ',
    about: 'About',
    contact: 'Contact',
    viewAll: 'View all',
    toggleMenu: 'Toggle menu',
    language: 'Language',
  },
  footer: {
    productWorlds: 'Offerings',
    explore: 'Explore',
    company: 'Company',
    allProducts: 'All products',
    sitemap: 'Sitemap',
    whatsappInquiry: 'WhatsApp inquiry',
    contactStrip: publicSiteCopy.positioning,
    copyright: 'All rights reserved.',
    clearPools: `International ${industryProfile.market.industry} information for B2B buyers.`,
  },
  sideContact: {
    label: 'Quick contact sidebar',
    whatsapp: 'WhatsApp',
    whatsappNote: 'Fast inquiry chat',
    inquiry: 'Inquiry',
    inquiryNote: 'Send request',
    call: 'Call',
  },
  common: {
    sharePage: 'Share page',
    shareProduct: 'Share product',
    shareCategory: 'Share category',
    dragSwipe: 'Drag / swipe to browse',
    dragTable: 'Drag / scroll to view full table',
    requestQuote: 'Request quote',
    exploreRange: 'Explore all offerings',
    requestFactoryQuote: 'Request a Quote',
    exploreProducts: 'Explore Products',
    backToTop: 'Back to top',
  },
  inquiryCart: {
    cartTitle: 'Inquiry cart',
    cartEmpty: 'No products selected yet.',
    allModels: 'All models',
    model: 'Model',
    quantity: 'Quantity',
    add: 'Add to inquiry',
    inquire: 'Inquire',
    clear: 'Clear',
    remove: 'Remove',
    decrease: 'Decrease quantity',
    increase: 'Increase quantity',
    selectedProducts: 'Products in this inquiry',
    review: 'Review the selected products, models, and quantities before sending.',
  },
};

export const ui: Record<Locale, typeof baseUi> = Object.fromEntries(
  supportedLocales.map(locale => [locale, localizeObject(baseUi, locale, 'ui')])
) as Record<Locale, typeof baseUi>;

const basePages = {
  home: {
    eyebrow: publicSiteCopy.heroEyebrow,
    title: publicSiteCopy.heroTitle,
    description: publicSiteCopy.heroDescription,
    metric1: 'Artwork and form',
    metric2: 'Finish and relief',
    metric3: 'Hardware and packaging',
    heroImageAlt: 'Custom lapel pins, challenge coins, medals, and keychains in a metal gift collection',
    heroIndexLabel: 'Custom product directions',
    heroFooterLeft: 'Custom metal gifts for international buyers',
    heroFooterRight: 'Artwork / finish / attachment / packaging',
    hotEyebrow: 'Built for specification',
    hotTitle: 'Turn a creative direction into a quotation-ready brief',
    hotDescription: publicSiteCopy.positioning,
    categoriesEyebrow: 'Product worlds',
    categoriesTitle: 'Custom metal gifts, organized by format.',
    categoriesDescription: 'Compare the object first, then define the artwork, dimensions, finish, attachment, and presentation required for your program.',
    featureEyebrow: 'Finish direction',
    featureTitle: 'Surface, relief, and color make the object legible.',
    featureDescription: 'Use finish references to align the intended visual character before final artwork, commercial terms, or production details are confirmed.',
    equipmentEyebrow: 'Published range',
    equipmentTitle: `${primaryKeyword} and related custom formats`,
    partnersEyebrow: 'Quote-ready brief',
    partnersTitle: 'Define the object before the quotation.',
    partnersDescription: publicSiteCopy.positioning,
    partnershipCaption: 'Custom project planning',
    briefStep1: 'Artwork and intent',
    briefStep1Description: 'Share the artwork, reference, event, campaign, or intended use.',
    briefStep2: 'Object specification',
    briefStep2Description: 'Define dimensions, thickness, relief, material, and front or reverse treatment.',
    briefStep3: 'Finish and attachment',
    briefStep3Description: 'Select color direction, plating, backing, ribbon, ring, chain, or leather construction.',
    briefStep4: 'Commercial context',
    briefStep4Description: 'Add quantity, packaging, destination, and target timing for a relevant response.',
    finishTabLabel: 'Finish directions',
    finishPolished: 'Polished',
    finishPolishedDescription: 'A reflective direction that emphasizes crisp edges, raised areas, and high-contrast presentation.',
    finishMatte: 'Matte',
    finishMatteDescription: 'A restrained, low-reflection surface direction suited to quieter graphics and contemporary programs.',
    finishAntique: 'Antique',
    finishAntiqueDescription: 'A recessed-darkening direction that can make relief, borders, and sculpted details easier to read.',
    finishDark: 'Dark metal',
    finishDarkDescription: 'A deep metallic direction for monochrome, tactical, fashion, or high-contrast color concepts.',
    finishImageAlt: 'Challenge coin finish and relief reference',
    finishCaptionEyebrow: 'Object study',
    finishCaption: 'Relief, edge, color, and surface direction',
    finishCta: 'Discuss a finish direction',
    factoryEyebrow: 'Specification clarity',
    factoryTitle: 'The details that make a custom brief actionable.',
    factoryDescription: industryProfile.visual.imageRules,
    proofImageAlt: 'Custom enamel pin and die detail reference',
    proofCaption: 'Reference imagery for form, enamel, and surface detail',
    insightsEyebrow: 'Insights',
    insightsTitle: `Useful ${industryProfile.market.industry} guidance`,
    ctaEyebrow: 'Start a custom project',
    ctaTitle: 'Bring the artwork. Define the object.',
    ctaDescription: 'Share the product format, design direction, quantity, packaging, destination, and timing available today. Unknown details can remain open for discussion.',
  },
  products: {
    title: 'Custom Metal Gifts Catalog',
    description: publicSiteCopy.catalogDescription,
    bannerEyebrow: 'Catalog',
    bannerTitle: 'Pins, coins, medals, and keychains for custom programs.',
    bannerDescription: publicSiteCopy.catalogDescription,
    bannerCta: 'Explore formats',
    summaryProducts: 'published product families',
    summaryCategories: 'custom gift categories',
    summaryFactory: 'organized for specification',
    customEyebrow: 'Custom planning',
    customTitle: 'Move from a visual idea to a precise product brief.',
    customDescription: 'Review published formats, applications, materials, relief, finishes, attachments, ribbons, hardware, and packaging before requesting a quotation.',
    discussCustomization: 'Discuss a custom project',
    browseAll: 'Browse all',
    categoryTitle: 'Explore by product format',
    categoryDescription: 'Start with lapel pins, challenge coins, sports medals, or keychains, then refine the object around the intended use.',
    seriesEyebrow: 'Published catalog',
    seriesTitle: 'Verified product families',
  },
  product: {
    metaReady: 'Content-ready',
    distributorSupport: 'Sales support',
    internationalSupport: 'International metadata',
    stickyText: 'Specification support for buyers, managers, and project teams.',
    requestQuote: 'Request quote',
    viewCategory: 'View category',
    highlightsEyebrow: 'Highlights',
    highlightsTitle: 'Key points for selection and comparison.',
    applicationsEyebrow: 'Applications',
    applicationsTitle: 'Where this offering is typically used.',
    specsEyebrow: 'Specifications',
    specsTitle: 'Overview specifications.',
    modelEyebrow: 'Model specifications',
    overviewEyebrow: 'Overview',
    faqEyebrow: 'FAQ',
    faqTitle: 'Common questions.',
    relatedEyebrow: 'Related items',
    relatedTitlePrefix: 'Compare more',
    relatedDescription: 'Continue exploring the same business range for model data, fit, and quotation planning.',
  },
  about: {
    title: `About ${siteInfo.name}`,
    description: publicSiteCopy.positioning,
    bannerEyebrow: 'About',
    bannerTitle: 'A custom metal gift partner for international buyers.',
    bannerDescription: publicSiteCopy.positioning,
    systemEyebrow: 'Approach',
    systemTitle: 'Start with the object, the artwork, and the decisions that shape both.',
    systemDescription: 'Share the intended use, format, finish, attachment, packaging, quantity, destination, and timing available for the project. The team can then respond to a defined brief.',
    whatWeBuild: 'What buyers can expect',
    whatWeBuildDescription: 'Clear product-format information, practical custom-specification dialogue, and a direct route for evaluating a specific pins, coins, medals, or keychains requirement.',
    factoryEyebrow: 'Capability',
    factoryTitle: 'See custom metal gift details in context',
  },
  contact: {
    title: 'Contact',
    description: 'Contact the team about a custom lapel pin, challenge coin, medal, or keychain requirement.',
    bannerEyebrow: 'Contact',
    bannerTitle: 'Turn your design direction into a clear request.',
    bannerDescription: 'Send the product format, artwork, dimensions, finish, attachment or ribbon, packaging, quantity, destination, and target timing available.',
    startInquiry: 'Start a custom inquiry',
    formEyebrow: 'Inquiry form',
    formTitle: 'Share the custom brief.',
    formDescription: 'Include the details already decided and leave unknown specifications open for discussion.',
    name: 'Your name',
    email: 'Email',
    company: 'Company / project',
    country: 'Country / Region',
    message: 'Product, artwork, dimensions, finish, attachment, packaging, quantity, destination, and timing',
    sendInquiry: 'Send inquiry',
    direct: 'Direct contact',
    salesOffice: 'Sales office',
    factoryAddress: 'Operating address',
    whatsapp: 'Contact by WhatsApp',
    mapEyebrow: 'Location',
    mapTitle: 'Business location',
    mapOpen: 'Open interactive map',
  },
  faq: {
    title: 'FAQ',
    description: `Answers to common ${industryProfile.market.industry} buyer questions.`,
    bannerEyebrow: 'FAQ',
    bannerTitle: 'Custom metal gift questions',
    bannerDescription: 'Practical answers for buyers preparing artwork, specifications, and quotation requests.',
    clarityEyebrow: 'Specification clarity',
    clarityTitle: 'Answers for custom pins, coins, medals, and keychain buyers.',
  },
  blog: {
    title: 'Insights',
    description: 'Buyer guides and technical notes for planning custom pins, challenge coins, medals, and keychains.',
    bannerEyebrow: 'Insights',
    bannerTitle: 'Custom metal gift insights',
    bannerDescription: 'Guidance for planning artwork, relief, finish, attachment, ribbon, hardware, packaging, and custom inquiries.',
  },
};

const pagesByLocale: Record<Locale, typeof basePages> = Object.fromEntries(
  supportedLocales.map(locale => [locale, localizeObject(basePages, locale, 'pages')])
) as Record<Locale, typeof basePages>;

export const getPageCopy = (locale: Locale = defaultLocale) => pagesByLocale[locale];
export const zhPages = pagesByLocale.zh;
export const arPages = pagesByLocale.ar;
export const hiPages = pagesByLocale.hi;
export const urPages = pagesByLocale.ur;
export const esPages = pagesByLocale.es;
export const ptPages = pagesByLocale.pt;
export const frPages = pagesByLocale.fr;
export const ruPages = pagesByLocale.ru;
export const koPages = pagesByLocale.ko;
export const filPages = pagesByLocale.fil;
export const trPages = pagesByLocale.tr;
export const dePages = pagesByLocale.de;
export const bnPages = pagesByLocale.bn;
export const uzPages = pagesByLocale.uz;

const localizedFaqs = (locale: Locale) => {
  const translated = siteLocaleEntries[locale]?.faqs;
  if (
    locale !== defaultLocale
    && Array.isArray(translated)
    && translated.length === publicFaqs.length
    && translated.every(item => item?.question?.trim() && item?.answer?.trim())
  ) {
    return translated.map(item => ({ question: item.question.trim(), answer: item.answer.trim() }));
  }
  return publicFaqs;
};

export const getLocalizedFaqs = (locale: Locale = defaultLocale) => localizedFaqs(locale);
export const zhFaqs = localizedFaqs('zh');
export const arFaqs = localizedFaqs('ar');
export const hiFaqs = localizedFaqs('hi');
export const ptFaqs = localizedFaqs('pt');
export const esFaqs = localizedFaqs('es');
export const frFaqs = localizedFaqs('fr');
export const ruFaqs = localizedFaqs('ru');
export const koFaqs = localizedFaqs('ko');
export const filFaqs = localizedFaqs('fil');
export const trFaqs = localizedFaqs('tr');
export const urFaqs = localizedFaqs('ur');
export const bnFaqs = localizedFaqs('bn');
export const uzFaqs = localizedFaqs('uz');
export const deFaqs = localizedFaqs('de');

const staticTextKeys: Record<string, string> = {
  'This series helps buyers and project teams compare models, confirm application fit and prepare quotations with clear technical data.': 'text.productOverview',
  'product series': 'text.productSeries',
  'Compare published items by design, application, model range and project fit.': 'text.productCategoryDescription',
  Context: 'text.aboutContext',
  'Information shaped around actual applications, evaluation criteria, and project fit.': 'text.aboutContextDescription',
  Clarity: 'text.aboutClarity',
  'Direct commercial conversations with the details needed for a useful response.': 'text.aboutClarityDescription',
  Continuity: 'text.aboutContinuity',
  'Support for selection, implementation, and long-term operating needs.': 'text.aboutContinuityDescription',
  Reach: 'text.aboutReach',
  'A perspective designed for international B2B buyers and project teams.': 'text.aboutReachDescription',
  Email: 'text.email',
  Phone: 'text.phone',
  'Business office': 'text.businessOffice',
  Applications: 'text.catalogCardApplications',
  'Understand where the offering fits and what it is intended to solve.': 'text.catalogCardApplicationsDescription',
  Details: 'text.catalogCardDetails',
  'Review specifications, service scope, and model differences where applicable.': 'text.catalogCardDetailsDescription',
  Evidence: 'text.catalogCardEvidence',
  'Use real imagery, documentation, and verified commercial information.': 'text.catalogCardEvidenceDescription',
  Inquiry: 'text.catalogCardInquiry',
  'Share market, quantity, timeline, and technical requirements with the team.': 'text.catalogCardInquiryDescription',
  'Verified offerings will be published here': 'text.catalogEmptyTitle',
  'In preparation': 'text.catalogEmptyEyebrow',
  'Product and service information is being prepared.': 'text.catalogEmptyDescription',
  'Practical guidance is in preparation': 'text.blogEmptyTitle',
  'Buyer-first product clarity': 'text.showcaseBuyerClarity',
  'Technical confidence': 'text.showcaseTechnicalConfidence',
  'Clear applications, specifications, and evidence for evaluation.': 'text.showcaseTechnicalConfidenceDescription',
  'International delivery': 'text.showcaseInternationalDelivery',
  'Built for global commercial and project conversations.': 'text.showcaseInternationalDeliveryDescription',
  'Lifecycle partnership': 'text.showcaseLifecyclePartnership',
  'From initial evaluation to long-term support.': 'text.showcaseLifecyclePartnershipDescription',
  'Strategy and sales workspace': 'text.galleryStrategy',
  'Product content review': 'text.galleryProductReview',
  'Operations dashboard': 'text.galleryOperations',
  'Quality workflow': 'text.galleryQuality',
  'Inventory and logistics': 'text.galleryInventory',
  'Client workshop': 'text.galleryClientWorkshop',
  Detail: 'text.homeDetail',
  'Technical evidence': 'text.homeTechnicalEvidence',
  Fit: 'text.homeFit',
  'Application context': 'text.homeApplicationContext',
  'International markets': 'text.homeInternationalMarkets',
  Support: 'text.homeSupport',
  'Commercial response': 'text.homeCommercialResponse',
  'Buyer-facing detail that supports selection, comparison, and procurement conversations.': 'text.homeEvidenceDescription',
  'Applications, compatibility, and decision criteria explained in a direct, credible voice.': 'text.homeContextDescription',
  'A clear path for global buyers to discover, assess, and discuss the offer.': 'text.homeReachDescription',
  Response: 'text.homeResponse',
  'A commercial inquiry flow designed for detailed requirements and real next steps.': 'text.homeResponseDescription',
  Ready: 'text.catalogReady',
  'Contact the team with your requirement to begin a commercial discussion.': 'text.catalogEmptyContactDescription',
  'Custom Lapel Pins': 'text.customLapelPins',
  'Enamel style, metal finish, backing, and presentation': 'text.customLapelPinsDescription',
  'Challenge Coins': 'text.challengeCoins',
  'Dimensions, relief, edge, finish, and front/reverse design': 'text.challengeCoinsDescription',
  'Sports Medals': 'text.sportsMedals',
  'Medal construction, ribbon specification, finish, and packaging': 'text.sportsMedalsDescription',
  'Custom Keychains': 'text.customKeychains',
  'Metal, enamel, leather, PU, ring, chain, and packaging formats': 'text.customKeychainsDescription',
  'Product category and intended use': 'text.attributeCategory',
  'Artwork format and design complexity': 'text.attributeArtwork',
  'Dimensions and thickness': 'text.attributeDimensions',
  'Base material': 'text.attributeMaterial',
  'Plating color and surface finish': 'text.attributePlating',
  'Color application or enamel style': 'text.attributeColor',
  'Front and reverse treatment': 'text.attributeSides',
  'Attachment or hardware': 'text.attributeHardware',
  'Packaging requirement': 'text.attributePackaging',
  'Quantity and delivery destination': 'text.attributeQuantity',
};

export const translateCategoryMeta = (category: ProductCategoryMeta, locale: Locale): ProductCategoryMeta => {
  if (locale === defaultLocale) return category;
  return { ...category };
};

export const translateProductCategory = (category: ProductCategory, locale: Locale): ProductCategory => {
  const meta = translateCategoryMeta(category, locale);
  return {
    ...category,
    ...meta,
    href: categoryPath(category.slug, locale),
    products: category.products,
    count: category.count,
  };
};

export const translateProductCategories = (categories: ProductCategory[], locale: Locale) =>
  categories.map(category => translateProductCategory(category, locale));

export const translateTechnicalText = (value: string, locale: Locale = defaultLocale): string => {
  const key = staticTextKeys[value];
  return key ? localizedPhrase(locale, key, value) : value;
};
export const translateProductTitle = (title: string, _locale: Locale = defaultLocale): string => title;
export const translateSeriesName = (series: string, _locale: Locale = defaultLocale) => series;

export const translateProductCardKeywords = (product: CollectionEntry<'products'>, _locale: Locale = defaultLocale) =>
  product.data.highlights.slice(0, 4);

export const localizedProduct = (product: CollectionEntry<'products'>, locale: Locale = defaultLocale) => {
  const categoryMeta = getCategoryMeta(product.data.category);
  const specs = publicProductSpecs(product.data.specs);
  const tags = [
    ...product.data.highlights,
    categoryMeta.displayName || categoryMeta.name,
    product.data.series,
  ].filter(Boolean).slice(0, 4);

  return {
    title: translateProductTitle(product.data.title, locale),
    fullTitle: translateProductTitle(product.data.title, locale),
    slug: product.id.replace(/\.mdoc$/, ''),
    description: translateTechnicalText(product.data.description, locale),
    categoryName: translateTechnicalText(categoryMeta.displayName || categoryMeta.name, locale),
    series: translateSeriesName(product.data.series, locale),
    applications: product.data.applications.map(item => translateTechnicalText(item, locale)),
    specs: specs.map(spec => ({ label: translateTechnicalText(spec.label, locale), value: spec.value })),
    specTables: product.data.specTables.map(table => ({
      ...table,
      title: translateTechnicalText(table.title, locale),
      columns: table.columns.map(column => translateTechnicalText(column, locale)),
      headerRows: table.headerRows.map(row => ({
        cells: row.cells.map(cell => ({ ...cell, text: translateTechnicalText(cell.text, locale) })),
      })),
      rows: table.rows,
    })),
    highlights: product.data.highlights.map(item => translateTechnicalText(item, locale)),
    faqs: product.data.faqs.map(item => ({
      question: translateTechnicalText(item.question, locale),
      answer: translateTechnicalText(item.answer, locale),
    })),
    tags,
  };
};

export const localizedProductUrl = (product: CollectionEntry<'products'>, locale: Locale = defaultLocale) =>
  productPath(product.id.replace(/\.mdoc$/, ''), locale);

export const localizedProductStructuredData = (
  product: CollectionEntry<'products'>,
  locale: Locale,
  site?: URL | string | null
): JsonLd[] => {
  const slug = product.id.replace(/\.mdoc$/, '');
  const localized = localizedProduct(product, locale);
  const localizedUrl = absoluteUrl(productPath(slug, locale), site);
  const sourceEntitySuffix = product.data.offeringType === 'physical-product' ? '#product' : '#service';
  return productStructuredData(product, slug, site).map(item => {
    if (item['@id'] === `${absoluteUrl(`/products/${slug}/`, site)}${sourceEntitySuffix}`) {
      return {
        ...item,
        '@id': `${localizedUrl}${sourceEntitySuffix}`,
        name: localized.title,
        description: localized.description,
        url: localizedUrl,
        inLanguage: localeMeta[locale].htmlLang,
        category: localized.categoryName,
      };
    }
    return item;
  });
};

export const localizedBlog = (post: CollectionEntry<'blog'>, locale: Locale = defaultLocale) => ({
  title: translateTechnicalText(post.data.title, locale),
  description: translateTechnicalText(post.data.description, locale),
  category: translateTechnicalText(post.data.category, locale),
  slug: post.id.replace(/\.mdoc$/, ''),
});

export const localizedArticleStructuredData = (
  post: CollectionEntry<'blog'>,
  locale: Locale,
  site?: URL | string | null
): JsonLd => {
  const slug = post.id.replace(/\.mdoc$/, '');
  const localized = localizedBlog(post, locale);
  const url = absoluteUrl(blogPath(slug, locale), site);
  return {
    ...articleStructuredData(post, slug, site),
    '@id': `${url}#article`,
    headline: localized.title,
    description: localized.description,
    inLanguage: localeMeta[locale].htmlLang,
    mainEntityOfPage: { '@id': `${url}#webpage` },
  };
};

const escapeArticleHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const localizedGeneratedArticleBody = (post: CollectionEntry<'blog'>, locale: Locale) => {
  const rawBody = String((post as any).body || '').replace(/^---[\s\S]*?---\s*/, '').trim();
  if (!rawBody) return `<p>${escapeArticleHtml(localizedBlog(post, locale).description)}</p>`;
  return rawBody
    .split(/\n{2,}/)
    .map(block => `<p>${escapeArticleHtml(translateTechnicalText(block.replace(/\s+/g, ' ').trim(), locale))}</p>`)
    .join('\n');
};

type ArticleBodyLocale = Exclude<Locale, 'en'>;

export const generatedLocalizedArticleBody = (post: CollectionEntry<'blog'>, locale: ArticleBodyLocale) =>
  localizedGeneratedArticleBody(post, locale);

export const arabicArticleBody = (post: CollectionEntry<'blog'>) => localizedGeneratedArticleBody(post, 'ar');
export const hindiArticleBody = (post: CollectionEntry<'blog'>) => localizedGeneratedArticleBody(post, 'hi');
export const spanishArticleBody = (post: CollectionEntry<'blog'>) => localizedGeneratedArticleBody(post, 'es');
export const portugueseArticleBody = (post: CollectionEntry<'blog'>) => localizedGeneratedArticleBody(post, 'pt');
export const frenchArticleBody = (post: CollectionEntry<'blog'>) => localizedGeneratedArticleBody(post, 'fr');
export const russianArticleBody = (post: CollectionEntry<'blog'>) => localizedGeneratedArticleBody(post, 'ru');
export const koreanArticleBody = (post: CollectionEntry<'blog'>) => localizedGeneratedArticleBody(post, 'ko');
export const filipinoArticleBody = (post: CollectionEntry<'blog'>) => localizedGeneratedArticleBody(post, 'fil');
export const turkishArticleBody = (post: CollectionEntry<'blog'>) => localizedGeneratedArticleBody(post, 'tr');
export const germanArticleBody = (post: CollectionEntry<'blog'>) => localizedGeneratedArticleBody(post, 'de');
export const uzbekArticleBody = (post: CollectionEntry<'blog'>) => localizedGeneratedArticleBody(post, 'uz');
export const bengaliArticleBody = (post: CollectionEntry<'blog'>) => localizedGeneratedArticleBody(post, 'bn');
export const urduArticleBody = (post: CollectionEntry<'blog'>) => localizedGeneratedArticleBody(post, 'ur');
export const chineseArticleBody = (post: CollectionEntry<'blog'>) => localizedGeneratedArticleBody(post, 'zh');
