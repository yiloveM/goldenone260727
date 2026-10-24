import type { APIRoute } from 'astro';
import { getRuntimeEnv } from '../../../lib/runtime-env';
import { requireInternalPortalAccess } from '../../../lib/admin-portals';
import { getRepoFullName, getBranch, workflowRunsUrl } from '../../../lib/manager/github';
import {readGitHead,readGitTree} from '../../../lib/site-git';
import {readGitPolicyFile} from '../../../lib/site-policy-git';
import { configSnapshot } from '../../../../scripts/llms-discovery/config.mjs';
export const prerender=false;
export const GET:APIRoute=async({locals,request,cookies})=>{
  const env=getRuntimeEnv(locals),denied=requireInternalPortalAccess(request,env,'keystatic');if(denied)return denied;
  try{
    const assets=env?.ASSETS as {fetch:(request:Request)=>Promise<Response>}|undefined;
    if(!assets)return new Response('状态尚未生成。',{status:503});
    const result=await assets.fetch(new Request(new URL('/_llms/status.json',request.url)));
    if(!result.ok)return new Response('状态尚未生成。',{status:503});
    const report=await result.json() as Record<string,any>;
    const repo=getRepoFullName(env),branch=getBranch(env),token=cookies.get('keystatic-gh-access-token')?.value;
    if(!token)return new Response('请重新登录站长后台。',{status:401});
    const ctx={repo,branch,token},head=await readGitHead(ctx),currentTree=await readGitTree(ctx,head);
    const tree=new Map(currentTree.tree.filter(x=>x.type==='blob').map(x=>[x.path,x.sha]));
    const current=await readGitPolicyFile(ctx,tree,'src/data/ai-seo-settings.json');
    const bytes=new TextEncoder().encode(configSnapshot(current));
    const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),byte=>byte.toString(16).padStart(2,'0')).join('');
    return Response.json({enabled:report.enabled,matchesCurrent:hash===report.configHash,locales:report.locales,limits:report.limits,skipped:report.skipped,logsUrl:workflowRunsUrl(repo,'site-publish.yml')},{headers:{'cache-control':'private, no-store','x-robots-tag':'noindex'}});
  }catch{return new Response('生成状态暂时无法读取，请稍后重试。',{status:503,headers:{'cache-control':'no-store'}});}
};
