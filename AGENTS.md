# BusinessWeb Codex Operating Rules

This repository is a reusable international B2B business website, not an internal admin product. Public pages must always speak to external buyers, specifiers, distributors, project teams, and decision makers.

## Detect the two build requests

Treat either of these user requests as a required workflow, even if the user does not name a skill:

- An industry plus one or more core keywords, optionally with target languages: run the phase-one industry build.
- `全站SEO和GEO优化` or an equivalent request with an industry and keywords: run the phase-two current-data SEO/GEO workflow.

Read `.agents/skills/businessweb-seo-geo/SKILL.md` before acting. Use `src/data/industry-profile.json` as the single public brand and market brief. Use `src/data/site-language-settings.json`, edited through `/keystatic/` **网站语言**, as the only source of truth for enabled target locales. The source language stays English; target locales are translations, not a replacement source language.

## Non-negotiable system boundaries

- Keep `/keystatic/` as the owner-only Git-backed surface.
- Keep `/manager/` as the content-administrator portal with D1 drafts, R2 media, review, and approval/write-back flow.
- Preserve the custom Keystatic fields, AI translation APIs/workflow, R2 routes, Astro 6 Cloudflare Workers adapter, KV session binding, D1 binding, contact workflow, and publish workflow.
- Keep `/keystatic/`, `/manager/`, `/api/`, and `/r2/` out of public indexing.
- Do not use fabricated prices, availability, reviews, ratings, certifications, manufacturing claims, customer logos, dates, contact information, or case studies.

## Required verification

After meaningful public, content-schema, or deployment changes, run:

```powershell
npm run check
npm run check:template
npm run build
```

Before a real production launch, run `npm run check:template:production` after the industry brief, company information, and product data are verified.
