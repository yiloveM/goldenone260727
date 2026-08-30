import astroServer from '@astrojs/cloudflare/entrypoints/server';
import {
  ADMIN_PORTAL_HEADER,
  getAdminPortalHost,
  getAdminPortalConfigSet,
  type AdminPortalConfig,
  type AdminPortalName,
} from './lib/admin-portals';
import { rewritePortalLocation, rewritePortalText } from './lib/admin-portal-rewrite';
import { capturePublicPageView } from './lib/analytics/capture';
import { getEnvString } from './lib/runtime-env';
import { getScopedRuntimeSecret } from './lib/runtime-secret';
import analyticsDashboardSettings from './keystatic/analytics-dashboard.json';
import industryProfile from './data/industry-profile.json';

type WorkerEnv = Parameters<(typeof astroServer)['fetch']>[1] & Record<string, unknown>;
type WorkerContext = Parameters<(typeof astroServer)['fetch']>[2];

const astro = astroServer;
const PORTAL_COOKIE = '__Host-goldenone-portal';
const SESSION_TTL_SECONDS = 12 * 60 * 60;
const managerAnalyticsEnabled = analyticsDashboardSettings.managerVisible === true;
const portalBrand = String(industryProfile.brand?.name || 'Golden One').trim() || 'Golden One';
const portalOwner = String(industryProfile.governance?.contentOwner || 'Site owner').trim() || 'Site owner';
const PRIVATE_HEADERS = {
  'cache-control': 'private, no-store, max-age=0',
  'permissions-policy': 'camera=(), geolocation=(), microphone=()',
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'x-robots-tag': 'noindex, nofollow, noarchive, nosnippet',
};

const isProtectedPublicPath = (pathname: string) =>
  /^\/(?:manager(?:\/|$)|keystatic(?:\/|$)|api\/(?:analytics(?:\/|$)|manager(?:\/|$)|keystatic(?:\/|$)|ai(?:\/|$)|deploy\/site$|products\/manager$|r2\/assets$))/.test(
    pathname
  );

const isPortalAssetPath = (pathname: string) => pathname.startsWith('/_astro/');
const isDirectPortalApiPath = (pathname: string) => pathname.startsWith('/api/');
const isKeystaticOAuthCallback = (pathname: string) => pathname === '/api/keystatic/github/oauth/callback';
const isLoopbackHost = (hostname: string) => hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';

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

const getSessionSecret = async (env: WorkerEnv) => {
  const derivedSecret = await getScopedRuntimeSecret(env, 'admin-portal-session');
  const portalPassword = getEnvString(env, 'KEYSTATIC_SECRET');
  return derivedSecret.length >= 32 && portalPassword.length >= 32 ? `${derivedSecret}:${portalPassword}` : '';
};

const getPortalLoginCredentials = (env: WorkerEnv) => ({
  username: getEnvString(env, 'PUBLIC_KEYSTATIC_GITHUB_APP_SLUG'),
  password: getEnvString(env, 'KEYSTATIC_SECRET'),
});

const hasPortalLoginCredentials = (credentials: ReturnType<typeof getPortalLoginCredentials>) =>
  credentials.username.length > 0 && credentials.password.length >= 32;

const signPortalSession = async (secret: string, portal: AdminPortalConfig, expiresAt: number) => {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return base64Url(
    await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`v1|${portal.name}|${portal.host}|${expiresAt}`))
  );
};

const hasValidPortalSession = async (request: Request, env: WorkerEnv, portal: AdminPortalConfig) => {
  const secret = await getSessionSecret(env);
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
  const secret = await getSessionSecret(env);
  if (secret.length < 32) return null;

  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const signature = await signPortalSession(secret, portal, expiresAt);
  return `${PORTAL_COOKIE}=v1.${portal.name}.${expiresAt}.${signature}; Path=/; Max-Age=${SESSION_TTL_SECONDS}; Secure; HttpOnly; SameSite=Strict`;
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

const portalLoginResponse = (
  request: Request,
  portal: AdminPortalConfig,
  options: { error?: string; status?: number } = {}
) => {
  const portalLabel = portal.name === 'keystatic' ? '站长后台' : '内容管理后台';
  const portalPrompt = portal.name === 'keystatic' ? '' : '请使用站长提供的账号登录';
  const submitLabel = portal.name === 'keystatic' ? '登录' : '进入内容后台';
  const action = escapeHtml(`/${portal.uuid}`);
  const error = options.error
    ? `<p class="login-error" role="alert">${escapeHtml(options.error)}</p>`
    : '<p class="login-error" aria-hidden="true"></p>';
  const html = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${portalLabel}登录 | ${escapeHtml(portalBrand)}</title>
    <style>
      :root { color-scheme: light; font-family: Inter, "Segoe UI", system-ui, sans-serif; }
      * { box-sizing: border-box; }
      body { margin: 0; min-width: 320px; min-height: 100vh; color: #17202a; background: #f4f7f6; }
      .login-shell { min-height: 100vh; display: grid; place-items: center; padding: 24px; }
      .login-panel { width: min(100%, 400px); padding: 32px; border: 1px solid #d6dedb; border-radius: 8px; background: #fff; box-shadow: 0 18px 48px rgba(22, 45, 39, 0.1); }
      .brand { margin: 0 0 8px; color: #2457c5; font-size: 14px; font-weight: 750; }
      h1 { margin: 0; color: #111827; font-size: 28px; line-height: 1.2; letter-spacing: 0; }
      .portal-label { margin: 8px 0 28px; color: #667085; font-size: 14px; }
      .portal-prompt { margin: -14px 0 20px; color: #475467; font-size: 14px; line-height: 1.5; }
      form { display: grid; gap: 16px; }
      label { display: grid; gap: 7px; color: #344054; font-size: 14px; font-weight: 650; }
      input { width: 100%; height: 44px; padding: 0 12px; border: 1px solid #b8c4c0; border-radius: 6px; color: #17202a; background: #fff; font: inherit; outline: none; }
      input:focus { border-color: #2457c5; box-shadow: 0 0 0 3px rgba(36, 87, 197, 0.14); }
      button { height: 44px; margin-top: 4px; border: 0; border-radius: 6px; color: #fff; background: #2457c5; font: inherit; font-weight: 750; cursor: pointer; }
      button:hover { background: #183b91; }
      button:focus-visible { outline: 3px solid rgba(36, 87, 197, 0.24); outline-offset: 2px; }
      .login-error { min-height: 20px; margin: 2px 0 0; color: #b42318; font-size: 13px; line-height: 1.5; }
      @media (max-width: 480px) { .login-shell { padding: 16px; } .login-panel { padding: 24px 20px; } }
    </style>
  </head>
  <body>
    <main class="login-shell">
      <section class="login-panel" aria-labelledby="login-owner">
        <p class="brand">${escapeHtml(portalBrand)}</p>
        <h1 id="login-owner">${escapeHtml(portalOwner)}</h1>
        <p class="portal-label">${portalLabel}</p>
        ${portalPrompt ? `<p class="portal-prompt">${portalPrompt}</p>` : ''}
        <form method="post" action="${action}">
          <label>用户名<input name="username" type="text" autocomplete="username" maxlength="100" required autofocus /></label>
          <label>密码<input name="password" type="password" autocomplete="current-password" maxlength="256" required /></label>
          <button type="submit">${submitLabel}</button>
          ${error}
        </form>
      </section>
    </main>
  </body>
</html>`;
  return new Response(request.method === 'HEAD' ? null : html, {
    status: options.status || 200,
    headers: {
      ...PRIVATE_HEADERS,
      'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
      'content-type': 'text/html; charset=utf-8',
    },
  });
};

const readPortalLogin = async (request: Request) => {
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(contentLength) && contentLength > 8192) return { username: '', password: '' };
  try {
    const form = await request.formData();
    return {
      username: typeof form.get('username') === 'string' ? String(form.get('username')).trim() : '',
      password: typeof form.get('password') === 'string' ? String(form.get('password')) : '',
    };
  } catch {
    return { username: '', password: '' };
  }
};

const mapPortalPath = (pathname: string, portal: AdminPortalConfig) => {
  const prefix = `/${portal.uuid}`;
  if (pathname !== prefix && !pathname.startsWith(`${prefix}/`)) return null;

  const suffix = pathname.slice(prefix.length) || '/';
  if (suffix === '/') return portal.name === 'keystatic' ? '/keystatic/' : '/manager/';
  if (suffix.startsWith('/api/')) return suffix;
  if (portal.name === 'keystatic') return `/keystatic${suffix}`;
  if (portal.name === 'manager' && (suffix === '/reviews' || suffix === '/reviews/')) return '/manager/reviews/';
  if (portal.name === 'manager' && managerAnalyticsEnabled && (suffix === '/analytics' || suffix === '/analytics/')) {
    return '/manager/analytics/';
  }
  return null;
};

const isPortalEntryPath = (mappedPath: string, portal: AdminPortalConfig) =>
  mappedPath === (portal.name === 'keystatic' ? '/keystatic/' : '/manager/');

const contextWithEnv = (context: WorkerContext, env: WorkerEnv) => ({
  env,
  waitUntil: (promise: Promise<unknown>) => context.waitUntil(promise),
  passThroughOnException: () => context.passThroughOnException(),
  get props() {
    return (context as WorkerContext & { props?: unknown }).props;
  },
}) as unknown as WorkerContext;

const fetchAstro = (request: Request, env: WorkerEnv, context: WorkerContext) =>
  astro.fetch(request, env, contextWithEnv(context, env));

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
    const isEntry = isPortalEntryPath(mappedPath, portal);

    if (isEntry && !hasSession) {
      const credentials = getPortalLoginCredentials(env);
      if (!hasPortalLoginCredentials(credentials)) {
        return portal.name === 'manager'
          ? portalLoginResponse(request, portal, { error: '暂时无法登录，请联系站长检查后台设置。', status: 503 })
          : unavailable();
      }
      if (request.method === 'GET' || request.method === 'HEAD') return portalLoginResponse(request, portal);
      if (request.method !== 'POST') {
        return new Response('Method not allowed.', {
          status: 405,
          headers: { ...PRIVATE_HEADERS, allow: 'GET, HEAD, POST', 'content-type': 'text/plain; charset=utf-8' },
        });
      }

      const submitted = await readPortalLogin(request);
      if (
        !timingSafeEqual(submitted.username, credentials.username) ||
        !timingSafeEqual(submitted.password, credentials.password)
      ) {
        return portalLoginResponse(request, portal, {
          error: portal.name === 'manager' ? '账号或密码不正确，请确认后重试；如仍无法登录，请联系站长。' : '用户名或密码不正确。',
          status: 401,
        });
      }

      const cookie = await sessionCookie(env, portal);
      if (!cookie) return unavailable();
      return new Response(null, {
        status: 303,
        headers: { ...PRIVATE_HEADERS, location: `/${portal.uuid}`, 'set-cookie': cookie },
      });
    }

    if (!hasSession) return notFound();
    if (isEntry && request.method === 'POST') {
      return new Response(null, { status: 303, headers: { ...PRIVATE_HEADERS, location: `/${portal.uuid}` } });
    }
    url.pathname = mappedPath;
    const response = await fetchAstro(requestForInternalPath(request, url, portal.name), env, context);
    return securePortalResponse(response, portal);
  }

  if (portal.name === 'keystatic' && isKeystaticOAuthCallback(url.pathname)) {
    const response = await fetchAstro(requestForInternalPath(request, url, portal.name), env, context);
    return securePortalResponse(response, portal);
  }

  // A signed portal session is sufficient for same-host API calls. This keeps
  // dynamically loaded admin bundles working even when their URLs were not rewritten.
  if (isDirectPortalApiPath(url.pathname) && (await hasValidPortalSession(request, env, portal))) {
    const response = await fetchAstro(requestForInternalPath(request, url, portal.name), env, context);
    return securePortalResponse(response, portal);
  }

  if (isPortalAssetPath(url.pathname) && (await hasValidPortalSession(request, env, portal))) {
    const response = await fetchAstro(requestForInternalPath(request, url), env, context);
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

    if (!isLoopbackHost(hostname) && isProtectedPublicPath(url.pathname)) return notFound();
    const response = await fetchAstro(requestForInternalPath(request, url), env, context);
    context.waitUntil(
      capturePublicPageView(request, response, env).catch(error => {
        console.error({
          event: 'public_analytics_capture_failed',
          error: error instanceof Error ? error.message : String(error),
          path: url.pathname,
        });
      })
    );
    return response;
  },
};
