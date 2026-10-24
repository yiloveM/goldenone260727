import { getBranch, getDispatchToken, getRepoFullName } from './github';
import { readGitHead, readGitTree, readGitBlob, commitGitFiles, DraftConflict } from '../site-git';
import { readSitePublicLocales } from '../site-language-policy';
import { visualSlots, visualPolicy } from '../../data/site-visual-slots';
import { legacySiteImages } from '../../data/backgroundImages';
import { categoryBackgroundImage } from '../../data/productCategories';
import { VISUAL_FILE, mergeVisualPatch, validateSiteVisuals, visualAt } from '../site-visuals.mjs';

export async function openVisualState(env: any) {
  const ctx = { repo: getRepoFullName(env), branch: getBranch(env), token: getDispatchToken(env) };
  const expected = String(import.meta.env.PUBLIC_KEYSTATIC_GITHUB_REPO || '');
  if (!ctx.token || !expected || ctx.repo.toLowerCase() !== expected.toLowerCase() || ctx.repo.toLowerCase() === 'ironstraight/businessweb') throw new Error('本站内容服务暂时不可用。');
  const head = await readGitHead(ctx), tree = await readGitTree(ctx, head);
  const files = new Map(tree.tree.filter(item => item.type === 'blob').map(item => [item.path, item.sha]));
  const sha = files.get(VISUAL_FILE) || 'missing';
  const raw = sha === 'missing' ? null : JSON.parse(await readGitBlob(ctx, sha));
  const locales = [...await readSitePublicLocales(ctx, files)];
  const policy = { ...visualPolicy, locales, cdn: String(env.PUBLIC_R2_ASSET_BASE_URL || visualPolicy.cdn) };
  const config = validateSiteVisuals(raw, policy);
  return { ctx, head, tree, files, sha, raw, config, policy };
}
export function visualDefaultImage(slot: typeof visualSlots[number]) {
  if (slot.imagePath) { const [group, key] = slot.imagePath.split('.'); return (legacySiteImages as any)[group]?.[key] || ''; }
  return categoryBackgroundImage(slot.title);
}
export function managerVisualSlots(state: Awaited<ReturnType<typeof openVisualState>>) {
  return visualSlots.filter(slot => slot.supported && visualAt(state.config, slot)?.enabled).map(slot => {
    const { enabled, ...value } = visualAt(state.config, slot)!;
    return { key: slot.key, title: slot.title, group: slot.group, path: slot.path, fallback: visualDefaultImage(slot), ...value, localizedAlts: value.localizedAlts.filter(item => state.policy.locales.includes(item.locale)) };
  });
}
export const visualRecord = (row: any) => ({ id: row.id, payload: JSON.parse(row.payload_json), baseSha: row.base_content_sha, status: row.status, updatedAt: row.updated_at, appliedAt: row.applied_at, appliedSha: row.applied_content_sha });
const blobSha = async (content: string) => {
  const bytes = new TextEncoder().encode(content), prefix = new TextEncoder().encode(`blob ${bytes.length}\0`), data = new Uint8Array(prefix.length + bytes.length); data.set(prefix); data.set(bytes, prefix.length);
  return [...new Uint8Array(await crypto.subtle.digest('SHA-1', data))].map(byte => byte.toString(16).padStart(2, '0')).join('');
};
export async function approveVisualDraft(db: any, state: Awaited<ReturnType<typeof openVisualState>>, row: any, expected: string, email: string) {
  if (row.status === 'applied') return { applied: true, duplicate: true };
  if (row.status !== 'draft' || row.updated_at !== expected || state.sha !== row.base_content_sha) throw new DraftConflict('草稿或正式内容已更新，请重新载入并核对。');
  const next = mergeVisualPatch(state.raw, JSON.parse(row.payload_json), state.policy), content = JSON.stringify(next, null, 2) + '\n', intended = await blobSha(content);
  const updatedAt = new Date(Math.max(Date.now(), Date.parse(row.updated_at) + 1)).toISOString();
  const lock = await db.prepare("UPDATE manager_site_visual_drafts SET status='queued', updated_by=?, updated_at=?, applied_content_sha=? WHERE id=? AND updated_at=? AND status='draft'").bind(email, updatedAt, intended, row.id, expected).run();
  if (lock.meta?.changes !== 1) throw new DraftConflict('草稿已更新或正在处理，请刷新。');
  try {
    if (state.sha !== intended) await commitGitFiles(state.ctx, state.head, state.tree.sha, [{ path: VISUAL_FILE, content }], `Review site visuals ${row.id}`);
    const saved = await db.prepare("UPDATE manager_site_visual_drafts SET status='applied', applied_at=?, updated_at=? WHERE id=? AND status='queued' AND applied_content_sha=?").bind(updatedAt, updatedAt, row.id, intended).run();
    if (saved.meta?.changes !== 1) throw new Error('内容处理结果需要重新核对。');
    return { applied: true, contentSha: intended };
  } catch (error) {
    // A definite CAS rejection is recoverable. Ambiguous network outcomes stay
    // locked; a later fresh tree can prove that the intended blob was received.
    if (error instanceof DraftConflict) await db.prepare("UPDATE manager_site_visual_drafts SET status='draft' WHERE id=? AND status='queued' AND applied_content_sha=?").bind(row.id, intended).run();
    throw error;
  }
}
