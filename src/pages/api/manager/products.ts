import { readProductCatalog } from '../../../lib/manager/product-catalog';
import { getDispatchToken } from '../../../lib/manager/github';
import type { APIRoute } from 'astro';
import productEditorSettings from '../../../data/product-editor-settings.json';
import { resolveProductEditorPolicy } from '../../../lib/product-editor.mjs';
import { getCollection } from 'astro:content';
import { allCustomerReviews } from '../../../data/customerReviews';
import { storedProductReviews } from '../../../lib/product-reviews.mjs';
import { productCategoryMeta, sortProductsByPriority } from '../../../data/productCategories';
import { getRuntimeEnv, requireManagerAccess } from '../../../lib/manager/access';
import { productPath } from '../../../data/i18n';
import siteOriginConfig from '../../../data/site-origin.json';

export const prerender = false;

const slugFromId = (id: string) => id.replace(/\.mdoc$/, '');

export const GET: APIRoute = async ({ locals, request }) => {
  const env = getRuntimeEnv(locals);
  const access = requireManagerAccess(request, env);
  if (access.response) return access.response;

  const products = sortProductsByPriority(await getCollection('products'));
  let catalog: Awaited<ReturnType<typeof readProductCatalog>> | null = null;
  try { catalog = await readProductCatalog(env,getDispatchToken(env)); } catch { /* Compiled read-only metadata remains available. */ }
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
      translations: catalog?.translations || [],
      warning: catalog?.warning || (catalog ? '' : '最新产品暂无法同步，当前为部署时目录；删除前必须重新核验最新版本。'),
      branch: catalog?.branch,
      editorPolicy: resolveProductEditorPolicy(productEditorSettings),
      products: catalog ? catalog.products.map(product => ({...product, reviews:storedProductReviews(product.slug,product.reviews,allCustomerReviews)})) : products.map(product => ({
        id: product.id,
        slug: slugFromId(product.id),
        publicUrl: new URL(productPath(slugFromId(product.id)), siteOriginConfig.productionUrl || 'http://localhost').href,
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
