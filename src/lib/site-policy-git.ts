import { readGitBlob, readGitHead, readGitTree, type GitContext } from './site-git';
import { getRepoFullName, getBranch, getDispatchToken } from './manager/github';
import { effectivePolicyFile, parseSiteConfig } from './site-config-core.mjs';
import type { RuntimeEnv } from './runtime-env';
export async function readGitPolicyFile(ctx: GitContext, tree: Map<string, string>, file: string, legacy?: unknown) {
    const sha = tree.get('src/data/site-config.json');
    const config = sha ? parseSiteConfig(JSON.parse(await readGitBlob(ctx, sha))) : null;
    const data = tree.has(file) ? JSON.parse(await readGitBlob(ctx, tree.get(file)!)) : legacy ?? {};
    return effectivePolicyFile(file, data, config);
}
export async function readManagerPolicyFile(env: RuntimeEnv, file: string, legacy: unknown) {
    return (await readManagerPolicyFiles(env, { [file]: legacy }))[file];
}
export async function readManagerPolicyFiles(env: RuntimeEnv, legacyFiles: Record<string, unknown>) {
    const ctx = { repo: getRepoFullName(env), branch: getBranch(env), token: getDispatchToken(env) };
    const head = await readGitHead(ctx), result = await readGitTree(ctx, head);
    const tree = new Map(result.tree.filter(x => x.type === 'blob').map(x => [x.path, x.sha]));
    return Object.fromEntries(await Promise.all(Object.entries(legacyFiles).map(async ([file, legacy]) => [file, await readGitPolicyFile(ctx, tree, file, legacy)])));
}
