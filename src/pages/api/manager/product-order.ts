import type { APIRoute } from 'astro';
import { parseDocument } from 'yaml';
import { getRuntimeEnv, requireManagerAccess } from '../../../lib/manager/access';
import { ensureManagerSchema, getManagerDb } from '../../../lib/manager/d1';
import { getRepoFullName, getBranch, getDispatchToken } from '../../../lib/manager/github';
import { readGitHead, readGitTree, readGitBlobs, commitGitFiles, DraftConflict,FeatureDenied,FeatureUnavailable, gitBlobSha } from '../../../lib/site-git';
import { splitDraft } from '../../../lib/draft-lifecycle';
export const prerender = false;
const json = (data: any) => Response.json(data, { headers: { 'cache-control': 'no-store' } });
async function resources(locals: any, request: Request) {
  const env = getRuntimeEnv(locals), access = requireManagerAccess(request, env); if (access.response) return { response: access.response };
  const db: any = getManagerDb(env), ctx = { repo: getRepoFullName(env), branch: getBranch(env), token: getDispatchToken(env) };
  if (!db || !ctx.token || ctx.repo.toLowerCase() !== String(import.meta.env.PUBLIC_KEYSTATIC_GITHUB_REPO).toLowerCase()) return { response: new Response('排序服务暂不可用。', { status: 503 }) };
  try { await ensureManagerSchema(db); } catch { return {response:new Response('排序草稿暂时无法连接，请稍后重试。',{status:503})}; } return { db, ctx, email: access.email, response: null };
}
async function catalog(ctx: any) {
  const head = await readGitHead(ctx), tree = await readGitTree(ctx, head), files = tree.tree.filter(item => item.type === 'blob' && /^src\/content\/products\/[a-z0-9-]+\.mdoc$/.test(item.path));
  const blobs = await readGitBlobs(ctx, files.map(file => file.sha));
  const products = files.map(file => ({ ...splitDraft(blobs.get(file.sha)!), sourcePath: file.path, sourceSha: file.sha, slug: file.path.split('/').pop()!.slice(0, -5), raw: blobs.get(file.sha)! }));
  return { head, tree, products };
}
const fail = (error: any) => new Response(error instanceof DraftConflict||error instanceof FeatureDenied||error instanceof FeatureUnavailable ? error.message : '排序未完成，请重新载入产品后重试。', { status: [403,409,503].includes(error?.status) ? error.status : 400, headers: { 'cache-control': 'no-store' } });
export const GET: APIRoute = async ({ locals, request }) => {
  const resource = await resources(locals, request); if (resource.response) return resource.response;
  const rows = (await resource.db.prepare("SELECT * FROM manager_product_drafts WHERE json_extract(payload_json,'$.managerOrderBatch.id') IS NOT NULL ORDER BY updated_at DESC LIMIT 500").all()).results || [];
  const groups = new Map<string, any>();
  if (rows.some((row: any) => row.status === 'queued')) {
    const state = await catalog(resource.ctx);
    for (const id of new Set(rows.filter((row: any) => row.status === 'queued').map((row: any) => JSON.parse(row.payload_json).managerOrderBatch.id))) {
      const group = rows.filter((row: any) => JSON.parse(row.payload_json).managerOrderBatch.id === id);
      if (group.length === JSON.parse(group[0].payload_json).managerOrderBatch.count && group.every((row: any) => { const payload = JSON.parse(row.payload_json); return payload.managerOrderResultSha && state.products.some(product => product.slug === row.product_slug && product.sourceSha === payload.managerOrderResultSha); })) {
        await resource.db.batch(group.map((row: any) => resource.db.prepare("UPDATE manager_product_drafts SET status='applied',applied_at=CURRENT_TIMESTAMP WHERE id=? AND status='queued'").bind(row.id)));
        group.forEach((row: any) => { row.status = 'applied'; });
      }
    }
  }
  for (const row of rows) { const payload = JSON.parse(row.payload_json), key = payload.managerOrderBatch.id; if (!groups.has(key)) groups.set(key, { id: key, category: payload.managerOrderBatch.category, records: [], status: row.status }); groups.get(key).records.push({ id: row.id, updatedAt: row.updated_at, title: row.product_title }); if (row.status !== groups.get(key).status) groups.get(key).status = 'unknown'; }
  return json({ groups: [...groups.values()] });
};
export const POST: APIRoute = async ({ locals, request }) => {
  const resource = await resources(locals, request); if (resource.response) return resource.response;
  const { db, ctx, email } = resource;
  try {
    const body = await request.json();
    if (!Array.isArray(body.records) || !body.records.length || body.records.length > 100 || typeof body.category !== 'string') return new Response('请按分类选择不超过 100 个产品的完整排序范围。', { status: 400 });
    const state = await catalog(ctx), scope = state.products.filter(product => !body.category || product.data.category === body.category), selected = new Map(body.records.map((item: any) => [item.slug, item]));
    if (selected.size !== scope.length || selected.size !== body.records.length) throw new DraftConflict('排序范围不完整或产品已变化，请重新载入；不要对搜索分页结果单独排序。');
    for (const product of scope) { const row: any = selected.get(product.slug); if (!row || row.sourceSha !== product.sourceSha || !Number.isInteger(row.sortOrder) || row.sortOrder < 1 || row.sortOrder > 1000000) throw new DraftConflict('产品已更新或排序数字不正确，请重新载入。'); }
    const changed = scope.filter(product => Number(product.data.sortOrder) !== (selected.get(product.slug) as any).sortOrder);
    if (!changed.length) return json({ groups: [], message: '顺序没有变化，无需保存。' });
    const batch = crypto.randomUUID(), now = new Date().toISOString(), metadata = { id: batch, category: body.category, expected: scope.map(product => ({ path: product.sourcePath, sha: product.sourceSha })), count: changed.length };
    await db.batch(changed.map((product, index) => db.prepare("INSERT INTO manager_product_drafts (id,product_slug,product_title,payload_json,status,created_by,updated_by,created_at,updated_at) VALUES (?,?,?,?,'draft',?,?,?,?)").bind(`product-order-${batch}-${index.toString(36)}`, product.slug, product.data.title, JSON.stringify({ ...product.data, productSlug: product.slug, sourceSha: product.sourceSha, sortOrder: (selected.get(product.slug) as any).sortOrder, managerOrderBatch: metadata }), email, email, now, now)));
    return json({ id: batch, count: changed.length, message: '排序草稿已保存，请整批审核后发布网站更新。' });
  } catch (error) { return fail(error); }
};
export const PATCH: APIRoute = async ({ locals, request }) => {
  const resource = await resources(locals, request); if (resource.response) return resource.response;
  const { db, ctx } = resource;
  try {
    const body = await request.json(); if (!/^[a-f0-9-]{36}$/.test(body.id || '') || !Array.isArray(body.records) || body.records.length > 100) return new Response('排序草稿信息不正确。', { status: 400 });
    const rows = (await db.prepare("SELECT * FROM manager_product_drafts WHERE json_extract(payload_json,'$.managerOrderBatch.id')=?").bind(body.id).all()).results || [];
    if (!rows.length || rows.length !== body.records.length) throw new DraftConflict('排序草稿不完整，请重新载入。');
    if (rows.every((row: any) => row.status === 'applied')) return json({ applied: true });
    for (const row of rows) if (row.status !== 'draft' || !body.records.some((item: any) => item.id === row.id && item.updatedAt === row.updated_at)) throw new DraftConflict('排序草稿已变化或仍在处理，请刷新。');
    const state = await catalog(ctx), metadata = JSON.parse(rows[0].payload_json).managerOrderBatch;
    if (metadata.count !== rows.length || state.products.filter(product => !metadata.category || product.data.category === metadata.category).length !== metadata.expected.length || !metadata.expected.every((item: any) => state.products.some(product => product.sourcePath === item.path && product.sourceSha === item.sha))) throw new DraftConflict('产品内容或分类已经更新，本批未修改，请重新生成排序草稿。');
    const files = rows.map((row: any) => { const payload = JSON.parse(row.payload_json), product = state.products.find(item => item.slug === row.product_slug)!; const match = product.raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/)!; const document = parseDocument(match[1]); if (document.errors.length) throw new Error('Invalid metadata'); document.set('sortOrder', payload.sortOrder); return { path: product.sourcePath, content: `---\n${document.toString().trimEnd()}\n---\n${product.raw.slice(match[0].length)}` }; });
    const selection = JSON.stringify(await Promise.all(rows.map(async (row: any, index: number) => ({ id: row.id, updatedAt: row.updated_at, sha: await gitBlobSha(files[index].content) }))));
    const locked = await db.prepare("WITH selected AS (SELECT json_extract(value,'$.id') AS id,json_extract(value,'$.updatedAt') AS updated_at,json_extract(value,'$.sha') AS sha FROM json_each(?)) UPDATE manager_product_drafts SET status='queued',payload_json=json_set(payload_json,'$.managerOrderResultSha',(SELECT sha FROM selected s WHERE s.id=manager_product_drafts.id)) WHERE (id,updated_at) IN (SELECT id,updated_at FROM selected) AND (SELECT COUNT(*) FROM manager_product_drafts d JOIN selected s ON d.id=s.id AND d.updated_at=s.updated_at WHERE d.status='draft')=?").bind(selection, rows.length).run();
    if (locked.meta?.changes !== rows.length) throw new DraftConflict('排序草稿已被更新，本批未修改。');
    try {
      await commitGitFiles(ctx!, state.head, state.tree.sha, files, `Review product order ${body.id}`);
      await db.batch(rows.map((row: any) => db.prepare("UPDATE manager_product_drafts SET status='applied',applied_at=CURRENT_TIMESTAMP WHERE id=? AND status='queued'").bind(row.id)));
    } catch (error) { if (error instanceof DraftConflict||error instanceof FeatureDenied||error instanceof FeatureUnavailable) await db.batch(rows.map((row: any) => db.prepare("UPDATE manager_product_drafts SET status='draft' WHERE id=? AND status='queued'").bind(row.id))); throw error; }
    return json({ applied: true, message: '排序已审核，等待发布网站更新。' });
  } catch (error) { return fail(error); }
};
