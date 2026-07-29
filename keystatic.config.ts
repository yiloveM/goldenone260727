import { collection, config, fields, singleton } from '@keystatic/core';
import { productManagerField } from './src/keystatic/product-manager-field';
import { productOrderField } from './src/keystatic/product-order-field';
import { r2ImagePoolField } from './src/keystatic/r2-image-pool-field';
import { r2ImageUrlField } from './src/keystatic/r2-image-url-field';
import { r2MarkdocComponents } from './src/keystatic/r2-markdoc-components';
import { aiTranslatorField } from './src/keystatic/ai-translator-field';
import { sitePublisherField } from './src/keystatic/site-publisher-field';
import { translationDraftReviewField } from './src/keystatic/translation-draft-review-field';
import { siteLanguageBulkActionsField, siteLanguageCheckboxField } from './src/keystatic/site-language-selector-field';
import siteLocaleConfig from './src/data/site-locales.json';

const isProduction = process.env.NODE_ENV === 'production';
const configuredGitHubRepo = String(import.meta.env.PUBLIC_KEYSTATIC_GITHUB_REPO || '').trim();
const githubAppSlug = String(import.meta.env.PUBLIC_KEYSTATIC_GITHUB_APP_SLUG || '').trim();

if (isProduction && (!configuredGitHubRepo || configuredGitHubRepo === 'your-org/businessweb')) {
  throw new Error(
    'Set PUBLIC_KEYSTATIC_GITHUB_REPO to the real owner/repo in wrangler.toml before building for production.'
  );
}
if (isProduction && !githubAppSlug) {
  throw new Error(
    'Set PUBLIC_KEYSTATIC_GITHUB_APP_SLUG to the GitHub App slug in wrangler.toml before building for production.'
  );
}

const [githubOwner = 'your-org', githubName = 'businessweb'] = (
  configuredGitHubRepo || 'your-org/businessweb'
).split('/');

const translationLocaleOptions = [
  { label: 'Simplified Chinese（简体中文）', value: 'zh' },
  { label: 'Arabic（阿拉伯语）', value: 'ar' },
  { label: 'Hindi（印地语）', value: 'hi' },
  { label: 'Spanish（西班牙语）', value: 'es' },
  { label: 'French（法语）', value: 'fr' },
  { label: 'Bengali（孟加拉语）', value: 'bn' },
  { label: 'Portuguese（葡萄牙语）', value: 'pt' },
  { label: 'Russian（俄语）', value: 'ru' },
  { label: 'Urdu（乌尔都语）', value: 'ur' },
  { label: 'German（德语）', value: 'de' },
  { label: 'Turkish（土耳其语）', value: 'tr' },
  { label: 'Filipino（菲律宾语）', value: 'fil' },
  { label: 'Korean（韩语）', value: 'ko' },
  { label: 'Uzbek（乌兹别克语）', value: 'uz' },
] as const;

const localeEntries = (siteLocaleConfig.locales || {}) as Record<string, {
  approved?: boolean;
  phrases?: Record<string, string>;
  faqs?: Array<{ question?: string; answer?: string }>;
}>;
const requiredPhraseKeys = siteLocaleConfig.requiredPhraseKeys || [];
const requiredFaqCount = Number(siteLocaleConfig.requiredFaqCount || 0);
const isStaticLocaleReady = (locale: string) => {
  const entry = localeEntries[locale];
  if (!entry || entry.approved !== true) return false;
  if (requiredPhraseKeys.some(key => !entry.phrases?.[key]?.trim())) return false;
  return Array.isArray(entry.faqs)
    && entry.faqs.length === requiredFaqCount
    && entry.faqs.every(item => item.question?.trim() && item.answer?.trim());
};
const targetLocaleCodes = translationLocaleOptions.map(option => option.value);
const targetLanguageFields = {
  selectionTools: siteLanguageBulkActionsField({ localeCodes: targetLocaleCodes }),
  ...Object.fromEntries(
    translationLocaleOptions.map(option => [
      option.value,
      siteLanguageCheckboxField({
        code: option.value,
        label: `${option.label} · ${option.value}`,
        defaultValue: false,
        description: isStaticLocaleReady(option.value)
          ? '固定 UI、页面文案和 FAQ 已审核。勾选并保存后可进入公开站点和翻译工作流。'
          : '勾选并保存后会出现在 AI 翻译选项中；固定文案审核完成前不会作为公开站点语言上线。',
      }),
    ])
  ),
};

const specTablesTranslationField = () =>
  fields.array(
    fields.object({
      title: fields.text({ label: 'Table title' }),
      columns: fields.array(fields.text({ label: 'Column name' }), {
        label: 'Columns',
        itemLabel: props => props.value || 'Column',
      }),
      headerRows: fields.array(
        fields.object({
          cells: fields.array(
            fields.object({
              text: fields.text({ label: 'Header text' }),
              colspan: fields.integer({ label: 'Colspan', defaultValue: 1 }),
              rowspan: fields.integer({ label: 'Rowspan', defaultValue: 1 }),
            }),
            { label: 'Header cells', itemLabel: props => props.fields.text.value || 'Cell' }
          ),
        }),
        { label: 'Complex header rows', itemLabel: () => 'Header row' }
      ),
      rows: fields.array(
        fields.array(fields.text({ label: 'Cell' }), {
          label: 'Cells',
          itemLabel: props => props.value || 'Cell',
        }),
        { label: 'Rows', itemLabel: () => 'Row' }
      ),
    }),
    { label: 'Specification tables', itemLabel: props => props.fields.title.value || 'Specification table' }
  );

export default config({
  storage: isProduction
    ? { kind: 'github', repo: { owner: githubOwner, name: githubName } }
    : { kind: 'local' },
  ui: {
    brand: { name: 'BusinessWeb Content Manager' },
    navigation: {
      Foundation: ['siteFoundation', 'siteLanguages'],
      Content: ['productManager', 'productOrder', 'products', 'blog', 'aiTranslator', 'productTranslationReview', 'blogTranslationReview', 'sitePublisher'],
      Media: ['imagePool'],
    },
  },
  singletons: {
    siteLanguages: singleton({
      label: '网站语言',
      path: 'src/data/site-language-settings',
      format: 'json',
      schema: {
        sourceLocale: fields.select({
          label: '默认源语言（固定）',
          options: [{ label: 'English（英语） · en', value: 'en' }],
          defaultValue: 'en',
          description: '英语是唯一源语言，不能关闭。其它语言均从已核实的英语内容翻译。',
        }),
        enabledLocales: fields.object(targetLanguageFields, {
          label: '启用的目标语言',
          description: '保存并完成自动部署后，/manager/ 和 AI 翻译只显示已勾选语言。公开站点还要求该语言的固定文案和 FAQ 已审核。',
          layout: [6, 6],
        }),
      },
    }),
    siteFoundation: singleton({
      label: 'Brand and industry foundation',
      path: 'src/data/industry-profile.json',
      format: 'json',
      schema: {
        version: fields.integer({ label: 'Profile schema version', defaultValue: 1 }),
        lifecycle: fields.select({
          label: 'Lifecycle',
          options: [
            { label: 'Template - not configured', value: 'template' },
            { label: 'Industry brief complete', value: 'briefed' },
            { label: 'SEO and GEO research complete', value: 'researched' },
            { label: 'Production-ready and verified', value: 'production-ready' },
          ],
          defaultValue: 'template',
        }),
        brand: fields.object({
          name: fields.text({ label: 'Public brand name', defaultValue: 'BusinessWeb' }),
          tagline: fields.text({ label: 'Short public tagline', defaultValue: 'International B2B brand platform' }),
          legalName: fields.text({ label: 'Legal company name', defaultValue: '' }),
          description: fields.text({ label: 'Buyer-facing positioning', multiline: true, defaultValue: '' }),
          email: fields.text({ label: 'Inquiry email', defaultValue: 'sales@example.com' }),
          phone: fields.text({ label: 'Phone', defaultValue: '' }),
          whatsapp: fields.text({ label: 'WhatsApp URL', defaultValue: '' }),
          address: fields.text({ label: 'Business address', multiline: true, defaultValue: '' }),
          factoryAddress: fields.text({ label: 'Factory or operating address', multiline: true, defaultValue: '' }),
          socialProfiles: fields.array(fields.text({ label: 'Profile URL' }), {
            label: 'Verified public social profiles',
            itemLabel: props => props.value || 'Profile URL',
          }),
        }),
        market: fields.object({
          industry: fields.text({ label: 'Industry', defaultValue: 'Your industry' }),
          businessModel: fields.select({
            label: 'Commercial and product model',
            options: [
              { label: 'Undetermined', value: 'undetermined' },
              { label: 'Industrial series and model catalog', value: 'industrial-series' },
              { label: 'Discrete physical products', value: 'discrete-products' },
              { label: 'Professional services', value: 'services' },
              { label: 'Engineered solutions', value: 'solutions' },
              { label: 'Hybrid products and services', value: 'hybrid' },
            ],
            defaultValue: 'undetermined',
          }),
          primaryLocale: fields.text({ label: 'Source content locale (keep en)', defaultValue: 'en' }),
          markets: fields.array(fields.text({ label: 'Target market' }), {
            label: 'Target markets',
            itemLabel: props => props.value || 'Market',
          }),
          buyerRoles: fields.array(fields.text({ label: 'Buyer role' }), {
            label: 'Primary buyer roles',
            itemLabel: props => props.value || 'Buyer role',
          }),
          positioning: fields.text({ label: 'Market positioning', multiline: true, defaultValue: '' }),
        }),
        seo: fields.object({
          coreKeywords: fields.array(fields.text({ label: 'Core English keyword' }), {
            label: 'Core keywords',
            itemLabel: props => props.value || 'Keyword',
          }),
          longTailKeywords: fields.array(fields.text({ label: 'Long-tail keyword' }), {
            label: 'Verified long-tail keywords',
            itemLabel: props => props.value || 'Keyword',
          }),
          entityTopics: fields.array(fields.text({ label: 'Entity or topic' }), {
            label: 'Entities and topical coverage',
            itemLabel: props => props.value || 'Entity',
          }),
          searchIntentSummary: fields.text({ label: 'Current search-intent summary', multiline: true, defaultValue: '' }),
          competitorReferences: fields.array(fields.text({ label: 'Competitor or SERP reference URL' }), {
            label: 'Research references',
            itemLabel: props => props.value || 'Reference',
          }),
          lastResearchDate: fields.text({ label: 'Last current-data research date (YYYY-MM-DD)', defaultValue: '' }),
        }),
        productArchitecture: fields.object({
          offeringType: fields.select({
            label: 'Catalog architecture',
            options: [
              { label: 'Undetermined', value: 'undetermined' },
              { label: 'Industrial series and model tables', value: 'industrial-series' },
              { label: 'Discrete product catalog', value: 'discrete-products' },
              { label: 'Services', value: 'services' },
              { label: 'Solution pages', value: 'solutions' },
              { label: 'Hybrid', value: 'hybrid' },
            ],
            defaultValue: 'undetermined',
          }),
          categoryPlans: fields.array(
            fields.object({
              name: fields.text({ label: 'Category name' }),
              description: fields.text({ label: 'Buyer-facing category description', multiline: true }),
              highlights: fields.array(fields.text({ label: 'Highlight' }), {
                label: 'Category highlights',
                itemLabel: props => props.value || 'Highlight',
              }),
            }),
            { label: 'Planned public categories', itemLabel: props => props.fields.name.value || 'Category' }
          ),
          commonAttributes: fields.array(fields.text({ label: 'Series-wide or common attribute' }), {
            label: 'Common attributes',
            itemLabel: props => props.value || 'Attribute',
          }),
          modelAttributes: fields.array(fields.text({ label: 'Model-specific attribute' }), {
            label: 'Model-specific attributes',
            itemLabel: props => props.value || 'Attribute',
          }),
        }),
        visual: fields.object({
          archetype: fields.text({ label: 'Visual direction', defaultValue: 'precise editorial' }),
          accentColor: fields.text({ label: 'Accent color (#RRGGBB)', defaultValue: '#0f766e' }),
          accentColorStrong: fields.text({ label: 'Strong accent color (#RRGGBB)', defaultValue: '#075985' }),
          accentColorSoft: fields.text({ label: 'Soft accent color (#RRGGBB)', defaultValue: '#ccfbf1' }),
          heroDirection: fields.text({ label: 'Hero image direction', multiline: true, defaultValue: '' }),
          imageRules: fields.text({ label: 'Image selection rules', multiline: true, defaultValue: '' }),
        }),
        governance: fields.object({
          factsVerified: fields.checkbox({ label: 'Verified facts only', defaultValue: false }),
          contentOwner: fields.text({ label: 'Content owner', defaultValue: '' }),
          lastUpdated: fields.text({ label: 'Last updated (YYYY-MM-DD)', defaultValue: '' }),
          notes: fields.text({ label: 'Internal launch notes', multiline: true, defaultValue: '' }),
        }),
      },
    }),
    productTranslationReview: singleton({
      label: 'Product translation drafts',
      path: 'src/keystatic/product-translation-review.json',
      format: 'json',
      schema: {
        review: translationDraftReviewField({ label: 'Product translation drafts', type: 'product' }),
      },
    }),
    blogTranslationReview: singleton({
      label: 'Article translation drafts',
      path: 'src/keystatic/blog-translation-review.json',
      format: 'json',
      schema: {
        review: translationDraftReviewField({ label: 'Article translation drafts', type: 'blog' }),
      },
    }),
    sitePublisher: singleton({
      label: 'Publish site updates',
      path: 'src/keystatic/site-publisher.json',
      format: 'json',
      schema: {
        publisher: sitePublisherField({ label: 'Publish site updates' }),
      },
    }),
    aiTranslator: singleton({
      label: 'AI translator',
      path: 'src/keystatic/ai-translator.json',
      format: 'json',
      schema: {
        translator: aiTranslatorField({ label: 'AI translator' }),
      },
    }),
    productManager: singleton({
      label: 'Product manager',
      path: 'src/keystatic/product-manager.json',
      format: 'json',
      schema: {
        manager: productManagerField({ label: 'Product manager' }),
      },
    }),
    productOrder: singleton({
      label: 'Product order',
      path: 'src/keystatic/product-order.json',
      format: 'json',
      schema: {
        order: productOrderField({ label: 'Product order' }),
      },
    }),
    imagePool: singleton({
      label: 'Image pool',
      path: 'src/keystatic/image-pool.json',
      format: 'json',
      schema: {
        browser: r2ImagePoolField({ label: 'Image pool' }),
      },
    }),
  },
  collections: {
    products: collection({
      label: 'Products and offerings',
      slugField: 'title',
      path: 'src/content/products/*',
      format: { contentField: 'content' },
      schema: {
        title: fields.slug({ name: { label: 'Title' } }),
        description: fields.text({ label: 'Short description', multiline: true }),
        offeringType: fields.select({
          label: 'Offering type for structured data',
          options: [
            { label: 'Physical product', value: 'physical-product' },
            { label: 'Service', value: 'service' },
            { label: 'Engineered solution', value: 'solution' },
          ],
          defaultValue: 'physical-product',
        }),
        modelStrategy: fields.select({
          label: 'Model and parameter structure',
          options: [
            { label: 'One sellable model', value: 'single-model' },
            { label: 'Series with model rows', value: 'series' },
            { label: 'Configured to order', value: 'configurable' },
            { label: 'Not applicable to this service', value: 'not-applicable' },
          ],
          defaultValue: 'series',
        }),
        category: fields.text({ label: 'Public category', defaultValue: 'Solutions' }),
        series: fields.text({ label: 'Series / model / offer group' }),
        sortOrder: fields.integer({ label: 'Display order', defaultValue: 9999 }),
        published: fields.checkbox({ label: 'Published', defaultValue: true }),
        image: r2ImageUrlField({
          label: 'Main image URL',
          pickerTitle: 'Select main image',
          description: 'This image is used as the listing thumbnail and primary page image.',
        }),
        galleryImages: fields.array(r2ImageUrlField({ label: 'Gallery image URL', pickerTitle: 'Select gallery image' }), {
          label: 'Gallery images',
          itemLabel: props => props.value || 'Image',
        }),
        detailImages: fields.array(
          fields.object({
            image: r2ImageUrlField({ label: 'Image URL', pickerTitle: 'Select detail image' }),
            title: fields.text({ label: 'Image title', defaultValue: '' }),
            caption: fields.text({ label: 'Image caption', multiline: true, defaultValue: '' }),
          }),
          { label: 'Detail images', itemLabel: props => props.fields.title.value || props.fields.image.value || 'Detail image' }
        ),
        applications: fields.array(fields.text({ label: 'Application' }), {
          label: 'Applications',
          itemLabel: props => props.value || 'Application',
        }),
        specs: fields.array(
          fields.object({
            label: fields.text({ label: 'Spec label' }),
            value: fields.text({ label: 'Spec value' }),
          }),
          { label: 'Overview specs', itemLabel: props => props.fields.label.value || 'Spec' }
        ),
        specTables: specTablesTranslationField(),
        highlights: fields.array(fields.text({ label: 'Highlight' }), {
          label: 'Highlights',
          itemLabel: props => props.value || 'Highlight',
        }),
        faqs: fields.array(
          fields.object({
            question: fields.text({ label: 'Question' }),
            answer: fields.text({ label: 'Answer', multiline: true }),
          }),
          { label: 'FAQ', itemLabel: props => props.fields.question.value || 'FAQ' }
        ),
        aggregateRatingValue: fields.text({
          label: 'Real aggregate rating',
          description: 'Optional. Use only genuine public rating data between 1.0 and 5.0.',
          defaultValue: '',
        }),
        aggregateRatingCount: fields.integer({
          label: 'Real rating count',
          description: 'Optional. Must be the actual number of ratings when a rating value is provided.',
          defaultValue: 0,
        }),
        featured: fields.checkbox({ label: 'Featured on homepage', defaultValue: false }),
        content: fields.markdoc({ label: 'Body content', components: r2MarkdocComponents }),
      },
    }),
    blog: collection({
      label: 'Articles',
      slugField: 'title',
      path: 'src/content/blog/*',
      format: { contentField: 'content' },
      schema: {
        title: fields.slug({ name: { label: 'Article title' } }),
        description: fields.text({ label: 'SEO description', multiline: true }),
        publishDate: fields.date({ label: 'Publish date' }),
        category: fields.text({ label: 'Article category' }),
        image: r2ImageUrlField({
          label: 'Cover image URL',
          pickerTitle: 'Select article cover',
          description: 'Paste an image URL or select from the image pool.',
        }),
        author: fields.text({ label: 'Author', defaultValue: 'BusinessWeb Editorial Team' }),
        featured: fields.checkbox({ label: 'Featured on homepage', defaultValue: false }),
        content: fields.markdoc({ label: 'Body content', components: r2MarkdocComponents }),
      },
    }),
    productTranslations: collection({
      label: 'Product translation drafts',
      slugField: 'title',
      path: 'src/content/productTranslations/*',
      format: { contentField: 'content' },
      previewUrl: '/api/ai/draft-preview?type=product&draft={slug}',
      schema: {
        title: fields.slug({ name: { label: 'Translated title' } }),
        sourceSlug: fields.text({ label: 'Source product slug' }),
        sourceTitle: fields.text({ label: 'Source product title' }),
        locale: fields.select({
          label: 'Locale',
          options: [...translationLocaleOptions],
          defaultValue: 'zh',
        }),
        published: fields.checkbox({ label: 'Publish after review', defaultValue: false }),
        generatedAt: fields.text({ label: 'Generated at' }),
        description: fields.text({ label: 'SEO description', multiline: true }),
        offeringType: fields.select({
          label: 'Offering type',
          options: [
            { label: 'Physical product', value: 'physical-product' },
            { label: 'Service', value: 'service' },
            { label: 'Engineered solution', value: 'solution' },
          ],
          defaultValue: 'physical-product',
        }),
        modelStrategy: fields.select({
          label: 'Model and parameter structure',
          options: [
            { label: 'One sellable model', value: 'single-model' },
            { label: 'Series with model rows', value: 'series' },
            { label: 'Configured to order', value: 'configurable' },
            { label: 'Not applicable to this service', value: 'not-applicable' },
          ],
          defaultValue: 'series',
        }),
        categoryName: fields.text({ label: 'Category name' }),
        series: fields.text({ label: 'Series / model / offer group' }),
        applications: fields.array(fields.text({ label: 'Application' }), {
          label: 'Applications',
          itemLabel: props => props.value || 'Application',
        }),
        specs: fields.array(
          fields.object({
            label: fields.text({ label: 'Spec label' }),
            value: fields.text({ label: 'Spec value' }),
          }),
          { label: 'Overview specs', itemLabel: props => props.fields.label.value || 'Spec' }
        ),
        specTables: specTablesTranslationField(),
        highlights: fields.array(fields.text({ label: 'Highlight' }), {
          label: 'Highlights',
          itemLabel: props => props.value || 'Highlight',
        }),
        faqs: fields.array(
          fields.object({
            question: fields.text({ label: 'Question' }),
            answer: fields.text({ label: 'Answer', multiline: true }),
          }),
          { label: 'FAQ', itemLabel: props => props.fields.question.value || 'FAQ' }
        ),
        content: fields.markdoc({ label: 'Translated body', components: r2MarkdocComponents }),
      },
    }),
    blogTranslations: collection({
      label: 'Article translation drafts',
      slugField: 'title',
      path: 'src/content/blogTranslations/*',
      format: { contentField: 'content' },
      previewUrl: '/api/ai/draft-preview?type=blog&draft={slug}',
      schema: {
        title: fields.slug({ name: { label: 'Translated title' } }),
        sourceSlug: fields.text({ label: 'Source article slug' }),
        sourceTitle: fields.text({ label: 'Source article title' }),
        locale: fields.select({
          label: 'Locale',
          options: [...translationLocaleOptions],
          defaultValue: 'zh',
        }),
        published: fields.checkbox({ label: 'Publish after review', defaultValue: false }),
        generatedAt: fields.text({ label: 'Generated at' }),
        description: fields.text({ label: 'SEO description', multiline: true }),
        category: fields.text({ label: 'Article category' }),
        content: fields.markdoc({ label: 'Translated body', components: r2MarkdocComponents }),
      },
    }),
  },
});
