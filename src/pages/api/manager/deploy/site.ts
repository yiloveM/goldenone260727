import type { APIRoute } from 'astro';
import { getRuntimeEnv, requireManagerAccess } from '../../../../lib/manager/access';
import {
  createRequestId,
  dispatchWorkflow,
  getBranch,
  getDispatchToken,
  getRepoFullName,
  githubErrorText,
  githubFetch,
} from '../../../../lib/manager/github';

export const prerender = false;

const DEFAULT_WORKFLOW_FILE = 'site-publish.yml';
const HISTORY_LIMIT = 20;

type PublishStage = 'waiting' | 'queued' | 'building' | 'uploading' | 'success' | 'failed' | 'unknown';

type WorkflowRun = {
  id: number;
  name?: string;
  display_title?: string;
  status?: string;
  conclusion?: string | null;
  created_at?: string;
  updated_at?: string;
  run_started_at?: string;
  run_number?: number;
};

type WorkflowStep = {
  name: string;
  status?: string;
  conclusion?: string | null;
  number?: number;
  started_at?: string;
  completed_at?: string;
};

type WorkflowJob = {
  id: number;
  name: string;
  status?: string;
  conclusion?: string | null;
  started_at?: string;
  completed_at?: string;
  steps?: WorkflowStep[];
};

const getWorkflowFile = (env: Record<string, unknown> | undefined) =>
  typeof env?.SITE_PUBLISH_WORKFLOW_FILE === 'string' && env.SITE_PUBLISH_WORKFLOW_FILE.trim()
    ? env.SITE_PUBLISH_WORKFLOW_FILE.trim()
    : DEFAULT_WORKFLOW_FILE;

const runsApiUrl = (repoFullName: string, workflowFile: string, branch: string, perPage = 30) =>
  `https://api.github.com/repos/${repoFullName}/actions/workflows/${workflowFile}/runs?branch=${encodeURIComponent(branch)}&event=workflow_dispatch&per_page=${perPage}`;

const jobsApiUrl = (repoFullName: string, runId: number) =>
  `https://api.github.com/repos/${repoFullName}/actions/runs/${runId}/jobs?per_page=20`;

const dispatchErrorMessage = (error: unknown, dispatchTokenConfigured: boolean) => {
  const message = githubErrorText(error);
  void dispatchTokenConfigured;
  if (/bad credentials|401/i.test(message)) {
    return '发布服务暂时不可用，请稍后重试；如持续出现，请联系系统维护人员。';
  }
  if (/resource not accessible|403|forbidden|permission/i.test(message)) {
    return '当前无法提交发布请求，请稍后重试；如持续出现，请联系系统维护人员。';
  }
  if (/not found|404/i.test(message)) {
    return '发布任务暂时不可用，请稍后重试；如持续出现，请联系系统维护人员。';
  }
  return '发布请求提交失败，请稍后重试。';
};

const stepNameToStage = (stepName: string): PublishStage => {
  if (/request.*(pages|deployment|build)|create.*deployment/i.test(stepName)) return 'queued';
  if (/wait.*(pages|deployment)|pages.*deployment|build/i.test(stepName)) return 'building';
  if (/upload|wrangler/i.test(stepName)) return 'uploading';
  if (/checkout|node|install|check|astro|npm/i.test(stepName)) return 'building';
  return 'building';
};

const getActiveStep = (jobs: WorkflowJob[]) => {
  const activeJob = jobs.find(job => job.status === 'in_progress') || jobs.find(job => job.status === 'queued');
  const steps = activeJob?.steps || [];
  return (
    steps.find(step => step.status === 'in_progress') ||
    [...steps].reverse().find(step => step.status === 'completed') ||
    steps[0] ||
    null
  );
};

const getRunStage = (run: WorkflowRun | undefined, jobs: WorkflowJob[] = []): PublishStage => {
  if (!run) return 'waiting';
  if (run.status === 'queued' || run.status === 'requested' || run.status === 'waiting' || run.status === 'pending') return 'queued';
  if (run.status === 'in_progress') {
    const activeStep = getActiveStep(jobs);
    return activeStep ? stepNameToStage(activeStep.name) : 'building';
  }
  if (run.status === 'completed' && run.conclusion === 'success') return 'success';
  if (run.status === 'completed') return 'failed';
  return 'unknown';
};

const stageLabel = (stage: PublishStage) => {
  switch (stage) {
    case 'waiting':
    case 'queued':
      return '等待中';
    case 'building':
      return '生成中';
    case 'uploading':
      return '发布中';
    case 'success':
      return '已完成';
    case 'failed':
      return '未完成';
    default:
      return '状态未知';
  }
};

const stageMessage = (stage: PublishStage, run?: WorkflowRun) => {
  if (stage === 'waiting') return '发布请求已提交，正在等待处理。';
  if (stage === 'queued') return '发布请求正在排队。';
  if (stage === 'building') return '正在生成网站更新。';
  if (stage === 'uploading') return '正在发布网站更新。';
  if (stage === 'success') return '网站更新已发布。';
  if (stage === 'failed') {
    void run;
    return '网站更新未完成，请稍后重试。';
  }
  return '当前发布状态暂时无法确认。';
};

const requestIdFromRun = (run: WorkflowRun) => {
  const text = `${run.display_title || ''} ${run.name || ''}`;
  return text.match(/site-[a-z0-9-]+/i)?.[0] || '';
};

const getRunJobs = async (repoFullName: string, accessToken: string, runId: number) => {
  try {
    const jobsResponse = await githubFetch<{ jobs: WorkflowJob[] }>(
      jobsApiUrl(repoFullName, runId),
      accessToken,
      undefined,
      'businessweb-manager-site-publisher'
    );
    return jobsResponse.jobs || [];
  } catch {
    return [];
  }
};

const summarizeRun = (run: WorkflowRun, jobs: WorkflowJob[]) => {
  const stage = getRunStage(run, jobs);
  const completedAt =
    jobs.find(job => job.completed_at)?.completed_at ||
    [...jobs.flatMap(job => job.steps || [])].reverse().find(step => step.completed_at)?.completed_at ||
    '';

  return {
    id: run.id,
    requestId: requestIdFromRun(run),
    runNumber: run.run_number || 0,
    title: run.display_title || run.name || '',
    stage,
    label: stageLabel(stage),
    status: run.status || 'unknown',
    conclusion: run.conclusion || '',
    message: stageMessage(stage, run),
    submittedAt: run.created_at || '',
    startedAt: run.run_started_at || '',
    updatedAt: run.updated_at || '',
    completedAt,
  };
};

const getPublishHistory = async (repoFullName: string, branch: string, workflowFile: string, accessToken: string) => {
  const runsResponse = await githubFetch<{ workflow_runs: WorkflowRun[] }>(
    runsApiUrl(repoFullName, workflowFile, branch, HISTORY_LIMIT),
    accessToken,
    undefined,
    'businessweb-manager-site-publisher'
  );
  const runs = (runsResponse.workflow_runs || []).slice(0, HISTORY_LIMIT);
  return Promise.all(runs.map(async run => summarizeRun(run, await getRunJobs(repoFullName, accessToken, run.id))));
};

export const POST: APIRoute = async ({ locals, request }) => {
  const env = getRuntimeEnv(locals);
  const access = requireManagerAccess(request, env);
  if (access.response) return access.response;

  const dispatchToken = getDispatchToken(env, 'publish');
  if (!dispatchToken) {
    return new Response('发布服务暂时不可用，请稍后重试；如持续出现，请联系系统维护人员。', {
      status: 500,
      headers: { 'cache-control': 'no-store', 'content-type': 'text/plain; charset=utf-8' },
    });
  }

  const repoFullName = getRepoFullName(env);
  const branch = getBranch(env);
  const workflowFile = getWorkflowFile(env);
  const requestId = createRequestId('site');

  try {
    await dispatchWorkflow({
      accessToken: dispatchToken,
      repoFullName,
      branch,
      workflowFile,
      inputs: { requestId },
      userAgent: 'businessweb-manager-site-publisher',
    });
  } catch (error) {
    return new Response(dispatchErrorMessage(error, Boolean(dispatchToken)), {
      status: 502,
      headers: { 'cache-control': 'no-store', 'content-type': 'text/plain; charset=utf-8' },
    });
  }

  return new Response(
    JSON.stringify({
      ok: true,
      requestId,
      stage: 'queued',
      label: stageLabel('queued'),
      message: '发布请求已提交，请等待网站更新完成。',
      statusUrl: `/api/manager/deploy/site?requestId=${encodeURIComponent(requestId)}`,
    }),
    {
      headers: { 'cache-control': 'no-store', 'content-type': 'application/json; charset=utf-8' },
    }
  );
};

export const GET: APIRoute = async ({ locals, request, url }) => {
  const env = getRuntimeEnv(locals);
  const access = requireManagerAccess(request, env);
  if (access.response) return access.response;

  const accessToken = getDispatchToken(env, 'publish');
  if (!accessToken) {
    return new Response('暂时无法读取发布状态，请稍后重试。', {
      status: 500,
      headers: { 'cache-control': 'no-store', 'content-type': 'text/plain; charset=utf-8' },
    });
  }

  const repoFullName = getRepoFullName(env);
  const branch = getBranch(env);
  const workflowFile = getWorkflowFile(env);
  const requestId = url.searchParams.get('requestId')?.trim() || '';

  try {
    if (!requestId) {
      const records = await getPublishHistory(repoFullName, branch, workflowFile, accessToken);
      return new Response(JSON.stringify({ records, limit: HISTORY_LIMIT }), {
        headers: { 'cache-control': 'no-store', 'content-type': 'application/json; charset=utf-8' },
      });
    }

    const runsResponse = await githubFetch<{ workflow_runs: WorkflowRun[] }>(
      runsApiUrl(repoFullName, workflowFile, branch),
      accessToken,
      undefined,
      'businessweb-manager-site-publisher'
    );
    const runs = runsResponse.workflow_runs || [];
    const matchedRun = runs.find(run => `${run.display_title || ''} ${run.name || ''}`.includes(requestId));

    if (!matchedRun) {
      return new Response(
        JSON.stringify({
          requestId,
          found: false,
          stage: 'waiting',
          label: stageLabel('waiting'),
          status: 'waiting',
          message: stageMessage('waiting'),
        }),
        {
          headers: { 'cache-control': 'no-store', 'content-type': 'application/json; charset=utf-8' },
        }
      );
    }

    const jobs = await getRunJobs(repoFullName, accessToken, matchedRun.id);
    const stage = getRunStage(matchedRun, jobs);

    return new Response(
      JSON.stringify({
        requestId,
        found: true,
        stage,
        label: stageLabel(stage),
        status: matchedRun.status || 'unknown',
        conclusion: matchedRun.conclusion || '',
        message: stageMessage(stage, matchedRun),
        run: {
          id: matchedRun.id,
          title: matchedRun.display_title || matchedRun.name || '',
          createdAt: matchedRun.created_at || '',
          startedAt: matchedRun.run_started_at || '',
          updatedAt: matchedRun.updated_at || '',
        },
      }),
      {
        headers: { 'cache-control': 'no-store', 'content-type': 'application/json; charset=utf-8' },
      }
    );
  } catch (error) {
    void githubErrorText(error);
    return new Response('读取发布状态失败，请稍后重试。', {
      status: 502,
      headers: { 'cache-control': 'no-store', 'content-type': 'text/plain; charset=utf-8' },
    });
  }
};

export const DELETE: APIRoute = async ({ locals, request }) => {
  const env = getRuntimeEnv(locals);
  const access = requireManagerAccess(request, env);
  if (access.response) return access.response;

  let body: { runIds?: unknown };
  try {
    body = await request.json();
  } catch {
    return new Response('删除请求不完整，请重新选择记录。', { status: 400 });
  }

  const runIds = Array.isArray(body.runIds)
    ? body.runIds.map(value => Number(value)).filter(value => Number.isSafeInteger(value) && value > 0)
    : [];
  if (!runIds.length) {
    return new Response('请至少选择一条发布记录。', {
      status: 400,
      headers: { 'cache-control': 'no-store', 'content-type': 'text/plain; charset=utf-8' },
    });
  }

  const accessToken = getDispatchToken(env, 'publish');
  if (!accessToken) {
    return new Response('暂时无法删除发布记录，请稍后重试。', {
      status: 500,
      headers: { 'cache-control': 'no-store', 'content-type': 'text/plain; charset=utf-8' },
    });
  }

  const repoFullName = getRepoFullName(env);
  const branch = getBranch(env);
  const workflowFile = getWorkflowFile(env);

  try {
    const runsResponse = await githubFetch<{ workflow_runs: WorkflowRun[] }>(
      runsApiUrl(repoFullName, workflowFile, branch, 100),
      accessToken,
      undefined,
      'businessweb-manager-site-publisher'
    );
    const allowedRunIds = new Set((runsResponse.workflow_runs || []).map(run => run.id));
    const deleted: number[] = [];
    const skipped: number[] = [];
    const errors: Array<{ runId: number; message: string }> = [];

    for (const runId of [...new Set(runIds)]) {
      if (!allowedRunIds.has(runId)) {
        skipped.push(runId);
        continue;
      }

      try {
        await githubFetch<void>(
          `https://api.github.com/repos/${repoFullName}/actions/runs/${runId}`,
          accessToken,
          { method: 'DELETE' },
          'businessweb-manager-site-publisher'
        );
        deleted.push(runId);
      } catch (error) {
        void githubErrorText(error);
        errors.push({ runId, message: '删除失败，请稍后重试。' });
      }
    }

    return new Response(JSON.stringify({ deleted, skipped, errors }), {
      headers: { 'cache-control': 'no-store', 'content-type': 'application/json; charset=utf-8' },
    });
  } catch (error) {
    void githubErrorText(error);
    return new Response('删除发布记录失败，请稍后重试。', {
      status: 502,
      headers: { 'cache-control': 'no-store', 'content-type': 'text/plain; charset=utf-8' },
    });
  }
};
