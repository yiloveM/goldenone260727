import astroServer from '@astrojs/cloudflare/entrypoints/server';
import {
  ADMIN_PORTAL_HEADER,
  getAdminPortalHost,
  getAdminPortalConfigSet,
  type AdminPortalConfig,
  type AdminPortalName,
} from './lib/admin-portals';
import { rewritePortalLocation, rewritePortalText } from './lib/admin-portal-rewrite';

type WorkerEnv = Parameters<(typeof astroServer)['fetch']>[1] & Record<string, unknown>;
type WorkerContext = Parameters<(typeof astroServer)['fetch']>[2];

const astro = astroServer;
const PORTAL_COOKIE = '__Host-goldenone-portal';
const PORTAL_SESSION_SECRET = 'ADMIN_PORTAL_SESSION_SECRET';
const SESSION_TTL_SECONDS = 12 * 60 * 60;
const PRIVATE_HEADERS = {
  'cache-control': 'private, no-store, max-age=0',
  'permissions-policy': 'camera=(), geolocation=(), microphone=()',
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'x-robots-tag': 'noindex, nofollow, noarchive, nosnippet',
};

const isProtectedPublicPath = (pathname: string) =>
  /^\/(?:manager(?:\/|$)|keystatic(?:\/|$)|api\/(?:manager(?:\/|$)|keystatic(?:\/|$)|ai(?:\/|$)|deploy\/site$|products\/manager$|r2\/assets$))/.test(
    pathname
  );

const isPortalAssetPath = (pathname: string) => pathname.startsWith('/_astro/');
const isKeystaticOAuthCallback = (pathname: string) => pathname === '/api/keystatic/github/oauth/callback';

const notFound = () =>
  new Response('Not found.', {
    status: 404,
    headers: { ...PRIVATE_HEADERS, 'content-type': 'text/plain; charset=utf-8' },
  });

const unavailable = () =>
  new Response('Admin portal configuration is unavailable.', {
    status: 503,
    headers: { ...PRIVATE_HEADERS, 'content-type': 'text/plain; charset=utf-8' },
  });

const parseCookies = (request: Request) => {
  const cookies: Record<string, string> = {};
  for (const part of (request.headers.get('cookie') || '').split(';')) {
    const [name, ...value] = part.trim().split('=');
    if (!name || !value.length) continue;
    cookies[name] = value.join('=');
  }
  return cookies;
};

const base64Url = (bytes: ArrayBuffer) => {
  const value = new Uint8Array(bytes);
  let binary = '';
  for (let index = 0; index < value.length; index += 1) binary += String.fromCharCode(value[index]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const timingSafeEqual = (left: string, right: string) => {
  if (left.length !== right.length) return false;
  let result = 0;
  for (let index = 0; index < left.length; index += 1) result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return result === 0;
};

const getSessionSecret = (env: WorkerEnv) =>
  typeof env[PORTAL_SESSION_SECRET] === 'string' ? env[PORTAL_SESSION_SECRET].trim() : '';

const signPortalSession = async (secret: string, portal: AdminPortalConfig, expiresAt: number) => {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return base64Url(
    await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`v1|${portal.name}|${portal.host}|${expiresAt}`))
  );
};

const hasValidPortalSession = async (request: Request, env: WorkerEnv, portal: AdminPortalConfig) => {
  const secret = getSessionSecret(env);
  if (secret.length < 32) return false;

  const token = parseCookies(request)[PORTAL_COOKIE] || '';
  const [version, name, expiresRaw, signature] = token.split('.');
  const expiresAt = Number(expiresRaw);
  const now = Math.floor(Date.now() / 1000);

  if (
    version !== 'v1' ||
    name !== portal.name ||
    !Number.isSafeInteger(expiresAt) ||
    expiresAt <= now ||
    expiresAt > now + SESSION_TTL_SECONDS + 60 ||
    !signature
  ) {
    return false;
  }

  return timingSafeEqual(signature, await signPortalSession(secret, portal, expiresAt));
};

const sessionCookie = async (env: WorkerEnv, portal: AdminPortalConfig) => {
  const secret = getSessionSecret(env);
  if (secret.length < 32) return null;

  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const signature = await signPortalSession(secret, portal, expiresAt);
  return `${PORTAL_COOKIE}=v1.${portal.name}.${expiresAt}.${signature}; Path=/; Max-Age=${SESSION_TTL_SECONDS}; Secure; HttpOnly; SameSite=Strict`;
};

const mapPortalPath = (pathname: string, portal: AdminPortalConfig) => {
  const prefix = `/${portal.uuid}`;
  if (pathname !== prefix && !pathname.startsWith(`${prefix}/`)) return null;

  const suffix = pathname.slice(prefix.length) || '/';
  if (suffix === '/') return portal.name === 'keystatic' ? '/keystatic/' : '/manager/';
  if (suffix.startsWith('/api/')) return suffix;
  if (portal.name === 'keystatic') return `/keystatic${suffix}`;
  if (portal.name === 'manager' && (suffix === '/reviews' || suffix === '/reviews/')) return '/manager/reviews/';
  return null;
};

const isPortalEntryPath = (mappedPath: string, portal: AdminPortalConfig) =>
  mappedPath === (portal.name === 'keystatic' ? '/keystatic/' : '/manager/');

const isSafeMethod = (request: Request) => request.method === 'GET' || request.method === 'HEAD';

const requestForInternalPath = (request: Request, target: URL, portal?: AdminPortalName) => {
  const headers = new Headers(request.headers);
  headers.delete(ADMIN_PORTAL_HEADER);
  if (portal) headers.set(ADMIN_PORTAL_HEADER, portal);

  const init: RequestInit = {
    headers,
    method: request.method,
    redirect: request.redirect,
  };
  if (request.method !== 'GET' && request.method !== 'HEAD') init.body = request.body;
  return new Request(target, init);
};

const isRewritableTextResponse = (contentType: string) =>
  /^(?:text\/(?:html|javascript)|application\/(?:javascript|x-javascript))\b/i.test(contentType);

const securePortalResponse = async (response: Response, portal: AdminPortalConfig, cookie?: string | null) => {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(PRIVATE_HEADERS)) headers.set(name, value);
  if (cookie) headers.append('set-cookie', cookie);

  const location = headers.get('location');
  if (location) headers.set('location', rewritePortalLocation(location, portal));

  const contentType = headers.get('content-type') || '';
  if (!isRewritableTextResponse(contentType)) return new Response(response.body, { status: response.status, statusText: response.statusText, headers });

  const body = rewritePortalText(await response.text(), portal);
  headers.delete('content-encoding');
  headers.delete('content-length');
  return new Response(body, { status: response.status, statusText: response.statusText, headers });
};

const handlePortalRequest = async (
  request: Request,
  env: WorkerEnv,
  context: WorkerContext,
  portal: AdminPortalConfig
) => {
  const url = new URL(request.url);
  const mappedPath = mapPortalPath(url.pathname, portal);

  if (mappedPath) {
    const hasSession = await hasValidPortalSession(request, env, portal);
    const startsSession = isPortalEntryPath(mappedPath, portal) && isSafeMethod(request);
    if (!hasSession && !startsSession) return notFound();

    const cookie = startsSession && !hasSession ? await sessionCookie(env, portal) : null;
    if (startsSession && !hasSession && !cookie) return unavailable();
    url.pathname = mappedPath;
    const response = await astro.fetch(requestForInternalPath(request, url, portal.name), env, context);
    return securePortalResponse(response, portal, cookie);
  }

  if (portal.name === 'keystatic' && isKeystaticOAuthCallback(url.pathname)) {
    const response = await astro.fetch(requestForInternalPath(request, url), env, context);
    return securePortalResponse(response, portal);
  }

  if (isPortalAssetPath(url.pathname) && (await hasValidPortalSession(request, env, portal))) {
    const response = await astro.fetch(requestForInternalPath(request, url), env, context);
    return securePortalResponse(response, portal);
  }

  return notFound();
};

export default {
  async fetch(request: Request, env: WorkerEnv, context: WorkerContext) {
    const url = new URL(request.url);
    const hostname = url.hostname.toLowerCase();
    const keystaticHost = getAdminPortalHost(env, 'keystatic');
    const managerHost = getAdminPortalHost(env, 'manager');
    const portals = getAdminPortalConfigSet(env);

    if (hostname === keystaticHost) {
      return portals ? handlePortalRequest(request, env, context, portals.keystatic) : unavailable();
    }
    if (hostname === managerHost) {
      return portals ? handlePortalRequest(request, env, context, portals.manager) : unavailable();
    }

    if (isProtectedPublicPath(url.pathname)) return notFound();
    return astro.fetch(requestForInternalPath(request, url), env, context);
  },
};
