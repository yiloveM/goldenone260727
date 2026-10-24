import {sitePolicyFixture} from './site-policy-test-fixture.mjs';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createReader } from '@keystatic/core/reader';
import { emptySiteVisuals } from '../src/lib/site-visuals.mjs';
const output=resolve('.sandbox/site-visual-reader');await mkdir(output,{recursive:true});const run=await mkdtemp(resolve(output,'run-'));
await build({plugins:[sitePolicyFixture()],stdin:{contents:"import{config,singleton}from'@keystatic/core';import{siteVisualFields}from'./src/keystatic/site-visual-fields';export{visualSlots}from'./src/data/site-visual-slots';export default config({storage:{kind:'local'},singletons:{siteVisuals:singleton({label:'站点视觉',path:'src/data/site-visuals',format:'json',schema:siteVisualFields()})}})",resolveDir:process.cwd(),loader:'ts'},outfile:resolve(run,'config.mjs'),bundle:true,format:'esm',platform:'node',packages:'external',define:{'import.meta.env':'{}'},logLevel:'silent'});
const {default:config,visualSlots}=await import(pathToFileURL(resolve(run,'config.mjs')));const root=resolve(run,'content');await mkdir(resolve(root,'src/data'),{recursive:true});
const read=()=>createReader(root,config).singletons.siteVisuals.read(),file=resolve(root,'src/data/site-visuals.json');assert.equal(await read(),null);
let source;try{source=JSON.parse(await readFile('src/data/site-visuals.json','utf8'));}catch(error){if(error.code!=='ENOENT')throw error;source=emptySiteVisuals(visualSlots);}let checks=1;
for(const mode of ['OFF','ON_EMPTY','ON','OFF_KEEP','RE_ENABLE']){const data=structuredClone(source),visual=data.home.heroSlides[0].visual;visual.enabled=['ON_EMPTY','ON','RE_ENABLE'].includes(mode);visual.image=['ON','OFF_KEEP','RE_ENABLE'].includes(mode)?'/r2/fixtures/banner.webp':'';visual.localizedAlts=[{locale:'es',text:'Ilustración'}];await writeFile(file,JSON.stringify(data));assert.deepEqual(await read(),data);await writeFile(file,JSON.stringify(await read()));assert.deepEqual(await read(),data);checks++;}
const minimal={version:1,home:{heroSlides:[],center:{},primaryCta:{}},pages:Object.fromEntries(Object.keys(source.pages).map(key=>[key,{}])),categories:[]};await writeFile(file,JSON.stringify(minimal));const parsed=await read();assert.equal(parsed.pages.about.enabled,false);assert.equal(parsed.pages.about.focusX,null);checks++;
// A fresh industry may have no category positions yet. Construct its real owner
// schema without modifying the current template profile or content.
await build({stdin:{contents:"import{config,singleton}from'@keystatic/core';import{siteVisualFields}from'./src/keystatic/site-visual-fields';export default config({storage:{kind:'local'},singletons:{siteVisuals:singleton({label:'站点视觉',path:'src/data/site-visuals',format:'json',schema:siteVisualFields()})}})",resolveDir:process.cwd(),loader:'ts'},outfile:resolve(run,'empty-config.mjs'),bundle:true,format:'esm',platform:'node',packages:'external',define:{'import.meta.env':'{}'},logLevel:'silent',plugins:[sitePolicyFixture(),{name:'empty-category-adapter',setup(b){b.onResolve({filter:/site-visual-slots$/},()=>({path:'empty',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:"export const visualSlots=[{key:'home.primary',group:'home',title:'首页首屏',supported:true},{key:'pages.about',group:'pages',title:'关于我们',supported:true}];export const knownVisualLocales=['en'];",loader:'js'}));}}]});
const {default:emptyConfig}=await import(pathToFileURL(resolve(run,'empty-config.mjs')));
await writeFile(file,JSON.stringify({version:1,home:{heroSlides:[],center:{},primaryCta:{}},pages:{about:{}},categories:[]}));
const empty=await createReader(root,emptyConfig).singletons.siteVisuals.read();assert.deepEqual(empty.categories,[]);await writeFile(file,JSON.stringify(empty));assert.deepEqual(await createReader(root,emptyConfig).singletons.siteVisuals.read(),empty);checks++;
console.log(JSON.stringify({reader:'REAL_KEYSTATIC',passed:checks,sourceFile:'COPY_ONLY',cloudWrites:'NONE'}));
