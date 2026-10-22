import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { parse } from 'yaml';

export const nativeIdentityPaths = ['src/content/sitePages','src/content/pageTranslations','src/data/site-language-settings.json','src/data/site-locales.json'];
export function verifiedBuildCommit(root,paths) {
  const git = args => execFileSync('git', ['-C', root, ...args], {encoding:'utf8',windowsHide:true}).trim();
  try {
    if(git(['rev-parse','--show-toplevel']).replaceAll('\\','/').toLowerCase() !== root.replaceAll('\\','/').replace(/\/$/,'').toLowerCase()) return '';
    return git(['status','--porcelain','--untracked-files=all','--',...paths]) ? '' : git(['rev-parse','HEAD']);
  } catch {return '';}
}
export function siteBuildIdentity(root) {
  const commit=verifiedBuildCommit(root,['src/content','src/data/site-language-settings.json','src/data/site-locales.json']);
  const nativeCommit=verifiedBuildCommit(root,nativeIdentityPaths);
  const files = {};
  for (const collection of ['products', 'blog', 'productTranslations', 'blogTranslations']) {
    for (const name of readdirSync(join(root, 'src/content', collection))) {
      if (!name.endsWith('.mdoc') || /^(?:placeholder-|template-example-)/.test(name)) continue;
      const text = readFileSync(join(root, 'src/content', collection, name), 'utf8').replace(/\r\n/g, '\n');
      const match = text.match(/^---\s*\n([\s\S]*?)\n---/);
      if (!match) continue;
      const data = parse(match[1]);
      const summary = Object.fromEntries(['title','sourceSlug','sourceTitle','locale','published','generatedAt','category'].filter(key => data[key] !== undefined).map(key => [key, data[key]]));
      files[`src/content/${collection}/${name}`] = { sha: createHash('sha1').update(`blob ${Buffer.byteLength(text)}\0${text}`).digest('hex'), data: summary };
    }
  }
  return { name: 'site-build-identity', resolveId(id) { if (id === 'virtual:site-build-identity') return '\0' + id; },
    load(id) { if (id === '\0virtual:site-build-identity') return `export default ${JSON.stringify({ commit, nativeCommit, files })};`; } };
}
