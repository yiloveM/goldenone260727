import {
  DEFAULT_BRANCH,
  getBackendTaskToken,
  getBranch as getConfiguredBranch,
  getRepoFullName as getConfiguredRepoFullName,
  type BackendTaskPurpose,
  type RuntimeEnv,
} from '../runtime-env';

export { DEFAULT_BRANCH };

export const getRepoFullName = (env: RuntimeEnv) => getConfiguredRepoFullName(env);

export const getBranch = (env: RuntimeEnv) => getConfiguredBranch(env);

export const getDispatchToken = (env: RuntimeEnv, purpose: BackendTaskPurpose = 'manager') =>
  getBackendTaskToken(env, purpose);

export const githubHeaders = (accessToken: string, userAgent = 'businessweb-manager-portal') => ({
  accept: 'application/vnd.github+json',
  authorization: `Bearer ${accessToken}`,
  'content-type': 'application/json',
  'x-github-api-version': '2026-03-10',
  'user-agent': userAgent,
});

export const githubFetch = async <T>(
  url: string,
  accessToken: string,
  init?: RequestInit,
  userAgent = 'businessweb-manager-portal'
) => {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...githubHeaders(accessToken, userAgent),
      ...(init?.headers || {}),
    },
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
};

export const githubErrorText = (error: unknown) => {
  const raw = error instanceof Error ? error.message : String(error || 'Unknown error');
  try {
    const parsed = JSON.parse(raw) as { message?: string; status?: string | number };
    return [parsed.message, parsed.status ? `status ${parsed.status}` : ''].filter(Boolean).join(' / ') || raw;
  } catch {
    return raw;
  }
};

export const createRequestId = (prefix: string) => {
  const random = crypto.getRandomValues(new Uint32Array(1))[0].toString(36);
  return `${prefix}-${Date.now().toString(36)}-${random}`;
};

export const workflowRunsUrl = (repoFullName: string, workflowFile: string) =>
  `https://github.com/${repoFullName}/actions/workflows/${workflowFile}`;

export const dispatchWorkflow = async ({
  accessToken,
  repoFullName,
  branch,
  workflowFile,
  inputs,
  userAgent,
}: {
  accessToken: string;
  repoFullName: string;
  branch: string;
  workflowFile: string;
  inputs: Record<string, string>;
  userAgent?: string;
}) => {
  await githubFetch<void>(
    `https://api.github.com/repos/${repoFullName}/actions/workflows/${workflowFile}/dispatches`,
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify({
        ref: branch,
        inputs,
      }),
    },
    userAgent
  );
};

export const encodeGitHubPath = (path: string) => path.split('/').map(encodeURIComponent).join('/');
