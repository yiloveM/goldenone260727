# Golden One Codex Operating Rules

This repository is the in-progress Golden One international commercial website, not an untouched template or an internal admin product. Preserve the Golden One brand, metal-gift product architecture, public visual layer, content, artwork-upload inquiry flow, URLs, and production resource identities.

## Detect the two build requests

Treat either of these user requests as a required workflow, even if the user does not name a skill:

- An industry plus one or more core keywords, optionally with target languages: run the phase-one industry build.
- `全站SEO和GEO优化` or an equivalent request with an industry and keywords: run the phase-two current-data SEO/GEO workflow.

Read `.agents/skills/businessweb-seo-geo/SKILL.md` before acting. Use `src/data/industry-profile.json` as the single public brand and market brief. Use `src/data/site-language-settings.json`, edited through `/keystatic/` **网站语言**, as the only source of truth for enabled target locales. The source language stays English; target locales are translations, not a replacement source language.

## Non-negotiable system boundaries

- Keep `/keystatic/` as the owner-only Git-backed surface.
- Keep `/manager/` as the content-administrator portal with D1 drafts, R2 media, review, and approval/write-back flow.
- In production, expose those surfaces only through two different dedicated custom domains plus two different secret UUID entry paths. Both portals must then require the configured GitHub App slug as username and `KEYSTATIC_SECRET` as password before opening a 12-hour signed session.
- Keep the two UUIDs, GitHub App Client Secret, portal password, and backend GitHub token in Cloudflare Worker encrypted Secrets, never in committed files. The GitHub App Client Secret is the root for purpose-separated runtime secrets; do not restore separate session, analytics, or contact-form secrets.
- Do not add Cloudflare Access JWT/email verification or browser-stored Manager bearer tokens unless the owner explicitly requests a separate identity layer.
- Preserve the custom Keystatic fields, AI translation APIs/workflow, R2 routes, Astro 6 Cloudflare Workers adapter, KV session binding, D1 binding, contact workflow, and publish workflow.
- Keep `/keystatic/`, `/manager/`, `/api/`, and `/r2/` out of public indexing.
- Do not use fabricated prices, availability, reviews, ratings, certifications, manufacturing claims, customer logos, dates, or case studies.
- While `industry-profile.json` is in `template` or `briefed` lifecycle, clearly recognizable sample email, phone, WhatsApp, and address values may remain visible for frontend visual comparison. Keep them obviously exemplary; do not replace them with realistic but unverified company details.
- Before a real production launch, replace or verify every sample contact value. `npm run check:template:production` must reject remaining sample contacts.

## Deployment ownership boundary

- This boundary is owner-locked. No AI or automation may change it without the owner's explicit approval for that specific change.
- `.github/workflows/site-publish.yml` is the only site build/deploy system. It deploys qualifying `main` pushes automatically and keeps `workflow_dispatch` for explicit owner or administrator publishing.
- Cloudflare Workers Builds and its Git repository connection must remain disabled or disconnected. Never chain a GitHub Actions build into Workers Builds or perform two production builds for one publish request.
- Product, article, translation, site-language, and Keystatic JSON write-backs remain excluded from automatic deployment so drafts wait for explicit publishing. `src/data/customer-reviews.json` remains deploy-triggering.
- GitHub Actions content write-back jobs must not build or deploy the site themselves; only a resulting non-excluded commit may trigger `site-publish.yml`.
- The deployment workflow reads only `CLOUDFLARE_API_TOKEN` from GitHub Secrets. Golden One's Cloudflare Account ID remains in `wrangler.toml`; do not add a second Account ID variable without owner approval.
- Keep `keep_vars = true` so Wrangler deployments preserve Cloudflare Dashboard variables. Never commit Worker Secret values.

## README structure

- Keep `README.md` in this exact seven-chapter order: Repo feature summary; step-by-step deployment; collapsed Keystatic guide; collapsed Manager guide; important project locations; collapsed two-stage Codex build flow; collapsed troubleshooting guide.
- Update information only in its matching chapter. Do not rename, reorder, split, merge, or add peer chapters without owner approval.
- Keep deployment ownership, portal login, variable setup, publish rules, and verified incident conclusions. Avoid reference-document lists and repeated warnings.

## Required verification

After meaningful public, content-schema, or deployment changes, run:

```powershell
npm run types:cloudflare -- --check
npm run check
npm run check:template
npm run build
```

Before a real production launch, run `npm run check:template:production` after the industry brief, company information, and product data are verified.
