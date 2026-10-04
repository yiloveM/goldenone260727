# Golden One Codex Operating Rules

## Workspace governance

Lifecycle: `building`. Current workspace directory: `goldenone002-building/`
(formerly `goldenone002/`). The owner's standing instruction authorizes delivery
of approved work to this repository's `main`, including its existing Actions
publish workflow. A temporary branch is optional; finish integration and push
to `main` without another push confirmation. An explicit no-push/branch-only
task overrides this default. Reachable custom domains and a `production-ready`
content field do not mean the customer has accepted commercial launch. Preserve
this status in standalone clones until the owner changes it. Record before SHA,
change commits, checks, push/CI and scoped revert instructions in the local log.
This does not authorize DNS changes, live data migrations or other customers.

Accept concrete owner-provided/confirmed facts without repeated external proof.
Check model mapping, units, missing values and contradictions; the agent owns
research/visual/SEO metadata, not the client. Do not add evidence-per-field forms,
invent missing counts/prices or equate search-engine eligibility with business
truth. Owner confirmation can satisfy `factsVerified` for its confirmed scope.
Governance/path-only edits need diff, reference and isolation checks, not a full
site build; reuse valid checks and observe CI when a runtime release is triggered.

This is an independent Git root for `yiloveM/goldenone260727`, not the
mother template. When this checkout lives under `webtemp`, read
`../AGENTS.md`, `../CODEX-MASTER-INSTRUCTION.en.md` and
`../docs/REPOSITORY-MAP.md` first.
The parent owns shared governance; this file retains Golden One-specific
constraints and protects standalone clones, where parent instructions may
not exist or auto-load. This English `AGENTS.md` takes precedence over its
`AGENTS.zh-CN.md` translation.

Before any remote write, verify this Git root, requested branch, exact staged
files, and both origin URLs resolve to `yiloveM/goldenone260727`. Never
push mother or another customer content here, or push this repository to
their remotes. Direct network first; retry port 7890 only after connection
failure. Switch the existing `gh` account if needed and judge real API/push
feedback; do not treat sandbox denial as a credential failure.

Record reusable engineering additions in `docs/CAPABILITY-REGISTER.md` and,
when the mother checkout is available, its `新增工程能力清单.txt` pending
section. A candidate is not an approved backport. When this site's capability
actually changes, update the existing README capability list and related
instructions in place without changing its eight-chapter layout.

Use the existing `docs/PROJECT-PROGRESS.md` as the single operational record:
dated, branch-scoped current status at the top, concise handoffs below. Record
integration, configuration, switch state and verification separately, with
evidence and next action/responsible party. Enabled is not working; not audited
is not missing. Distinguish intentional off/owner-deferred from pending activation
and machine-local access from deployed service state. Read this overview and
the latest relevant handoff at task start; update only affected rows, not every
customer or service. Pending rows do not authorize changes, repeated setup
requests or reminders in unrelated tasks. Preserve owner deferrals.
README is a stable deployment/use manual: update it only for actual supported
behavior or procedure changes, never to mirror toggles, temporary incidents,
missing credentials or to-do lists. Keep its original configuration instructions
and chapter layout. Explain purpose, prerequisites, steps and expected results
for human owners/administrators, not an AI handoff. Before editing README,
distinguish a changed reusable instruction from this task's outcome/state;
the latter belongs only in progress. Do not erase valid setup requirements to
hide an incomplete flow. Group status by feature, not every product/image.
Capability ledgers retain engineering provenance, approval,
dependencies, compatibility and rollback; link current status here rather than
maintaining another live table. Do not create a new status/protocol file.

Record in `docs/PROJECT-PROGRESS.md` only what another agent needs for
resumption, release/recovery, capability work, or repository/governance changes:
one concise entry per batch content/media change, mapping/parameter change,
release, consequential external-state change, or unfinished task. Normally use
3-5 short lines covering scope, branch/baseline/change reference, relevant checks,
actual delivery state, and pending/next/recovery steps. Completed low-risk copy
or single-image fixes with no handoff/release impact need no separate entry;
Git is sufficient. Advice-only answers, downloads, conversions, upload/retry
steps, and cleanup statistics are not progress entries. Preserve historical
records; keep secrets out and never invent deployment status. The mother log,
when available, contains only a cross-workspace summary, not duplicated detail.

This customer project has its own release and compatibility state, not an
automatic mirror of the mother. For a selected CAP/revision, inspect the
local register, code, settings and data before classifying it; keep
implementation, enablement, preview validation and production release distinct.
`NOT AUDITED` is not `missing`. For approved changes, adapt minimum dependencies
using an isolated branch when useful, test old data and rollback, then integrate
and push `main` under the building authorization above. The mother's master instruction section 13
supplies details when available; a standalone clone uses these rules and its
local register. Maintain the existing entries without adding another governance
document. On another computer, read local progress and verify branch, HEAD and
origin before continuing. At task start,
lightly check mother GSC MCP availability if the mother exists. Use it only
for GSC work after exact property verification; missing machine-local tools
or credentials do not authorize site runtime or production changes.

Never modify/delete files outside the project workspace. Before batch deletion
(multiple files, directory, recursive or wildcard), show the exact resolved
targets and purpose in an interactive warning and wait for the owner's exact
`确认`. If the request ends in `静默处理无需汇报`, omit routine updates but
retain tests, safety/Git checks, required handoff records, necessary approvals, and a
brief final summary.

This repository is the in-progress Golden One international commercial website, not an untouched template or an internal admin product. Preserve the Golden One brand, metal-gift product architecture, public visual layer, content, artwork-upload inquiry flow, URLs, and production resource identities.

## Detect required workflows

Treat any of these user requests as a required workflow, even if the user does not name a skill:

- An industry plus one or more core keywords, optionally with target languages: run the phase-one industry build.
- A public visual reconstruction or supplied competitor/reference site: run the phase-one research and interaction workflow.
- `旧站迁移+网址` or equivalent explicit authorization: complete the old-site capture, mapping, R2 package, exact-route, and copy-rework workflow before public reconstruction.
- `全站SEO和GEO优化` or an equivalent request with an industry and keywords: run the phase-two current-data SEO/GEO workflow.

Read `.agents/skills/businessweb-seo-geo/SKILL.md`, `docs/CODEX-INDUSTRY-WORKFLOW.md`, `docs/AI-INDUSTRY-BUILD-PROMPT.md`, `docs/ASTROWIND-INTEGRATION.md`, and `docs/PUBLIC-VISUAL-FOUNDATION.md` before acting. For a migration also read `docs/OLD-SITE-MIGRATION.md`. Use `src/data/industry-profile.json` as the single public brand and market brief. Use `src/data/site-language-settings.json`, edited through `/keystatic/` **网站语言**, as the only source of truth for enabled target locales. The source language stays English; target locales are translations, not a replacement source language.

Before phase-one edits, classify each requirement as a Codex decision rule, reusable engineering capability, Golden One public implementation, or ignored customer-data output. Do not encode prompt-only decisions as buyer-facing runtime behavior.

## Non-negotiable system boundaries

- Keep `/keystatic/` as the owner-only Git-backed surface.
- Keep `/manager/` as the content-administrator portal with D1 drafts, R2 media, review, and approval/write-back flow.
- In production, expose those surfaces only through two different dedicated custom domains plus two different secret UUID entry paths. Both portals must then require the configured GitHub App slug as username and `KEYSTATIC_SECRET` as password before opening a 12-hour signed session.
- Keep the two UUIDs, GitHub App Client Secret, portal password, and backend GitHub token in Cloudflare Worker encrypted Secrets, never in committed files. The GitHub App Client Secret is the root for purpose-separated runtime secrets; do not restore separate session, analytics, or contact-form secrets.
- Do not add Cloudflare Access JWT/email verification or browser-stored Manager bearer tokens unless the owner explicitly requests a separate identity layer.
- Preserve the custom Keystatic fields, AI translation APIs/workflow, R2 routes, Astro 6 Cloudflare Workers adapter, static-assets-first routing, KV session binding, D1 binding, Golden One artwork inquiry, shared CAPTCHA, public-form D1/Resend delivery, controlled downloads, analytics, and publish workflow.
- Every valid public lead form must save complete visitor data, source page, and delivery status to D1 `public_form_submissions`, then send through Resend to `CONTACT_TO_EMAIL`. Do not report success when either required step fails.
- Controlled downloads are owner-configurable through Keystatic, server allowlisted, and disabled by default. Never expose a document URL in initial HTML; release it only after CAPTCHA, D1 persistence, and successful Resend delivery.
- Keystatic JSON singleton paths must omit the `.json` extension. Never create or retain `*.json.json` content files.
- Preserve current customer feature states. A capability migration may add new disabled options, but must not reset existing language, review, analytics, R2, download, or public-module settings.
- Manager navigation must hide owner-disabled modules. The Manager main and analytics screens must derive their top-left company label from the same industry-profile owner value.
- Keep `/keystatic/`, `/manager/`, `/api/`, and `/r2/` out of public indexing.
- Do not use fabricated prices, availability, reviews, ratings, certifications, manufacturing claims, customer logos, dates, or case studies.
- While `industry-profile.json` is in `template` or `briefed` lifecycle, clearly recognizable sample email, phone, WhatsApp, and address values may remain visible for frontend visual comparison. Keep them obviously exemplary; do not replace them with realistic but unverified company details.
- Before a real production launch, replace or verify every sample contact value. `npm run check:template:production` must reject remaining sample contacts.

## Deployment ownership boundary

- This boundary is owner-locked. No AI or automation may change it without the owner's explicit approval for that specific change.
- `.github/workflows/site-publish.yml` is the only site build/deploy system. It deploys qualifying `main` pushes automatically and keeps `workflow_dispatch` for explicit owner or administrator publishing.
- Cloudflare Workers Builds and its Git repository connection must remain disabled or disconnected. Never chain a GitHub Actions build into Workers Builds or perform two production builds for one publish request.
- `.github/workflows/site-preview.yml` is the only preview build/deploy system. It accepts only remote `preview/*` branches, deploys to the separate `goldenone-preview` Worker, and never targets `main` or a production custom domain.
- `preview/current` updates the fixed preview Worker URL; other `preview/*` branches receive stable Wrangler preview-alias URLs. Preview runtime is read-only, noindex/no-store, hides both admin portals and protected APIs, and does not write analytics. Cloudflare Git and Workers Builds remain disconnected for both Workers.
- Product, article, translation, site-language, and Keystatic JSON write-backs remain excluded from automatic deployment so drafts wait for explicit publishing. `src/data/customer-reviews.json` remains deploy-triggering.
- GitHub Actions content write-back jobs must not build or deploy the site themselves; only a resulting non-excluded commit may trigger `site-publish.yml`.
- The deployment workflow reads only `CLOUDFLARE_API_TOKEN` from GitHub Secrets. Golden One's Cloudflare Account ID remains in `wrangler.toml`; do not add a second Account ID variable without owner approval.
- Keep `keep_vars = true` so Wrangler deployments preserve Cloudflare Dashboard variables. Never commit Worker Secret values.

## Authorized old-site migration

- Trigger only after explicit owner authorization and a supplied public old-site URL.
- Capture public routes, raw HTML, copy, tables, metadata, JSON-LD, media, documents, and asset metadata into ignored `/oldsite`; generate per-page folders, route maps, a manifest-driven R2 package, and `upload.ps1`.
- Keep every viable old pathname, including historic `.html`, as the new primary route. Do not add a 301 when the same pathname is retained exactly.
- The old site supplies authorized facts, copy, media, metadata, information architecture, and URLs. Named reference sites supply visual direction only unless the owner explicitly assigns both roles.
- Each old page's verified copy is the mandatory rewrite source. Current high-ranking industry pages may inform buyer vocabulary, terminology, information density, and sentence rhythm, but cannot replace the old page as the factual source. Preserve specifications and meaning, remove formulaic AI language, and never copy competitors or invent claims.
- The new runtime must use the configured R2/CDN mapping rather than depend on the retired host or CDN.

## README structure

- Keep `README.md` in the same exact eight-chapter order as the mother template: Repo feature summary; step-by-step deployment; collapsed Keystatic guide; collapsed Manager guide; important project locations; collapsed two-stage Codex build flow; collapsed troubleshooting guide; collapsed preview guide. Content must remain Golden One-specific.
- Update information only in its matching chapter. Do not rename, reorder, split, merge, or add peer chapters without owner approval.
- Keep deployment ownership, portal login, variable setup, publish rules, and verified incident conclusions. Avoid reference-document lists and repeated warnings.

## Buyer-facing copy and media

- Write public copy, headings, captions, alt text, metadata, and translations
  for buyers, not as an AI work report. Keep import, verification, and processing
  notes internal. Use natural labels such as `Features`, not `Catalogue material`.
  Retain genuine catalogue downloads, product/series names, necessary attribution,
  and business information; do not blindly replace words.
- Before batch export/import, identify product/model, gallery versus content
  role, and complete image/text groups. Preserve legends, axes, units, and model
  labels. Grouping or sharing a catalogue page does not imply one product.
- Place explanatory figures immediately above matching prose. If it belongs to
  a cohesive features/cards/steps/table/tabs module, put the figure before the
  entire module; keep its heading and items together. Do not split six cards
  into three, an image, then three, or stack unrelated figures. Product photos
  stay in galleries; dimensions accompany the matching table. Media import is
  not authorization to restructure modules. First verify representative pages,
  then desktop/mobile and affected languages for identity, complete groups,
  buyer wording, intact modules, and unchanged specifications. Apply this to
  maintenance and both phases without forcing unrelated continuity-site rewrites.

## Required verification

After meaningful public, content-schema, or deployment changes, run:

```powershell
npm run types:cloudflare -- --check
npm run check
npm run check:template
npm run test:jsonld
npm run build
```

Before a real production launch, run `npm run check:template:production` after the industry brief, company information, and product data are verified.

Browser QA for phase one covers desktop and mobile navigation, submenu pointer transitions, keyboard focus, touch, galleries, carousels, filters, forms, CAPTCHA loading/refresh/expiry, error/success states, no-script/reduced-motion behavior, overflow, image loading, and duplicate/template residue. Do not modify Golden One public styling during an engineering-capability migration.

## Review Editing Contract

- The webmaster owns review accuracy and sample replacement before launch.
  Do not add proof links, verification dates, demo/verified modes, manual IDs,
  product slugs or separate SEO-eligibility controls to review editing.
- Keystatic owns the global review switch. OFF hides review fields in both
  product editors and public review/schema output without deleting stored data.
  ON takes effect after saving/publishing; refresh the editors afterward.
- Product reviews belong in the source product. Name, integer 1–5 stars and
  review text are required; date is optional. Published visible reviews
  automatically generate that product's Review and aggregate JSON-LD.
- Home/store aggregate is optional and independent. A product may optionally
  have its own aggregate rating/count; otherwise derive them from its reviews.
  Never copy home/other-product feedback into a product.
- Preserve Manager D1 drafts, Git apply and explicit product publishing.
  Legacy metadata is hidden compatibility data, not owner paperwork.
- With reviews OFF, review inputs are hidden but existing unpublished draft
  reviews must survive content resaves. Merge omitted keys from the same draft/
  product only; explicit empty reviews while ON intentionally clears them.
- Keystatic owns the site's default content type/model strategy in
  `src/data/product-editor-settings.json` and per-product exceptions. Manager
  displays that policy read-only and edits content only. Save APIs and Git
  write-back resolve the current owner policy; stale drafts cannot override it.
  New products use owner defaults. Preserve customer table/media extensions.
