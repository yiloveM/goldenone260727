import { mkdirSync, writeFileSync } from 'node:fs';
import {fileURLToPath} from 'node:url';

export default function keystatic() {
  return {
    name: 'keystatic-cloudflare',
    hooks: {
      'astro:config:setup': ({ injectRoute, updateConfig, config }) => {
        updateConfig({
          server: config.server.host ? {} : { host: '127.0.0.1' },
          vite: {
            plugins: [
              {
                name: 'keystatic',
                resolveId(id) {
                  if (id === 'virtual:keystatic-config') {
                    return this.resolve('./keystatic.config', './a');
                  }
                  return null;
                },
              },
            ],
            optimizeDeps: {
              entries: ['keystatic.config.*', '.astro/keystatic-imports.js'],
            },
          },
        });

        const dotAstroDir = new URL('./.astro/', config.root);
        mkdirSync(dotAstroDir, { recursive: true });
        writeFileSync(
          new URL('keystatic-imports.js', dotAstroDir),
          `import "@keystatic/astro/ui";
import "@keystatic/astro/api";
import "@keystatic/core/ui";
`
        );

        injectRoute({
          entryPoint: fileURLToPath(new URL('../keystatic/feature-page.astro',import.meta.url)),
          entrypoint: fileURLToPath(new URL('../keystatic/feature-page.astro',import.meta.url)),
          pattern: '/keystatic/[...params]',
          prerender: false,
        });
      },
    },
  };
}
