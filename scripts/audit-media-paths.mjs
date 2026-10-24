import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { lookup } from 'node:dns/promises';
import { build } from 'esbuild';
import YAML from 'yaml';
import { Agent } from 'undici';
import { loadWranglerVars } from './load-wrangler-vars.mjs';
import { publicMediaUrl } from '../src/lib/public-media-url.mjs';
import { entryMatches, validateMediaRegistry, mediaPathJsonSchema, publicRegistryUrl, publicHostname, safeRegistryPath } from './media-path-registry.mjs';

const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
const git = (root, args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true, stdio: ['pipe','pipe','pipe'] }).trim();
export function repositoryIdentity(root) {
  if (path.resolve(git(root, ['rev-parse', '--show-toplevel'])) !== path.resolve(root)) throw new Error('Audit root must be its own Git root, not a parent or nested directory.');
  const urls = [git(root,['remote','get-url','--all','origin']), git(root,['remote','get-url','--push','--all','origin'])];
  const repos = urls.map(url => /^(?:https:\/\/github\.com\/|git@github\.com:)([\w.-]+\/[\w.-]+?)(?:\.git)?$/.exec(url)?.[1]);
  if (!repos[0] || repos[0] !== repos[1]) throw new Error('One consistent GitHub fetch/push identity is required.');
  return repos[0];
}
function within(root, relative) {
  if (!safeRegistryPath(relative)) throw new Error('Unsafe audit path.');
  const resolved = path.resolve(root, relative);
  let ancestor=resolved;while(!fs.existsSync(ancestor))ancestor=path.dirname(ancestor);
  const real = fs.realpathSync(ancestor), prefix = fs.realpathSync(root) + path.sep;
  if (real !== fs.realpathSync(root) && !real.startsWith(prefix)) throw new Error('Source/symlink escapes audit root.');
  return fs.existsSync(resolved)?real:resolved;
}
function files(root, relative, extensions) {
  const folder=within(root,relative); if(!fs.existsSync(folder))return [];
  return fs.readdirSync(folder,{withFileTypes:true}).flatMap(item => {
    const child = relative+'/'+item.name;
    if(item.isSymbolicLink())throw new Error('Audit does not follow symlinks: '+child);
    return item.isDirectory()?files(root,child,extensions):extensions.some(ext=>item.name.endsWith(ext))?[child]:[];
  }).sort();
}
const mediaField = /^(?:image|imageUrl|src|sourceUrl|publicUrl|logo|footerLogo|icon|favicon|url|downloadUrl|fileUrl|mobileImage|desktop|mobile|center|rippleDesktop|rippleMobile)$/i;
const looksMedia = value => /^(?:\/r2\/|r2\/)|\.(?:avif|webp|jpe?g|png|svg|ico|gif|pdf)(?:[?#].*)?$/i.test(value);

export async function collectMediaReferences(root, vars, origin) {
  const references=[], coverage=[],buildManagedAssets=[],protectedReferences=[];
  const add=(raw,category,source,field,state='retained')=>{
    if(typeof raw!=='string'||!raw.trim())return;
    // Public body links are not automatically media, and directories are not objects.
    if(!looksMedia(raw))return;
    const value=publicMediaUrl(raw,vars.PUBLIC_R2_ASSET_BASE_URL||'',origin);
    const kind=/\.pdf(?:[?#].*)?$/i.test(raw)?'download':category;
    // Never retain credentials/signed URLs in a report, even on a rejected input.
    references.push(publicRegistryUrl(value)?{raw,value,category:kind,source,field,state}:{raw:'',value:'',category:kind,source,field,state,issue:'unsafe-or-unresolved'});
  };
  const body=(text,category,source,field,state)=>{
    for(const m of text.matchAll(/!\[[^\]]*\]\(([^\s)]+)(?:\s+[^)]*)?\)|\b(?:src|srcset|href)\s*=\s*["']([^"']+)["']|url\(\s*["']?([^\s)'";]+)["']?\s*\)/g)) {
      const raw=m[1]||m[2]||m[3]; if(raw.includes('${')||raw.includes('{'))continue;
      if(m[3]&&/^data:image\//i.test(raw))continue; // Inlined bytes have no public path to register.
      if(m[3]&&/^\.{1,2}\//.test(raw)){
        const asset=path.resolve(root,path.dirname(source),raw);
        if(asset.startsWith(path.resolve(root)+path.sep)&&fs.existsSync(asset)){
          buildManagedAssets.push({source,import:raw});continue; // Vite import, not a browser URL.
        }
      }
      add(raw,category,source,field,state);
    }
  };
  const walk=(value,category,source,parts=[],state='retained',allStrings=false)=>{
    if(typeof value==='string'){
      if(allStrings||mediaField.test(parts.at(-1)||'')||['galleryImages','images','floatingProducts'].some(key=>parts.includes(key)))add(value,category,source,parts.join('.'),state);
      if(/content|body|html|markdown/i.test(parts.at(-1)||''))body(value,category,source,parts.join('.'),state);
    }else if(Array.isArray(value))value.forEach((item,i)=>walk(item,category,source,[...parts,String(i)],state,allStrings));
    else if(value&&typeof value==='object')for(const [key,item] of Object.entries(value))walk(item,category,source,[...parts,key],state,allStrings);
  };
  for(const file of files(root,'src/content',['.mdoc','.json'])) {
    const text=fs.readFileSync(within(root,file),'utf8').replace(/^\uFEFF/,''), category=/\/(?:product|category)/.test(file)?'product':/\/blog/.test(file)?'blog':'company';
    if(file.endsWith('.json')) { const data=JSON.parse(text);walk(data,category,file,[],data.published===false?'draft':'source-published'); }
    else {
      const front=/^---\s*\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);if(!front)throw new Error('Invalid content frontmatter: '+file);
      const data=YAML.parse(front[1]),state=data.published===false?'draft':'source-published';walk(data,category,file,[],state);body(text.slice(front[0].length),category,file,'body',state);
    }
  }
  for(const [file,category] of [['src/data/site-visuals.json','banner'],['src/data/industry-profile.json','company']])if(fs.existsSync(within(root,file)))walk(readJson(within(root,file)),category,file);
  const downloads='src/data/catalog-downloads.json',downloadModel='src/data/catalogDownloads.ts';
  const rawDownloads=fs.existsSync(within(root,downloads))?readJson(within(root,downloads)):null;
  let actualDownloads=null;
  if(fs.existsSync(within(root,downloadModel))){
    // Only the fixed, existing trusted consumer can establish a direct-download mode.
    // Legacy enabled-only or static-array catalogues are gated, never inferred direct.
    const result=await build({stdin:{contents:`import * as catalog from './${downloadModel}';export default catalog;`,resolveDir:root,loader:'ts'},bundle:true,write:false,format:'esm',platform:'node',logLevel:'silent',plugins:[{name:'fixed-download-policy-glob',setup(b){b.onLoad({filter:/[\\/]site-policy\.ts$/},args=>({loader:'ts',contents:fs.readFileSync(args.path,'utf8').replace(/import\.meta\.glob\('(\.\/site-config\.json)', \{ eager: true, import: 'default' \}\)/g,(_all,relative)=>{const target=path.join(path.dirname(args.path),relative);return JSON.stringify(fs.existsSync(target)?{[relative]:readJson(target)}:{});})}));}}]});
    actualDownloads=(await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'))).default;
  }
  const downloadMode=actualDownloads?.catalogDownloadMode;
  if(downloadMode==='direct')walk(actualDownloads.catalogDownloads||[],'download',downloadModel,[],'current-consumer');
  else {
    const documents=rawDownloads?.documents||actualDownloads?.catalogDownloads||[];
    for(const[index,document]of documents.entries())if(typeof document?.url==='string'){
      const value=publicMediaUrl(document.url,vars.PUBLIC_R2_ASSET_BASE_URL||'',origin);
      protectedReferences.push({source:rawDownloads?downloads:downloadModel,field:`documents.${index}.url`,value:publicRegistryUrl(value)?value:'',category:'download',state:'protected-or-disabled',reason:downloadMode||'legacy-gated-or-unverified'});
    }
    if(documents.length||rawDownloads)coverage.push('Downloads: actual consumer has no explicit direct mode; protected/disabled/unverified catalogue references are retained locally and excluded from the public registry/probes.');
  }
  // Evaluate existing, trusted read models. Registry references cannot nominate executable modules.
  const bg='src/data/backgroundImages.ts',categories='src/data/productCategories.ts',campaign='src/data/campaignImages.ts';
  if(fs.existsSync(within(root,bg))) {
    const imports=[`import * as bg from ${JSON.stringify(within(root,bg))};`];
    if(fs.existsSync(within(root,categories)))imports.push(`import * as categories from ${JSON.stringify(within(root,categories))};`);
    else imports.push('const categories={};');
    if(fs.existsSync(within(root,campaign)))imports.push(`import * as campaign from ${JSON.stringify(within(root,campaign))};`);
    else imports.push('const campaign={};');
    const code=imports.join('\n')+'\nexport default {current:bg.siteImages, fallback:bg.legacySiteImages, categories:categories.productCategoryMeta||[], process:(categories.productCategoryMeta||[]).flatMap(c=>campaign.categoryProcessImages?.(c.name)||[])};';
    const result=await build({stdin:{contents:code,resolveDir:root,loader:'ts'},write:false,bundle:true,platform:'node',format:'esm',logLevel:'silent',define:{'import.meta.env':JSON.stringify(Object.fromEntries(['PUBLIC_R2_ASSET_BASE_URL','PUBLIC_R2_IMAGE_DELIVERY_MODE','SITE_URL'].map(key=>[key,vars[key]||''])))},plugins:[{name:'fixed-existing-json-globs',setup(b){
      b.onLoad({filter:/[\\/]site-(?:visuals|policy)\.ts$/},args=>({loader:'ts',contents:fs.readFileSync(args.path,'utf8').replace(/import\.meta\.glob\('(\.\/site-(?:visuals|config)\.json)', \{ eager: true, import: 'default' \}\)/g,(_all,relative)=>{const target=path.join(path.dirname(args.path),relative);return JSON.stringify(fs.existsSync(target)?{[relative]:readJson(target)}:{});})}));
    }}]});
    const actual=(await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'))).default;
    for(const [state,groups] of [['retained',actual.fallback],['current-consumer',actual.current]])for(const [group,values] of Object.entries(groups||{}))walk(values,group==='brand'?'logo':/hero|background|banner/i.test(group)?'banner':/showcase|productCategor/i.test(group)?'product':'company',bg,[group],state,true);
    walk(actual.categories,'product',categories,[],'current-consumer');
    walk(actual.process,'company',campaign,[],'current-consumer',true);
    coverage.push('Actual background, fallback and category read models evaluated, including selected catalog images and category process images.');
  } else coverage.push('No background read model: dynamic consumer coverage requires manual verification.');
  for(const dir of ['src/components','src/pages','src/templates','src/styles'])for(const file of files(root,dir,['.astro','.css','.tsx','.ts']))body(fs.readFileSync(within(root,file),'utf8'),'company',file,'source-literal','retained');
  if(buildManagedAssets.length)coverage.push('Existing relative CSS dependency assets are build-managed, not guessed public URLs; verify emitted/inlined assets in the fresh build.');
  const protectedUrls=new Set(protectedReferences.map(ref=>ref.value).filter(Boolean));
  return {references:references.filter(ref=>!protectedUrls.has(ref.value)).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))),protectedReferences,buildManagedAssets,coverage,cleanupAllowed:false,limitations:['No complete cloud-draft or still-served release snapshot was supplied. Source states do not prove deployment.','Source literals conservatively protect stored uses; unrecognized/custom runtime consumers require independent review. No deletion is authorized by this report.']};
}

export function checkMediaReferences(registry, inventory, vars, origin, root) {
  const errors=[],unused=[],counts={};
  for(const entry of registry.entries){
    const authority=entry.authority==='PUBLIC_R2_ASSET_BASE_URL'?vars.PUBLIC_R2_ASSET_BASE_URL:entry.authority==='SITE_URL'?origin:null;
    if(authority&&entry.baseUrl.replace(/\/+$/,'')!==authority.replace(/\/+$/,''))errors.push('Configured authority differs: '+entry.id);
    if(entry.authority!=='observed-external'&&!authority)errors.push('Configured authority is missing: '+entry.id);
    for(const ref of entry.references)if(!fs.existsSync(within(root,ref.path)))errors.push('Source evidence no longer exists: '+entry.id+' / '+ref.path);
    counts[entry.id]=0;
  }
  for(const ref of inventory.references){
    if(!publicRegistryUrl(ref.value)){errors.push('Unsafe/unresolved media at '+ref.source+' / '+ref.field);continue;}
    const matched=registry.entries.filter(entry=>entryMatches(entry,ref.value,ref.category));
    if(!matched.length)errors.push('Unregistered '+ref.category+' media at '+ref.source+' / '+ref.field);
    matched.forEach(entry=>counts[entry.id]++);
    if(matched.some(entry=>entry.delivery==='site-static')&&!matched.some(entry=>entry.delivery==='r2-public')) {
      const publicPath='public/'+decodeURIComponent(new URL(ref.value).pathname.slice(1));
      if(!safeRegistryPath(publicPath)||!fs.existsSync(within(root,publicPath)))errors.push('Missing site-static object at '+ref.source+' / '+ref.field);
    }
  }
  for(const entry of registry.entries)if(!counts[entry.id])unused.push({id:entry.id,action:'REVIEW_ONLY_NOT_DELETION',reason:'No recognized Git reference; cloud drafts, retained consumers and current release are not fully audited.'});
  return {errors:[...new Set(errors)].sort(),unused,counts};
}

export async function probeMedia(value, allowedOrigins, fetcher=fetch, resolver=lookup) {
  const url=publicRegistryUrl(value);
  if(!url||!allowedOrigins.includes(url.origin))throw new Error('Online probe rejected an unsafe/unregistered source.');
  const addresses=await resolver(url.hostname,{all:true});
  if(!addresses.length||addresses.some(item=>!publicHostname(item.address)))throw Object.assign(new Error('Online probe refused a non-public DNS answer.'),{code:'DNS_NOT_PUBLIC'});
  // No ambient credentials, no redirects to another host/private service, bounded body reads.
  const agent=new Agent({connect:{lookup:(hostname,options,callback)=>{if(hostname!==url.hostname)return callback(new Error('Unexpected probe hostname.'));const fixed=addresses[0];callback(null,...(options.all?[addresses]:[fixed.address,fixed.family]));}}});
  try {
  const response=await fetcher(url,{method:'GET',redirect:'manual',credentials:'omit',dispatcher:agent,headers:{range:'bytes=0-511'},signal:AbortSignal.timeout(15000)});
  const reader=response.body?.getReader();let first=new Uint8Array();
  try{if(reader){const result=await reader.read();first=(result.value||first).slice(0,512);}}finally{await reader?.cancel();}
  const mime=(response.headers.get('content-type')||'').split(';')[0],signature=Buffer.from(first).toString('hex');
  const real=/^89504e470d0a1a0a|^ffd8ff|^474946383[79]61|^52494646[0-9a-f]{8}57454250|^25504446/.test(signature)||mime==='image/svg+xml'&&/^\s*(?:<\?xml[^>]*>\s*)?<svg[\s>]/i.test(Buffer.from(first).toString())||mime==='image/avif'&&Buffer.from(first).includes(Buffer.from('ftypavif'))||mime==='image/x-icon'&&/^00000100/.test(signature);
  return {url:url.href,httpStatus:response.status,contentType:mime,mediaSignature:real,passed:response.status>=200&&response.status<300&&/^(?:image\/|application\/pdf$)/.test(mime)&&real};
  } finally { await agent.close(); }
}

export function onlineMediaSamples(registry, inventory) {
  const entries=registry.entries.map(entry=>({id:entry.id,values:[...new Set(inventory.references.filter(ref=>ref.state!=='draft'&&!/Translations\//.test(ref.source)&&entryMatches(entry,ref.value,ref.category)).map(ref=>ref.value))].slice(0,2)}));
  return {values:[...new Set(entries.flatMap(entry=>entry.values))].sort(),unprobedEntries:entries.filter(entry=>!entry.values.length).map(entry=>entry.id)};
}

export async function auditMediaPaths(root=process.cwd(),{online=false}={}) {
  root=path.resolve(root);const repository=repositoryIdentity(root),file=within(root,'docs/media-paths.json');
  if(!fs.existsSync(file))return {repository,status:'NOT_ADOPTED',errors:[],cleanupAllowed:false};
  const registry=validateMediaRegistry(readJson(file));if(registry.repository!==repository)throw new Error('Registry belongs to a different repository.');
  if(repository==='ironstraight/businessweb'){
    if(registry.entries.length)throw new Error('Mother registry must remain empty: no customer media defaults.');
    return {repository,status:'TEMPLATE_EMPTY',errors:[],cleanupAllowed:false};
  }
  const allVars=loadWranglerVars(root),vars=Object.fromEntries(['SITE_URL','PUBLIC_R2_ASSET_BASE_URL','PUBLIC_R2_IMAGE_DELIVERY_MODE'].map(key=>[key,allVars[key]||'']));
  const siteFile=within(root,'src/data/site-origin.json'),origin=(fs.existsSync(siteFile)?readJson(siteFile).productionUrl:'')||vars.SITE_URL;
  if(!publicRegistryUrl(origin,true))throw new Error('A real public site origin is required for adopted media registration.');
  const inventory=await collectMediaReferences(root,vars,origin),checks=checkMediaReferences(registry,inventory,vars,origin,root);
  if(vars.SITE_URL&&new URL(vars.SITE_URL).origin!==new URL(origin).origin)checks.errors.push('SITE_URL and current site-origin differ; do not repair canonical via the registry.');
  const result={repository,status:checks.errors.length?'FAIL':'SOURCE_CHECKED',sourceHead:git(root,['rev-parse','HEAD']),...inventory,...checks};
  if(online){
    const origins=[...new Set(registry.entries.map(entry=>new URL(entry.baseUrl).origin))];
    const selection=onlineMediaSamples(registry,inventory),samples=selection.values;result.onlineUnprobedEntries=selection.unprobedEntries;
    result.online=[];
    for(const value of samples)try{result.online.push(await probeMedia(value,origins));}catch(error){result.online.push({url:value,status:'NOT_VERIFIED',code:error.code==='DNS_NOT_PUBLIC'?'DNS_NOT_PUBLIC':'NETWORK_UNVERIFIED',error:'No public response verified; no credential or redirect fallback.'});}
    result.onlineScope='AT_MOST_TWO_REAL_REFERENCES_PER_ENTRY_NOT_FULL_CENSUS';
    if(result.online.some(item=>item.passed===false))result.status='ONLINE_FAILURE';
    else if(result.online.some(item=>item.status==='NOT_VERIFIED')||selection.unprobedEntries.length)result.status='ONLINE_UNVERIFIED';
  }
  return result;
}

if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
  try {
    const args=process.argv.slice(2),allowed=new Set(['--online','--json','--schema','--report']);
    if(args.some((arg,i)=>!allowed.has(arg)&&args[i-1]!=='--report'))throw new Error('Unknown media audit option. Run from the selected repository root.');
    if(args.includes('--schema'))console.log(JSON.stringify(mediaPathJsonSchema(),null,2));
    else {
      const result=await auditMediaPaths(process.cwd(),{online:args.includes('--online')});
      if(args.includes('--report')){const relative=args[args.indexOf('--report')+1];if(!relative?.startsWith('Temp/')||!safeRegistryPath(relative))throw new Error('Reports must be inside this repository Temp/.');const target=within(process.cwd(),relative);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,JSON.stringify(result,null,2)+'\n');}
      console.log(args.includes('--json')?JSON.stringify(result,null,2):JSON.stringify({repository:result.repository,status:result.status,references:result.references?.length,errors:result.errors,cleanupAllowed:false,onlineScope:result.onlineScope}));
      if(result.errors.length||result.status==='ONLINE_FAILURE')process.exitCode=1;
      else if(result.status==='ONLINE_UNVERIFIED')process.exitCode=2;
    }
  } catch(error){console.error(error instanceof Error?error.message:'Media audit failed.');process.exitCode=1;}
}
