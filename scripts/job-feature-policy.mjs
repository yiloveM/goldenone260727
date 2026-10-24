import {existsSync,readFileSync,realpathSync} from 'node:fs';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {readSiteConfig} from './site-policy.mjs';
import {featurePolicy} from '../src/lib/feature-policy.mjs';
import {loadWranglerVars} from './load-wrangler-vars.mjs';

// Read only: never fetch into the checkout, reset files or recover a closed job
// by rebasing/pushing. A changed branch is stale even if its change was unrelated.
export function assertJobFeatures(root,requirements,{env=process.env,git}={}){
 const read=file=>existsSync(resolve(root,file))?JSON.parse(readFileSync(resolve(root,file),'utf8')):{};
 const features=featurePolicy(readSiteConfig(root),{reviews:read('src/data/customer-reviews.json'),analytics:read('src/keystatic/analytics-dashboard.json'),downloads:read('src/data/catalog-downloads.json'),publisher:read('src/data/article-publisher-settings.json'),aiSeo:read('src/data/ai-seo-settings.json')});
 if(requirements.some(id=>features[id]!==true))throw new Error('This feature is closed; no content was applied. Existing drafts are retained.');
 if(env.GITHUB_ACTIONS==='true'){
  const vars=loadWranglerVars(root),repo=vars.PUBLIC_KEYSTATIC_GITHUB_REPO||vars.KEYSTATIC_GITHUB_REPO,branch=vars.KEYSTATIC_GITHUB_BRANCH||'main';
  const fail=()=>{throw new Error('Queued task identity or branch changed; content was not applied.');};
  if(!repo||repo.toLowerCase()==='ironstraight/businessweb'||env.GITHUB_REPOSITORY!==repo||env.GITHUB_REF_NAME!==branch||env.GITHUB_SERVER_URL!=='https://github.com')fail();
  git||=(args,optional=false)=>{try{return execFileSync('git',args,{cwd:root,encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']}).trim();}catch(error){if(optional&&error.status===1)return '';fail();}};
  if(realpathSync(git(['rev-parse','--show-toplevel']))!==realpathSync(root)||realpathSync(resolve(root,git(['rev-parse','--git-common-dir'])))!==realpathSync(resolve(root,'.git'))||git(['branch','--show-current'])!==branch)fail();
  const url=`https://github.com/${repo}`;
  if(git(['remote','get-url','--all','origin'])!==url||git(['remote','get-url','--push','--all','origin'])!==url||git(['config','--get-all','remote.origin.push'],true)||git(['config','--get-regexp','^url\\..*\\.(insteadOf|pushInsteadOf)$'],true))fail();
  const head=git(['rev-parse','HEAD']),remote=git(['ls-remote','--heads','origin',`refs/heads/${branch}`]).split(/\s+/)[0];
  if(!/^[a-f0-9]{40}$/.test(head)||remote!==head)fail();
 }
 return features;
}
