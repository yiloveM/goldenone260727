import type { ManagerEnv } from './access';

export type ManagerProductDraftPayload = {
  productSlug: string;
  title: string;
  description: string;
  offeringType: 'physical-product' | 'service' | 'solution';
  modelStrategy: 'single-model' | 'series' | 'configurable' | 'not-applicable';
  category: string;
  series: string;
  sortOrder: number;
  published: boolean;
  image: string;
  galleryImages: string[];
  detailImages: Array<{ image: string; title: string; caption: string }>;
  applications: string[];
  specs: Array<{ label: string; value: string }>;
  specTables: Array<{
    title: string;
    columns: string[];
    headerRows: Array<{
      cells: Array<{ text: string; colspan: number; rowspan: number }>;
    }>;
    rows: string[][];
  }>;
  highlights: string[];
  faqs: Array<{ question: string; answer: string }>;
  featured: boolean;
  content?: string;
};

export type ManagerBlogDraftPayload = {
  blogSlug: string;
  title: string;
  description: string;
  category: string;
  image: string;
  author: string;
  publishDate: string;
  featured: boolean;
  body: string;
};

export type ManagerReviewPayload = {
  operation: 'upsert' | 'delete';
  id: string;
  published: boolean;
  kind: 'verified' | 'demo';
  rating: '4' | '5';
  quote: string;
  buyerLabel: string;
  country: string;
  date: string;
  projectType: string;
  source: string;
  sourceUrl: string;
  productSlugs: string[];
  seoEligible: boolean;
};

type D1DatabaseLike = {
  prepare: (query: string) => {
    bind: (...values: unknown[]) => {
      run: () => Promise<unknown>;
      first: <T = unknown>() => Promise<T | null>;
      all: <T = unknown>() => Promise<{ results?: T[] }>;
    };
    run: () => Promise<unknown>;
    all: <T = unknown>() => Promise<{ results?: T[] }>;
  };
};

export type ProductDraftRecord = {
  id: string;
  product_slug: string;
  product_title: string;
  payload_json: string;
  status: string;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
  applied_at: string | null;
  workflow_request_id: string | null;
  workflow_url: string | null;
};

export type BlogDraftRecord = {
  id: string;
  blog_slug: string;
  blog_title: string;
  payload_json: string;
  status: string;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
  applied_at: string | null;
  workflow_request_id: string | null;
  workflow_url: string | null;
};

export type ReviewDraftRecord = {
  id: string;
  review_id: string;
  buyer_label: string;
  payload_json: string;
  status: string;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
  applied_at: string | null;
  workflow_request_id: string | null;
  workflow_url: string | null;
};

export const getManagerDb = (env: ManagerEnv) => env?.MANAGER_DB as D1DatabaseLike | undefined;

export const ensureManagerSchema = async (db: D1DatabaseLike) => {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS manager_product_drafts (
        id TEXT PRIMARY KEY,
        product_slug TEXT NOT NULL,
        product_title TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'draft',
        created_by TEXT NOT NULL,
        updated_by TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        applied_at TEXT,
        workflow_request_id TEXT,
        workflow_url TEXT
      )`
    )
    .run();
  await db
    .prepare('CREATE INDEX IF NOT EXISTS idx_manager_product_drafts_updated_at ON manager_product_drafts(updated_at DESC)')
    .run();
  await db
    .prepare('CREATE INDEX IF NOT EXISTS idx_manager_product_drafts_product_slug ON manager_product_drafts(product_slug)')
    .run();
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS manager_blog_drafts (
        id TEXT PRIMARY KEY,
        blog_slug TEXT NOT NULL,
        blog_title TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'draft',
        created_by TEXT NOT NULL,
        updated_by TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        applied_at TEXT,
        workflow_request_id TEXT,
        workflow_url TEXT
      )`
    )
    .run();
  await db
    .prepare('CREATE INDEX IF NOT EXISTS idx_manager_blog_drafts_updated_at ON manager_blog_drafts(updated_at DESC)')
    .run();
  await db
    .prepare('CREATE INDEX IF NOT EXISTS idx_manager_blog_drafts_blog_slug ON manager_blog_drafts(blog_slug)')
    .run();
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS manager_review_drafts (
        id TEXT PRIMARY KEY,
        review_id TEXT NOT NULL,
        buyer_label TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'draft',
        created_by TEXT NOT NULL,
        updated_by TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        applied_at TEXT,
        workflow_request_id TEXT,
        workflow_url TEXT
      )`
    )
    .run();
  await db
    .prepare('CREATE INDEX IF NOT EXISTS idx_manager_review_drafts_updated_at ON manager_review_drafts(updated_at DESC)')
    .run();
  await db
    .prepare('CREATE INDEX IF NOT EXISTS idx_manager_review_drafts_review_id ON manager_review_drafts(review_id)')
    .run();
};

export const normalizeProductDraftPayload = (value: unknown): ManagerProductDraftPayload => {
  const body = (value || {}) as Partial<ManagerProductDraftPayload>;
  const productSlug = String(body.productSlug || '').trim();

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(productSlug)) {
    throw new Error('A valid product slug is required.');
  }

  const title = String(body.title || '').trim();
  const description = String(body.description || '').trim();
  const offeringType = String(body.offeringType || 'physical-product').trim();
  const modelStrategy = String(body.modelStrategy || 'series').trim();
  const category = String(body.category || '').trim();
  const series = String(body.series || '').trim();
  const image = String(body.image || '').trim();
  const sortOrder = Number.isFinite(Number(body.sortOrder)) ? Math.max(1, Math.round(Number(body.sortOrder))) : 9999;

  if (!title) throw new Error('Product title is required.');
  if (!description) throw new Error('Product description is required.');
  if (!['physical-product', 'service', 'solution'].includes(offeringType)) throw new Error('A valid offering type is required.');
  if (!['single-model', 'series', 'configurable', 'not-applicable'].includes(modelStrategy)) throw new Error('A valid model strategy is required.');
  if (!category) throw new Error('Product category is required.');
  if (!series) throw new Error('Product series is required.');

  const normalized: ManagerProductDraftPayload = {
    productSlug,
    title,
    description,
    offeringType: offeringType as ManagerProductDraftPayload['offeringType'],
    modelStrategy: modelStrategy as ManagerProductDraftPayload['modelStrategy'],
    category,
    series,
    sortOrder,
    published: body.published !== false,
    image,
    galleryImages: normalizeStringArray(body.galleryImages),
    detailImages: normalizeDetailImages(body.detailImages),
    applications: normalizeStringArray(body.applications),
    specs: normalizeSpecs(body.specs),
    specTables: normalizeSpecTables(body.specTables),
    highlights: normalizeStringArray(body.highlights),
    faqs: normalizeFaqs(body.faqs),
    featured: body.featured === true,
  };

  if (Object.prototype.hasOwnProperty.call(body, 'content')) {
    normalized.content = String((body as { content?: unknown }).content || '').trim();
  }

  return normalized;
};

export const normalizeBlogDraftPayload = (value: unknown): ManagerBlogDraftPayload => {
  const body = (value || {}) as Partial<ManagerBlogDraftPayload>;
  const blogSlug = String(body.blogSlug || '').trim();

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(blogSlug)) {
    throw new Error('A valid blog slug is required.');
  }

  const title = String(body.title || '').trim();
  const description = String(body.description || '').trim();
  const category = String(body.category || '').trim();
  const image = String(body.image || '').trim();
  const author = String(body.author || 'BusinessWeb Editorial Team').trim();
  const publishDate = String(body.publishDate || new Date().toISOString()).trim();
  const content = String(body.body || '').trim();

  if (!title) throw new Error('Blog title is required.');
  if (!description) throw new Error('Blog description is required.');
  if (!category) throw new Error('Blog category is required.');
  if (!content) throw new Error('Blog body is required.');

  return {
    blogSlug,
    title,
    description,
    category,
    image,
    author,
    publishDate,
    featured: body.featured === true,
    body: content,
  };
};

export const normalizeReviewDraftPayload = (value: unknown): ManagerReviewPayload => {
  const body = (value || {}) as Partial<ManagerReviewPayload>;
  const id = String(body.id || '').trim().toLowerCase();
  const kind = body.kind === 'demo' ? 'demo' : 'verified';
  const rating = String(body.rating) === '4' ? '4' : '5';
  const quote = String(body.quote || '').trim();
  const buyerLabel = String(body.buyerLabel || '').trim();
  const date = String(body.date || '').trim();
  const sourceUrl = String(body.sourceUrl || '').trim();
  const productSlugs = normalizeStringArray(body.productSlugs).map(slug => slug.toLowerCase());
  const seoEligible = body.seoEligible === true;
  const operation = body.operation === 'delete' ? 'delete' : 'upsert';

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) throw new Error('A valid review ID is required.');
  if (operation === 'upsert' && !quote) throw new Error('Review text is required.');
  if (operation === 'upsert' && !buyerLabel) throw new Error('Buyer display name is required.');
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Review date must use YYYY-MM-DD.');
  if (seoEligible && (kind !== 'verified' || !date || !sourceUrl || productSlugs.length === 0)) {
    throw new Error('SEO reviews must be verified and include a date, source URL, and at least one product slug.');
  }

  return {
    operation,
    id,
    published: body.published !== false,
    kind,
    rating,
    quote,
    buyerLabel,
    country: String(body.country || '').trim(),
    date,
    projectType: String(body.projectType || '').trim(),
    source: String(body.source || (kind === 'verified' ? 'Alibaba.com' : 'Layout preview')).trim(),
    sourceUrl,
    productSlugs,
    seoEligible: kind === 'verified' && seoEligible,
  };
};

const normalizeStringArray = (value: unknown) => {
  if (!Array.isArray(value)) return [];
  return value.map(item => String(item ?? '').trim()).filter(Boolean);
};

const normalizeDetailImages = (value: unknown) => {
  if (!Array.isArray(value)) return [];
  return value
    .map(item => {
      const image = (item || {}) as { image?: unknown; title?: unknown; caption?: unknown };
      return {
        image: String(image.image || '').trim(),
        title: String(image.title || '').trim(),
        caption: String(image.caption || '').trim(),
      };
    })
    .filter(item => item.image || item.title || item.caption);
};

const normalizeFaqs = (value: unknown) => {
  if (!Array.isArray(value)) return [];
  return value
    .map(item => {
      const faq = (item || {}) as { question?: unknown; answer?: unknown };
      return {
        question: String(faq.question || '').trim(),
        answer: String(faq.answer || '').trim(),
      };
    })
    .filter(item => item.question || item.answer);
};

const normalizeSpecs = (value: unknown) => {
  if (!Array.isArray(value)) return [];
  return value
    .map(item => {
      const spec = (item || {}) as { label?: unknown; value?: unknown };
      return {
        label: String(spec.label || '').trim(),
        value: String(spec.value || '').trim(),
      };
    })
    .filter(item => item.label || item.value);
};

const normalizePositiveInteger = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.max(1, Math.round(parsed)) : 1;
};

const normalizeSpecTables = (value: unknown) => {
  if (!Array.isArray(value)) return [];
  return value
    .map(item => {
      const table = (item || {}) as {
        title?: unknown;
        columns?: unknown;
        headerRows?: unknown;
        rows?: unknown;
      };
      const rows = Array.isArray(table.rows)
        ? table.rows
            .map(row => (Array.isArray(row) ? row.map(cell => String(cell ?? '').trim()) : []))
            .filter(row => row.length > 0)
        : [];

      return {
        title: String(table.title || '').trim(),
        columns: Array.isArray(table.columns) ? table.columns.map(column => String(column ?? '').trim()) : [],
        headerRows: Array.isArray(table.headerRows)
          ? table.headerRows.map(headerRow => {
              const row = (headerRow || {}) as { cells?: unknown };
              return {
                cells: Array.isArray(row.cells)
                  ? row.cells
                      .map(cell => {
                        const normalizedCell = (cell || {}) as { text?: unknown; colspan?: unknown; rowspan?: unknown };
                        return {
                          text: String(normalizedCell.text || '').trim(),
                          colspan: normalizePositiveInteger(normalizedCell.colspan),
                          rowspan: normalizePositiveInteger(normalizedCell.rowspan),
                        };
                      })
                      .filter(cell => cell.text)
                  : [],
              };
            })
          : [],
        rows,
      };
    })
    .filter(table => table.title || table.columns.length || table.rows.length);
};

export const createDraftId = (productSlug: string) => `product-${productSlug}-${Date.now().toString(36)}`;

export const createBlogDraftId = (blogSlug: string) => `blog-${blogSlug}-${Date.now().toString(36)}`;

export const createReviewDraftId = (reviewId: string) => `review-${reviewId}-${Date.now().toString(36)}`;

export const productDraftToResponse = (record: ProductDraftRecord) => ({
  id: record.id,
  productSlug: record.product_slug,
  productTitle: record.product_title,
  payload: JSON.parse(record.payload_json) as ManagerProductDraftPayload,
  status: record.status,
  createdBy: record.created_by,
  updatedBy: record.updated_by,
  createdAt: record.created_at,
  updatedAt: record.updated_at,
  appliedAt: record.applied_at,
});

export const blogDraftToResponse = (record: BlogDraftRecord) => ({
  id: record.id,
  blogSlug: record.blog_slug,
  blogTitle: record.blog_title,
  payload: JSON.parse(record.payload_json) as ManagerBlogDraftPayload,
  status: record.status,
  createdBy: record.created_by,
  updatedBy: record.updated_by,
  createdAt: record.created_at,
  updatedAt: record.updated_at,
  appliedAt: record.applied_at,
});

export const reviewDraftToResponse = (record: ReviewDraftRecord) => ({
  id: record.id,
  reviewId: record.review_id,
  buyerLabel: record.buyer_label,
  payload: JSON.parse(record.payload_json) as ManagerReviewPayload,
  status: record.status,
  createdBy: record.created_by,
  updatedBy: record.updated_by,
  createdAt: record.created_at,
  updatedAt: record.updated_at,
  appliedAt: record.applied_at,
});
