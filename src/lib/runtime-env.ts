import { env as cloudflareEnv } from 'cloudflare:workers';

export type RuntimeEnv = Record<string, unknown> | undefined;

export type BackendTaskPurpose = 'manager' | 'translation' | 'publish';

export const DEFAULT_GITHUB_REPO = 'your-org/businessweb';
export const DEFAULT_BRANCH = 'main';

export const getEnvString = (env: RuntimeEnv, key: string) =>
  typeof env?.[key] === 'string' ? env[key].trim() : '';

export const getRuntimeEnv = (locals: unknown) => {
  const processEnv = typeof process !== 'undefined' ? process.env : {};
  const contextEnv = ((locals as any).cfContext?.env || (locals as any).env || {}) as Record<string, unknown>;
  return { ...processEnv, ...cloudflareEnv, ...contextEnv } as RuntimeEnv;
};

export const firstEnvString = (env: RuntimeEnv, keys: string[]) => {
  for (const key of keys) {
    const value = getEnvString(env, key);
    if (value) return value;
  }
  return '';
};

export const getRepoFullName = (env: RuntimeEnv) =>
  firstEnvString(env, ['KEYSTATIC_GITHUB_REPO', 'PUBLIC_KEYSTATIC_GITHUB_REPO']) || DEFAULT_GITHUB_REPO;

export const getBranch = (env: RuntimeEnv) => getEnvString(env, 'KEYSTATIC_GITHUB_BRANCH') || DEFAULT_BRANCH;

const backendTaskTokenKeys: Record<BackendTaskPurpose, string[]> = {
  manager: [
    'MANAGER_DISPATCH_TOKEN',
    'BUSINESSWEB_GITHUB_TOKEN',
    'AI_TRANSLATION_DISPATCH_TOKEN',
    'SITE_PUBLISH_DISPATCH_TOKEN',
    'GITHUB_ACTIONS_DISPATCH_TOKEN',
  ],
  translation: [
    'BUSINESSWEB_GITHUB_TOKEN',
    'AI_TRANSLATION_DISPATCH_TOKEN',
    'MANAGER_DISPATCH_TOKEN',
    'SITE_PUBLISH_DISPATCH_TOKEN',
    'GITHUB_ACTIONS_DISPATCH_TOKEN',
  ],
  publish: [
    'SITE_PUBLISH_DISPATCH_TOKEN',
    'BUSINESSWEB_GITHUB_TOKEN',
    'AI_TRANSLATION_DISPATCH_TOKEN',
    'MANAGER_DISPATCH_TOKEN',
    'GITHUB_ACTIONS_DISPATCH_TOKEN',
  ],
};

export const getBackendTaskToken = (env: RuntimeEnv, purpose: BackendTaskPurpose = 'manager') =>
  firstEnvString(env, backendTaskTokenKeys[purpose]);
