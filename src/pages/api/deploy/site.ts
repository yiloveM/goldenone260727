import type { APIRoute } from 'astro';
import { getBackendTaskToken, getRuntimeEnv } from '../../../lib/runtime-env';

export const prerender = false;

const DEFAULT_BRANCH = 'main';
const DEFAULT_WORKFLOW_FILE = 'site-publish.yml';
const HISTORY_LIMIT = 20;

type Env = Record<string, unknown> | undefined;
type PublishStage = 'waiting' | 'queued' | 'building' | 'uploading' | 'success' | 'failed' | 'unknown';

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
  run_number?: number;
  head_branch?: string;
  head_sha?: string;
  actor?: { login?: string };
  triggering_actor?: { login?: string };
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
  html_url?: string;
  started_at?: string;
  completed_at?: string;
  steps?: WorkflowStep[];
};

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
const getWorkflowFile = (env: Env) => getEnvString(env, 'SITE_PUBLISH_WORKFLOW_FILE') || DEFAULT_WORKFLOW_FILE;
const getDispatchToken = (env: Env) => getBackendTaskToken(env, 'publish');
const getAccessToken = (request: Request) => parseCookies(request)['keystatic-gh-access-token'] || '';

const githubHeaders = (accessToken: string) => ({
  accept: 'application/vnd.github+json',
  authorization: `Bearer ${accessToken}`,
  'content-type': 'application/json',
  'x-github-api-version': '2026-03-10',
  'user-agent': 'businessweb-keystatic-site-publisher',
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
  if (response.status === 204) return undefined as T;
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

const requireWriteAccess = async (request: Request, env: Env) => {
  if (await hasGitHubWriteAccess(request, env)) return null;

  return new Response('Sign in with a GitHub account that has write access before publishing site updates.', {
    status: 401,
    headers: { 'cache-control': 'no-store', 'content-type': 'text/plain; charset=utf-8' },
  });
};

const createRequestId = () => {
  const random = crypto.getRandomValues(new Uint32Array(1))[0].toString(36);
  return `site-${Date.now().toString(36)}-${random}`;
};

const workflowRunsUrl = (repoFullName: string, workflowFile: string) =>
  `https://github.com/${repoFullName}/actions/workflows/${workflowFile}`;

const runsApiUrl = (repoFullName: string, workflowFile: string, branch: string, perPage = 30) =>
  `https://api.github.com/repos/${repoFullName}/actions/workflows/${workflowFile}/runs?branch=${encodeURIComponent(branch)}&event=workflow_dispatch&per_page=${perPage}`;

const jobsApiUrl = (repoFullName: string, runId: number) =>
  `https://api.github.com/repos/${repoFullName}/actions/runs/${runId}/jobs?per_page=20`;

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
      ? 'The backend publish token is invalid or expired. Configure BUSINESSWEB_GITHUB_TOKEN again and redeploy.'
      : 'Publishing is not configured yet. Configure BUSINESSWEB_GITHUB_TOKEN first.';
  }
  if (/resource not accessible|403|forbidden|permission/i.test(message)) {
    return 'The backend publish token does not have enough permission. Check repository Actions and Contents permissions.';
  }
  if (/not found|404/i.test(message)) {
    return 'The publish workflow was not found. Confirm site-publish.yml exists on the configured branch.';
  }
  return `The backend publish task could not be submitted: ${message}`;
};

const dispatchPublishWorkflow = async ({
  accessToken,
  repoFullName,
  branch,
  workflowFile,
  requestId,
}: {
  accessToken: string;
  repoFullName: string;
  branch: string;
  workflowFile: string;
  requestId: string;
}) => {
  await githubFetch(
    `https://api.github.com/repos/${repoFullName}/actions/workflows/${workflowFile}/dispatches`,
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify({
        ref: branch,
        inputs: { requestId },
      }),
    }
  );
};

const stepNameToStage = (stepName: string): PublishStage => {
  if (/upload|wrangler|cloudflare|deploy/i.test(stepName)) return 'uploading';
  if (/checkout|node|install|check|build|astro|npm/i.test(stepName)) return 'building';
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
      return 'Queued';
    case 'building':
      return 'Building';
    case 'uploading':
      return 'Uploading';
    case 'success':
      return 'Success';
    case 'failed':
      return 'Failed';
    default:
      return 'Unknown';
  }
};

const stageMessage = (stage: PublishStage, run?: WorkflowRun, activeStep?: WorkflowStep | null) => {
  if (stage === 'waiting') return 'The publish request was submitted and is waiting for a workflow run record.';
  if (stage === 'queued') return 'The publish workflow is queued.';
  if (stage === 'building') return activeStep ? `Processing: ${activeStep.name}` : 'The site is being checked and built.';
  if (stage === 'uploading') return activeStep ? `Uploading: ${activeStep.name}` : 'The latest site files are being published.';
  if (stage === 'success') return 'The site update has been published.';
  if (stage === 'failed') return `Publishing failed: ${run?.conclusion || 'open the workflow run to inspect logs.'}`;
  return run?.status || 'The current publish status is unknown.';
};

const requestIdFromRun = (run: WorkflowRun) => {
  const text = `${run.display_title || ''} ${run.name || ''}`;
  return text.match(/site-[a-z0-9-]+/i)?.[0] || '';
};

const summarizeRun = (run: WorkflowRun, jobs: WorkflowJob[]) => {
  const activeStep = getActiveStep(jobs);
  const stage = getRunStage(run, jobs);
  const completedAt =
    jobs.find(job => job.completed_at)?.completed_at ||
    [...(jobs.flatMap(job => job.steps || []))].reverse().find(step => step.completed_at)?.completed_at ||
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
    message: stageMessage(stage, run, activeStep),
    submittedAt: run.created_at || '',
    startedAt: run.run_started_at || '',
    updatedAt: run.updated_at || '',
    completedAt,
    htmlUrl: run.html_url || '',
    branch: run.head_branch || '',
    sha: run.head_sha || '',
    actor: run.triggering_actor?.login || run.actor?.login || '',
    activeStep: activeStep?.name || '',
  };
};

const getRunJobs = async (repoFullName: string, accessToken: string, runId: number) => {
  try {
    const jobsResponse = await githubFetch<{ jobs: WorkflowJob[] }>(jobsApiUrl(repoFullName, runId), accessToken);
    return jobsResponse.jobs || [];
  } catch {
    return [];
  }
};

const getPublishHistory = async (repoFullName: string, branch: string, workflowFile: string, accessToken: string) => {
  const runsResponse = await githubFetch<{ workflow_runs: WorkflowRun[] }>(
    runsApiUrl(repoFullName, workflowFile, branch, HISTORY_LIMIT),
    accessToken
  );
  const runs = (runsResponse.workflow_runs || []).slice(0, HISTORY_LIMIT);
  return Promise.all(runs.map(async run => summarizeRun(run, await getRunJobs(repoFullName, accessToken, run.id))));
};

export const POST: APIRoute = async ({ locals, request }) => {
  const env = getRuntimeEnv(locals) as Env;
  const writeError = await requireWriteAccess(request, env);
  if (writeError) return writeError;

  const repoFullName = getRepoFullName(env);
  const branch = getBranch(env);
  const workflowFile = getWorkflowFile(env);
  const dispatchToken = getDispatchToken(env);

  if (!dispatchToken) {
    return new Response('Publishing is not configured yet. Configure BUSINESSWEB_GITHUB_TOKEN first.', {
      status: 500,
      headers: { 'cache-control': 'no-store', 'content-type': 'text/plain; charset=utf-8' },
    });
  }

  const requestId = createRequestId();

  try {
    await dispatchPublishWorkflow({
      accessToken: dispatchToken,
      repoFullName,
      branch,
      workflowFile,
      requestId,
    });
  } catch (error) {
    return new Response(dispatchErrorMessage(error, Boolean(dispatchToken)), {
      status: 502,
      headers: { 'cache-control': 'no-store', 'content-type': 'text/plain; charset=utf-8' },
    });
  }

  return new Response(JSON.stringify({
    ok: true,
    requestId,
    stage: 'queued',
    label: stageLabel('queued'),
    message: 'The backend publish workflow was submitted. Wait for the build and deployment to finish.',
    workflow: { branch, workflowFile, requestId },
    statusUrl: `/api/deploy/site?requestId=${encodeURIComponent(requestId)}`,
    actionsUrl: workflowRunsUrl(repoFullName, workflowFile),
  }), {
    headers: {
      'cache-control': 'no-store',
      'content-type': 'application/json; charset=utf-8',
    },
  });
};

export const GET: APIRoute = async ({ locals, request, url }) => {
  const env = getRuntimeEnv(locals) as Env;
  const writeError = await requireWriteAccess(request, env);
  if (writeError) return writeError;

  const repoFullName = getRepoFullName(env);
  const branch = getBranch(env);
  const workflowFile = getWorkflowFile(env);
  const accessToken = getDispatchToken(env) || getAccessToken(request);
  const actionsUrl = workflowRunsUrl(repoFullName, workflowFile);
  const requestId = url.searchParams.get('requestId')?.trim() || '';

  try {
    if (!requestId) {
      const records = await getPublishHistory(repoFullName, branch, workflowFile, accessToken);
      return new Response(JSON.stringify({ records, limit: HISTORY_LIMIT, actionsUrl }), {
        headers: { 'cache-control': 'no-store', 'content-type': 'application/json; charset=utf-8' },
      });
    }

    const runsResponse = await githubFetch<{ workflow_runs: WorkflowRun[] }>(
      runsApiUrl(repoFullName, workflowFile, branch),
      accessToken
    );
    const runs = runsResponse.workflow_runs || [];
    const matchedRun = runs.find(run => `${run.display_title || ''} ${run.name || ''}`.includes(requestId));

    if (!matchedRun) {
      return new Response(JSON.stringify({
        requestId,
        found: false,
        stage: 'waiting',
        label: stageLabel('waiting'),
        status: 'waiting',
        message: stageMessage('waiting'),
        actionsUrl,
      }), {
        headers: { 'cache-control': 'no-store', 'content-type': 'application/json; charset=utf-8' },
      });
    }

    const jobs = await getRunJobs(repoFullName, accessToken, matchedRun.id);
    const activeStep = getActiveStep(jobs);
    const stage = getRunStage(matchedRun, jobs);

    return new Response(JSON.stringify({
      requestId,
      found: true,
      stage,
      label: stageLabel(stage),
      status: matchedRun.status || 'unknown',
      conclusion: matchedRun.conclusion || '',
      message: stageMessage(stage, matchedRun, activeStep),
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
        steps: (job.steps || []).map(step => ({
          name: step.name,
          status: step.status || '',
          conclusion: step.conclusion || '',
          startedAt: step.started_at || '',
          completedAt: step.completed_at || '',
        })),
      })),
      actionsUrl,
    }), {
      headers: { 'cache-control': 'no-store', 'content-type': 'application/json; charset=utf-8' },
    });
  } catch (error) {
    return new Response(`Could not read backend publish status: ${githubErrorText(error)}`, {
      status: 502,
      headers: { 'cache-control': 'no-store', 'content-type': 'text/plain; charset=utf-8' },
    });
  }
};

export const DELETE: APIRoute = async ({ locals, request }) => {
  const env = getRuntimeEnv(locals) as Env;
  const writeError = await requireWriteAccess(request, env);
  if (writeError) return writeError;

  let body: { runIds?: unknown };
  try {
    body = await request.json();
  } catch {
    return new Response('Bad delete payload.', { status: 400 });
  }

  const runIds = Array.isArray(body.runIds)
    ? body.runIds.map(value => Number(value)).filter(value => Number.isSafeInteger(value) && value > 0)
    : [];
  if (!runIds.length) {
    return new Response('Select at least one publish record to delete.', {
      status: 400,
      headers: { 'cache-control': 'no-store', 'content-type': 'text/plain; charset=utf-8' },
    });
  }

  const repoFullName = getRepoFullName(env);
  const branch = getBranch(env);
  const workflowFile = getWorkflowFile(env);
  const accessToken = getDispatchToken(env) || getAccessToken(request);

  try {
    const runsResponse = await githubFetch<{ workflow_runs: WorkflowRun[] }>(
      runsApiUrl(repoFullName, workflowFile, branch, 100),
      accessToken
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
          { method: 'DELETE' }
        );
        deleted.push(runId);
      } catch (error) {
        errors.push({ runId, message: githubErrorText(error) });
      }
    }

    return new Response(JSON.stringify({ deleted, skipped, errors }), {
      headers: { 'cache-control': 'no-store', 'content-type': 'application/json; charset=utf-8' },
    });
  } catch (error) {
    return new Response(`Could not delete publish records: ${githubErrorText(error)}`, {
      status: 502,
      headers: { 'cache-control': 'no-store', 'content-type': 'text/plain; charset=utf-8' },
    });
  }
};
