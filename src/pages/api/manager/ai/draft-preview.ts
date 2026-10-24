import { renderMarkdownPreview } from '../../../../lib/translation-preview';
import { publicMediaUrl } from '../../../../lib/public-media-url.mjs';
import { renderProductPreviewMedia } from '../../../../lib/product-preview-media.mjs';
import siteOrigin from '../../../../data/site-origin.json';
import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { getRuntimeEnv, requireManagerAccess } from '../../../../lib/manager/access';
import { getBranch, getDispatchToken, getRepoFullName } from '../../../../lib/manager/github';
import {openDraftState,summarizeDraft,requireTranslationFeature,splitDraft} from '../../../../lib/draft-lifecycle';
import {readGitBlob,FeatureDenied} from '../../../../lib/site-git';
import {readFeatureState,requireFeature,featureResponse} from '../../../../lib/manager/features';

export const prerender = false;

type DraftType = 'product' | 'blog';

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
  return /^[a-z0-9]+(?:-[a-z0-9]+)*(?:--[a-z0-9]+(?:-[a-z0-9]+)*)?$/.test(draft) ? draft : '';
};

const slugFromId = (id: string) => id.replace(/\.mdoc$/, '');

const readLocalDraft = async (type: DraftType, draftSlug: string) => {
  const entries =
    type === 'product'
      ? await getCollection('productTranslations')
      : await getCollection('blogTranslations');
  const entry = entries.find(item => slugFromId(item.id) === draftSlug);
  if (!entry) return null;
  return {
    data: entry.data as Record<string, any>,
    body: String((entry as any).body || ''),
  };
};

const readLocalSource = async (type: DraftType, sourceSlug: string) => {
  if (!sourceSlug) return {};
  const entries = type === 'product' ? await getCollection('products') : await getCollection('blog');
  const entry = entries.find(item => slugFromId(item.id) === sourceSlug);
  return (entry?.data || {}) as Record<string, any>;
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
      const headerRows =
        Array.isArray(table.headerRows) && table.headerRows.length
          ? table.headerRows
          : [{ cells: (table.columns || []).map((text: string) => ({ text })) }];
      return `<section class="preview-card">
        <h2>${escapeHtml(table.title || 'Model specifications')}</h2>
        <div class="preview-table-scroll">
          <table>
            <thead>${headerRows
              .map(
                (row: any) =>
                  `<tr>${(row.cells || [])
                    .map(
                      (cell: any) =>
                        `<th colspan="${Math.max(1, Number(cell.colspan || 1))}" rowspan="${Math.max(1, Number(cell.rowspan || 1))}">${escapeHtml(cell.text)}</th>`
                    )
                    .join('')}</tr>`
              )
              .join('')}</thead>
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

const page = ({
  title,
  description,
  image,
  body,
  locale,
}: {
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
    <meta name="referrer" content="no-referrer"><meta name="robots" content="noindex, nofollow, noarchive" />
    <title>${escapeHtml(title)} | Draft preview</title>
    <style>
      .preview-card a { color: #1762ad; text-decoration: underline; text-underline-offset: 3px; overflow-wrap: anywhere; }
      .preview-card a:focus-visible { outline: 2px solid currentColor; outline-offset: 3px; }
      .preview-card img { max-width: 100%; height: auto; }
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
      <div class="preview-banner">草稿预览页面。确认内容无误后回到管理后台勾选草稿并一键审核。</div>
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
  const env = getRuntimeEnv(locals);
  const media = (value: string) => publicMediaUrl(value, String(env?.PUBLIC_R2_ASSET_BASE_URL || import.meta.env.PUBLIC_R2_ASSET_BASE_URL || ''), siteOrigin.productionUrl);
  const access = requireManagerAccess(request, env);
  if (access.response) return access.response;

  if(!['product','blog'].includes(url.searchParams.get('type')||'product'))return new Response('草稿类型不正确。',{status:400});

  const type = normalizeDraftType(url.searchParams.get('type'));
  const draftSlug = safeDraftSlug(url.searchParams.get('draft'));
  if (!draftSlug) return new Response('翻译草稿信息不正确，请重新打开后重试。', { status: 400 });

  const accessToken = getDispatchToken(env, 'translation');
  let draft: { data: Record<string, any>; body: string } | null = null;
  let source: Record<string, any> = {};

  if (accessToken) {
    try {
      const state=await openDraftState({repo:getRepoFullName(env),branch:getBranch(env),token:accessToken});
      const summary=await summarizeDraft(state,type,draftSlug,true);
      if(!summary)return new Response('内容不存在或该语言未开放。',{status:404});
      await requireTranslationFeature(state,summary);
      draft={data:summary.data!,body:summary.body!};
      const sourcePath=`src/content/${type==='product'?'products':'blog'}/${summary.sourceSlug}.mdoc`;
      source=splitDraft(await readGitBlob(state.ctx,state.files.get(sourcePath)!)).data;
    } catch (error) {
      return featureResponse(error instanceof FeatureDenied?403:503);
    }
  }

  if (!draft) {
    if(import.meta.env.PROD)return featureResponse(503);
    try{const denied=requireFeature(await readFeatureState(env),type==='product'?'productTranslations':'articleTranslations');if(denied)return denied;}catch{return featureResponse(503);}
    draft = await readLocalDraft(type, draftSlug);
    if (!draft) return new Response('找不到这个翻译草稿。', { status: 404 });
    source = await readLocalSource(type, String(draft.data.sourceSlug || ''));
  }

  const data = draft.data;
  if (type === 'product' && !Object.keys(source || {}).length) return new Response('产品原文暂时无法读取，草稿已保留，请稍后重新打开预览。', { status: 503, headers: { 'cache-control': 'no-store' } });
  const image = media(String(source.image || ''));

  const body =
    type === 'product'
      ? [
          renderProductPreviewMedia(source, media, { includeCover: false, title: String(data.title || source.title || '') }),
          renderList('Applications', data.applications),
          `<section class="preview-card"><h2>Key product parameters</h2>${renderKeyValueTable(data.specs)}</section>`,
          renderSpecTables(data.specTables),
          renderList('Highlights', data.highlights),
          `<section class="preview-card">${renderMarkdownPreview(draft.body, media)}</section>`,
          renderFaqs(data.faqs),
        ]
          .filter(Boolean)
          .join('')
      : [`<section class="preview-card"><span class="eyebrow">${escapeHtml(data.category)}</span>${renderMarkdownPreview(draft.body, media)}</section>`].join('');

  return new Response(
    page({
      title: String(data.title || data.sourceTitle || draftSlug),
      description: String(data.description || ''),
      image,
      body,
      locale: String(data.locale || 'en'),
    }),
    {
      headers: {
        'cache-control': 'no-store',
        'content-type': 'text/html; charset=utf-8',
        'x-robots-tag': 'noindex, nofollow, noarchive',
      },
    }
  );
};
