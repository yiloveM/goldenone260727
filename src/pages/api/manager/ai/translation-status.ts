import type { APIRoute } from 'astro';
import { getRuntimeEnv, requireManagerAccess } from '../../../../lib/manager/access';
import { activeTranslationRuns } from '../../../../lib/manager/translation-scope';
import {
  encodeGitHubPath,
  getBranch,
  getDispatchToken,
  getRepoFullName,
  githubFetch,
  githubHeaders,
  githubErrorText,
} from '../../../../lib/manager/github';

export const prerender = false;

const WORKFLOW_FILE = 'ai-translation.yml';

type WorkflowRun = {
  id: number;
  head_branch?: string;
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
  if (!run) return '等待后台建立任务记录';
  if (run.status === 'queued' || run.status === 'requested' || run.status === 'waiting') return '已排队，等待后台处理';
  if (run.status === 'in_progress') return 'AI 正在后台处理';
  if (run.status === 'completed' && run.conclusion === 'success') return '已完成，请审核翻译草稿';
  if (run.status === 'completed') return `任务结束：${run.conclusion || '未知结果'}`;
  return run.status || '状态未知';
};

const decodeBase64 = (value: string) => {
  const binary = atob(value.replace(/\s+/g, ''));
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
};

const getTranslationResult = async (
  repoFullName: string,
  branch: string,
  requestId: string,
  accessToken: string
) => {
  const path = `.github/ai-translation-results/${requestId}.json`;
  const response = await fetch(
    `https://api.github.com/repos/${repoFullName}/contents/${encodeGitHubPath(path)}?ref=${encodeURIComponent(branch)}`,
    {
      headers: githubHeaders(accessToken, 'businessweb-manager-ai-translator'), redirect: 'manual',
    }
  );

  if (response.status === 404) return null;
  if (response.status >= 300 && response.status < 400) throw new Error('Unexpected content redirect');
  if (!response.ok) throw new Error(await response.text());

  const data = (await response.json()) as { content?: string; encoding?: string; html_url?: string };
  if (!data.content || data.encoding !== 'base64') return null;

  try {
    return JSON.parse(decodeBase64(data.content)) as TranslationResultFile;
  } catch {
    return null;
  }
};

export const GET: APIRoute = async ({ locals, request, url }) => {
  const env = getRuntimeEnv(locals);
  const access = requireManagerAccess(request, env);
  if (access.response) return access.response;

  let requestId = url.searchParams.get('requestId')?.trim() || '';
  if (requestId && !/^ai-[a-z0-9]+-[a-z0-9]+$/.test(requestId)) return new Response('任务信息不正确。', { status: 400 });

  const accessToken = getDispatchToken(env, 'translation');
  if (!accessToken) {
    return new Response('暂时无法读取翻译任务状态，请稍后重试。', {
      status: 500,
      headers: { 'cache-control': 'no-store', 'content-type': 'text/plain; charset=utf-8' },
    });
  }

  const repoFullName = getRepoFullName(env);
  const branch = getBranch(env);
  const runsApiUrl =
    `https://api.github.com/repos/${repoFullName}/actions/workflows/${WORKFLOW_FILE}/runs?branch=${encodeURIComponent(branch)}&event=workflow_dispatch&per_page=30`;

  try {
    const runsResponse = await githubFetch<{ workflow_runs: WorkflowRun[] }>(
      runsApiUrl,
      accessToken,
      undefined,
      'businessweb-manager-ai-translator'
    );
    const active = await activeTranslationRuns({repo:repoFullName,branch,token:accessToken});
    const runs = [...new Map([...active,...(runsResponse.workflow_runs || [])].filter(run=>run.head_branch===branch).map(run=>[run.id,run])).values()];
    const tasks = runs.flatMap(run => {const id=String(run.display_title||'').match(/\bai-[a-z0-9]+-[a-z0-9]+\b/)?.[0];return id?[{requestId:id,status:run.status,label:statusLabel(run),locales:String(run.display_title||'').split(' / ')[1]||''}]:[];}).slice(0,100);
    if (!requestId) {
      const recent = runs.find(run => run.status !== 'completed' && /\bai-[a-z0-9]+-[a-z0-9]+\b/.test(run.display_title || '')) || runs.find(run => /\bai-[a-z0-9]+-[a-z0-9]+\b/.test(run.display_title || ''));
      requestId = recent?.display_title?.match(/\bai-[a-z0-9]+-[a-z0-9]+\b/)?.[0] || '';
      if (!requestId) return Response.json({ found: false, status: 'idle', label: '暂无翻译任务。',tasks }, { headers: { 'cache-control': 'no-store' } });
    }
    const matchedRun = runs.find(run => new RegExp(`(?:^|[^a-z0-9-])${requestId}(?=$|[^a-z0-9-])`, 'i').test(`${run.display_title || ''} ${run.name || ''}`));

    if (!matchedRun) {
      return new Response(
        JSON.stringify({
          requestId,
          found: false,
          status: 'waiting',
          label: statusLabel(undefined),
          message: '任务已提交，正在等待处理，请稍后刷新。',
          tasks,
        }),
        {
          headers: { 'cache-control': 'no-store', 'content-type': 'application/json; charset=utf-8' },
        }
      );
    }

    let jobs: WorkflowJob[] = [];
    let result: TranslationResultFile | null = null;

    try {
      const jobsResponse = await githubFetch<{ jobs: WorkflowJob[] }>(
        `https://api.github.com/repos/${repoFullName}/actions/runs/${matchedRun.id}/jobs?per_page=20`,
        accessToken,
        undefined,
        'businessweb-manager-ai-translator'
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

    return new Response(
      JSON.stringify({
        requestId,
        found: true,
        status: matchedRun.status || 'unknown',
        conclusion: matchedRun.conclusion || '',
        label: statusLabel(matchedRun),
        message: statusLabel(matchedRun),
        run: {
          id: matchedRun.id,
          title: matchedRun.display_title || matchedRun.name || '',
          createdAt: matchedRun.created_at || '',
          startedAt: matchedRun.run_started_at || '',
          updatedAt: matchedRun.updated_at || '',
        },
        jobs: jobs.map(job => ({
          name: job.name,
          status: job.status || '',
          conclusion: job.conclusion || '',
          startedAt: job.started_at || '',
          completedAt: job.completed_at || '',
        })),
        result,
        tasks,
      }),
      {
        headers: { 'cache-control': 'no-store', 'content-type': 'application/json; charset=utf-8' },
      }
    );
  } catch (error) {
    void githubErrorText(error);
    return new Response('读取翻译任务状态失败，请稍后重试。', {
      status: 502,
      headers: { 'cache-control': 'no-store', 'content-type': 'text/plain; charset=utf-8' },
    });
  }
};
