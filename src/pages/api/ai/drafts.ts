import type { APIRoute } from 'astro';
import { getRuntimeEnv } from '../../../lib/runtime-env';
import { parse, stringify } from 'yaml';

export const prerender = false;

const DEFAULT_BRANCH = 'main';
type Env = Record<string, unknown> | undefined;
type DraftKind = 'product' | 'blog';
type PreparedDraftApproval =
  | { draftSlug: string; status: 'missing' | 'skipped' }
  | { draftSlug: string; status: 'prepared'; path: string; content: string };

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

const encodePath = (path: string) => path.split('/').map(encodeURIComponent).join('/');
const encodeGitRef = (ref: string) => ref.split('/').map(encodeURIComponent).join('/');

const decodeBase64 = (value: string) => {
  const normalized = value.replace(/\s+/g, '');
  const binary = atob(normalized);
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
};

const splitMdoc = (content: string) => {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return {};
  return parse(match[1]) as Record<string, any>;
};

const splitMdocDocument = (content: string) => {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return { data: {}, body: content };
  return {
    data: parse(match[1]) as Record<string, any>,
    body: content.slice(match[0].length),
  };
};

const joinMdocDocument = (data: Record<string, any>, body: string) => `---\n${stringify(data).trimEnd()}\n---\n${body}`;

const readDirectory = async (repoFullName: string, branch: string, dir: string, accessToken: string) => {
  const response = await fetch(
    `https://api.github.com/repos/${repoFullName}/contents/${encodePath(dir)}?ref=${encodeURIComponent(branch)}`,
    { headers: githubHeaders(accessToken) }
  );

  if (response.status === 404) return [];
  if (!response.ok) throw new Error(await response.text());
  const files = await response.json() as Array<{ name: string; path: string; type: string }>;
  return files.filter(file => file.type === 'file' && file.name.endsWith('.mdoc') && !file.name.startsWith('placeholder-'));
};

const readFile = async (repoFullName: string, branch: string, path: string, accessToken: string) => {
  const response = await fetch(
    `https://api.github.com/repos/${repoFullName}/contents/${encodePath(path)}?ref=${encodeURIComponent(branch)}`,
    { headers: githubHeaders(accessToken) }
  );

  if (!response.ok) throw new Error(await response.text());
  const data = await response.json() as { content?: string; encoding?: string };
  if (!data.content || data.encoding !== 'base64') return '';
  return decodeBase64(data.content);
};

const readFileWithSha = async (repoFullName: string, branch: string, path: string, accessToken: string) => {
  const response = await fetch(
    `https://api.github.com/repos/${repoFullName}/contents/${encodePath(path)}?ref=${encodeURIComponent(branch)}`,
    { headers: githubHeaders(accessToken) }
  );

  if (response.status === 404) return null;
  if (!response.ok) throw new Error(await response.text());
  const data = await response.json() as { content?: string; encoding?: string; sha?: string };
  if (!data.content || data.encoding !== 'base64' || !data.sha) return null;
  return {
    content: decodeBase64(data.content),
    sha: data.sha,
  };
};

const draftKindLabel = (kind: DraftKind) => (kind === 'product' ? '产品' : '文章');
const normalizeType = (value: string | null) => (value === 'product' || value === 'blog' ? value : 'all');
const safeDraftSlug = (value: unknown) => {
  const draftSlug = String(value || '').trim();
  return /^[a-z0-9-]+--[a-z0-9-]+$/.test(draftSlug) ? draftSlug : '';
};

const listDrafts = async (kind: DraftKind, repoFullName: string, branch: string, accessToken: string) => {
  const dir = kind === 'product' ? 'src/content/productTranslations' : 'src/content/blogTranslations';
  const files = await readDirectory(repoFullName, branch, dir, accessToken);
  const drafts = await Promise.all(files.map(async file => {
    const draftSlug = file.name.replace(/\.mdoc$/, '');
    const data = splitMdoc(await readFile(repoFullName, branch, file.path, accessToken));
    return {
      type: kind,
      typeLabel: draftKindLabel(kind),
      draftSlug,
      title: String(data.title || draftSlug),
      sourceSlug: String(data.sourceSlug || ''),
      sourceTitle: String(data.sourceTitle || ''),
      locale: String(data.locale || ''),
      published: data.published === true,
      generatedAt: String(data.generatedAt || ''),
      previewUrl: `/api/ai/draft-preview?type=${kind}&draft=${encodeURIComponent(draftSlug)}`,
      editPath: `/collection/${kind === 'product' ? 'productTranslations' : 'blogTranslations'}/item/${encodeURIComponent(draftSlug)}`,
    };
  }));

  return drafts.sort((a, b) =>
    Number(a.published) - Number(b.published) ||
    a.locale.localeCompare(b.locale) ||
    a.sourceSlug.localeCompare(b.sourceSlug)
  );
};

const prepareDraftApproval = async (kind: DraftKind, draftSlug: string, repoFullName: string, branch: string, accessToken: string): Promise<PreparedDraftApproval> => {
  const dir = kind === 'product' ? 'src/content/productTranslations' : 'src/content/blogTranslations';
  const path = `${dir}/${draftSlug}.mdoc`;
  const file = await readFileWithSha(repoFullName, branch, path, accessToken);
  if (!file) return { draftSlug, status: 'missing' };

  const { data, body } = splitMdocDocument(file.content);
  if (data.published === true) return { draftSlug, status: 'skipped' };

  data.published = true;
  const content = joinMdocDocument(data, body);

  return { draftSlug, status: 'prepared', path, content };
};

const commitPreparedDrafts = async (
  kind: DraftKind,
  approvals: Extract<PreparedDraftApproval, { status: 'prepared' }>[],
  repoFullName: string,
  branch: string,
  accessToken: string
) => {
  if (!approvals.length) return '';

  const ref = await githubFetch<{ object?: { sha?: string } }>(
    `https://api.github.com/repos/${repoFullName}/git/ref/${encodeGitRef(`heads/${branch}`)}`,
    accessToken
  );
  const baseCommitSha = ref.object?.sha || '';
  if (!baseCommitSha) throw new Error('Cannot resolve branch head.');

  const baseCommit = await githubFetch<{ tree?: { sha?: string } }>(
    `https://api.github.com/repos/${repoFullName}/git/commits/${baseCommitSha}`,
    accessToken
  );
  const baseTreeSha = baseCommit.tree?.sha || '';
  if (!baseTreeSha) throw new Error('Cannot resolve branch tree.');

  const tree = await Promise.all(approvals.map(async approval => {
    const blob = await githubFetch<{ sha: string }>(
      `https://api.github.com/repos/${repoFullName}/git/blobs`,
      accessToken,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          content: approval.content,
          encoding: 'utf-8',
        }),
      }
    );

    return {
      path: approval.path,
      mode: '100644',
      type: 'blob',
      sha: blob.sha,
    };
  }));

  const nextTree = await githubFetch<{ sha: string }>(
    `https://api.github.com/repos/${repoFullName}/git/trees`,
    accessToken,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        base_tree: baseTreeSha,
        tree,
      }),
    }
  );

  const nextCommit = await githubFetch<{ sha: string }>(
    `https://api.github.com/repos/${repoFullName}/git/commits`,
    accessToken,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        message: `Approve ${approvals.length} ${kind === 'product' ? 'product' : 'article'} translation drafts [skip ci]`,
        tree: nextTree.sha,
        parents: [baseCommitSha],
      }),
    }
  );

  await githubFetch(
    `https://api.github.com/repos/${repoFullName}/git/refs/${encodeGitRef(`heads/${branch}`)}`,
    accessToken,
    {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        sha: nextCommit.sha,
        force: false,
      }),
    }
  );

  return nextCommit.sha;
};

export const GET: APIRoute = async ({ locals, request, url }) => {
  const env = getRuntimeEnv(locals) as Env;
  const accessToken = getAccessToken(request);

  if (!accessToken || !(await hasGitHubWriteAccess(request, env))) {
    return new Response('需要先登录内容管理后台，才可以查看翻译草稿。', { status: 401 });
  }

  const repoFullName = getRepoFullName(env);
  const branch = getBranch(env);
  const includePublished = url.searchParams.get('includePublished') === 'true';
  const type = normalizeType(url.searchParams.get('type'));
  const [productDrafts, blogDrafts] = await Promise.all([
    type === 'blog' ? Promise.resolve([]) : listDrafts('product', repoFullName, branch, accessToken),
    type === 'product' ? Promise.resolve([]) : listDrafts('blog', repoFullName, branch, accessToken),
  ]);
  const allDrafts = [...productDrafts, ...blogDrafts];
  const drafts = includePublished ? allDrafts : allDrafts.filter(draft => !draft.published);

  return new Response(JSON.stringify({
    drafts,
    counts: {
      total: allDrafts.length,
      pending: allDrafts.filter(draft => !draft.published).length,
      published: allDrafts.filter(draft => draft.published).length,
      visible: drafts.length,
    },
  }), {
    headers: {
      'cache-control': 'no-store',
      'content-type': 'application/json; charset=utf-8',
    },
  });
};

export const PATCH: APIRoute = async ({ locals, request }) => {
  const env = getRuntimeEnv(locals) as Env;
  const accessToken = getAccessToken(request);

  if (!accessToken || !(await hasGitHubWriteAccess(request, env))) {
    return new Response('需要先登录内容管理后台，才可以审核翻译草稿。', { status: 401 });
  }

  const payload = await request.json().catch(() => null) as { type?: string; drafts?: unknown[] } | null;
  const type: DraftKind | '' = payload?.type === 'product' || payload?.type === 'blog' ? payload.type : '';
  const draftSlugs = [...new Set((payload?.drafts || []).map(safeDraftSlug).filter(Boolean))];

  if (!type) return new Response('草稿类型不正确。', { status: 400 });
  if (!draftSlugs.length) return new Response('请先选择需要审核的草稿。', { status: 400 });

  const repoFullName = getRepoFullName(env);
  const branch = getBranch(env);
  const results: PreparedDraftApproval[] = [];
  const errors = [];

  for (const draftSlug of draftSlugs) {
    try {
      results.push(await prepareDraftApproval(type, draftSlug, repoFullName, branch, accessToken));
    } catch (error) {
      errors.push({
        draftSlug,
        message: error instanceof Error ? error.message : '审核失败。',
      });
    }
  }

  const approvals = results.filter(
    (result): result is Extract<PreparedDraftApproval, { status: 'prepared' }> => result.status === 'prepared'
  );
  let commit = '';

  if (approvals.length) {
    try {
      commit = await commitPreparedDrafts(type, approvals, repoFullName, branch, accessToken);
    } catch (error) {
      errors.push({
        draftSlug: approvals.map(result => result.draftSlug).join(', '),
        message: error instanceof Error ? error.message : '批量提交失败。',
      });
    }
  }

  return new Response(JSON.stringify({
    approved: errors.length ? [] : approvals.map(result => result.draftSlug),
    skipped: results.filter(result => result.status !== 'prepared'),
    errors,
    commit,
  }), {
    status: errors.length ? 207 : 200,
    headers: {
      'cache-control': 'no-store',
      'content-type': 'application/json; charset=utf-8',
    },
  });
};
