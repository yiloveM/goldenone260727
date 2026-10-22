import {transform} from 'esbuild';

// Astro deliberately emits readable SSR modules and Cloudflare uploads them
// with no_bundle. Wrangler --minify only affects its tiny entry wrapper.
// Remove whitespace in the existing build, preserving identifiers, semantics,
// Unicode content and legal notices; no new runtime or deployment chain.
export const compactWorkerChunks=()=>({
  name:'businessweb-compact-worker-chunks',apply:'build',enforce:'post',
  async renderChunk(code,chunk){
    if(!chunk.fileName.endsWith('.mjs'))return null;
    const result=await transform(code,{loader:'js',format:'esm',target:'esnext',charset:'utf8',minifyWhitespace:true,minifyIdentifiers:false,minifySyntax:false,legalComments:'eof',sourcefile:chunk.fileName,sourcemap:true});
    return {code:result.code,map:result.map};
  },
});
