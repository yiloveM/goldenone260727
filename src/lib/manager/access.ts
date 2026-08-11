import { requireInternalPortalAccess } from '../admin-portals';
import { getEnvString, getRuntimeEnv, type RuntimeEnv } from '../runtime-env';

export type ManagerEnv = RuntimeEnv;
export { getEnvString, getRuntimeEnv };

export const getManagerEmail = (request: Request, env: ManagerEnv) => {
  if (import.meta.env.PROD) return '';
  try {
    const hostname = new URL(request.url).hostname.toLowerCase();
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]' || hostname === '::1') {
      return 'local-manager@goldenone.local';
    }
  } catch {
    return '';
  }

  const bypassToken = getEnvString(env, 'MANAGER_ACCESS_BYPASS_TOKEN') || getEnvString(env, 'KEYSTATIC_SECRET');
  const authorization = request.headers.get('authorization') || '';
  const bearerToken = authorization.toLowerCase().startsWith('bearer ') ? authorization.slice(7).trim() : '';

  if (bypassToken && bearerToken === bypassToken) {
    return (request.headers.get('x-manager-user-email') || 'local-manager@goldenone.local').trim().toLowerCase();
  }

  return '';
};

export const requireManagerAccess = (request: Request, env: ManagerEnv) => {
  const portalDenied = requireInternalPortalAccess(request, env, 'manager');
  if (!portalDenied) return { email: 'manager-portal@goldenone.local', response: null };

  const email = getManagerEmail(request, env);
  if (!email) return { email: '', response: portalDenied };

  return { email, response: null };
};
