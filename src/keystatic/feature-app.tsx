import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {Keystatic} from '@keystatic/core/ui';
import {createKeystaticConfig} from '../../keystatic.config';
import {siteConfig} from '../data/site-policy';
import {featurePolicy,interfaceConfig,featureAllowed} from '../lib/feature-policy.mjs';
import {singletonFeatures,collectionFeatures} from '../lib/feature-registry.mjs';
import {FeatureUiContext,AssemblyNotice} from './feature-assembly-field';
import {adminApiUrl} from '../lib/admin-client';
import {getKeystaticBasePath} from './keystatic-path';
import {useSyncedSurfaceTheme} from './use-synced-surface-theme';
type Snapshot={features:Record<string,boolean>;revision:string;schemaVersion:1|2|null;scope?:'features';formDefaults?:{downloadMode:'disabled'|'direct'|'protected'}};
const closed=Object.fromEntries(Object.keys(featurePolicy(siteConfig)).map(key=>[key,false]));
function branchAtLocation(){const parts=location.pathname.split('/').filter(Boolean),index=parts.indexOf('branch');return index>=0?decodeURIComponent(parts[index+1]||''):'';}
function currentFeature(){const match=location.pathname.match(/\/(singleton|collection)\/([^/]+)/);if(!match)return null;if(match[1]==='singleton'&&match[2]==='siteVisuals')return 'visualConfiguration';const registry:Record<string,string|null>=match[1]==='singleton'?singletonFeatures:collectionFeatures;return Object.hasOwn(registry,match[2])?registry[match[2]]:'unregistered';}
export default function FeatureApp(){
 const root=useRef<HTMLDivElement>(null);useSyncedSurfaceTheme(root,'sp');
 const dirty=useRef(false),generation=useRef(0),loadedBranch=useRef('');
 const dialog=useRef<HTMLDialogElement>(null),abort=useRef<AbortController|null>(null),trigger=useRef<HTMLElement|null>(null);
 const [view,setView]=useState<Snapshot>({features:closed,revision:'',schemaVersion:siteConfig?.schemaVersion||null,scope:siteConfig&&'scope'in siteConfig?siteConfig.scope:undefined}),[latest,setLatest]=useState<Snapshot|null>(null),[message,setMessage]=useState('正在核验本站已保存的功能设置。'),[route,setRoute]=useState('');
 const latestRef=useRef<Snapshot|null>(null);latestRef.current=latest;
 const refresh=useCallback(async()=>{
  const branch=branchAtLocation(),epoch=++generation.current;
  abort.current?.abort();const controller=new AbortController();abort.current=controller;
  try{const response=await fetch(adminApiUrl('/api/keystatic/features')+(branch?'?branch='+encodeURIComponent(branch):''),{credentials:'same-origin',cache:'no-store',signal:controller.signal});if(!response.ok)throw new Error();const next:Snapshot=await response.json();
   if(!next.features||Object.keys(closed).some(key=>typeof next.features[key]!=='boolean')||![null,1,2].includes(next.schemaVersion)||(next.scope!==undefined&&next.scope!=='features'))throw new Error();
   if(epoch!==generation.current)return;
   if(branch!==loadedBranch.current){dirty.current=false;loadedBranch.current=branch;}
   setLatest(next);setMessage('');if(!dirty.current)setView(current=>JSON.stringify(current.features)===JSON.stringify(next.features)&&current.schemaVersion===next.schemaVersion&&current.scope===next.scope&&JSON.stringify(current.formDefaults)===JSON.stringify(next.formDefaults)?current:next);
  }catch{if(epoch===generation.current){setLatest(null);setMessage('暂时无法核验已保存的功能设置。请稍后重试；当前编辑仍保留。');}}
 },[]);
 useEffect(()=>{const edited=()=>{dirty.current=true;},focused=()=>{setRoute(location.pathname);void refresh();};document.addEventListener('input',edited,true);document.addEventListener('change',edited,true);void refresh();let currentPath=location.pathname;setRoute(currentPath);
  const clock=setInterval(()=>{if(location.pathname!==currentPath){currentPath=location.pathname;dirty.current=false;setRoute(currentPath);void refresh();}},750),poll=setInterval(()=>void refresh(),15000);window.addEventListener('focus',focused);
  return()=>{generation.current++;abort.current?.abort();clearInterval(clock);clearInterval(poll);document.removeEventListener('input',edited,true);document.removeEventListener('change',edited,true);window.removeEventListener('focus',focused);};
 },[refresh]);
 const pending=!!latest&&(JSON.stringify(view.features)!==JSON.stringify(latest.features)||view.schemaVersion!==latest.schemaVersion||view.scope!==latest.scope||JSON.stringify(view.formDefaults)!==JSON.stringify(latest.formDefaults));
 const finishApply=()=>{if(latestRef.current){dirty.current=false;setView(latestRef.current);}dialog.current?.close();trigger.current?.focus();};
 const apply=()=>{if(dirty.current){trigger.current=document.activeElement as HTMLElement;dialog.current?.showModal();}else finishApply();};
 const config=useMemo(()=>interfaceConfig(createKeystaticConfig(view.schemaVersion?{schemaVersion:view.schemaVersion,scope:view.scope}:null,view.features,view.formDefaults?.downloadMode),view.features),[view.features,view.schemaVersion,view.scope,view.formDefaults]);
 const feature=useMemo(()=>currentFeature(),[route]),allowed=feature==null||!!latest&&featureAllowed(latest.features,feature),assembly=getKeystaticBasePath()+'/singleton/siteConfig';
 return <FeatureUiContext.Provider value={{pending,refresh:apply,features:latest?.features||closed}}><div ref={root} style={{fontFamily:'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'}}>
  {(message||pending)&&<aside role="status" style={{padding:'10px 20px',background:'var(--sp-panel)',color:'var(--sp-text)',borderBottom:'1px solid var(--sp-border)',lineHeight:1.6}}>{message||'功能设置已更新。请先保存当前修改，再更新配置入口。'} <button type="button" onClick={()=>pending?apply():void refresh()}>{pending?'更新配置入口':'重试'}</button></aside>}
  {!allowed&&<section role="status" style={{maxWidth:600,margin:'48px auto',padding:24,border:'1px solid var(--sp-border)',borderRadius:12,color:'var(--sp-text)',background:'var(--sp-panel)'}}><h1>此功能暂未开放</h1><p>已有配置和内容仍保留。请在功能总成开启后再编辑。</p><p>如果本页已有未保存内容，可保留本页，另开功能总成进行设置。</p><a href={assembly} target={dirty.current?'_blank':undefined} rel="noreferrer">前往功能总成</a></section>}
  {/\/singleton\/siteConfig\/?$/.test(route)&&<AssemblyNotice/>}
  <dialog ref={dialog} aria-labelledby="assembly-refresh-title" onClose={()=>trigger.current?.focus()} style={{maxWidth:480,width:'calc(100% - 48px)',padding:24,border:'1px solid var(--sp-border)',borderRadius:12,background:'var(--sp-panel)',color:'var(--sp-text)'}}><h2 id="assembly-refresh-title">更新配置入口</h2><p>请先保存当前编辑。更新入口可能关闭部分配置页，未保存的修改不会自动保存。</p><div style={{display:'flex',gap:12,flexWrap:'wrap'}}><button type="button" autoFocus onClick={()=>dialog.current?.close()}>返回继续编辑</button><button type="button" onClick={finishApply}>确认已保存或放弃修改，更新入口</button></div></dialog>
  <div inert={!allowed} style={!allowed?{display:'none'}:undefined} aria-hidden={!allowed}><Keystatic config={config} appSlug={{envName:'PUBLIC_KEYSTATIC_GITHUB_APP_SLUG',value:import.meta.env.PUBLIC_KEYSTATIC_GITHUB_APP_SLUG}}/></div>
 </div></FeatureUiContext.Provider>;
}
