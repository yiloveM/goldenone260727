import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { parse, stringify } from 'yaml';
import { getRuntimeEnv, requireManagerAccess } from '../../../../lib/manager/access';
import {
  encodeGitHubPath,
  getBranch,
  getDispatchToken,
  getRepoFullName,
  githubErrorText,
  githubFetch,
  githubHeaders,
} from '../../../../lib/manager/github';

export const prerender = false;

type DraftKind = 'product' | 'blog';
type DraftSummary = {
  type: DraftKind;
  typeLabel: string;
  draftSlug: string;
  title: string;
  sourceSlug: string;
  sourceTitle: string;
  locale: string;
  published: boolean;
  generatedAt: string;
  previewUrl: string;
  editPath: string;
};
type DraftDetail = DraftSummary & {
  path: string;
  data: Record<string, any>;
  body: string;
  editable: boolean;
};
type PreparedDraftApproval =
  | { draftSlug: string; status: 'missing' | 'skipped' }
  | { draftSlug: string; status: 'prepared'; path: string; content: string };

const encodeGitRef = (ref: string) => ref.split('/').map(encodeURIComponent).join('/');

const decodeBase64 = (value: string) => {
  const binary = atob(value.replace(/\s+/g, ''));
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
};

const encodeBase64 = (value: string) => {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
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
    `https://api.github.com/repos/${repoFullName}/contents/${encodeGitHubPath(dir)}?ref=${encodeURIComponent(branch)}`,
    { headers: githubHeaders(accessToken, 'businessweb-manager-draft-review') }
  );

  if (response.status === 404) return [];
  if (!response.ok) throw new Error(await response.text());
  const files = (await response.json()) as Array<{ name: string; path: string; type: string }>;
  return files.filter(file => file.type === 'file' && file.name.endsWith('.mdoc') && !file.name.startsWith('placeholder-'));
};

const readFile = async (repoFullName: string, branch: string, path: string, accessToken: string) => {
  const response = await fetch(
    `https://api.github.com/repos/${repoFullName}/contents/${encodeGitHubPath(path)}?ref=${encodeURIComponent(branch)}`,
    { headers: githubHeaders(accessToken, 'businessweb-manager-draft-review') }
  );

  if (!response.ok) throw new Error(await response.text());
  const data = (await response.json()) as { content?: string; encoding?: string };
  if (!data.content || data.encoding !== 'base64') return '';
  return decodeBase64(data.content);
};

const readFileWithSha = async (repoFullName: string, branch: string, path: string, accessToken: string) => {
  const response = await fetch(
    `https://api.github.com/repos/${repoFullName}/contents/${encodeGitHubPath(path)}?ref=${encodeURIComponent(branch)}`,
    { headers: githubHeaders(accessToken, 'businessweb-manager-draft-review') }
  );

  if (response.status === 404) return null;
  if (!response.ok) throw new Error(await response.text());
  const data = (await response.json()) as { content?: string; encoding?: string; sha?: string };
  if (!data.content || data.encoding !== 'base64' || !data.sha) return null;
  return {
    content: decodeBase64(data.content),
    sha: data.sha,
  };
};

const draftKindLabel = (kind: DraftKind) => (kind === 'product' ? '产品' : '文章');
const normalizeType = (value: string | null) => (value === 'product' || value === 'blog' ? value : 'all');
const draftListFallbackWarning = '正在显示当前可用的翻译草稿；最新内容暂时无法同步，请稍后重试。';
const draftListFallbackWarningForError = (error: unknown) => {
  const message = githubErrorText(error);
  if (/bad credentials|401/i.test(message)) {
    return draftListFallbackWarning;
  }
  if (/resource not accessible|403|forbidden|permission/i.test(message)) {
    return draftListFallbackWarning;
  }
  if (/not found|404/i.test(message)) {
    return draftListFallbackWarning;
  }
  return draftListFallbackWarning;
};
const safeDraftSlug = (value: unknown) => {
  const draftSlug = String(value || '').trim();
  return /^[a-z0-9]+(?:-[a-z0-9]+)*(?:--[a-z0-9]+(?:-[a-z0-9]+)*)?$/.test(draftSlug) ? draftSlug : '';
};

const draftPathForKind = (kind: DraftKind, draftSlug: string) =>
  `${kind === 'product' ? 'src/content/productTranslations' : 'src/content/blogTranslations'}/${draftSlug}.mdoc`;

const draftEditPathForKind = (kind: DraftKind, draftSlug: string, branch?: string) => {
  const collectionPath = `/collection/${kind === 'product' ? 'productTranslations' : 'blogTranslations'}/item/${encodeURIComponent(draftSlug)}`;
  return branch ? `/branch/${encodeURIComponent(branch)}${collectionPath}` : collectionPath;
};

const sortDrafts = (drafts: DraftSummary[]) =>
  drafts.sort(
    (a, b) =>
      Number(a.published) - Number(b.published) ||
      a.locale.localeCompare(b.locale) ||
      a.sourceSlug.localeCompare(b.sourceSlug)
  );

const draftSummaryFromData = (kind: DraftKind, draftSlug: string, data: Record<string, any>, branch?: string): DraftSummary => ({
  type: kind,
  typeLabel: draftKindLabel(kind),
  draftSlug,
  title: String(data.title || draftSlug),
  sourceSlug: String(data.sourceSlug || ''),
  sourceTitle: String(data.sourceTitle || ''),
  locale: String(data.locale || ''),
  published: data.published === true,
  generatedAt: String(data.generatedAt || ''),
  previewUrl: `/api/manager/ai/draft-preview?type=${kind}&draft=${encodeURIComponent(draftSlug)}`,
  editPath: draftEditPathForKind(kind, draftSlug, branch),
});

const draftDetailFromDocument = (
  kind: DraftKind,
  draftSlug: string,
  path: string,
  content: string,
  editable: boolean,
  branch?: string
): DraftDetail => {
  const { data, body } = splitMdocDocument(content);
  return {
    ...draftSummaryFromData(kind, draftSlug, data, branch),
    path,
    data,
    body,
    editable,
  };
};

const listLocalDrafts = async (kind: DraftKind, branch?: string): Promise<DraftSummary[]> => {
  const entries =
    kind === 'product'
      ? await getCollection('productTranslations')
      : await getCollection('blogTranslations');

  return sortDrafts(
    entries
      .filter(entry => !entry.id.startsWith('placeholder-'))
      .map(entry => draftSummaryFromData(kind, entry.id.replace(/\.mdoc$/, ''), entry.data, branch))
  );
};

const readLocalDraftDetail = async (
  kind: DraftKind,
  draftSlug: string,
  branch?: string,
  editable = false
): Promise<DraftDetail | null> => {
  const entries =
    kind === 'product'
      ? await getCollection('productTranslations')
      : await getCollection('blogTranslations');
  const entry = entries.find(item => item.id.replace(/\.mdoc$/, '') === draftSlug);
  if (!entry) return null;

  const data = { ...(entry.data as Record<string, any>) };
  return {
    ...draftSummaryFromData(kind, draftSlug, data, branch),
    path: draftPathForKind(kind, draftSlug),
    data,
    body: String((entry as any).body || ''),
    editable,
  };
};

const listDrafts = async (
  kind: DraftKind,
  repoFullName: string,
  branch: string,
  accessToken: string
): Promise<DraftSummary[]> => {
  const dir = kind === 'product' ? 'src/content/productTranslations' : 'src/content/blogTranslations';
  const files = await readDirectory(repoFullName, branch, dir, accessToken);
  const drafts = await Promise.all(
    files.map(async file => {
      const draftSlug = file.name.replace(/\.mdoc$/, '');
      const data = splitMdoc(await readFile(repoFullName, branch, file.path, accessToken));
      return draftSummaryFromData(kind, draftSlug, data, branch);
    })
  );

  return sortDrafts(drafts);
};

const prepareDraftApproval = async (
  kind: DraftKind,
  draftSlug: string,
  repoFullName: string,
  branch: string,
  accessToken: string
): Promise<PreparedDraftApproval> => {
  const path = draftPathForKind(kind, draftSlug);
  const file = await readFileWithSha(repoFullName, branch, path, accessToken).catch(() => null);
  const document = file
    ? splitMdocDocument(file.content)
    : await readLocalDraftDetail(kind, draftSlug, import.meta.env.PROD ? branch : undefined, true);
  if (!document) return { draftSlug, status: 'missing' };

  const { data, body } = document;
  if (data.published === true) return { draftSlug, status: 'skipped' };

  data.published = true;
  return { draftSlug, status: 'prepared', path, content: joinMdocDocument(data, body) };
};

const commitDraftFiles = async (
  files: Array<{ path: string; content: string }>,
  message: string,
  repoFullName: string,
  branch: string,
  accessToken: string
) => {
  if (!files.length) return '';

  const ref = await githubFetch<{ object?: { sha?: string } }>(
    `https://api.github.com/repos/${repoFullName}/git/ref/${encodeGitRef(`heads/${branch}`)}`,
    accessToken,
    undefined,
    'businessweb-manager-draft-review'
  );
  const baseCommitSha = ref.object?.sha || '';
  if (!baseCommitSha) throw new Error('Cannot resolve branch head.');

  const baseCommit = await githubFetch<{ tree?: { sha?: string } }>(
    `https://api.github.com/repos/${repoFullName}/git/commits/${baseCommitSha}`,
    accessToken,
    undefined,
    'businessweb-manager-draft-review'
  );
  const baseTreeSha = baseCommit.tree?.sha || '';
  if (!baseTreeSha) throw new Error('Cannot resolve branch tree.');

  const tree = await Promise.all(
    files.map(async file => {
      const blob = await githubFetch<{ sha: string }>(
        `https://api.github.com/repos/${repoFullName}/git/blobs`,
        accessToken,
        {
          method: 'POST',
          body: JSON.stringify({
            content: file.content,
            encoding: 'utf-8',
          }),
        },
        'businessweb-manager-draft-review'
      );

      return {
        path: file.path,
        mode: '100644',
        type: 'blob',
        sha: blob.sha,
      };
    })
  );

  const nextTree = await githubFetch<{ sha: string }>(
    `https://api.github.com/repos/${repoFullName}/git/trees`,
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify({ base_tree: baseTreeSha, tree }),
    },
    'businessweb-manager-draft-review'
  );

  const nextCommit = await githubFetch<{ sha: string }>(
    `https://api.github.com/repos/${repoFullName}/git/commits`,
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify({
        message,
        tree: nextTree.sha,
        parents: [baseCommitSha],
      }),
    },
    'businessweb-manager-draft-review'
  );

  await githubFetch(
    `https://api.github.com/repos/${repoFullName}/git/refs/${encodeGitRef(`heads/${branch}`)}`,
    accessToken,
    {
      method: 'PATCH',
      body: JSON.stringify({ sha: nextCommit.sha, force: false }),
    },
    'businessweb-manager-draft-review'
  );

  return nextCommit.sha;
};

const commitPreparedDrafts = async (
  kind: DraftKind,
  approvals: Extract<PreparedDraftApproval, { status: 'prepared' }>[],
  repoFullName: string,
  branch: string,
  accessToken: string
) =>
  commitDraftFiles(
    approvals.map(approval => ({ path: approval.path, content: approval.content })),
    `Approve ${approvals.length} ${kind === 'product' ? 'product' : 'article'} translation drafts [skip ci]`,
    repoFullName,
    branch,
    accessToken
  );

const getAccessToken = (env: Record<string, unknown> | undefined) => getDispatchToken(env, 'translation');

export const GET: APIRoute = async ({ locals, request, url }) => {
  const env = getRuntimeEnv(locals);
  const access = requireManagerAccess(request, env);
  if (access.response) return access.response;

  const accessToken = getAccessToken(env);
  const includePublished = url.searchParams.get('includePublished') === 'true';
  const type = normalizeType(url.searchParams.get('type'));
  const requestedDraftSlug = safeDraftSlug(url.searchParams.get('draft'));
  const keystaticBranch = import.meta.env.PROD ? getBranch(env) : undefined;

  if (requestedDraftSlug) {
    if (type !== 'product' && type !== 'blog') {
      return new Response('草稿类型不正确。', { status: 400 });
    }

    let draft: DraftDetail | null = null;
    let warning = '';
    if (accessToken) {
      const repoFullName = getRepoFullName(env);
      const branch = getBranch(env);
      const path = draftPathForKind(type, requestedDraftSlug);
      try {
        const file = await readFileWithSha(repoFullName, branch, path, accessToken);
        draft = file ? draftDetailFromDocument(type, requestedDraftSlug, path, file.content, true, keystaticBranch) : null;
      } catch (error) {
        warning = draftListFallbackWarningForError(error);
      }
    } else {
      warning = draftListFallbackWarning;
    }

    if (!draft) draft = await readLocalDraftDetail(type, requestedDraftSlug, keystaticBranch, Boolean(accessToken));
    if (!draft) return new Response('找不到这条翻译草稿。', { status: 404 });

    return new Response(JSON.stringify({ draft, warning }), {
      headers: { 'cache-control': 'no-store', 'content-type': 'application/json; charset=utf-8' },
    });
  }

  let warning = '';
  let productDrafts: DraftSummary[] = [];
  let blogDrafts: DraftSummary[] = [];

  const listRequestedDrafts = async (source: (kind: DraftKind) => Promise<DraftSummary[]>) => {
    const [nextProductDrafts, nextBlogDrafts] = await Promise.all([
      type === 'blog' ? Promise.resolve([]) : source('product'),
      type === 'product' ? Promise.resolve([]) : source('blog'),
    ]);
    productDrafts = nextProductDrafts;
    blogDrafts = nextBlogDrafts;
  };

  if (accessToken) {
    const repoFullName = getRepoFullName(env);
    const branch = getBranch(env);
    try {
      await listRequestedDrafts(kind => listDrafts(kind, repoFullName, branch, accessToken));
    } catch (error) {
      warning = draftListFallbackWarningForError(error);
      await listRequestedDrafts(kind => listLocalDrafts(kind, keystaticBranch));
    }
  } else {
    warning = draftListFallbackWarning;
    await listRequestedDrafts(kind => listLocalDrafts(kind, keystaticBranch));
  }
  const allDrafts = [...productDrafts, ...blogDrafts];
  const drafts = includePublished ? allDrafts : allDrafts.filter(draft => !draft.published);

  return new Response(
    JSON.stringify({
      drafts,
      warning,
      counts: {
        total: allDrafts.length,
        pending: allDrafts.filter(draft => !draft.published).length,
        published: allDrafts.filter(draft => draft.published).length,
        visible: drafts.length,
      },
    }),
    {
      headers: { 'cache-control': 'no-store', 'content-type': 'application/json; charset=utf-8' },
    }
  );
};

export const PUT: APIRoute = async ({ locals, request }) => {
  const env = getRuntimeEnv(locals);
  const access = requireManagerAccess(request, env);
  if (access.response) return access.response;

  const accessToken = getAccessToken(env);
  if (!accessToken) {
    return new Response('翻译草稿保存服务暂时不可用，请稍后重试。', { status: 500 });
  }

  const payload = (await request.json().catch(() => null)) as {
    type?: string;
    draftSlug?: unknown;
    data?: unknown;
    body?: unknown;
  } | null;
  const type: DraftKind | '' = payload?.type === 'product' || payload?.type === 'blog' ? payload.type : '';
  const draftSlug = safeDraftSlug(payload?.draftSlug);
  if (!type) return new Response('草稿类型不正确。', { status: 400 });
  if (!draftSlug) return new Response('草稿文件名不正确。', { status: 400 });
  if (!payload?.data || typeof payload.data !== 'object' || Array.isArray(payload.data)) {
    return new Response('草稿内容不正确。', { status: 400 });
  }

  const repoFullName = getRepoFullName(env);
  const branch = getBranch(env);
  const path = draftPathForKind(type, draftSlug);
  let file: Awaited<ReturnType<typeof readFileWithSha>> = null;
  let current: { data: Record<string, any>; body: string } | null = null;

  try {
    file = await readFileWithSha(repoFullName, branch, path, accessToken);
  } catch {
    file = null;
  }

  if (file) {
    current = splitMdocDocument(file.content);
  } else {
    current = await readLocalDraftDetail(type, draftSlug, import.meta.env.PROD ? branch : undefined, true);
  }

  if (!current) return new Response('找不到这条翻译草稿。', { status: 404 });

  const data = {
    ...current.data,
    ...(payload.data as Record<string, any>),
  };
  const body = typeof payload.body === 'string' ? payload.body : current.body;
  const content = joinMdocDocument(data, body);

  try {
    if (file?.sha) {
      await githubFetch(
        `https://api.github.com/repos/${repoFullName}/contents/${encodeGitHubPath(path)}`,
        accessToken,
        {
          method: 'PUT',
          body: JSON.stringify({
            message: `Update ${type === 'product' ? 'product' : 'article'} translation draft ${draftSlug} [skip ci]`,
            content: encodeBase64(content),
            sha: file.sha,
            branch,
          }),
        },
        'businessweb-manager-draft-review'
      );
    } else {
      await commitDraftFiles(
        [{ path, content }],
        `Update ${type === 'product' ? 'product' : 'article'} translation draft ${draftSlug} [skip ci]`,
        repoFullName,
        branch,
        accessToken
      );
    }
  } catch (error) {
    const message = githubErrorText(error);
    if (/bad credentials|401/i.test(message)) {
      return new Response('翻译草稿保存服务暂时不可用，请稍后重试。', { status: 502 });
    }
    if (/resource not accessible|403|forbidden|permission/i.test(message)) {
      return new Response('当前无法保存翻译草稿，请稍后重试；如持续出现，请联系系统维护人员。', { status: 502 });
    }
    return new Response('保存翻译草稿失败，请稍后重试。', { status: 502 });
  }

  return new Response(
    JSON.stringify({
      draft: draftDetailFromDocument(type, draftSlug, path, content, true, import.meta.env.PROD ? branch : undefined),
    }),
    {
      headers: { 'cache-control': 'no-store', 'content-type': 'application/json; charset=utf-8' },
    }
  );
};

export const PATCH: APIRoute = async ({ locals, request }) => {
  const env = getRuntimeEnv(locals);
  const access = requireManagerAccess(request, env);
  if (access.response) return access.response;

  const accessToken = getAccessToken(env);
  if (!accessToken) {
    return new Response('翻译草稿审核服务暂时不可用，请稍后重试。', { status: 500 });
  }

  const payload = (await request.json().catch(() => null)) as { type?: string; drafts?: unknown[] } | null;
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
      void error;
      errors.push({
        draftSlug,
        message: '审核失败，请稍后重试。',
      });
    }
  }

  const approvals = results.filter(
    (result): result is Extract<PreparedDraftApproval, { status: 'prepared' }> => result.status === 'prepared'
  );
  if (approvals.length) {
    try {
      await commitPreparedDrafts(type, approvals, repoFullName, branch, accessToken);
    } catch (error) {
      void error;
      errors.push({
        draftSlug: approvals.map(result => result.draftSlug).join(', '),
        message: '批量提交失败，请稍后重试。',
      });
    }
  }

  return new Response(
    JSON.stringify({
      approved: errors.length ? [] : approvals.map(result => result.draftSlug),
      skipped: results.filter(result => result.status !== 'prepared'),
      errors,
    }),
    {
      status: errors.length ? 207 : 200,
      headers: { 'cache-control': 'no-store', 'content-type': 'application/json; charset=utf-8' },
    }
  );
};
