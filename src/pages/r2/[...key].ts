import type { APIRoute } from 'astro';
import { getRuntimeEnv } from '../../lib/runtime-env';

export const prerender = false;

const MIME_TYPES: Record<string, string> = {
  avif: 'image/avif',
  gif: 'image/gif',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  svg: 'image/svg+xml',
  webp: 'image/webp',
  pdf: 'application/pdf',
};

export const GET: APIRoute = async ({ params, locals }) => {
  const key = params.key;

  if (!key || key.includes('..') || key.startsWith('/')) {
    return new Response('Bad R2 object key', { status: 400 });
  }

  const bucket = getRuntimeEnv(locals)?.CONTENT_BUCKET as any;
  if (!bucket) {
    return new Response('R2 binding CONTENT_BUCKET is not configured', { status: 503 });
  }

  const object = await bucket.get(key);
  if (!object) {
    return new Response('R2 object not found', { status: 404 });
  }

  const extension = key.split('.').pop()?.toLowerCase() || '';
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  headers.set('content-type', headers.get('content-type') || MIME_TYPES[extension] || 'application/octet-stream');
  headers.set('cache-control', 'public, max-age=31536000, immutable');

  return new Response(object.body, { headers });
};
