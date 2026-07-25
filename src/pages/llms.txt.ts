import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { buildProductCategories, isProductPublished } from '../data/productCategories';
import { siteInfo } from '../data/site';
import { industryProfile, profileKeywords } from '../data/industry-profile';

export const prerender = true;

export const GET: APIRoute = async ({ site }) => {
  const origin = site?.origin || 'https://businessweb.workers.dev';
  const products = (await getCollection('products')).filter(isProductPublished);
  const categories = buildProductCategories(products);
  const absolute = (path: string) => new URL(path, `${origin}/`).toString();

  const lines = [
    `# ${siteInfo.name}`,
    '',
    `> ${siteInfo.description}`,
    '',
    `${siteInfo.name} is an international ${industryProfile.market.industry} business website for external B2B buyers, project teams, and commercial partners.`,
    '',
    '## Primary resources',
    '',
    `- [Products](${absolute('/products/')}): Published product, service, or solution catalog pages.`,
    `- [Machine-readable catalog](${absolute('/product-catalog.json')}): Public product, series, application, specification, and model data.`,
    `- [Insights](${absolute('/blog/')}): Article and guide collection.`,
    `- [About](${absolute('/about/')}): Company approach and capability information.`,
    `- [Contact](${absolute('/contact/')}): Inquiry and contact form page.`,
    '',
    '## Active categories',
    '',
    ...categories.map(category =>
      `- [${category.displayName || category.name}](${absolute(category.href)}): ${category.description} (${category.count} items).`
    ),
    '',
    '## Content notes',
    '',
    `- Core topics: ${profileKeywords().join(', ') || industryProfile.market.industry}.`,
    '- Product availability, pricing, certifications, warranty, and project suitability are only authoritative when visibly published and verified by the business.',
    '- Published translations use locale-prefixed URLs and preserve model codes, units, URLs, and contact details.',
    '',
  ];

  return new Response(lines.join('\n'), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=86400',
    },
  });
};
