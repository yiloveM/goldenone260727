import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const output = resolve('.sandbox/draft-lifecycle-tests');
await mkdir(output, { recursive: true });
await build({ entryPoints: ['src/lib/draft-lifecycle.ts','src/lib/translation-preview.ts','src/lib/site-release.ts','src/lib/manager/formal-content-deletion.ts'], outdir: output, bundle: true, format: 'esm', platform: 'node', packages: 'external', logLevel: 'silent', plugins: [{ name: 'identity', setup(b) {
  b.onResolve({ filter: /^virtual:site-build-identity$/ }, () => ({ path: 'identity', namespace: 'test' }));
  b.onResolve({ filter: /^cloudflare:workers$/ }, () => ({ path: 'cloudflare', namespace: 'test' }));
  b.onLoad({ filter: /.*/, namespace: 'test' }, args => ({ contents: args.path === 'identity' ? 'export default {commit:"",files:{}}' : 'export const env = {};' }));
} }] });
const { renderMarkdownPreview } = await import(pathToFileURL(resolve(output,'translation-preview.js')));
const { openDraftState, listTranslationDrafts, mutateTranslationDrafts, splitDraft, translationDraftRoute } = await import(pathToFileURL(resolve(output,'draft-lifecycle.js')));
const { isProductionRelease } = await import(pathToFileURL(resolve(output,'site-release.js')));
const { formalContentDeletionRoute } = await import(pathToFileURL(resolve(output,'manager/formal-content-deletion.js')));
const ctx = { repo: 'fixture/customer', branch: 'main', token: 'test-only' };
const sha = value => createHash('sha1').update(value).digest('hex');
const blobSha = value => sha(`blob ${Buffer.byteLength(value)}\0${value}`);
const blobs = new Map(), commits = new Map();
const sourcePath = 'src/content/blog/article.mdoc';
const path = id => `src/content/blogTranslations/${id}.mdoc`;
const mdoc = (locale, published, body = '[**Product**](/products/part.html)') => `---\ntitle: Article ${locale}\nlocale: ${locale}\nsourceSlug: article\npublished: ${published}\ngeneratedAt: "2026-10-22T03:00:00.000Z"\nmetaKeywords: retained\nimageMetadata:\n  - sourceUrl: https://cdn.example.com/a.webp\n    alt: retained\n    title: retained\n---\n${body}\n`;
function tree(files) {
  const result = {};
  for (const [path, content] of Object.entries(files)) { const id = blobSha(content); blobs.set(id,content); result[path] = id; }
  return result;
}
const baseFiles = {
  'src/data/i18n.ts': "export const supportedLocales = ['en','es','fr','ar','de'] as const;",
  'src/data/site-language-settings.json': JSON.stringify({enabledLocales:{es:true,fr:true,ar:true,de:false}}),
  'src/data/site-locales.json': JSON.stringify({requiredPhraseKeys:['a'],requiredFaqCount:1,locales:Object.fromEntries(['es','fr','ar','de'].map(code=>[code,{approved:true,phrases:{a:'ready'},faqs:[{question:'Q',answer:'A'}]}]))}),
  [sourcePath]: '---\ntitle: Source\npublished: true\n---\nSource\n',
  [path('es--article')]: mdoc('es',true),
  [path('ar--article')]: mdoc('ar',true),
};
const deployedTree = tree(baseFiles), deployedCommit = sha('deployed'); commits.set(deployedCommit,deployedTree);
const currentTree = tree({...baseFiles,[path('ar--article')]:mdoc('ar',true,'Changed [contact](mailto:a@example.com)'),[path('fr--article')]:mdoc('fr',false),[path('de--article')]:mdoc('de',true)});
let head = sha('current'); commits.set(head,currentTree);
let mode = 'success', concurrent = false, writes = 0;
const step = (name, conclusion = 'success') => ({name,status:'completed',conclusion,completed_at:'2026-10-22T04:00:00Z'});
const jobs = () => [{status:'completed',conclusion:mode === 'failed' ? 'failure' : 'success',steps:[step('Build the Astro site'),step('Deploy the production Worker and static assets',mode === 'skipped' ? 'skipped' : mode === 'failed' ? 'failure' : 'success')]}];
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(input), endpoint = url.pathname.replace('/repos/fixture/customer',''), body = init.body ? JSON.parse(init.body) : {};
  let result;
  if (endpoint === '/git/ref/heads/main') result = {object:{sha:head}};
  else if (endpoint.startsWith('/git/trees/') && init.method !== 'POST') {
    const ref = decodeURIComponent(endpoint.split('/').pop());
    const files = commits.get(ref);
    if (!files) throw new Error('Unknown fixture tree ' + ref);
    result = {sha:ref,tree:Object.entries(files).map(([path,sha])=>({path,sha,type:'blob'})),truncated:false};
  } else if (endpoint.startsWith('/git/blobs/') && !init.method) result = {encoding:'base64',content:Buffer.from(blobs.get(endpoint.split('/').pop())).toString('base64')};
  else if (endpoint === '/actions/workflows/site-publish.yml/runs') {
    if(mode === 'unavailable') return new Response('Unavailable',{status:503});
    result = {workflow_runs:[{id:1,event:'push',head_branch:'main',head_sha:deployedCommit,status:'completed',conclusion:mode === 'failed' ? 'failure':'success',created_at:'2026-10-22T03:00:00Z'}]};
  } else if (endpoint === '/actions/runs/1/jobs') result = {jobs:jobs(),total_count:1};
  else if (endpoint === '/git/blobs' && init.method === 'POST') { writes++; const id=blobSha(body.content);blobs.set(id,body.content);result={sha:id}; }
  else if (endpoint === '/git/trees' && init.method === 'POST') {
    writes++; const files={...commits.get(body.base_tree)};for(const item of body.tree) {if(item.sha===null) delete files[item.path];else if(item.content!==undefined){const id=blobSha(item.content);blobs.set(id,item.content);files[item.path]=id;}else files[item.path]=item.sha;}const id=sha(JSON.stringify(files));commits.set(id,files);result={sha:id};
  } else if (endpoint === '/git/commits' && init.method === 'POST') {writes++;const id=sha(JSON.stringify(body));commits.set(id,commits.get(body.tree));result={sha:id};if(concurrent)head=sha('parallel');}
  else if (endpoint === '/git/refs/heads/main' && init.method === 'PATCH') {assert.equal(body.force,false);head=body.sha;result={object:{sha:head}};}
  else throw new Error(`Unexpected fixture request ${init.method || 'GET'} ${endpoint}`);
  return Response.json(result);
};
let checks=0;
try {
  const preview=renderMarkdownPreview('[**Part**](https://example.com/a_(b)?x=1&y=2)\n\n| Link |\n| --- |\n| [Email](mailto:a@example.com) |\n\n{% r2Image src="https://cdn.example.com/a.webp" alt="Part" /%}\n\n{% r2Document src="https://cdn.example.com/a.pdf" title="Specs" /%}\n\n[x](javascript:alert(1))\n<script>alert(1)</script>');
  assert.match(preview,/<a href="https:\/\/example.com\/a_\(b\)\?x=1&amp;y=2"[^>]*><strong>Part<\/strong>/);checks++;
  assert.match(preview,/<td><a href="mailto:a@example.com"/);assert.match(preview,/<img src="https:\/\/cdn.example.com\/a.webp"/);assert.match(preview,/<a href="https:\/\/cdn.example.com\/a.pdf"/);checks++;
  assert.doesNotMatch(preview,/<script|href="javascript:|onerror=/);checks++;
  assert.equal(isProductionRelease({status:'completed',conclusion:'success'},[]),false);checks++;
  let state=await openDraftState(ctx), rows=await listTranslationDrafts(state,'blog');
  assert.deepEqual(rows.map(row=>row.locale).sort(),['ar','es','fr']);checks++;
  assert.equal(rows.find(row=>row.locale==='es').lifecycle,'live');assert.equal(rows.find(row=>row.locale==='ar').deleteAction,'restore');checks++;
  const get=async params=>{const url=new URL('https://fixture.test/api/manager/ai/drafts?type=blog&'+params);return (await translationDraftRoute(new Request(url),url,ctx,'manager')).json();};
  assert.deepEqual((await get('')).drafts.map(row=>row.locale),['fr']);checks++;
  assert.deepEqual((await get('includePublished=true')).drafts.map(row=>row.locale).sort(),['ar','fr']);checks++;
  mode='skipped';state=await openDraftState(ctx);rows=await listTranslationDrafts(state,'blog');assert.ok(rows.every(row=>row.lifecycle!=='live'&&!row.deleteAction));checks++;
  mode='failed';state=await openDraftState(ctx);assert.equal(state.release.commit,'');checks++;
  mode='unavailable';state=await openDraftState(ctx);await assert.rejects(()=>mutateTranslationDrafts(state,'blog',{drafts:[{draftSlug:'fr--article',sourceSha:currentTree[path('fr--article')]}]},'delete'));checks++;
  mode='success';state=await openDraftState(ctx);const before=writes;await assert.rejects(()=>mutateTranslationDrafts(state,'blog',{drafts:[{draftSlug:'fr--article',sourceSha:'0'.repeat(40)}]},'approve'));assert.equal(writes,before);checks++;
  await mutateTranslationDrafts(state,'blog',{drafts:[{draftSlug:'fr--article',sourceSha:currentTree[path('fr--article')]}]},'approve');
  const saved=splitDraft(blobs.get(commits.get(head)[path('fr--article')]));assert.equal(saved.data.published,true);assert.equal(typeof saved.data.generatedAt,'string');assert.equal(saved.data.metaKeywords,'retained');assert.equal(saved.data.imageMetadata[0].alt,'retained');assert.match(saved.body,/\[\*\*Product\*\*\]\(/);checks++;
  state=await openDraftState(ctx);await mutateTranslationDrafts(state,'blog',{drafts:[{draftSlug:'ar--article',sourceSha:state.files.get(path('ar--article'))}]},'delete');assert.equal(commits.get(head)[path('ar--article')],deployedTree[path('ar--article')]);checks++;
  state=await openDraftState(ctx);await mutateTranslationDrafts(state,'blog',{drafts:[{draftSlug:'fr--article',sourceSha:state.files.get(path('fr--article'))}]},'delete');assert.equal(commits.get(head)[path('fr--article')],undefined);assert.equal(commits.get(head)[path('es--article')],deployedTree[path('es--article')]);checks++;
  state=await openDraftState(ctx);await assert.rejects(()=>mutateTranslationDrafts(state,'blog',{drafts:[{draftSlug:'es--article',sourceSha:state.files.get(path('es--article'))}]},'delete'));checks++;
  const previousHead=head;concurrent=true;
  state=await openDraftState(ctx);await assert.rejects(()=>mutateTranslationDrafts(state,'blog',{draftSlug:'es--article',sourceSha:state.files.get(path('es--article')),data:{title:'changed'},body:'new'},'save'),/其它管理员/);assert.notEqual(head,previousHead);assert.equal(commits.get(previousHead)[path('es--article')],deployedTree[path('es--article')]);checks++;
  head=previousHead;concurrent=false;
  const readRecords=async ref=>{
    const files=commits.get(ref), source={sourcePath,title:'English',locale:'en',sourceSha:files[sourcePath],publicUrl:'https://fixture.test/news/article.html'};
    source.translations=['es','ar'].filter(locale=>files[path(`${locale}--article`)]).map(locale=>({sourcePath:path(`${locale}--article`),sourceSha:files[path(`${locale}--article`)],title:locale,locale,publicUrl:`https://fixture.test/${locale}/news/article.html`}));return [source];
  };
  const formal=async(method,payload)=>formalContentDeletionRoute(new Request('https://fixture.test/api/manager/blog-deletion',{method,headers:{'content-type':'application/json'},body:JSON.stringify(payload)}),ctx,readRecords,'article');
  let planned=await (await formal('POST',{selection:[{sourcePath,sourceSha:commits.get(head)[sourcePath]}]})).json();assert.equal(planned.records.length,3);checks++;
  let result=await formal('DELETE',{...planned,confirmed:false});assert.equal(result.status,502);checks++;
  const originalHead=head;head=sha('other-file-change');commits.set(head,{...commits.get(originalHead)});const beforeFormalWrites=writes;
  result=await formal('DELETE',{...planned,confirmed:true});assert.equal(result.status,409);assert.equal(writes,beforeFormalWrites);checks++;
  planned=await (await formal('POST',{selection:[{sourcePath:path('es--article'),sourceSha:commits.get(head)[path('es--article')]}]})).json();assert.equal(planned.records.length,1);
  result=await formal('DELETE',{...planned,confirmed:true});assert.equal(result.status,200);assert.equal(commits.get(head)[path('es--article')],undefined);assert.ok(commits.get(head)[sourcePath]);assert.ok(commits.get(head)[path('ar--article')]);checks++;
  result=await formal('POST',{selection:[{sourcePath:'src/data/site-origin.json',sourceSha:sha('wrong')} ]});assert.equal(result.status,409);checks++;
  console.log(`PASS ${checks} draft/formal lifecycle, atomic conflict, release proof, safe preview and preservation checks`);
} finally { globalThis.fetch=originalFetch; }
