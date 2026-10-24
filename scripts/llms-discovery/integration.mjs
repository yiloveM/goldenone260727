import {readPolicyFile} from '../site-policy.mjs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { generateDiscovery } from './generate.mjs';
import { verifyDiscovery } from './verify.mjs';

export function llmsDiscovery(){
  let config;
  return {name:'businessweb-llms-discovery',hooks:{
    'astro:config:done':({config:resolved})=>{config=resolved;},
    'astro:build:done':async({dir,pages,logger})=>{
      const root=fileURLToPath(config.root), outputDir=fileURLToPath(dir);
      const manifest=JSON.parse(await readFile(resolve(outputDir,'llms.txt'),'utf8'));
      const settings=readPolicyFile(root,'src/data/ai-seo-settings.json');
      const report=await generateDiscovery({outputDir,routePaths:pages.map(page=>page.pathname),manifest,settings,origin:config.site});
      const verification=await verifyDiscovery({outputDir,origin:config.site});
      logger.info(`llms.txt v2: ${JSON.stringify(report)}`);
      logger.info(`llms.txt verified: ${JSON.stringify(verification)}`);
    }
  }};
}
