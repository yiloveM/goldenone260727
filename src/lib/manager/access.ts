import { getEnvString, getRuntimeEnv, type RuntimeEnv } from '../runtime-env';

export type ManagerEnv = RuntimeEnv;
export { getEnvString, getRuntimeEnv };

const parseAllowedEmails = (value: string) =>
  value
    .split(',')
    .map(item => item.trim().toLowerCase())
    .filter(Boolean);

export const getManagerEmail = (request: Request, env: ManagerEnv) => {
  const accessEmail = request.headers.get('cf-access-authenticated-user-email') || '';
  const normalizedEmail = accessEmail.trim().toLowerCase();
  const bypassToken = getEnvString(env, 'MANAGER_ACCESS_BYPASS_TOKEN') || getEnvString(env, 'KEYSTATIC_SECRET');
  const authorization = request.headers.get('authorization') || '';
  const bearerToken = authorization.toLowerCase().startsWith('bearer ') ? authorization.slice(7).trim() : '';

  if (normalizedEmail) return normalizedEmail;
  if (bypassToken && bearerToken === bypassToken) {
    return (request.headers.get('x-manager-user-email') || 'bypass-manager@businessweb.local').trim().toLowerCase();
  }

  return '';
};

export const requireManagerAccess = (request: Request, env: ManagerEnv) => {
  const email = getManagerEmail(request, env);

  if (!email) {
    return {
      email: '',
      response: new Response('请先输入后台访问口令，或联系站长开通后台访问权限。', {
        status: 401,
        headers: {
          'cache-control': 'no-store',
          'content-type': 'text/plain; charset=utf-8',
        },
      }),
    };
  }

  const allowedEmails = parseAllowedEmails(getEnvString(env, 'MANAGER_ALLOWED_EMAILS'));
  if (allowedEmails.length && !allowedEmails.includes(email)) {
    return {
      email,
      response: new Response('This account is not allowed to use the content portal.', {
        status: 403,
        headers: {
          'cache-control': 'no-store',
          'content-type': 'text/plain; charset=utf-8',
        },
      }),
    };
  }

  return { email, response: null };
};
