import { githubFetch, getBranch, getRepoFullName } from './manager/github';
import type { RuntimeEnv } from './runtime-env';
export async function keystaticGitAccess(request: Request, env: RuntimeEnv) {
  const raw = request.headers.get('cookie')?.split(';').map(item => item.trim()).find(item => item.startsWith('keystatic-gh-access-token='))?.slice('keystatic-gh-access-token='.length);
  let token = '';
  try { token = decodeURIComponent(raw || ''); } catch { token = ''; }
  if (!token) return null;
  const repo = getRepoFullName(env);
  const user = await githubFetch<{login?:string}>('https://api.github.com/user',token);
  if (!user.login) return null;
  const access = await githubFetch<{permission?:string}>(`https://api.github.com/repos/${repo}/collaborators/${encodeURIComponent(user.login)}/permission`,token);
  return ['admin','maintain','write'].includes(access.permission || '') ? {repo,branch:getBranch(env),token} : null;
}
