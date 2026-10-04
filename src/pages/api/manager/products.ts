import type { APIRoute } from 'astro';
import productEditorSettings from '../../../data/product-editor-settings.json';
import { resolveProductEditorPolicy } from '../../../lib/product-editor.mjs';
import { getCollection } from 'astro:content';
import { allCustomerReviews } from '../../../data/customerReviews';
import { storedProductReviews } from '../../../lib/product-reviews.mjs';
import { productCategoryMeta, sortProductsByPriority } from '../../../data/productCategories';
import { getRuntimeEnv, requireManagerAccess } from '../../../lib/manager/access';

export const prerender = false;

const slugFromId = (id: string) => id.replace(/\.mdoc$/, '');

export const GET: APIRoute = async ({ locals, request }) => {
  const env = getRuntimeEnv(locals);
  const access = requireManagerAccess(request, env);
  if (access.response) return access.response;

  const products = sortProductsByPriority(await getCollection('products'));
  const categories = [
    ...productCategoryMeta.map(category => category.name),
    ...Array.from(new Set(products.map(product => product.data.category))).filter(
      category => !productCategoryMeta.some(meta => meta.name === category)
    ),
  ];

  return new Response(
    JSON.stringify({
      manager: { email: access.email },
      categories,
      editorPolicy: resolveProductEditorPolicy(productEditorSettings),
      products: products.map(product => ({
        id: product.id,
        slug: slugFromId(product.id),
        title: product.data.title,
        description: product.data.description,
        offeringType: product.data.offeringType,
        modelStrategy: product.data.modelStrategy,
        category: product.data.category,
        series: product.data.series,
        image: product.data.image,
        galleryImages: product.data.galleryImages,
        detailImages: product.data.detailImages,
        applications: product.data.applications,
        sortOrder: product.data.sortOrder,
        published: product.data.published !== false,
        specs: product.data.specs,
        specTables: product.data.specTables,
        highlights: product.data.highlights,
        faqs: product.data.faqs,
        reviews: storedProductReviews(slugFromId(product.id), product.data.reviews, allCustomerReviews),
        aggregateRatingValue: product.data.aggregateRatingValue,
        aggregateRatingCount: product.data.aggregateRatingCount,
        featured: product.data.featured,
        content: (product as unknown as { body?: string }).body || '',
      })),
    }),
    {
      headers: {
        'cache-control': 'no-store',
        'content-type': 'application/json; charset=utf-8',
      },
    }
  );
};
