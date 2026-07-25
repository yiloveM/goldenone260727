import type { APIRoute } from 'astro';

export const GET: APIRoute = ({ site }) => {
  const origin = site?.origin || 'https://businessweb.workers.dev';
  return new Response(
    [
      'User-agent: *',
      'Allow: /',
      'Disallow: /keystatic/',
      'Disallow: /manager/',
      'Disallow: /api/',
      'Disallow: /r2/',
      `Sitemap: ${origin}/sitemap-index.xml`,
      '',
    ].join('\n'),
    {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    }
  );
};
