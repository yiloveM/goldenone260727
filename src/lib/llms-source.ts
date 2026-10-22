import { getCollection } from 'astro:content';
import { siteInfo } from '../data/site';
import { defaultLocale, locales, localeMeta, productPath, blogPath, localizePath, ui } from '../data/i18n';
import { buildProductCategories, isProductPublished } from '../data/productCategories';
import { parse } from 'yaml';

// This adapter describes eligibility only. Text is taken from the same build's
// public HTML, so Markdoc and native JSON never acquire a second content source.
export async function llmsSourceManifest() {
  const products=await getCollection('products'), posts=await getCollection('blog');
  const productTranslations=Object.keys(import.meta.glob('../content/productTranslations/*.mdoc')).length?await getCollection('productTranslations'):[];
  const blogTranslations=Object.keys(import.meta.glob('../content/blogTranslations/*.mdoc')).length?await getCollection('blogTranslations'):[];
  const rawPosts=import.meta.glob<string>('../content/blog/*.mdoc',{query:'?raw',import:'default',eager:true});
  const postFlags=new Map(Object.entries(rawPosts).map(([path,body])=>[path.split('/').pop(),parse(body.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/)?.[1]||'')||{}]));
  const entries:Array<{path:string;locale:string;kind:string;eligible:boolean}>=[];
  for(const locale of locales){
    for(const product of products){
      const slug=product.id.replace(/\.mdoc$/,'');
      entries.push({path:productPath(slug,locale),locale,kind:'products',eligible:isProductPublished(product)&&(locale===defaultLocale||productTranslations.some(t=>t.data.locale===locale&&t.data.sourceSlug===slug&&t.data.published===true))});
    }
    for(const post of posts){
      const slug=post.id.replace(/\.mdoc$/,''), flags=postFlags.get(post.id)||{};
      entries.push({path:blogPath(slug,locale),locale,kind:'articles',eligible:flags.published!==false&&flags.draft!==true&&(locale===defaultLocale||blogTranslations.some(t=>t.data.locale===locale&&t.data.sourceSlug===slug&&t.data.published===true))});
    }
    for(const category of buildProductCategories(products.filter(isProductPublished))) entries.push({path:localizePath(category.href,locale),locale,kind:'categories',eligible:true});
  }
  return {version:1,discoverStructuredPages:true,name:siteInfo.name,defaultLocale,locales:locales.map(code=>{
    const copy=ui[code] as Record<string,any>;
    return {code,htmlLang:localeMeta[code].htmlLang,root:localizePath('/',code),labels:{products:copy.nav.products,categories:copy.footer.productWorlds||copy.nav.products,articles:copy.nav.engineeringNotes,company:copy.nav.about,resources:copy.nav.engineeringNotes,contact:copy.nav.contact}};
  }),entries};
}
