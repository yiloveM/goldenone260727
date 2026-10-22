import {getCollection} from 'astro:content';
import identity from 'virtual:site-build-identity';
import {getRepoFullName,getBranch} from './github';
import {openDraftState,listTranslationDrafts,splitDraft} from '../draft-lifecycle';
import {readGitBlob,readGitBlobs} from '../site-git';
import {canonicalArticleCategory} from '../article-categories.mjs';
import {blogPath,locales,type Locale} from '../../data/i18n';
import origin from '../../data/site-origin.json';
import type {RuntimeEnv} from '../runtime-env';

const pathFor=(slug:string)=>`src/content/blog/${slug}.mdoc`;
const summary=(data:any,slug:string,locale='en',sourceSha='',body='')=>({
 id:locale==='en'?slug:`${locale}--${slug}`,slug,locale,format:'markdoc',collection:locale==='en'?'blog':'blogTranslations',
 sourcePath:locale==='en'?pathFor(slug):`src/content/blogTranslations/${locale}--${slug}.mdoc`,sourceSha,
 title:data.title || '',description:data.description || '',category:canonicalArticleCategory(data.category),image:data.image || '',author:data.author || '',featured:data.featured===true,published:data.published!==false,
 publishDate:data.publishDate?new Date(data.publishDate).toISOString():'',body,path:blogPath(slug),publicUrl:new URL(blogPath(slug,locale as Locale),origin.productionUrl || 'http://localhost').href,translations:[] as any[]
});
export async function readArticleCatalog(env:RuntimeEnv,token:string,slug='',locale='en',ref=''){
 const compiled=await getCollection('blog'),repo=getRepoFullName(env),branch=getBranch(env);
 let state:Awaited<ReturnType<typeof openDraftState>>;
 try{if(!token)throw new Error('Unavailable');state=await openDraftState({repo,branch,token},ref);}
 catch{
  if(slug||ref)throw new Error('暂时无法读取最新文章，请刷新后重试。');
  const translated=await getCollection('blogTranslations');
  const posts=compiled.map(post=>{const id=post.id.replace(/\.mdoc$/,'');return summary(post.data,id,'en',identity.files[pathFor(id)]?.sha);});
  for(const post of posts)post.translations=translated.filter(item=>item.data.sourceSlug===post.slug&&item.data.published===true&&post.published&&locales.includes(item.data.locale as Locale)).map(item=>({...summary(item.data,post.slug,item.data.locale,identity.files[`src/content/blogTranslations/${item.id.replace(/\.mdoc$/,'')}.mdoc`]?.sha),category:post.category}));
  return {posts,warning:'暂时无法同步最新文章，当前显示上次发布的内容。编辑和删除前会重新检查。',branch};
 }
 const entries=[...state.files].filter(([path])=>/^src\/content\/blog\/[a-z0-9-]+\.mdoc$/.test(path));
 state.ctx.bodyCache=await readGitBlobs(state.ctx,entries.filter(([path,sha])=>identity.files[path]?.sha!==sha||!compiled.some(item=>pathFor(item.id.replace(/\.mdoc$/,''))===path)).map(([,sha])=>sha));
 const posts=[];
 for(const [path,sha] of entries){
  const id=path.split('/').pop()!.replace(/\.mdoc$/,''),cached=compiled.find(item=>item.id.replace(/\.mdoc$/,'')===id);
  const current=identity.files[path]?.sha===sha&&cached?{data:cached.data,body:String((cached as any).body||'')}:splitDraft(await readGitBlob(state.ctx,sha));
  posts.push(summary(current.data,id,'en',sha,current.body));
 }
 const translated=(await listTranslationDrafts(state,'blog')) as any[];
 for(const post of posts)post.translations=post.published?translated.filter(item=>item.sourceSlug===post.slug&&(item.wasLive||!state.release.commit&&item.published&&identity.files[`src/content/blogTranslations/${item.draftSlug}.mdoc`]?.data?.published===true)).map(item=>({...summary(item,post.slug,item.locale,item.sourceSha),category:post.category})):[];
 if(slug){
  if(locale!=='en'){
   const candidate=translated.find(item=>item.sourceSlug===slug&&item.locale===locale);if(!candidate)throw new Error('文章不存在或该语言未公开。');
   const full=splitDraft(await readGitBlob(state.ctx,candidate.sourceSha)),source=posts.find(item=>item.slug===slug)!;
   return {post:{...summary(full.data,slug,locale,candidate.sourceSha,full.body),category:source.category},warning:state.release.warning,branch};
  }
  const post=posts.find(item=>item.slug===slug);if(!post)throw new Error('文章不存在，请刷新。');
  const full=splitDraft(await readGitBlob(state.ctx,post.sourceSha));return {post:{...post,body:full.body},warning:state.release.warning,branch};
 }
 return {posts:posts.map(({body,...item})=>item).sort((a,b)=>b.publishDate.localeCompare(a.publishDate)||a.title.localeCompare(b.title)),warning:state.release.warning,branch};
}
