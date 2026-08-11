import type { RuntimeEnv } from './runtime-env';

export type AdminPortalName = 'keystatic' | 'manager';

export const ADMIN_PORTAL_HEADER = 'x-goldenone-internal-portal';

export type AdminPortalConfig = {
  name: AdminPortalName;
  host: string;
  uuid: string;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HOST_PATTERN = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

const getEnvString = (env: RuntimeEnv, key: string) =>
  typeof env?.[key] === 'string' ? env[key].trim() : '';

const configKeys: Record<AdminPortalName, { host: string; uuid: string }> = {
  keystatic: {
    host: 'KEYSTATIC_PORTAL_HOST',
    uuid: 'KEYSTATIC_PORTAL_UUID',
  },
  manager: {
    host: 'MANAGER_PORTAL_HOST',
    uuid: 'MANAGER_PORTAL_UUID',
  },
};

const normalizeHost = (value: string) => value.toLowerCase().replace(/\.$/, '');

export const getAdminPortalHost = (env: RuntimeEnv, name: AdminPortalName) => {
  const host = normalizeHost(getEnvString(env, configKeys[name].host));
  return HOST_PATTERN.test(host) ? host : null;
};

export const getAdminPortalConfig = (env: RuntimeEnv, name: AdminPortalName): AdminPortalConfig | null => {
  const keys = configKeys[name];
  const host = getAdminPortalHost(env, name);
  const uuid = getEnvString(env, keys.uuid).toLowerCase();

  if (!host || !UUID_PATTERN.test(uuid)) return null;
  return { name, host, uuid };
};

export const getAdminPortalConfigSet = (env: RuntimeEnv) => {
  const keystatic = getAdminPortalConfig(env, 'keystatic');
  const manager = getAdminPortalConfig(env, 'manager');

  if (!keystatic || !manager || keystatic.host === manager.host || keystatic.uuid === manager.uuid) return null;
  return { keystatic, manager };
};

const requestHost = (request: Request) => {
  try {
    return new URL(request.url).hostname.toLowerCase();
  } catch {
    return '';
  }
};

const isKeystaticOAuthCallback = (request: Request) => {
  try {
    return new URL(request.url).pathname === '/api/keystatic/github/oauth/callback';
  } catch {
    return false;
  }
};

const privateResponse = (status: 403 | 404 | 503) =>
  new Response(status === 503 ? 'Admin portal configuration is unavailable.' : 'Not found.', {
    status,
    headers: {
      'cache-control': 'no-store',
      'content-type': 'text/plain; charset=utf-8',
      'x-robots-tag': 'noindex, nofollow, noarchive, nosnippet',
    },
  });

export const requireInternalPortalAccess = (
  request: Request,
  env: RuntimeEnv,
  name: AdminPortalName,
  options: { allowKeystaticOAuthCallback?: boolean } = {}
) => {
  const configs = getAdminPortalConfigSet(env);
  if (!configs) return privateResponse(503);

  const config = configs[name];
  if (requestHost(request) !== config.host) return privateResponse(404);

  if (options.allowKeystaticOAuthCallback && name === 'keystatic' && isKeystaticOAuthCallback(request)) {
    return null;
  }

  return request.headers.get(ADMIN_PORTAL_HEADER) === name ? null : privateResponse(403);
};
