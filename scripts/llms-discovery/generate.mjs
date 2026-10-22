import { readFile, writeFile, mkdir, stat, unlink, realpath } from 'node:fs/promises';
import { resolve, dirname, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { validateConfig, publicPath, kinds, configSnapshot } from './config.mjs';
import { readPage, escapeMarkdown } from './html.mjs';
export const fingerprint = value => createHash('sha256').update(configSnapshot(value)).digest('hex');
const codepoint=(a,b)=>a<b?-1:a>b?1:0;
const cleanUrl = (path,origin) => {
  if(!publicPath(path))throw new Error('Unsafe AI discovery path.');
  const url=new URL(path,origin);
  if(url.origin!==origin||url.search||url.hash||url.username||url.password)throw new Error('Cross-site discovery URL.');
  return url;
};
const fileAt=(root,path)=>{
  if(!path.startsWith('/')||/[\\\u0000]/u.test(path)||path.split('/').some(p=>p==='.'||p==='..'))throw new Error('Unsafe output path.');
  const file=resolve(root,'.'+decodeURIComponent(path));
  if(file!==root&&!file.startsWith(root+sep))throw new Error('Output escaped its site.');
  return file;
};
const markdownPath=path=>path.endsWith('/')?path+'index.md':path+'.md';
const navPath=root=>root+'llms.txt';
const exists=async file=>{try{return (await stat(file)).isFile();}catch(e){if(e.code==='ENOENT'||e.code==='ENOTDIR')return false;throw e;}};
const isOwned=path=>/^\/(?:[^?#\\]+\/)?llms(?:-full)?\.txt$/.test(path)||path.endsWith('.md');
async function readHtml(root,path){
  const base=fileAt(root,path);
  for(const file of [base,resolve(base,'index.html')]){
    if(!await exists(file))continue;
    if(!(await realpath(file)).startsWith((await realpath(root))+sep))throw new Error('Symlink escaped site output.');
    return {file,html:await readFile(file,'utf8')};
  }
  return null;
}
export async function generateDiscovery({outputDir,routePaths,manifest,settings,origin}){
  const root=resolve(outputDir),config=validateConfig(settings),base=new URL(origin);
  if(!['https:','http:'].includes(base.protocol)||base.username||base.password||base.pathname!=='/'||base.search||base.hash)throw new Error('Invalid discovery origin.');
  origin=base.origin;
  if(manifest.version!==1||!manifest.name?.trim()||!Array.isArray(manifest.entries)||!Array.isArray(manifest.locales)||!manifest.locales.some(l=>l.code===manifest.defaultLocale))throw new Error('Missing CMS discovery manifest.');
  const ledger=fileAt(root,'/_llms/generated.json');
  let previous=[];
  if(await exists(ledger))previous=JSON.parse(await readFile(ledger,'utf8'));
  if(!Array.isArray(previous)||previous.some(path=>!isOwned(path)))throw new Error('Invalid generated-output inventory.');
  // Only generated static output is retired; never source/CMS/R2 content.
  for(const path of previous){const file=fileAt(root,path);if(await exists(file))await unlink(file);}
  const report={version:2,configHash:fingerprint(config),enabled:config.enabled,origin,locales:[],skipped:{},limits:[],markdown:0};
  const skip=reason=>report.skipped[reason]=(report.skipped[reason]||0)+1;
  const routes=new Set(routePaths.map(value=>('/'+value.replace(/^\//,'')).replace(/\.html\/$/,'.html')));
  const entries=new Map();
  for(const item of manifest.entries){
    if(!publicPath(item.path)||!kinds.includes(item.kind))throw new Error('Invalid CMS discovery entry.');
    const prior=entries.get(item.path);
    if(prior&&(prior.locale!==item.locale||prior.kind!==item.kind)){
      // A native category record and its product category can describe the same
      // real route. Conflicting identities must not silently overwrite content.
      throw new Error('Conflicting discovery identity: '+item.path);
    }
    entries.set(item.path,{...item,eligible:item.eligible===true&&prior?.eligible!==false});
  }
  if(config.enabled&&manifest.discoverStructuredPages){
    const scopes=[...manifest.locales].sort((a,b)=>b.root.length-a.root.length);
    for(const path of routes){
      if(entries.has(path)||!publicPath(path)||/\.(?:json|txt|md|xml)$/i.test(path))continue;
      const built=await readHtml(root,path);if(!built)continue;
      const page=readPage(built.html,new URL(path,origin).href),locale=scopes.find(locale=>path.startsWith(locale.root)&&page.language.toLowerCase()===locale.htmlLang.toLowerCase());if(!locale)continue;
      const type=new Set(page.types);
      const kind=path===locale.root||type.has('AboutPage')?'company':type.has('ContactPage')?'contact':type.has('FAQPage')?'resources':type.has('Article')||type.has('BlogPosting')?'resources':type.has('Product')||type.has('Service')?'products':'';
      if(kind)entries.set(path,{path,locale:locale.code,kind,eligible:true});
    }
  }
  const outputs=new Map(),htmlUpdates=new Map();
  // A repeat build/generation on the same output also removes stale discovery
  // links when a page/language/category or the whole system is switched OFF.
  for(const path of previous.length?routes:[]){
    if(!publicPath(path))continue;
    const built=await readHtml(root,path);if(!built)continue;
    const html=built.html.replace(/<link\b[^>]*\bdata-llms-discovery=["']true["'][^>]*>\s*/gi,'');
    if(html!==built.html)htmlUpdates.set(built.file,html);
  }
  const locales=manifest.locales.filter(locale=>config.multilingual||locale.code===manifest.defaultLocale).sort((a,b)=>codepoint(a.root,b.root));
  const localeRoots=manifest.locales.map(l=>l.root).sort((a,b)=>b.length-a.length);
  for(const locale of locales){
    if(!publicPath(locale.root)||!locale.root.endsWith('/')||!locale.htmlLang)throw new Error('Invalid public language scope.');
    const priority=['company','contact','categories','products','resources','articles'];
    const candidates=[...entries.values()].filter(e=>e.locale===locale.code).sort((a,b)=>priority.indexOf(a.kind)-priority.indexOf(b.kind)||codepoint(a.path,b.path));
    const selected=[];
    for(const entry of candidates){
      if(!entry.eligible||!config.include[entry.kind]||!config.enabled||config.excludePaths.includes(entry.path)){skip('policy');continue;}
      if(!routes.has(entry.path)){skip('not-built');continue;}
      if(localeRoots.find(prefix=>entry.path.startsWith(prefix))!==locale.root){skip('language-scope');continue;}
      const url=cleanUrl(entry.path,origin),built=await readHtml(root,entry.path);
      if(!built){skip('not-built');continue;}
      const page=readPage(built.html,url.href);
      if(!page.main||!page.title||!page.description||page.language.toLowerCase()!==locale.htmlLang.toLowerCase()){skip('incomplete-or-language');continue;}
      if(/(?:^|[\s,])(?:noindex|none)(?:$|[\s,])/i.test(page.robots)){skip('noindex');continue;}
      let canonical;try{canonical=new URL(page.canonical);}catch{skip('canonical');continue;}
      if(canonical.href!==url.href){skip('canonical');continue;}
      if(selected.length>=config.maxEntries){skip('entry-limit');continue;}
      const mdPath=markdownPath(entry.path);
      const markdown=config.markdown&&page.content.length>=100;
      if(config.markdown&&!markdown)skip('html-fallback');
      const target=markdown?cleanUrl(mdPath,origin).href:url.href;
      if(markdown){
        outputs.set(mdPath,`<!-- businessweb-ai-discovery:v2 -->\n<!-- discovery-scope:${navPath(locale.root)} -->\n# ${escapeMarkdown(page.title)}\n\n> ${escapeMarkdown(page.description)}\n\n[${escapeMarkdown(page.title)}](<${url.href}>)\n\n${page.content}\n`);
        report.markdown++;
      }
      const scope=navPath(locale.root);
      const tags=[`<link data-llms-discovery="true" rel="describedby" href="${scope}">`,...(markdown?[`<link data-llms-discovery="true" rel="alternate" type="text/markdown" href="${mdPath}">`]:[])];
      if(!/<\/head\s*>/i.test(page.html))throw new Error('Public HTML has no head.');
      htmlUpdates.set(built.file,page.html.replace(/<\/head\s*>/i,tags.join('\n')+'\n</head>'));
      selected.push({...entry,...page,target,mdPath,markdown});
    }
    if(!config.enabled)continue;
    if(!selected.length){skip('empty-language');continue;}
    const scope=navPath(locale.root),summary=config.summaries.find(item=>item.locale===locale.code)?.text?.trim()||selected.find(item=>item.path===locale.root)?.description||selected.find(item=>item.kind==='company')?.description||selected[0].description;
    const lines=[`# ${escapeMarkdown(manifest.name)}`,'',`> ${escapeMarkdown(summary)}`,''];
    const groups=new Map();
    for(const kind of kinds){const items=selected.filter(item=>item.kind===kind);if(!items.length)continue;const label=locale.labels?.[kind]||kind;groups.set(label,[...(groups.get(label)||[]),...items]);}
    for(const [label,items] of groups){lines.push(`## ${escapeMarkdown(label)}`,'',...items.map(page=>`- [${escapeMarkdown(page.title)}](<${page.target}>): ${escapeMarkdown(page.description)}`),'');}
    outputs.set(scope,lines.join('\n'));
    let fullBytes=0,fullTruncated=false;
    if(config.llmsFull){
      if(!config.markdown)throw new Error('llms-full requires Markdown representations.');
      let full=`# ${escapeMarkdown(manifest.name)}\n\n> ${escapeMarkdown(summary)}\n`;
      for(const page of selected.filter(item=>item.markdown)){
        const section=`\n\n## ${escapeMarkdown(page.title)}\n\n[${escapeMarkdown(page.title)}](<${new URL(page.path,origin).href}>)\n\n${page.content}\n`;
        if(Buffer.byteLength(full+section,'utf8')>config.maxFullBytes){fullTruncated=true;continue;}
        full+=section;
      }
      fullBytes=Buffer.byteLength(full,'utf8');outputs.set(locale.root+'llms-full.txt',full);
      if(fullTruncated)report.limits.push({locale:locale.code,reason:'full-byte-limit'});
    }
    report.locales.push({locale:locale.code,path:scope,entries:selected.length,markdown:selected.filter(item=>item.markdown).length,fullBytes,fullTruncated});
  }
  // Commit only after every page/config is validated. A build error aborts the
  // existing release; it cannot silently substitute a stale discovery file.
  for(const [path,content] of outputs){
    const file=fileAt(root,path);
    if(await exists(file)&&path!=='/llms.txt')throw new Error('Discovery output collides with an authored asset: '+path);
    await mkdir(dirname(file),{recursive:true});await writeFile(file,content,'utf8');
  }
  for(const [file,html] of htmlUpdates)await writeFile(file,html,'utf8');
  // Remove the build-only root seed when OFF or when no eligible root exists.
  if(!outputs.has('/llms.txt')&&await exists(fileAt(root,'/llms.txt')))await unlink(fileAt(root,'/llms.txt'));
  await mkdir(dirname(ledger),{recursive:true});
  await writeFile(ledger,JSON.stringify([...outputs.keys()].sort(codepoint))+'\n');
  await writeFile(fileAt(root,'/_llms/status.json'),JSON.stringify(report)+'\n');
  return report;
}
