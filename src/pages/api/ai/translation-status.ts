import type { APIRoute } from 'astro';
import { getRuntimeEnv } from '../../../lib/runtime-env';
import { getBackendTaskToken } from '../../../lib/runtime-env';

export const prerender = false;

const DEFAULT_BRANCH = 'main';
const WORKFLOW_FILE = 'ai-translation.yml';
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
  getEnvString(env, 'KEYSTATIC_GITHUB_REPO') || getEnvString(env, 'PUBLIC_KEYSTATIC_GITHUB_REPO') || 'your-org/businessweb';
const getBranch = (env: Env) => getEnvString(env, 'KEYSTATIC_GITHUB_BRANCH') || DEFAULT_BRANCH;
const getDispatchToken = (env: Env) => getBackendTaskToken(env, 'translation');
const getAccessToken = (request: Request) => parseCookies(request)['keystatic-gh-access-token'] || '';

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

const workflowRunsUrl = (repoFullName: string) => `https://github.com/${repoFullName}/actions/workflows/${WORKFLOW_FILE}`;

type WorkflowRun = {
  id: number;
  name?: string;
  display_title?: string;
  status?: string;
  conclusion?: string | null;
  html_url?: string;
  created_at?: string;
  updated_at?: string;
  run_started_at?: string;
};

type WorkflowJob = {
  id: number;
  name: string;
  status?: string;
  conclusion?: string | null;
  html_url?: string;
  started_at?: string;
  completed_at?: string;
};

type TranslationResultFile = {
  requestId: string;
  sourceType?: string;
  sourceSlug?: string;
  locales?: string[];
  generatedAt?: string;
  resultStatus?: 'success' | 'partial_success' | 'failure';
  resultStatusLabel?: string;
  generated?: Array<{ type: string; locale: string; slug: string; path: string; keySlot?: number; attempts?: number }>;
  skipped?: Array<{ type: string; locale: string; slug: string; reason: string }>;
  errors?: Array<{ type: string; locale: string; slug: string; message: string; friendlyMessage?: string; attempts?: number; keySlots?: number[]; failureKind?: string }>;
};

const statusLabel = (run: WorkflowRun | undefined) => {
  if (!run) return '等待后台任务建立运行记录';
  if (run.status === 'queued' || run.status === 'requested' || run.status === 'waiting') return '已排队，等待后台处理资源';
  if (run.status === 'in_progress') return 'AI 正在后台处理';
  if (run.status === 'completed' && run.conclusion === 'success') return '已完成，请审核翻译草稿';
  if (run.status === 'completed') return `任务结束：${run.conclusion || '未知结果'}`;
  return run.status || '状态未知';
};

const encodePath = (path: string) => path.split('/').map(encodeURIComponent).join('/');

const decodeBase64 = (value: string) => {
  const normalized = value.replace(/\s+/g, '');
  if (typeof atob === 'function') {
    const binary = atob(normalized);
    const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }
  return normalized;
};

const getTranslationResult = async (
  repoFullName: string,
  branch: string,
  requestId: string,
  accessToken: string
) => {
  const path = `.github/ai-translation-results/${requestId}.json`;
  const response = await fetch(
    `https://api.github.com/repos/${repoFullName}/contents/${encodePath(path)}?ref=${encodeURIComponent(branch)}`,
    {
      headers: githubHeaders(accessToken),
    }
  );

  if (response.status === 404) return null;
  if (!response.ok) throw new Error(await response.text());

  const data = await response.json() as { content?: string; encoding?: string; html_url?: string };
  if (!data.content || data.encoding !== 'base64') return null;

  try {
    return {
      ...(JSON.parse(decodeBase64(data.content)) as TranslationResultFile),
      htmlUrl: data.html_url || '',
    };
  } catch {
    return null;
  }
};

export const GET: APIRoute = async ({ locals, request, url }) => {
  const env = getRuntimeEnv(locals) as Env;

  if (!await hasGitHubWriteAccess(request, env)) {
    return new Response('需要使用有内容管理权限的账号登录后，才能查看 AI 翻译任务状态。', { status: 401 });
  }

  const requestId = url.searchParams.get('requestId')?.trim() || '';
  if (!requestId) return new Response('Missing requestId.', { status: 400 });

  const repoFullName = getRepoFullName(env);
  const branch = getBranch(env);
  const accessToken = getDispatchToken(env) || getAccessToken(request);
  const actionsUrl = workflowRunsUrl(repoFullName);
  const runsApiUrl =
    `https://api.github.com/repos/${repoFullName}/actions/workflows/${WORKFLOW_FILE}/runs?branch=${encodeURIComponent(branch)}&event=workflow_dispatch&per_page=30`;

  try {
    const runsResponse = await githubFetch<{ workflow_runs: WorkflowRun[] }>(runsApiUrl, accessToken);
    const runs = runsResponse.workflow_runs || [];
    const matchedRun = runs.find(run => `${run.display_title || ''} ${run.name || ''}`.includes(requestId));

    if (!matchedRun) {
      return new Response(JSON.stringify({
        requestId,
        found: false,
        status: 'waiting',
        label: statusLabel(undefined),
        message: '后台触发请求已发出，但运行记录可能还没创建。请等待 10-30 秒，或打开后台任务列表查看。',
        actionsUrl,
      }), {
        headers: { 'cache-control': 'no-store', 'content-type': 'application/json; charset=utf-8' },
      });
    }

    let jobs: WorkflowJob[] = [];
    let result: (TranslationResultFile & { htmlUrl?: string }) | null = null;
    try {
      const jobsResponse = await githubFetch<{ jobs: WorkflowJob[] }>(
        `https://api.github.com/repos/${repoFullName}/actions/runs/${matchedRun.id}/jobs?per_page=20`,
        accessToken
      );
      jobs = jobsResponse.jobs || [];
    } catch {
      jobs = [];
    }
    try {
      result = await getTranslationResult(repoFullName, branch, requestId, accessToken);
    } catch {
      result = null;
    }

    return new Response(JSON.stringify({
      requestId,
      found: true,
      status: matchedRun.status || 'unknown',
      conclusion: matchedRun.conclusion || '',
      label: statusLabel(matchedRun),
      run: {
        id: matchedRun.id,
        title: matchedRun.display_title || matchedRun.name || '',
        htmlUrl: matchedRun.html_url || '',
        createdAt: matchedRun.created_at || '',
        startedAt: matchedRun.run_started_at || '',
        updatedAt: matchedRun.updated_at || '',
      },
      jobs: jobs.map(job => ({
        name: job.name,
        status: job.status || '',
        conclusion: job.conclusion || '',
        htmlUrl: job.html_url || '',
        startedAt: job.started_at || '',
        completedAt: job.completed_at || '',
      })),
      result,
      actionsUrl,
    }), {
      headers: { 'cache-control': 'no-store', 'content-type': 'application/json; charset=utf-8' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || 'Unknown error');
    return new Response(`读取后台任务状态失败：${message}`, {
      status: 502,
      headers: { 'cache-control': 'no-store', 'content-type': 'text/plain; charset=utf-8' },
    });
  }
};
