import {readFile} from 'node:fs/promises';

// esbuild does not implement Vite's import.meta.glob macro. Tests explicitly
// supply their policy mode; the production entry keeps the real macro call.
export const sitePolicyFixture=(config=null)=>({
  name:'explicit-site-policy-fixture',
  setup(builder){builder.onLoad({filter:/[\\/]site-policy\.ts$/},async args=>({
    loader:'ts',contents:(await readFile(args.path,'utf8')).replace(/const configs\s*=.*?;\r?\n/, 'const configs='+JSON.stringify(config?{'./site-config.json':config}:{})+';\n')
  }));}
});
