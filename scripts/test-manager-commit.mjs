import assert from 'node:assert/strict';
import {mkdtemp,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {commitManagerContent} from './commit-manager-content.mjs';
await mkdir('.sandbox/manager-commit-tests',{recursive:true});
const root=await mkdtemp(resolve('.sandbox/manager-commit-tests/run-'));await mkdir(resolve(root,'.git'));
const path='src/content/products/product.mdoc',base='a'.repeat(40),next='b'.repeat(40),repo='fixture/customer';
let config={},calls=[],staged='',committed=false;
function git(args){
 const command=args.join(' ');calls.push(command);if(Object.hasOwn(config,command))return config[command];
 if(command==='rev-parse --show-toplevel')return root;
 if(command==='rev-parse --git-common-dir')return '.git';
 if(command==='branch --show-current')return 'main';
 if(command.startsWith('remote get-url'))return `https://github.com/${repo}`;
 if(command==='diff --cached --name-only')return staged;
 if(command.startsWith('status --porcelain'))return ' M '+path;
 if(command==='rev-parse HEAD')return committed?next:base;
 if(command==='rev-parse FETCH_HEAD')return base;
 if(command.startsWith('add -- ')){staged=path;return '';}
 if(command.startsWith('commit -m ')){committed=true;return '';}
 if(command.startsWith('ls-remote'))return next+'\trefs/heads/main';
 return '';
}
const options={root,kind:'product',vars:{PUBLIC_KEYSTATIC_GITHUB_REPO:repo,KEYSTATIC_GITHUB_BRANCH:'main'},env:{CONTENT_PATH:path,GITHUB_REPOSITORY:repo,GITHUB_REF_NAME:'main',GITHUB_SERVER_URL:'https://github.com'},git};
let checks=0;
function rejects(patch={},gitConfig={}){calls=[];staged='';committed=false;config=gitConfig;assert.throws(()=>commitManagerContent({...options,...patch}),/identity, path or branch/);assert.ok(!calls.some(x=>x.startsWith('push ')));checks++;}
rejects({env:{...options.env,GITHUB_REPOSITORY:'other/customer'}});
rejects({env:{...options.env,CONTENT_PATH:'../customer/products/a.mdoc'}});
rejects({}, {'remote get-url --push --all origin':'https://github.com/fixture/customer\nhttps://github.com/other/customer'});
rejects({}, {'config --get-all remote.origin.push':'HEAD:main'});
rejects({}, {'branch --show-current':'preview/other'});
rejects({}, {'diff --cached --name-only':'owner-file.txt'});
rejects({}, {'rev-parse FETCH_HEAD':'c'.repeat(40)});
calls=[];config={};staged='';committed=false;assert.deepEqual(commitManagerContent(options),{changed:true,commit:next});assert.ok(calls.includes('push origin HEAD:refs/heads/main'));assert.deepEqual(calls.filter(x=>x.startsWith('add ')),['add -- '+path]);checks++;
console.log(JSON.stringify({passed:checks,cloudWrites:'NONE'}));
