import { requireInternalPortalAccess } from '../admin-portals';
import { getEnvString, getRuntimeEnv, type RuntimeEnv } from '../runtime-env';

export type ManagerEnv = RuntimeEnv;
export { getEnvString, getRuntimeEnv };

const getLocalBypassEmail = (request: Request, env: ManagerEnv) => {
  const bypassToken = getEnvString(env, 'KEYSTATIC_SECRET');
  const authorization = request.headers.get('authorization') || '';
  const bearerToken = authorization.toLowerCase().startsWith('bearer ') ? authorization.slice(7).trim() : '';

  if (bypassToken && bearerToken === bypassToken) {
    return (request.headers.get('x-manager-user-email') || 'local-manager@goldenone.local').trim().toLowerCase();
  }

  return '';
};

export const requireManagerAccess = (request: Request, env: ManagerEnv) => {
  const portalDenied = requireInternalPortalAccess(request, env, 'manager');
  if (portalDenied) {
    const email = !import.meta.env.PROD ? getLocalBypassEmail(request, env) : '';
    return {
      email,
      response: email ? null : portalDenied,
    };
  }

  return { email: '内容管理员', response: null };
};
