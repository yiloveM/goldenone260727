import type { APIRoute } from 'astro';
import { getRuntimeEnv, requireManagerAccess } from '../../../lib/manager/access';
import { ensureManagerSchema, getManagerDb } from '../../../lib/manager/d1';
import { renderMarkdownPreview } from '../../../lib/translation-preview';
import { openVisualState, managerVisualSlots } from '../../../lib/manager/site-visuals';
import { mergeVisualPatch, visualAt } from '../../../lib/site-visuals.mjs';
import { safeContentUrl } from '../../../lib/content-links.mjs';
import { publicMediaUrl } from '../../../lib/public-media-url.mjs';
import siteOrigin from '../../../data/site-origin.json';
export const prerender = false;
const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
export const GET: APIRoute = async ({ locals, request, url }) => {
  const env = getRuntimeEnv(locals), access = requireManagerAccess(request, env); if (access.response) return access.response;
  const media = (value: string) => publicMediaUrl(value, String(env?.PUBLIC_R2_ASSET_BASE_URL || import.meta.env.PUBLIC_R2_ASSET_BASE_URL || ''), siteOrigin.productionUrl);
  const kind = url.searchParams.get('kind') || '', id = url.searchParams.get('id') || '', version = url.searchParams.get('version') || '';
  if (!['product', 'blog', 'visual'].includes(kind) || !/^[a-z0-9-]{1,180}$/.test(id) || !version) return new Response('请先保存并重新打开草稿。', { status: 400 });
  const db = getManagerDb(env); if (!db) return new Response('草稿预览暂不可用。', { status: 503 });
  await ensureManagerSchema(db);
  const table = kind === 'visual' ? 'manager_site_visual_drafts' : `manager_${kind}_drafts`;
  const row = await db.prepare(`SELECT payload_json,updated_at FROM ${table} WHERE id=?`).bind(id).first<{ payload_json: string; updated_at: string }>();
  if (!row || row.updated_at !== version) return new Response('草稿版本已变化，请重新保存后预览。', { status: 409 });
  try {
    const data = JSON.parse(row.payload_json); let body = '', title = data.title || '站点视觉';
    if (kind === 'visual') {
      const state = await openVisualState(env), next = mergeVisualPatch(state.raw, data, state.policy);
      body = managerVisualSlots(state).filter(slot => data.slots.some((item: any) => item.key === slot.key)).map(slot => {
        const visual = visualAt(next, state.policy.slots.find(item => item.key === slot.key)!);
        if (!visual) throw new Error('Missing visual slot');
        const image = media(visual.image || slot.fallback), mobile = media(visual.image ? visual.mobileImage || visual.image : slot.fallback);
        return `<section><h2>${escape(slot.title)}</h2><p>桌面与手机裁切预览，正式文字和页面布局保留。</p><picture><source media="(max-width:760px)" srcset="${escape(mobile)}"><img class="banner" src="${escape(image)}" style="object-position:${visual.focusX}% ${visual.focusY}%" alt=""></picture></section>`;
      }).join('');
    } else {
      const image = media(safeContentUrl(data.image, true));
      body = `<p>${escape(data.description)}</p>${image ? `<img src="${escape(image)}" alt="">` : ''}${renderMarkdownPreview(data.content || data.body || '', media)}`;
      if (kind === 'product') {
        if (data.specs?.length) body += `<h2>Specifications</h2><table>${data.specs.map((item: any) => `<tr><th>${escape(item.label)}</th><td>${escape(item.value)}</td></tr>`).join('')}</table>`;
        for (const table of data.specTables || []) body += `<h2>${escape(table.title)}</h2><table><thead><tr>${(table.columns || []).map((cell: any) => `<th>${escape(cell)}</th>`).join('')}</tr></thead><tbody>${(table.rows || []).map((row: any[]) => `<tr>${row.map(cell => `<td>${escape(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
      }
    }
    return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>草稿预览 · ${escape(title)}</title><style>body{font:16px/1.7 system-ui;margin:24px auto;padding:0 24px;max-width:1100px;color:#202631;background:#fafbfc}aside{padding:12px 18px;background:#eef1f5;border-radius:8px}img{max-width:100%;height:auto}.banner{width:100%;height:420px;object-fit:cover}table{border-collapse:collapse;max-width:100%;display:block;overflow:auto}td,th{border:1px solid #ccd3dc;padding:10px}a{color:#17597a}@media(max-width:760px){.banner{height:260px}}</style></head><body><aside>工作草稿预览 · 尚未发布。这是已保存内容的预览，最终页面布局以网站为准。</aside><main><h1>${escape(title)}</h1>${body}</main></body></html>`, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow', 'content-security-policy': "default-src 'none'; img-src 'self' https: data:; style-src 'unsafe-inline'; base-uri 'self'; form-action 'none'" } });
  } catch { return new Response('草稿预览暂时无法生成，请检查已保存的内容。', { status: 400 }); }
};
