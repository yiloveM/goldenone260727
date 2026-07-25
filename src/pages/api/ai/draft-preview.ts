import type { APIRoute } from 'astro';
import { getRuntimeEnv } from '../../../lib/runtime-env';
import { parse } from 'yaml';

export const prerender = false;

const DEFAULT_BRANCH = 'main';
type Env = Record<string, unknown> | undefined;
type DraftType = 'product' | 'blog';

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
  'user-agent': 'businessweb-keystatic-preview',
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

const decodeBase64 = (value: string) => {
  const normalized = value.replace(/\s+/g, '');
  const binary = atob(normalized);
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
};

const readRepoFile = async (repoFullName: string, branch: string, path: string, accessToken: string) => {
  const response = await fetch(
    `https://api.github.com/repos/${repoFullName}/contents/${encodePath(path)}?ref=${encodeURIComponent(branch)}`,
    { headers: githubHeaders(accessToken) }
  );

  if (response.status === 404) return null;
  if (!response.ok) throw new Error(await response.text());
  const data = await response.json() as { content?: string; encoding?: string };
  if (!data.content || data.encoding !== 'base64') return null;
  return decodeBase64(data.content);
};

const splitMdoc = (content: string) => {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { data: {}, body: content };
  return {
    data: parse(match[1]) as Record<string, any>,
    body: match[2] || '',
  };
};

const escapeHtml = (value: unknown) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const normalizeDraftType = (value: string | null): DraftType => (value === 'blog' ? 'blog' : 'product');
const safeDraftSlug = (value: string | null) => {
  const draft = String(value || '').trim();
  return /^[a-z0-9-]+--[a-z0-9-]+$/.test(draft) ? draft : '';
};

const renderMarkdownPreview = (body: string) => {
  const lines = body.replace(/\r\n/g, '\n').split('\n');
  const output: string[] = [];
  let inList = false;
  let tableRows: string[][] = [];

  const closeList = () => {
    if (!inList) return;
    output.push('</ul>');
    inList = false;
  };
  const flushTable = () => {
    if (!tableRows.length) return;
    const [head, ...rows] = tableRows;
    output.push('<div class="preview-table-scroll"><table><thead><tr>');
    output.push(head.map(cell => `<th>${escapeHtml(cell)}</th>`).join(''));
    output.push('</tr></thead><tbody>');
    rows.forEach(row => output.push(`<tr>${row.map(cell => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`));
    output.push('</tbody></table></div>');
    tableRows = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      closeList();
      flushTable();
      continue;
    }
    if (/^\|.+\|$/.test(line) && !/^\|\s*-+/.test(line)) {
      closeList();
      tableRows.push(line.slice(1, -1).split('|').map(cell => cell.trim()));
      continue;
    }
    if (/^\|\s*:?-+/.test(line)) continue;
    flushTable();
    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      closeList();
      const level = Math.min(4, heading[1].length + 1);
      output.push(`<h${level}>${escapeHtml(heading[2])}</h${level}>`);
      continue;
    }
    const bullet = line.match(/^[-*]\s+(.+)$/);
    if (bullet) {
      if (!inList) {
        output.push('<ul>');
        inList = true;
      }
      output.push(`<li>${escapeHtml(bullet[1])}</li>`);
      continue;
    }
    closeList();
    output.push(`<p>${escapeHtml(line)}</p>`);
  }

  closeList();
  flushTable();
  return output.join('\n');
};

const renderKeyValueTable = (rows: Array<{ label?: string; value?: string }> = []) => {
  if (!rows.length) return '';
  return `<div class="preview-table-scroll"><table><tbody>${rows
    .map(row => `<tr><th>${escapeHtml(row.label)}</th><td>${escapeHtml(row.value)}</td></tr>`)
    .join('')}</tbody></table></div>`;
};

const renderSpecTables = (tables: any[] = []) =>
  tables
    .filter(table => Array.isArray(table?.rows) && table.rows.length)
    .map(table => {
      const headerRows = Array.isArray(table.headerRows) && table.headerRows.length
        ? table.headerRows
        : [{ cells: (table.columns || []).map((text: string) => ({ text })) }];
      return `<section class="preview-card">
        <h2>${escapeHtml(table.title || 'Model specifications')}</h2>
        <div class="preview-table-scroll">
          <table>
            <thead>${headerRows.map((row: any) => `<tr>${(row.cells || []).map((cell: any) =>
              `<th colspan="${Math.max(1, Number(cell.colspan || 1))}" rowspan="${Math.max(1, Number(cell.rowspan || 1))}">${escapeHtml(cell.text)}</th>`
            ).join('')}</tr>`).join('')}</thead>
            <tbody>${table.rows.map((row: unknown[]) => `<tr>${row.map(cell => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')}</tbody>
          </table>
        </div>
      </section>`;
    })
    .join('');

const renderList = (title: string, items: string[] = []) => {
  if (!items.length) return '';
  return `<section class="preview-card"><h2>${escapeHtml(title)}</h2><ul>${items.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul></section>`;
};

const renderFaqs = (items: Array<{ question?: string; answer?: string }> = []) => {
  if (!items.length) return '';
  return `<section class="preview-card"><h2>FAQ</h2>${items
    .map(item => `<details><summary>${escapeHtml(item.question)}</summary><p>${escapeHtml(item.answer)}</p></details>`)
    .join('')}</section>`;
};

const page = ({ title, description, image, body, locale }: {
  title: string;
  description: string;
  image?: string;
  body: string;
  locale: string;
}) => `<!doctype html>
<html lang="${escapeHtml(locale)}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex, nofollow, noarchive" />
    <title>${escapeHtml(title)} | Draft preview</title>
    <style>
      :root { color-scheme: light; font-family: Inter, "Noto Sans", Arial, sans-serif; color: #062436; background: #edf8fa; }
      body { margin: 0; background: radial-gradient(circle at 15% 0%, rgba(91, 208, 223, .18), transparent 32%), linear-gradient(180deg, #f8fdfe 0%, #e8f8fb 58%, #f7fcfd 100%); }
      .preview-shell { max-width: 1180px; margin: 0 auto; padding: 28px 18px 64px; }
      .preview-banner { margin-bottom: 16px; border: 1px solid rgba(12, 139, 163, .24); border-radius: 8px; padding: 12px 14px; background: rgba(255,255,255,.72); color: #0b6d7f; font-weight: 800; }
      .preview-hero, .preview-card { border: 1px solid rgba(17, 134, 156, .18); border-radius: 12px; background: rgba(255,255,255,.82); box-shadow: 0 24px 80px rgba(5, 69, 84, .12); }
      .preview-hero { display: grid; grid-template-columns: minmax(0, 1.08fr) minmax(280px, .92fr); gap: 28px; align-items: center; padding: 30px; overflow: hidden; }
      .preview-hero img { width: 100%; max-height: 420px; object-fit: contain; background: #fff; border-radius: 10px; }
      .eyebrow { color: #008aa1; font-size: 12px; font-weight: 900; letter-spacing: .12em; text-transform: uppercase; }
      h1 { margin: 12px 0; font-size: clamp(34px, 5vw, 68px); line-height: .95; }
      h2 { margin: 0 0 14px; font-size: clamp(22px, 3vw, 34px); }
      p, li, td, th, summary { font-size: 16px; line-height: 1.72; }
      .preview-grid { display: grid; gap: 18px; margin-top: 18px; }
      .preview-card { padding: 24px; overflow: hidden; }
      .preview-card ul { margin: 0; padding-left: 22px; }
      .preview-table-scroll { width: 100%; overflow-x: auto; padding-bottom: 8px; }
      table { width: 100%; min-width: 620px; border-collapse: collapse; background: #fff; }
      th, td { border: 1px solid rgba(14, 131, 153, .2); padding: 10px 12px; text-align: left; vertical-align: middle; }
      th { background: linear-gradient(180deg, #e5fbff, #d6f4f9); color: #06475b; font-weight: 900; }
      details { border-top: 1px solid rgba(14, 131, 153, .16); padding: 12px 0; }
      details:first-of-type { border-top: 0; }
      @media (max-width: 760px) { .preview-hero { grid-template-columns: 1fr; padding: 20px; } .preview-shell { padding: 14px; } }
    </style>
  </head>
  <body>
    <main class="preview-shell">
      <div class="preview-banner">Draft preview only. Review the content here, then return to Keystatic and enable publish after approval.</div>
      <section class="preview-hero">
        <div dir="auto">
          <span class="eyebrow">AI translation draft</span>
          <h1>${escapeHtml(title)}</h1>
          <p>${escapeHtml(description)}</p>
        </div>
        ${image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(title)}" />` : ''}
      </section>
      <div class="preview-grid" dir="auto">${body}</div>
    </main>
  </body>
</html>`;

export const GET: APIRoute = async ({ locals, request, url }) => {
  const env = getRuntimeEnv(locals) as Env;
  const accessToken = getAccessToken(request);

  if (!accessToken || !(await hasGitHubWriteAccess(request, env))) {
    return new Response('需要先登录内容管理后台，才可以预览翻译草稿。', { status: 401 });
  }

  const type = normalizeDraftType(url.searchParams.get('type'));
  const draftSlug = safeDraftSlug(url.searchParams.get('draft'));
  if (!draftSlug) return new Response('Draft slug is invalid.', { status: 400 });

  const repoFullName = getRepoFullName(env);
  const branch = getBranch(env);
  const draftPath = type === 'product'
    ? `src/content/productTranslations/${draftSlug}.mdoc`
    : `src/content/blogTranslations/${draftSlug}.mdoc`;
  const draftFile = await readRepoFile(repoFullName, branch, draftPath, accessToken);
  if (!draftFile) return new Response('找不到这个翻译草稿。', { status: 404 });

  const draft = splitMdoc(draftFile);
  const data = draft.data;
  const sourceSlug = String(data.sourceSlug || '');
  const sourcePath = type === 'product'
    ? `src/content/products/${sourceSlug}.mdoc`
    : `src/content/blog/${sourceSlug}.mdoc`;
  const sourceFile = sourceSlug ? await readRepoFile(repoFullName, branch, sourcePath, accessToken) : null;
  const source = sourceFile ? splitMdoc(sourceFile).data : {};
  const image = String(source.image || '');

  const body = type === 'product'
    ? [
      renderList('Applications', data.applications),
      `<section class="preview-card"><h2>Key product parameters</h2>${renderKeyValueTable(data.specs)}</section>`,
      renderSpecTables(data.specTables),
      renderList('Highlights', data.highlights),
      `<section class="preview-card">${renderMarkdownPreview(draft.body)}</section>`,
      renderFaqs(data.faqs),
    ].filter(Boolean).join('')
    : [
      `<section class="preview-card"><span class="eyebrow">${escapeHtml(data.category)}</span>${renderMarkdownPreview(draft.body)}</section>`,
    ].join('');

  return new Response(page({
    title: String(data.title || data.sourceTitle || draftSlug),
    description: String(data.description || ''),
    image,
    body,
    locale: String(data.locale || 'en'),
  }), {
    headers: {
      'cache-control': 'no-store',
      'content-type': 'text/html; charset=utf-8',
      'x-robots-tag': 'noindex, nofollow, noarchive',
    },
  });
};
