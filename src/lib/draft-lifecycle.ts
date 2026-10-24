import { canonicalArticleCategory, requireArticleCategory } from './article-categories.mjs';
import identity from 'virtual:site-build-identity';
import { parse, stringify } from 'yaml';
import { commitGitFiles, DraftConflict, mapGitItems, readGitBlob, readGitBlobs, readGitHead, readGitTree, type GitContext, type GitTree } from './site-git';
import { readSiteRelease } from './site-release';
import {readSitePublicLocales as publicLocales} from './site-language-policy';

export type DraftKind = 'product' | 'blog';
export const draftPath = (type: DraftKind, id: string) => `src/content/${type === 'product' ? 'productTranslations' : 'blogTranslations'}/${id}.mdoc`;
export const safeDraftSlug = (value: unknown) => /^[a-z0-9]+(?:-[a-z0-9]+)*--[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(value || '')) ? String(value) : '';
export function splitDraft(text: string) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) throw new Error('草稿缺少有效的元数据。');
  const data = parse(match[1]);
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('草稿元数据不正确。');
  return { data, body: text.slice(match[0].length) };
}
export const joinDraft = (data: Record<string, any>, body: string) => `---\n${stringify(data, { defaultStringType: 'QUOTE_DOUBLE' }).trimEnd()}\n---\n${body}`;
export const treeFiles = (tree: GitTree) => new Map(tree.tree.filter(item => item.type === 'blob').map(item => [item.path, item.sha]));
async function metadata(ctx: GitContext, path: string, sha: string) {
  const cached = identity.files[path];
  return cached?.sha === sha ? cached.data : splitDraft(await readGitBlob(ctx, sha)).data;
}
export async function openDraftState(ctx: GitContext, ref = '') {
  const head = ref || await readGitHead(ctx);
  const tree = await readGitTree(ctx, head);
  const files = treeFiles(tree);
  const active = await publicLocales(ctx, files);
  let release: Awaited<ReturnType<typeof readSiteRelease>> = { commit: '', warning: '' };
  let deployed = new Map<string, string>();
  let deployedLocales = new Set<string>();
  try {
    release = await readSiteRelease(ctx);
    if (release.commit) {
      deployed = treeFiles(await readGitTree(ctx, release.commit));
      deployedLocales = await publicLocales(ctx, deployed);
    }
  } catch { release = { commit: '', warning: '暂时无法核验线上版本，已审核稿保留；删除暂不可用。' }; }
  return { ctx, head, tree, files, active, release, deployed, deployedLocales };
}
type State = Awaited<ReturnType<typeof openDraftState>>;
export async function summarizeDraft(state: State, type: DraftKind, id: string, withBody = false) {
  const path = draftPath(type, id);
  const sha = state.files.get(path);
  if (!sha) throw new DraftConflict('草稿已移动或删除，请刷新列表。');
  const document = withBody ? splitDraft(await readGitBlob(state.ctx, sha)) : { data: await metadata(state.ctx, path, sha), body: '' };
  const data = document.data;
  if (!state.active.has(data.locale) || data.locale === 'en' || id !== `${data.locale}--${data.sourceSlug}`) return null;
  const sourcePath = `src/content/${type === 'product' ? 'products' : 'blog'}/${data.sourceSlug}.mdoc`;
  const sourceSha = state.files.get(sourcePath);
  if (!sourceSha || (await metadata(state.ctx, sourcePath, sourceSha)).published === false) return null;
  const deployedSourceSha = state.deployed.get(sourcePath);
  const wasLive = Boolean(state.release.commit && state.deployedLocales.has(data.locale) && deployedSourceSha
    && (await metadata(state.ctx, sourcePath, deployedSourceSha)).published !== false && state.deployed.get(path)
    && (await metadata(state.ctx, path, state.deployed.get(path)!)).published === true);
  const live = data.published === true && wasLive && state.deployed.get(path) === sha;
  const lifecycle = live ? 'live' : data.published === true ? 'reviewed' : 'pending';
  return { type, typeLabel: type === 'product' ? '产品' : '文章', draftSlug: id, title: String(data.title || id), sourceSlug: String(data.sourceSlug || ''), sourceTitle: String(data.sourceTitle || ''),
    locale: String(data.locale || ''), published: data.published === true, generatedAt: String(data.generatedAt || ''), sourceSha: sha, lifecycle, wasLive,
    deleteAction: live || !state.release.commit ? '' : wasLive ? 'restore' : 'delete',
    previewUrl: `/api/manager/ai/draft-preview?type=${type}&draft=${encodeURIComponent(id)}`,
    editPath: `/branch/${encodeURIComponent(state.ctx.branch)}/collection/${type === 'product' ? 'productTranslations' : 'blogTranslations'}/item/${encodeURIComponent(id)}`,
    ...(withBody ? { path, data: type === 'blog' ? { ...data, category: canonicalArticleCategory((await metadata(state.ctx, sourcePath, sourceSha)).category) } : data, body: document.body, editable: true } : {}) };
}
export async function listTranslationDrafts(state: State, type: DraftKind | 'all') {
  const entries = [...state.files.keys()].flatMap(path => {
    const match = path.match(/^src\/content\/(productTranslations|blogTranslations)\/([a-z0-9-]+)\.mdoc$/);
    if (!match || !safeDraftSlug(match[2])) return [];
    const kind: DraftKind = match[1] === 'productTranslations' ? 'product' : 'blog';
    return type === 'all' || type === kind ? [{ kind, id: match[2] }] : [];
  });
  const missing:string[]=[];
  for(const item of entries){
    const path=draftPath(item.kind,item.id),source=`src/content/${item.kind==='product'?'products':'blog'}/${item.id.split('--')[1]}.mdoc`;
    for(const files of [state.files,state.deployed])for(const candidate of [path,source]){
      const sha=files.get(candidate);if(sha&&identity.files[candidate]?.sha!==sha)missing.push(sha);
    }
  }
  state.ctx.bodyCache=new Map([...(state.ctx.bodyCache || []),...await readGitBlobs(state.ctx,missing)]);
  return (await mapGitItems(entries, item => summarizeDraft(state, item.kind, item.id))).filter(Boolean).sort((a,b) => Number(a!.published) - Number(b!.published) || a!.locale.localeCompare(b!.locale) || a!.sourceSlug.localeCompare(b!.sourceSlug));
}
export async function mutateTranslationDrafts(state: State, type: DraftKind, payload: any, action: 'approve' | 'delete' | 'save') {
  const requested = action === 'save' ? [{ draftSlug: payload.draftSlug, sourceSha: payload.sourceSha }] : payload.drafts;
  if (!Array.isArray(requested) || !requested.length || requested.length > 1000) throw new Error('请选择有效的草稿。');
  const unique = new Map<string, string>();
  for (const item of requested) {
    const id = safeDraftSlug(item?.draftSlug);
    if (!id || !/^[a-f0-9]{40}$/.test(item?.sourceSha || '') || unique.has(id)) throw new Error('选择信息已失效，请刷新后重新选择。');
    unique.set(id, item.sourceSha);
  }
  const files: Array<{path:string; content?:string; sha?:string|null}> = [];
  const approved: string[] = [], skipped: string[] = [], removed: any[] = [];
  const missingBodies:string[]=[];
  for(const [id,expected] of unique){
    const path=draftPath(type,id),locale=id.split('--')[0],sourcePath=`src/content/${type==='product'?'products':'blog'}/${id.slice(locale.length+2)}.mdoc`;
    if(state.files.get(path)!==expected||!state.active.has(locale))throw new DraftConflict('草稿或公开语言已变化，请刷新后重试。');
    if(identity.files[path]?.sha!==expected)missingBodies.push(expected);
    const sourceSha=state.files.get(sourcePath);
    if(sourceSha&&identity.files[sourcePath]?.sha!==sourceSha)missingBodies.push(sourceSha);
  }
  state.ctx.bodyCache=await readGitBlobs(state.ctx,missingBodies);
  // Validate every selected version before fetching or preparing any body.
  const candidates = [];
  for (const [id, expected] of unique) {
    const current = await summarizeDraft(state,type,id);
    if(!current || current.sourceSha!==expected)throw new DraftConflict('草稿或公开语言已变化，请刷新后重试。');
    candidates.push(current);
  }
  const bodies=action==='delete'?new Map<string,string>():await readGitBlobs(state.ctx,candidates.filter(item=>action==='save'||!item.published).map(item=>item.sourceSha));
  for (const current of candidates) {
    const id=current.draftSlug,path=draftPath(type,id);
    if(action==='approve' && current.published){skipped.push(id);continue;}
    const {data,body}=action==='delete'?{data:{published:current.published},body:''}:splitDraft(bodies.get(current.sourceSha)!);
    if (action === 'save') {
      if (!payload.data || typeof payload.data !== 'object' || Array.isArray(payload.data) || typeof payload.body !== 'string') throw new Error('草稿内容不正确。');
      const next = { ...data, ...payload.data };
      if (type === 'blog') {
        const source = await readGitBlob(state.ctx, state.files.get(`src/content/blog/${data.sourceSlug}.mdoc`)!);
        const category = canonicalArticleCategory(splitDraft(source).data.category);
        if (Object.hasOwn(payload.data,'category') && requireArticleCategory(payload.data.category) !== category) throw new Error('译文分类须与英文源稿一致，请在英文源稿调整。');
        next.category=category;
      }
      if (next.locale !== data.locale || next.sourceSlug !== data.sourceSlug) throw new Error('请勿修改译文身份。');
      files.push({ path, content: joinDraft(next, payload.body) });
    } else if (action === 'approve') {
      if (data.published === true) { skipped.push(id); continue; }
      const approvedData = { ...data, published: true };
      if (type === 'blog') approvedData.category = canonicalArticleCategory((await metadata(state.ctx, `src/content/blog/${data.sourceSlug}.mdoc`, state.files.get(`src/content/blog/${data.sourceSlug}.mdoc`)!)).category);
      files.push({ path, content: joinDraft(approvedData, body) }); approved.push(id);
    } else {
      if (!state.release.commit || current.lifecycle === 'live' || !current.deleteAction) throw new DraftConflict('无法安全撤销这条内容，请刷新后在正式内容中管理。');
      // Restore ANY previous deployed file, including a previously unreviewed
      // candidate, rather than removing data present in the deployment commit.
      const previousSha = current.deleteAction === 'restore' ? state.deployed.get(path) : undefined;
      files.push({ path, sha: previousSha || null });
      removed.push({ draftSlug: id, action: previousSha ? 'restore' : 'delete' });
    }
  }
  const commit = await commitGitFiles(state.ctx, state.head, state.tree.sha, files, `${action === 'approve' ? 'Approve' : action === 'delete' ? 'Discard' : 'Update'} ${files.length} ${type} translation candidates [skip ci]`);
  return { commit, approved, skipped, removed, errors: [] };
}

export async function translationDraftRoute(request: Request, url: URL, ctx: GitContext, surface: 'manager' | 'keystatic') {
  const json = (value: any) => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
  try {
    if (!ctx.token || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(ctx.repo)) throw new Error('GitHub 连接暂不可用。');
    const state = await openDraftState(ctx);
    const payload = request.method === 'GET' ? null : await request.json();
    const rawType = payload?.type || url.searchParams.get('type');
    const type: DraftKind | 'all' = rawType === 'product' || rawType === 'blog' ? rawType : 'all';
    const adapt = (item: any) => surface === 'keystatic' ? { ...item, previewUrl: item.previewUrl.replace('/api/manager/', '/api/') } : item;
    if (request.method === 'GET') {
      const id = url.searchParams.get('draft');
      if (id) {
        if (!safeDraftSlug(id) || type === 'all') throw new Error('草稿信息不正确。');
        const draft = await summarizeDraft(state, type, id, true);
        if (!draft) throw new Error('内容不存在或该语言未公开。');
        return json({ draft: adapt(draft), warning: state.release.warning });
      }
      const all = (await listTranslationDrafts(state, type)) as any[];
      const liveOnly = url.searchParams.get('scope') === 'live';
      const formal = url.searchParams.get('scope') === 'formal';
      const drafts = all.filter(item => formal ? item.wasLive : liveOnly ? item.lifecycle === 'live' : item.lifecycle !== 'live' && (url.searchParams.get('includePublished') === 'true' || !item.published));
      return json({ drafts: drafts.map(adapt), warning: state.release.warning, counts: { total: all.length, pending: all.filter(item => !item.published).length, published: all.filter(item => item.lifecycle === 'reviewed').length, live: all.filter(item => item.lifecycle === 'live').length, visible: drafts.length } });
    }
    if (type === 'all') throw new Error('草稿类型不正确。');
    if (request.method === 'DELETE' && payload.confirmed !== true) throw new Error('请先确认准确的删除或撤销清单。');
    const result = await mutateTranslationDrafts(state, type, payload, request.method === 'DELETE' ? 'delete' : request.method === 'PUT' ? 'save' : 'approve');
    if (request.method === 'PUT') {
      const next = await openDraftState(ctx);
      return json({ ...result, draft: adapt(await summarizeDraft(next, type, payload.draftSlug, true)) });
    }
    return json(result);
  } catch (error) {
    return new Response(error instanceof DraftConflict ? error.message : '无法读取或修改最新内容，请刷新后重试。' + (error instanceof Error && !/token|credential|github\.com|\{/.test(error.message) ? ` ${error.message}` : ''), { status: error instanceof DraftConflict ? 409 : 502, headers: { 'cache-control': 'no-store' } });
  }
}
