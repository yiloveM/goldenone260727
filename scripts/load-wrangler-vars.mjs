import { resolve } from 'node:path';
import { unstable_readConfig } from 'wrangler';

export const loadWranglerVars = (projectRoot = process.cwd()) => {
  const config = unstable_readConfig(
    { config: resolve(projectRoot, 'wrangler.toml') },
    { hideWarnings: true }
  );

  return Object.fromEntries(
    Object.entries(config.vars || {}).filter(([, value]) => typeof value === 'string')
  );
};
