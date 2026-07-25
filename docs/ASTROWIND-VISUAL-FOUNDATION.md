# AstroWind Visual Foundation

## Purpose

The public-facing BusinessWeb shell uses an AstroWind-inspired visual foundation: a centered image-backed hero, restrained navigation, editorial content spacing, simple action buttons, image-led interior banners, and low-decoration content panels.

The reference is [AstroWind](https://github.com/arthelokyo/astrowind), an MIT-licensed Astro template. This project does not vendor AstroWind source code, content, images, or application configuration. `src/styles/astrowind-visual-foundation.css` remains original CSS, while `src/styles/home-tailwind.css` provides a deliberately scoped Tailwind 4 utility layer for the English and localized home pages on Astro 6.

## Isolation Boundary

Only the public visual layer changes:

- `src/styles/astrowind-visual-foundation.css` overrides presentation after `global.css`.
- `src/styles/home-tailwind.css` imports Tailwind theme and utilities only, with a `tw:` prefix and explicit homepage sources. It intentionally omits Tailwind Preflight, so it cannot reset Keystatic, manager, or established public-page styles.
- `BaseLayout.astro` remains the owner of metadata, JSON-LD, hreflang, canonical URLs, navigation data, language switching, and footer routes.
- The English and localized home templates only receive stable presentation classes and Tailwind utilities; content collections, links, JSON-LD, and interaction code remain unchanged.

The following systems are intentionally outside the visual layer and must not be replaced by a theme migration:

- Keystatic GitHub storage and all custom fields.
- `/manager/`, D1 drafts, RBAC, and GitHub Actions write-back.
- R2 image picker, image pool, asset APIs, and public R2 delivery route.
- Cloudflare KV session binding, D1 binding, R2 binding, generated Worker types, and Workers configuration.
- AI translation workflows and Gemini environment variables.
- SEO/GEO schema generation, `robots.txt`, sitemap, hreflang, product catalog JSON, and `llms.txt`.

## Verification

Run these checks from the project root after any design change:

```powershell
npm run check:continuity
npm run check:template
npm run build
```

`npm run check:template` also verifies that `worker-configuration.d.ts` still matches `wrangler.toml`. Regenerate the file with `npm run types:cloudflare` after changing a binding or compatibility setting.

After the template is synchronized to `businessweb`, verify both the functional contract and every source file hash:

```powershell
npm run check:continuity -- --compare businessweb
```

The continuity audit intentionally validates code markers for the runtime, Keystatic, manager, R2, D1, AI translation, deployment workflows, structured data, and search-discovery outputs. It does not validate live credentials or external Cloudflare resources; use the README deployment checklist for those production checks.
