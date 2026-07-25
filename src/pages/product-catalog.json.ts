import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { getCategoryMeta, isProductPublished, sortProductsByPriority } from '../data/productCategories';
import { siteInfo } from '../data/site';

export const prerender = true;

const modelColumn = /^(model|model no\.?|model number|item|item no\.?|code|sku|mpn)$/i;

const modelData = (table: {
  title: string;
  columns: string[];
  rows: string[][];
}) => {
  const modelIndex = table.columns.findIndex(column => modelColumn.test(column.trim()));
  if (modelIndex < 0) return [];

  const models = new Map<string, Array<Record<string, string>>>();
  for (const row of table.rows) {
    const model = String(row[modelIndex] || '').trim();
    if (!model) continue;
    const values = Object.fromEntries(
      table.columns
        .map((column, index) => [column, String(row[index] || '').trim()] as const)
        .filter(([, value]) => value)
    );
    models.set(model, [...(models.get(model) || []), values]);
  }

  return [...models].map(([model, specifications]) => ({ model, specifications }));
};

export const GET: APIRoute = async ({ site }) => {
  const origin = site?.origin || 'https://businessweb.workers.dev';
  const products = sortProductsByPriority((await getCollection('products')).filter(isProductPublished));

  const catalog = {
    schemaVersion: 1,
    name: `${siteInfo.name} Product Catalog`,
    description: siteInfo.description,
    publisher: {
      name: siteInfo.name,
      url: `${origin}/`,
      email: siteInfo.email,
      telephone: siteInfo.phone,
    },
    productCount: products.length,
    products: products.map(product => {
      const slug = product.id.replace(/\.mdoc$/, '');
      const category = getCategoryMeta(product.data.category);
      return {
        slug,
        url: new URL(`/products/${slug}/`, `${origin}/`).toString(),
        title: product.data.title,
        description: product.data.description,
        brand: siteInfo.name,
        offeringType: product.data.offeringType,
        modelStrategy: product.data.modelStrategy,
        category: category.displayName || category.name,
        series: product.data.series,
        image: product.data.image || undefined,
        applications: product.data.applications,
        commonSpecifications: product.data.specs.map(spec => ({
          name: spec.label,
          value: spec.value,
        })),
        specificationTables: product.data.specTables.map(table => ({
          title: table.title,
          columns: table.columns,
          rows: table.rows,
          models: modelData(table),
        })),
        highlights: product.data.highlights,
        faqs: product.data.faqs,
      };
    }),
  };

  return new Response(JSON.stringify(catalog, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=86400',
    },
  });
};
