import { getCollection } from 'astro:content';
import identity from 'virtual:site-build-identity';
import { getRepoFullName, getBranch } from './github';
import { openDraftState, listTranslationDrafts, splitDraft } from '../draft-lifecycle';
import { mapGitItems, readGitBlob } from '../site-git';
import { productPath } from '../../data/i18n';
import origin from '../../data/site-origin.json';
import type { RuntimeEnv } from '../runtime-env';

export async function readProductCatalog(env: RuntimeEnv,token:string,ref='') {
  if(!token)throw new Error('GitHub connection unavailable');
  const state=await openDraftState({repo:getRepoFullName(env),branch:getBranch(env),token},ref);
  const compiled=await getCollection('products');
  const sources=[...state.files.entries()].filter(([path])=>/^src\/content\/products\/[a-z0-9-]+\.mdoc$/.test(path)&&!path.split('/').pop()!.startsWith('placeholder-'));
  const products=await mapGitItems(sources,async([path,sha])=>{
    const id=path.split('/').pop()!.replace(/\.mdoc$/,''),entry=compiled.find(item=>item.id.replace(/\.mdoc$/,'')===id);
    const current=identity.files[path]?.sha===sha&&entry ? {data:entry.data,body:String((entry as any).body||'')} : splitDraft(await readGitBlob(state.ctx,sha));
    const product:any={...current.data,id:entry?.id || `${id}.mdoc`,slug:id,locale:'en',sourcePath:path,sourceSha:sha,content:current.body,
      published:current.data.published!==false,publicUrl:new URL(productPath(id,'en'),(origin.productionUrl || 'http://localhost')).href,
      lifecycle:state.release.commit ? state.deployed.get(path)===sha ? 'live':'reviewed':'unknown',translations:[]};
    return product;
  });
  const drafts=(await listTranslationDrafts(state,'product')) as any[];
  const translations=drafts.filter(draft=>draft.wasLive || (!state.release.commit && draft.published
    && identity.files[`src/content/productTranslations/${draft.draftSlug}.mdoc`]?.data?.published===true)).flatMap(draft=>{
    const source=products.find(product=>product.slug===draft.sourceSlug);
    if(!source)return [];
    return [{...draft,category:source.category,series:source.series,image:source.image,sortOrder:source.sortOrder,id:draft.draftSlug,slug:draft.sourceSlug,sourcePath:`src/content/productTranslations/${draft.draftSlug}.mdoc`,
      publicUrl:new URL(productPath(draft.sourceSlug,draft.locale),(origin.productionUrl || 'http://localhost')).href,translations:[]}];
  });
  for(const product of products)product.translations=translations.filter(record=>record.slug===product.slug);
  return {products,translations,branch:state.ctx.branch,warning:state.release.warning};
}
