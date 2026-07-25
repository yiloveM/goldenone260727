import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { isProductPublished } from '../../../../data/productCategories';
import { selectedTargetLocales, type Locale } from '../../../../data/i18n';
import { getRuntimeEnv, requireManagerAccess } from '../../../../lib/manager/access';
import {
  createRequestId,
  dispatchWorkflow,
  getBranch,
  getDispatchToken,
  getRepoFullName,
  githubErrorText,
} from '../../../../lib/manager/github';

export const prerender = false;

const WORKFLOW_FILE = 'ai-translation.yml';
type SourceType = 'products' | 'blog' | 'all';

const nonEnglishLocales = selectedTargetLocales;
const slugFromId = (id: string) => id.replace(/\.mdoc$/, '');

const normalizeLocales = (value: unknown): Exclude<Locale, 'en'>[] => {
  if (!Array.isArray(value)) return [...nonEnglishLocales];
  const selected = value.filter((item): item is Exclude<Locale, 'en'> => typeof item === 'string' && nonEnglishLocales.includes(item as Exclude<Locale, 'en'>));
  return [...new Set(selected)];
};

const normalizeSourceType = (value: unknown): SourceType => (value === 'products' || value === 'blog' ? value : 'all');

const dispatchErrorMessage = (error: unknown, dispatchTokenConfigured: boolean) => {
  const message = githubErrorText(error);
  if (/bad credentials|401/i.test(message)) {
    return dispatchTokenConfigured
      ? '后台任务授权无效或已过期，请联系站长重新配置后台任务授权。'
      : '站长还没有配置后台任务授权，暂时无法提交 AI 处理任务。';
  }
  if (/resource not accessible|403|forbidden|permission/i.test(message)) {
    return '后台任务权限不足，请联系站长检查任务授权和内容写入权限。';
  }
  if (/not found|404/i.test(message)) {
    return '找不到后台 AI 处理任务，请联系站长检查任务配置。';
  }
  return '后台 AI 处理任务提交失败，请联系站长检查任务配置。';
};

export const POST: APIRoute = async ({ locals, request }) => {
  const env = getRuntimeEnv(locals);
  const access = requireManagerAccess(request, env);
  if (access.response) return access.response;

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
  if (!targetLocales.length) return new Response('至少选择一个目标语言。', { status: 400 });

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
      return new Response(`找不到这个 slug：${sourceSlug}。请检查网址最后一段是否复制正确，或调整生成范围。`, {
        status: 404,
        headers: { 'cache-control': 'no-store', 'content-type': 'text/plain; charset=utf-8' },
      });
    }
  }

  const dispatchToken = getDispatchToken(env, 'translation');
  if (!dispatchToken) {
    return new Response('站长还没有配置后台任务授权，暂时无法提交 AI 处理任务。', {
      status: 500,
      headers: { 'cache-control': 'no-store', 'content-type': 'text/plain; charset=utf-8' },
    });
  }

  const repoFullName = getRepoFullName(env);
  const branch = getBranch(env);
  const requestId = createRequestId('ai');

  try {
    await dispatchWorkflow({
      accessToken: dispatchToken,
      repoFullName,
      branch,
      workflowFile: WORKFLOW_FILE,
      inputs: {
        requestId,
        sourceType,
        locales: targetLocales.join(','),
        sourceSlug,
        overwrite: overwrite ? 'true' : 'false',
        apiKeyOffset: String(Number.isFinite(Number(body.apiKeyOffset)) ? Number(body.apiKeyOffset) : Date.now()),
      },
      userAgent: 'businessweb-manager-ai-translator',
    });
  } catch (error) {
    return new Response(dispatchErrorMessage(error, Boolean(dispatchToken)), {
      status: 502,
      headers: { 'cache-control': 'no-store', 'content-type': 'text/plain; charset=utf-8' },
    });
  }

  return new Response(
    JSON.stringify({
      queued: true,
      requestId,
      sourceType,
      locales: targetLocales,
      sourceSlug,
    }),
    {
      headers: { 'cache-control': 'no-store', 'content-type': 'application/json; charset=utf-8' },
    }
  );
};
