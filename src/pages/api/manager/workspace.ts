import type { APIRoute } from 'astro';
import { getRuntimeEnv, requireManagerAccess } from '../../../lib/manager/access';
import { getManagerDb, ensureManagerSchema } from '../../../lib/manager/d1';
import { getRepoFullName, getBranch, getDispatchToken } from '../../../lib/manager/github';
import { openDraftState, listTranslationDrafts } from '../../../lib/draft-lifecycle';
export const prerender = false;
export const GET: APIRoute = async ({ locals, request }) => {
  const env = getRuntimeEnv(locals), access = requireManagerAccess(request, env); if (access.response) return access.response;
  const db = getManagerDb(env), token = getDispatchToken(env);
  if (!db || !token) return Response.json({ known: false, message: '暂时无法确认待办，请稍后更新状态。' }, { headers: { 'cache-control': 'no-store' } });
  try {
    await ensureManagerSchema(db);
    const state = await openDraftState({ repo: getRepoFullName(env), branch: getBranch(env), token });
    const translations = [...await listTranslationDrafts(state, 'product'), ...await listTranslationDrafts(state, 'blog')].filter(Boolean) as any[];
    const pending = translations.filter(row => row.lifecycle === 'pending').length;
    const changed = new Set<string>();
    if (state.release.commit) {
      for (const path of new Set([...state.files.keys(), ...state.deployed.keys()])) {
        if (state.files.get(path) === state.deployed.get(path)) continue;
        if (/^src\/content\/(products|blog)\/[a-z0-9-]+\.mdoc$/.test(path) || /^src\/data\/(site-visuals|site-language-settings|catalog-downloads|form-verification|ai-seo-settings|product-editor-settings|customer-reviews)\.json$/.test(path)) changed.add(path);
        if (/^src\/content\/(productTranslations|blogTranslations)\//.test(path) && (translations.some(row => row.lifecycle === 'reviewed' && path.endsWith(`/${row.draftSlug}.mdoc`)) || !state.files.has(path))) changed.add(path);
      }
    }
    const drafts = await db.prepare("SELECT 'product' AS kind,COUNT(*) AS count FROM manager_product_drafts WHERE status!='applied' UNION ALL SELECT 'blog',COUNT(*) FROM manager_blog_drafts WHERE status!='applied' UNION ALL SELECT 'review',COUNT(*) FROM manager_review_drafts WHERE status!='applied' UNION ALL SELECT 'visual',COUNT(*) FROM manager_site_visual_drafts WHERE status!='applied'").all();
    return Response.json({ known: Boolean(state.release.commit), pending, unpublished: state.release.commit ? changed.size : null, workDrafts: drafts.results, message: state.release.warning || '审核通过的变更将在下一次网站发布后上线。' }, { headers: { 'cache-control': 'no-store' } });
  } catch { return Response.json({ known: false, message: '暂时无法核验待办或线上版本，请稍后更新状态。' }, { headers: { 'cache-control': 'no-store' } }); }
};
