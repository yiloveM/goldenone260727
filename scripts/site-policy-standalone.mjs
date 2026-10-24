import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { resolve, relative, isAbsolute } from 'node:path';
import { parseSiteConfig, effectivePolicyFile } from '../src/lib/site-config-core.mjs';
export function readSiteConfig(root) {
    const file = resolve(root, 'src/data/site-config.json');
    if (!existsSync(file))
        return null;
    const rel = relative(realpathSync(root), realpathSync(file));
    if (rel.startsWith('..') || isAbsolute(rel))
        throw new Error('Site configuration escapes target root.');
    return parseSiteConfig(JSON.parse(readFileSync(file, 'utf8')));
}
export function readPolicyFile(root, file, legacy) {
    if (legacy === undefined)
        legacy = JSON.parse(readFileSync(resolve(root, file), 'utf8'));
    return effectivePolicyFile(file, legacy, readSiteConfig(root));
}
