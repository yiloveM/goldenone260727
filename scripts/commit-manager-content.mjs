import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadWranglerVars } from './load-wrangler-vars.mjs';
export function commitManagerContent({kind,root=process.cwd(),env=process.env,vars=loadWranglerVars(root),git}={}) {
  git ||= (args,optional=false)=>{try{return execFileSync('git',args,{cwd:root,encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']}).trim();}catch(error){if(optional&&error.status===1)return '';throw new Error('Git operation failed; changes were not force-pushed.');}};
  const fail=()=>{throw new Error('Content write identity, path or branch changed; reopen the latest draft.');};
  const path=env.CONTENT_PATH||'';
  const allowed={product:/^src\/content\/products\/[a-z0-9-]+\.mdoc$/,blog:/^src\/content\/blog\/[a-z0-9-]+\.mdoc$/,review:/^src\/data\/customer-reviews\.json$/};
  if(!allowed[kind]?.test(path))fail();
  const repo=vars.PUBLIC_KEYSTATIC_GITHUB_REPO||vars.KEYSTATIC_GITHUB_REPO,branch=vars.KEYSTATIC_GITHUB_BRANCH||'main';
  if(!repo||env.GITHUB_REPOSITORY!==repo||env.GITHUB_REF_NAME!==branch||env.GITHUB_SERVER_URL!=='https://github.com')fail();
  const absolute=value=>realpathSync(resolve(root,value));
  if(absolute(git(['rev-parse','--show-toplevel']))!==absolute(root)||absolute(git(['rev-parse','--git-common-dir']))!==absolute('.git')||git(['branch','--show-current'])!==branch)fail();
  const expected=`https://github.com/${repo}`;
  if(git(['remote','get-url','origin'])!==expected||git(['remote','get-url','--push','origin'])!==expected||git(['remote','get-url','--push','--all','origin'])!==expected
    ||git(['config','--get-all','remote.origin.push'],true)||git(['config','--get-regexp','^url\\..*\\.(insteadOf|pushInsteadOf)$'],true))fail();
  git(['check-ref-format',`refs/heads/${branch}`]);
  if(git(['diff','--cached','--name-only']))fail();
  if(!git(['status','--porcelain','--',path]))return {changed:false};
  const base=git(['rev-parse','HEAD']);
  git(['fetch','--no-tags','origin',`refs/heads/${branch}`]);
  if(git(['rev-parse','FETCH_HEAD'])!==base)fail();
  git(['config','user.name','github-actions[bot]']);git(['config','user.email','41898282+github-actions[bot]@users.noreply.github.com']);
  git(['add','--',path]);if(git(['diff','--cached','--name-only'])!==path)fail();
  git(['commit','-m',`Apply manager ${kind} draft [skip ci]`]);
  git(['push','origin',`HEAD:refs/heads/${branch}`]);
  const commit=git(['rev-parse','HEAD']);
  if(git(['ls-remote','--heads','origin',`refs/heads/${branch}`]).split(/\s/)[0]!==commit)fail();
  return {changed:true,commit};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  try {console.log(JSON.stringify(commitManagerContent({kind:process.argv[2]})));}
  catch(error){console.error(error.message);process.exitCode=1;}
}
