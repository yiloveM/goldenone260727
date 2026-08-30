import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const localizedDraftLocales = ['zh', 'ar', 'hi', 'es', 'fr', 'bn', 'pt', 'ru', 'ur', 'de', 'tr', 'fil', 'ko', 'uz'] as const;

const specTableSchema = z.object({
  title: z.string(),
  columns: z.array(z.string()),
  headerRows: z.array(z.object({
    cells: z.array(z.object({
      text: z.string(),
      colspan: z.number().int().positive().default(1),
      rowspan: z.number().int().positive().default(1),
    })),
  })).default([]),
  rows: z.preprocess(
    value => value ?? [],
    z.array(z.array(z.coerce.string()))
  ),
});

const blog = defineCollection({
  // Keep legacy `.mdoc` IDs so product routes and CMS write-back paths stay stable.
  loader: glob({ pattern: '**/*.mdoc', base: './src/content/blog', generateId: ({ entry }) => entry }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    publishDate: z.date(),
    category: z.string(),
    image: z.string().default(''),
    author: z.string().default('Golden One Editorial Team'),
    featured: z.boolean().default(false),
  }),
});

const products = defineCollection({
  loader: glob({ pattern: '**/*.mdoc', base: './src/content/products', generateId: ({ entry }) => entry }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    offeringType: z.enum(['physical-product', 'service', 'solution']).default('physical-product'),
    modelStrategy: z.enum(['single-model', 'series', 'configurable', 'not-applicable']).default('series'),
    category: z.string(),
    series: z.string(),
    sortOrder: z.number().int().default(9999),
    published: z.boolean().default(true),
    image: z.string().default(''),
    galleryImages: z.array(z.string()).default([]),
    detailImages: z.array(z.object({
      image: z.string(),
      title: z.string().default(''),
      caption: z.string().default(''),
    })).default([]),
    applications: z.array(z.string()),
    specs: z.array(z.object({ label: z.string(), value: z.string() })),
    specTables: z.array(specTableSchema).default([]).transform(tables => tables.filter(table => table.rows.length > 0)),
    highlights: z.array(z.string()),
    faqs: z.array(z.object({
      question: z.string(),
      answer: z.string(),
    })).default([]),
    aggregateRatingValue: z.string()
      .refine(value => value === '' || (/^(?:[1-4](?:\.\d)?|5(?:\.0)?)$/.test(value) && Number(value) >= 1), 'Rating must be between 1.0 and 5.0.')
      .default(''),
    aggregateRatingCount: z.number().int().nonnegative().default(0),
    featured: z.boolean().default(false),
  }),
});

const productTranslations = defineCollection({
  loader: glob({ pattern: '**/*.mdoc', base: './src/content/productTranslations', generateId: ({ entry }) => entry }),
  schema: z.object({
    sourceSlug: z.string(),
    sourceTitle: z.string().default(''),
    locale: z.enum(localizedDraftLocales),
    published: z.boolean().default(false),
    generatedAt: z.coerce.string().default(''),
    title: z.string(),
    description: z.string(),
    offeringType: z.enum(['physical-product', 'service', 'solution']).default('physical-product'),
    modelStrategy: z.enum(['single-model', 'series', 'configurable', 'not-applicable']).default('series'),
    categoryName: z.string().default(''),
    series: z.string().default(''),
    applications: z.array(z.string()).default([]),
    specs: z.array(z.object({ label: z.string(), value: z.string() })).default([]),
    specTables: z.array(specTableSchema).default([]).transform(tables => tables.filter(table => table.rows.length > 0)),
    highlights: z.array(z.string()).default([]),
    faqs: z.array(z.object({
      question: z.string(),
      answer: z.string(),
    })).default([]),
  }),
});

const blogTranslations = defineCollection({
  loader: glob({ pattern: '**/*.mdoc', base: './src/content/blogTranslations', generateId: ({ entry }) => entry }),
  schema: z.object({
    sourceSlug: z.string(),
    sourceTitle: z.string().default(''),
    locale: z.enum(localizedDraftLocales),
    published: z.boolean().default(false),
    generatedAt: z.coerce.string().default(''),
    title: z.string(),
    description: z.string(),
    category: z.string().default(''),
  }),
});

export const collections = { blog, products, productTranslations, blogTranslations };
