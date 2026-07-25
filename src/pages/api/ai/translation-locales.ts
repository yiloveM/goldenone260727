import type { APIRoute } from 'astro';
import { publicTargetLocales, targetLocaleOptions } from '../../../data/i18n';

export const GET: APIRoute = () => new Response(JSON.stringify({
  locales: targetLocaleOptions,
  publicLocales: publicTargetLocales,
}), {
  headers: { 'cache-control': 'no-store', 'content-type': 'application/json; charset=utf-8' },
});
