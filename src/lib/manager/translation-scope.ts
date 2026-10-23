import { getRepoFullName, getBranch, getDispatchToken, githubFetch } from './github';
import { readGitHead, readGitTree } from '../site-git';
import { readSitePublicLocales } from '../site-language-policy';
export async function managerTranslationScope(env: any) {
  const ctx = { repo: getRepoFullName(env), branch: getBranch(env), token: getDispatchToken(env, 'translation') };
  if (!ctx.token || ctx.repo.toLowerCase() !== String(import.meta.env.PUBLIC_KEYSTATIC_GITHUB_REPO).toLowerCase()) throw new Error('Translation service unavailable');
  const head = await readGitHead(ctx), tree = await readGitTree(ctx, head);
  const files = new Map(tree.tree.filter(item => item.type === 'blob').map(item => [item.path,item.sha]));
  const locales = [...await readSitePublicLocales(ctx, files)].filter(code => code !== 'en');
  return { ctx, locales, files };
}
export async function activeTranslationRuns(ctx: { repo: string; branch: string; token: string }) {
  const results = await Promise.all(['in_progress','queued','waiting','requested','pending'].map(status => githubFetch<{ workflow_runs: any[]; total_count: number }>(`https://api.github.com/repos/${ctx.repo}/actions/workflows/ai-translation.yml/runs?branch=${encodeURIComponent(ctx.branch)}&status=${status}&per_page=100`,ctx.token)));
  if (results.some(result => result.total_count > (result.workflow_runs || []).length)) throw new Error('Too many active tasks');
  const runs=[...new Map(results.flatMap(result => result.workflow_runs || []).filter(run => run.head_branch === ctx.branch && run.status !== 'completed').map(run=>[run.id,run])).values()];
  if (runs.length > 100) throw new Error('Too many active tasks');
  return runs;
}
