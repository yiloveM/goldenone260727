import {getRepoFullName,getBranch,getDispatchToken} from './github';
import {readGitHead,readGitTree,readGitFeatureConfig, type GitContext} from '../site-git';
import {siteConfig,reviewSettings,analyticsSettings,downloadSettings,articlePublisherSettings,aiSeoSettings} from '../../data/site-policy';
import {featurePolicy,featureAllowed} from '../feature-policy.mjs';
import {visualSlots} from '../../data/site-visual-slots';
import type {RuntimeEnv} from '../runtime-env';
import {validateVisualControlSlots} from '../site-config-core.mjs';

export function validateFeatureSlots(config:any){validateVisualControlSlots(config,visualSlots);}
export function validFeatureBranch(branch:string){return branch.length>0&&branch.length<=200&&branch!=='@'&&!branch.startsWith('-')&&!/[\x00-\x20\x7f~^:?*\[\\]/.test(branch)&&!branch.includes('..')&&!branch.includes('@{')&&!branch.includes('//')&&!branch.startsWith('/')&&!branch.endsWith('/')&&branch.split('/').every(part=>!part.startsWith('.')&&!part.endsWith('.')&&!part.endsWith('.lock'));}
export async function readFeatureState(env:RuntimeEnv, selectedBranch='',ownerToken=''){
  const branch=selectedBranch||getBranch(env);if(!validFeatureBranch(branch))throw new Error('请选择有效的本站分支。');
  const token=ownerToken||getDispatchToken(env),repo=getRepoFullName(env);
  if(import.meta.env.DEV&&!token){validateFeatureSlots(siteConfig);return{config:siteConfig,features:featurePolicy(siteConfig,{reviews:reviewSettings,analytics:analyticsSettings,downloads:downloadSettings,publisher:articlePublisherSettings,aiSeo:aiSeoSettings}),revision:'local',branch};}
  const expected=String(import.meta.env.PUBLIC_KEYSTATIC_GITHUB_REPO||'');
  if(!token||!expected||repo.toLowerCase()!==expected.toLowerCase())throw new Error('本站功能设置暂时无法读取。');
  const ctx:GitContext={repo,branch,token},head=await readGitHead(ctx),tree=await readGitTree(ctx,head),state=await readGitFeatureConfig(ctx,new Map(tree.tree.filter(item=>item.type==='blob').map(item=>[item.path,item.sha])));
  validateFeatureSlots(state.config);return{...state,revision:head,branch};
}
export const featureResponse=(status=403)=>new Response(status===403?'站长暂未开放此功能，本次未保存；已有内容仍保留。':'暂时无法核验功能设置，本次未保存，请稍后重试。',{status,headers:{'cache-control':'no-store','x-robots-tag':'noindex, nofollow'}});
export function requireFeature(state:Awaited<ReturnType<typeof readFeatureState>>,feature:string|null){return featureAllowed(state.features,feature)?null:featureResponse();}
export function ownerFeatureState(env:RuntimeEnv,request:Request,branch=''){
  const item=(request.headers.get('cookie')||'').split(';').map(part=>part.trim()).find(part=>part.startsWith('keystatic-gh-access-token='));
  let token='';try{token=item?decodeURIComponent(item.slice('keystatic-gh-access-token='.length)):'';}catch{throw new Error('后台会话信息不正确。');}
  return readFeatureState(env,branch,token);
}
