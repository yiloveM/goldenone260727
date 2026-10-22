import { githubFetch } from './manager/github';
export type GitContext = { repo: string; branch: string; token: string; bodyCache?: Map<string,string> };
export type GitTree = { sha: string; tree: Array<{ path: string; sha: string; type: string }> };
export class DraftConflict extends Error { status = 409; }
export const api = (ctx: GitContext) => `https://api.github.com/repos/${ctx.repo}`;
export const decodeGitBlob = (value: string) => new TextDecoder().decode(Uint8Array.from(atob(value.replace(/\s/g, '')), char => char.charCodeAt(0)));
const blobs = new Map<string, string>();
export async function readGitTree(ctx: GitContext, ref: string): Promise<GitTree> {
  const result = await githubFetch<GitTree & { truncated?: boolean }>(`${api(ctx)}/git/trees/${encodeURIComponent(ref)}?recursive=1`, ctx.token);
  if (result.truncated || !result.sha || !Array.isArray(result.tree)) throw new Error('Git 目录不完整，请稍后重试。');
  return result;
}
export async function readGitHead(ctx: GitContext) {
  const ref = await githubFetch<{ object: { sha: string } }>(`${api(ctx)}/git/ref/heads/${ctx.branch.split('/').map(encodeURIComponent).join('/')}`, ctx.token);
  if (!/^[a-f0-9]{40}$/.test(ref.object?.sha)) throw new Error('无法核验 Git 分支。');
  return ref.object.sha;
}
export async function readGitBlob(ctx: GitContext, sha: string) {
  if(ctx.bodyCache?.has(sha))return ctx.bodyCache.get(sha)!;
  const key = `${ctx.repo}:${sha}`;
  if (blobs.has(key)) return blobs.get(key)!;
  const blob = await githubFetch<{ encoding: string; content: string }>(`${api(ctx)}/git/blobs/${sha}`, ctx.token);
  if (blob.encoding !== 'base64') throw new Error('Git 文件编码不正确。');
  const text = decodeGitBlob(blob.content);
  blobs.set(key, text);
  if (blobs.size > 128) blobs.delete(blobs.keys().next().value!);
  return text;
}
export async function readGitBlobs(ctx: GitContext, requested: string[]) {
  const shas=[...new Set(requested)],result=new Map<string,string>();
  const missing=shas.filter(sha=>{const cached=ctx.bodyCache?.get(sha) ?? blobs.get(`${ctx.repo}:${sha}`);if(cached!==undefined){result.set(sha,cached);return false;}return true;});
  if(missing.length<=8){await mapGitItems(missing,async sha=>result.set(sha,await readGitBlob(ctx,sha)));return result;}
  const [owner,name]=ctx.repo.split('/');
  // One immutable-blob query per 64 files avoids a fetch for every selected
  // translation. This stays within the existing Worker's subrequest budget.
  for(let offset=0;offset<missing.length;offset+=64){
    const batch=missing.slice(offset,offset+64),variables:Record<string,string>={owner,name};
    const declarations=batch.map((sha,index)=>{variables[`s${index}`]=sha;return `$s${index}:GitObjectID!`;});
    const fields=batch.map((_,index)=>`b${index}:object(oid:$s${index}){... on Blob{oid text byteSize isBinary isTruncated}}`);
    const response=await githubFetch<any>('https://api.github.com/graphql',ctx.token,{method:'POST',redirect:'error',body:JSON.stringify({query:`query($owner:String!,$name:String!,${declarations.join(',')}){repository(owner:$owner,name:$name){nameWithOwner ${fields.join(' ')}}}`,variables})});
    const repo=response.data?.repository;
    if(response.errors?.length||repo?.nameWithOwner?.toLowerCase()!==ctx.repo.toLowerCase())throw new Error('批量内容暂时无法同步，请按语言缩小范围后重试。');
    for(const [index,sha] of batch.entries()){
      const blob=repo[`b${index}`];
      if(blob?.oid!==sha||typeof blob.text!=='string'||blob.isBinary!==false||blob.isTruncated!==false||new TextEncoder().encode(blob.text).byteLength!==blob.byteSize)throw new Error('内容读取不完整，本批未修改。');
      result.set(sha,blob.text);
    }
  }
  return result;
}
export async function mapGitItems<T, U>(items: T[], read: (item: T) => Promise<U>): Promise<U[]> {
  const output = new Array<U>(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(4, items.length) }, async () => {
    while (cursor < items.length) { const index = cursor++; output[index] = await read(items[index]); }
  }));
  return output;
}
export async function commitGitFiles(ctx: GitContext, head: string, treeSha: string, files: Array<{ path: string; content?: string; sha?: string | null }>, message: string) {
  if (!files.length) return '';
  const tree = files.map(file=>({path:file.path,mode:'100644',type:'blob',...(file.content===undefined?{sha:file.sha}:{content:file.content})}));
  if(new TextEncoder().encode(JSON.stringify(tree)).byteLength>6*1024*1024)throw new Error('本批内容较多，请按语言分批处理。');
  const nextTree = await githubFetch<{sha:string}>(`${api(ctx)}/git/trees`, ctx.token, { method: 'POST', body: JSON.stringify({ base_tree: treeSha, tree }) });
  const commit = await githubFetch<{sha:string}>(`${api(ctx)}/git/commits`, ctx.token, { method: 'POST', body: JSON.stringify({ message, tree: nextTree.sha, parents: [head] }) });
  // Every candidate was read from this parent. A concurrent writer creates a
  // sibling, so the non-force update rejects the entire batch atomically.
  if (await readGitHead(ctx) !== head) throw new DraftConflict('内容已被其它管理员更新，请刷新后重新选择。');
  try {
    await githubFetch(`${api(ctx)}/git/refs/heads/${ctx.branch.split('/').map(encodeURIComponent).join('/')}`, ctx.token, { method: 'PATCH', body: JSON.stringify({ sha: commit.sha, force: false }) });
  } catch { throw new DraftConflict('提交遇到并发修改，请刷新后重试；未覆盖其它改动。'); }
  return commit.sha;
}
