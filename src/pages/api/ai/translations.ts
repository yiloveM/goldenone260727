import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { isProductPublished } from '../../../data/productCategories';
import { getBackendTaskToken, getRuntimeEnv } from '../../../lib/runtime-env';
import { selectedTargetLocales, type Locale } from '../../../data/i18n';

export const prerender = false;

const DEFAULT_BRANCH = 'main';
const WORKFLOW_FILE = 'ai-translation.yml';
type SourceType = 'products' | 'blog' | 'all';
type Env = Record<string, unknown> | undefined;

const nonEnglishLocales = selectedTargetLocales;

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
const getDispatchToken = (env: Env) => getBackendTaskToken(env, 'translation');

const githubHeaders = (accessToken: string) => ({
  accept: 'application/vnd.github+json',
  authorization: `Bearer ${accessToken}`,
  'content-type': 'application/json',
  'x-github-api-version': '2026-03-10',
  'user-agent': 'businessweb-keystatic-ai-translator',
});

const githubFetch = async <T>(url: string, accessToken: string, init?: RequestInit) => {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...githubHeaders(accessToken),
      ...(init?.headers || {}),
    },
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
};

const getAccessToken = (request: Request) => parseCookies(request)['keystatic-gh-access-token'] || '';

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

const requireWriteAccess = async (request: Request, env: Env) => {
  if (await hasGitHubWriteAccess(request, env)) {
    return null;
  }

  return new Response('需要使用有内容管理权限的账号登录后，才能提交 AI 翻译任务。', { status: 401 });
};

const slugFromId = (id: string) => id.replace(/\.mdoc$/, '');
const normalizeLocales = (value: unknown): Exclude<Locale, 'en'>[] => {
  if (!Array.isArray(value)) return [...nonEnglishLocales];
  const selected = value.filter((item): item is Exclude<Locale, 'en'> => typeof item === 'string' && nonEnglishLocales.includes(item as Exclude<Locale, 'en'>));
  return [...new Set(selected)];
};
const normalizeSourceType = (value: unknown): SourceType => (value === 'products' || value === 'blog' ? value : 'all');
const createRequestId = () => {
  const random = crypto.getRandomValues(new Uint32Array(1))[0].toString(36);
  return `ai-${Date.now().toString(36)}-${random}`;
};
const workflowRunsUrl = (repoFullName: string) => `https://github.com/${repoFullName}/actions/workflows/${WORKFLOW_FILE}`;

const dispatchTranslationWorkflow = async ({
  accessToken,
  repoFullName,
  branch,
  inputs,
}: {
  accessToken: string;
  repoFullName: string;
  branch: string;
  inputs: Record<string, string>;
}) => {
  const url = `https://api.github.com/repos/${repoFullName}/actions/workflows/${WORKFLOW_FILE}/dispatches`;

  await githubFetch(url, accessToken, {
    method: 'POST',
    body: JSON.stringify({
      ref: branch,
      inputs,
    }),
  });
};

const githubErrorText = (error: unknown) => {
  const raw = error instanceof Error ? error.message : String(error || 'Unknown error');
  try {
    const parsed = JSON.parse(raw) as { message?: string; status?: string | number };
    return [parsed.message, parsed.status ? `status ${parsed.status}` : ''].filter(Boolean).join(' / ') || raw;
  } catch {
    return raw;
  }
};

const dispatchErrorMessage = (error: unknown, dispatchTokenConfigured: boolean) => {
  const message = githubErrorText(error);
  if (/bad credentials|401/i.test(message)) {
    return dispatchTokenConfigured
      ? '后台任务授权配置无效或已过期。请联系站长重新配置后台任务授权，并在重新部署后再提交。'
      : '当前登录账号无法触发后台任务。请联系站长配置后台任务授权，或确认账号拥有内容管理权限。';
  }
  if (/resource not accessible|403|forbidden|permission/i.test(message)) {
    return '后台任务权限不足。请联系站长检查后台任务授权、任务开关和内容写入权限。';
  }
  if (/not found|404/i.test(message)) {
    return '找不到后台翻译任务。请联系站长确认 AI 翻译任务已经启用并发布。';
  }
  return `后台翻译任务提交失败。详情：${message}`;
};

export const POST: APIRoute = async ({ locals, request }) => {
  const env = getRuntimeEnv(locals) as Env;
  const writeError = await requireWriteAccess(request, env);
  if (writeError) return writeError;

  let body: {
    sourceType?: SourceType;
    locales?: string[];
    sourceSlug?: string;
    overwrite?: boolean;
    apiKeyOffset?: number;
  };

  try {
    body = await request.json();
  } catch {
    return new Response('Bad AI translation payload.', { status: 400 });
  }

  const targetLocales = normalizeLocales(body.locales);
  const sourceType = normalizeSourceType(body.sourceType);
  const sourceSlug = String(body.sourceSlug || '').trim();
  const overwrite = body.overwrite === true;
  if (!targetLocales.length) return new Response('At least one target language is required.', { status: 400 });

  if (sourceSlug) {
    let matchedSourceCount = 0;
    if (sourceType === 'all' || sourceType === 'products') {
      const products = (await getCollection('products')).filter(isProductPublished);
      matchedSourceCount += products.some(product => slugFromId(product.id) === sourceSlug) ? 1 : 0;
    }
    if (sourceType === 'all' || sourceType === 'blog') {
      const posts = await getCollection('blog');
      matchedSourceCount += posts.some(post => slugFromId(post.id) === sourceSlug) ? 1 : 0;
    }

    if (!matchedSourceCount) {
      return new Response(`找不到这个 slug：${sourceSlug}。请检查网址最后一段是否复制正确，或把“要翻译什么内容”改成“产品和文章”。`, {
        status: 404,
        headers: { 'cache-control': 'no-store', 'content-type': 'text/plain; charset=utf-8' },
      });
    }
  }

  const dispatchToken = getDispatchToken(env);
  const accessToken = dispatchToken || getAccessToken(request);
  const repoFullName = getRepoFullName(env);
  const branch = getBranch(env);
  const requestId = createRequestId();

  try {
    await dispatchTranslationWorkflow({
      accessToken,
      repoFullName,
      branch,
      inputs: {
        requestId,
        sourceType,
        locales: targetLocales.join(','),
        sourceSlug,
        overwrite: overwrite ? 'true' : 'false',
        apiKeyOffset: String(Number.isFinite(Number(body.apiKeyOffset)) ? Number(body.apiKeyOffset) : Date.now()),
      },
    });
  } catch (error) {
    return new Response(
      dispatchErrorMessage(error, Boolean(dispatchToken)),
      {
        status: 502,
        headers: { 'cache-control': 'no-store', 'content-type': 'text/plain; charset=utf-8' },
      }
    );
  }

  return new Response(JSON.stringify({
    queued: true,
    requestId,
    actionsUrl: workflowRunsUrl(repoFullName),
    generated: [],
    skipped: [],
    errors: [],
    previews: [],
    workflow: {
      branch,
      sourceType,
      locales: targetLocales,
      sourceSlug,
      requestId,
    },
  }), {
    headers: { 'cache-control': 'no-store', 'content-type': 'application/json; charset=utf-8' },
  });
};
