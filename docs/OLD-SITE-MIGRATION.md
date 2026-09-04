# Authorized Old-Site Migration

This workflow applies only when the project owner explicitly authorizes a public legacy-site migration and supplies its URL, for example `旧站迁移+https://old.example.com`.

## Input boundaries

Keep the sources distinct:

| Input | Authority |
| --- | --- |
| BusinessWeb template | Astro/Workers engineering, Keystatic, Manager, R2, D1, KV, localization, SEO primitives, publishing |
| Authorized old site | Real information architecture, copy, product data, metadata, JSON-LD, media, documents, and URL paths |
| Named reference sites | Visual language, composition, spacing, media proportions, controls, hover, motion, and palette |
| Current industry research | Buyer tasks, information expectations, language style, current interaction conventions, and avoid patterns |

The old site does not control the new visual layer unless the owner also names it as a design reference. A visual reference does not authorize copying its brand, text, logo, or media.

## 1. Capture the authorized site

From the repository root:

```powershell
npm run oldsite:crawl -- --url "https://old.example.com" --authorized --rebuild
```

The crawler discovers sitemaps from `robots.txt` and `/sitemap.xml`, follows sitemap indexes, follows same-origin public HTML links, archives raw HTML, extracts page and image metadata, and downloads referenced public assets. An optional `--proxy "http://proxy.example:port"` may be supplied when the execution environment requires one.

Useful options:

```powershell
# Metadata and raw pages only
npm run oldsite:crawl -- --url "https://old.example.com" --authorized --metadata-only --rebuild

# Raise or lower the crawl safety limit
npm run oldsite:crawl -- --url "https://old.example.com" --authorized --max-pages 8000 --rebuild

```

Never remove `--authorized` from the tool. Never use private credentials, bypass authentication, or capture non-public administration areas.

## 2. Local data contract

The generated `/oldsite` directory remains local and is ignored by Git:

```text
oldsite/
  manifest.json
  route-map.json
  pages.json
  pages.jsonl
  assets-manifest.json
  contacts-extracted.json
  crawl-errors.json
  raw/pages/
  raw/sitemaps/
  assets/
```

- `raw/` is the loss-resistant source archive.
- `pages.json` maps each page to copy, headings, tables, JSON-LD, metadata, links, images, contacts, and its raw source file.
- `assets-manifest.json` maps every asset URL to source pages, SEO metadata, hashes, and local files.
- `route-map.json` proposes every exact old pathname as the new primary route.
- Source-reported claims still require owner verification before production.

## 3. Build page folders and the R2 package

```powershell
npm run oldsite:prepare -- --bucket "client-site-content" --cdn-base "https://cdn.example.com"
```

This creates:

```text
oldsite/
  page-assets/<page-type>/<old-route>/assets.json
  page-assets-index.json
  r2-object-map.json
  R2-UPLOAD-GUIDE.md
  r2-upload/legacy/
    r2-upload-manifest.json
    upload.ps1
    images/
    documents/
    media/
    fonts/
```

Every page has a separate maintenance folder. Shared source assets may receive separate page-scoped R2 keys so a content manager can understand ownership without reconstructing crawler history. Every filename combines the original page URL slug, the best authorized source description (`alt`, `title`, caption, or original filename), a distinct semantic role when same-page descriptions repeat, and a short content hash. Review each manifest item's `seoKeyBasis` against the researched keyword-to-page map before upload; do not inject unrelated popular terms. The hash makes long-lived immutable caching safe.

Readable filenames improve operations and URL clarity, but do not by themselves create image rankings. Crawlable page context, accurate alt text, surrounding copy, image quality, stable dimensions, performance, and metadata remain more important.

## 4. Upload exactly by mapping

Open PowerShell in the generated package folder. The uploader reads `r2-upload-manifest.json`; it does not infer an object key from the drive path or add local wrapper folders.

```powershell
cd .\oldsite\r2-upload\legacy
.\upload.ps1 -Bucket 'client-site-content' -DryRun
.\upload.ps1 -Bucket 'client-site-content'
```

For every manifest item, Wrangler receives the exact destination in the form `<bucket>/<r2ObjectKey>` and the exact mapped local file. Running the command from any copied package folder therefore produces the same R2 keys.

After upload, configure `PUBLIC_R2_ASSET_BASE_URL`, verify sample CDN URLs, and replace all old-host media references with the generated CDN mapping. Keep the old archive and manifests for future Manager maintenance.

## 5. Preserve SEO routes and metadata

1. Implement every viable `targetPath` exactly, including historic `.html` filenames and nested paths.
2. Use the exact old pathname as the primary public route. Do not add a 301 for the same path.
3. Reuse owner-authorized titles, descriptions, canonical intent, Open Graph fields, image alt/title/caption metadata, headings, product tables, and internal-link relationships where accurate.
4. Update canonical origins to the new production origin while retaining the path.
5. Include retained routes in sitemap and internal navigation.
6. Add 301 redirects only for genuinely retired, conflicting, malformed, or intentionally consolidated paths, and record each decision.
7. Run the build, then `npm run oldsite:audit -- --origin "https://www.example.com"`.

## 6. Rework language without changing facts

Research current Google-ranking sites for the target industry and market. Use that evidence to improve terminology, sentence length, information density, headings, calls to action, and buyer clarity. Remove formulaic AI phrases, repetitive category labels, unsupported superlatives, and vague filler.

Do not change model numbers, dimensions, materials, standards, performance, company details, dates, or commercial claims unless the owner supplies corrected evidence. Keep a review list for contradictions and unverifiable statements.

## 7. Completion gate

- Every old route is implemented, intentionally redirected, or documented as unresolved.
- Every visible old-host media URL is replaced by the R2/CDN mapping.
- Page-to-asset and local-file-to-R2-key mappings remain available.
- Product parameters and source metadata are preserved or explicitly corrected.
- Desktop and mobile navigation, menus, galleries, tabs, forms, sharing, inquiry flows, focus, hover, and reduced motion work in a real browser.
- `npm run check`, `npm run check:template`, `npm run build`, and `npm run oldsite:audit` pass.
