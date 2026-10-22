import type { APIRoute } from 'astro';
import { getRuntimeEnv } from '../../../lib/runtime-env';
import { translationDraftRoute } from '../../../lib/draft-lifecycle';

export const prerender = false;

const DEFAULT_BRANCH = 'main';
type Env = Record<string, unknown> | undefined;
const parseCookies = (request: Request) => {
  const cookies: Record<string, string> = {};
  const header = request.headers.get('cookie') || '';

  for (const item of header.split(';')) {
    const [name, ...valueParts] = item.trim().split('=');
    if (!name || !valueParts.length) continue;
    try {
      cookies[name] = decodeURIComponent(valueParts.join('='));
    } catch {
      cookies[name] = valueParts.join('=');
    }
  }

  return cookies;
};

const getEnvString = (env: Env, key: string) => (typeof env?.[key] === 'string' ? env[key].trim() : '');
const getRepoFullName = (env: Env) =>
  getEnvString(env, 'PUBLIC_KEYSTATIC_GITHUB_REPO') || getEnvString(env, 'KEYSTATIC_GITHUB_REPO') || 'your-org/businessweb';
const getBranch = (env: Env) => getEnvString(env, 'KEYSTATIC_GITHUB_BRANCH') || DEFAULT_BRANCH;
const getAccessToken = (request: Request) => parseCookies(request)['keystatic-gh-access-token'] || '';

const githubHeaders = (accessToken: string) => ({
  accept: 'application/vnd.github+json',
  authorization: `Bearer ${accessToken}`,
  'x-github-api-version': '2026-03-10',
  'user-agent': 'businessweb-keystatic-draft-review',
});

const githubFetch = async <T>(url: string, accessToken: string, init?: RequestInit) => {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...githubHeaders(accessToken),
      ...(init?.headers || {}),
    },
  });

  if (!response.ok) throw new Error(await response.text());
  return (await response.json()) as T;
};

const hasGitHubWriteAccess = async (request: Request, env: Env) => {
  const accessToken = getAccessToken(request);
  if (!accessToken) return false;

  const user = await githubFetch<{ login?: string }>('https://api.github.com/user', accessToken);
  if (!user.login) return false;

  const permission = await githubFetch<{ permission?: string }>(
    `https://api.github.com/repos/${getRepoFullName(env)}/collaborators/${encodeURIComponent(user.login)}/permission`,
    accessToken
  );

  return permission.permission === 'admin' || permission.permission === 'maintain' || permission.permission === 'write';
};

const handle: APIRoute = async ({ locals, request, url }) => {
  const env = getRuntimeEnv(locals) as Env;
  try {
    if (!(await hasGitHubWriteAccess(request, env))) return new Response('请先登录有写入权限的内容管理账号。', { status: 401 });
    return translationDraftRoute(request, url, { repo: getRepoFullName(env), branch: getBranch(env), token: getAccessToken(request) }, 'keystatic');
  } catch { return new Response('暂时无法验证内容管理权限，请稍后重试。', { status: 502 }); }
};
export { handle as GET, handle as PUT, handle as PATCH, handle as DELETE };
