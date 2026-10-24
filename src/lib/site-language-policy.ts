import {readGitBlob,type GitContext} from './site-git';
import {readGitPolicyFile} from './site-policy-git';
const localePaths=['src/data/site-language-settings.json','src/data/site-locales.json'];
export async function readSitePublicLocales(ctx: GitContext, tree: Map<string, string>) {
  const values = await Promise.all(localePaths.map(async path => {
    const sha = tree.get(path);
    if (!sha) throw new Error('无法核验站点语言配置。');
    return JSON.parse(await readGitBlob(ctx, sha));
  }));
  const [legacySettings, brief] = values;
  const settings=await readGitPolicyFile(ctx,tree,localePaths[0],legacySettings);
  return new Set(['en', ...Object.keys(settings.enabledLocales || {}).filter(locale => {
    const entry = brief.locales?.[locale];
    return settings.enabledLocales[locale] === true && entry?.approved === true
      && (brief.requiredPhraseKeys || []).every((key: string) => String(entry.phrases?.[key] || '').trim())
      && Array.isArray(entry.faqs) && entry.faqs.length === brief.requiredFaqCount
      && entry.faqs.every((item: any) => String(item.question || '').trim() && String(item.answer || '').trim());
  })]);
}
