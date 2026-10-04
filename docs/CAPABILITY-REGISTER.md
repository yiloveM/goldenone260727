# Golden One Capability Register

Repository identity: `yiloveM/goldenone260727`. This customer-local register
separates engineering candidates, mother-template adoption, and brand/content/
visual work. Its absence of an entry does not prove a capability is missing.

## Status at 2026-09-21

No new engineering capability was implemented or fully inventoried during this
governance task. Existing implementation and adoption of mother CAP IDs remain
`NOT AUDITED`; visual product-detail work alone is not automatically a
reusable mother capability.

## Alignment queue at 2026-09-23

| Mother capability | Local assessment | Next evidence needed |
| --- | --- | --- |
| `CAP-0001` preview isolation | `NOT AUDITED` | Inspect this site's workflow, Worker separation and current release state. |
| `CAP-0002` local read-only GSC MCP | `NOT AUDITED`; mother tool not connected in this session | Only for an authorized GSC task, verify property, mapping and external credentials; no site runtime change is implied. |

## Assessment at 2026-09-25 01:31 +08:00

| Mother capability | Source/configuration state | Release evidence and next step |
| --- | --- | --- |
| `CAP-0001` isolated preview | Equivalent source present: `site-preview.yml`, `run-preview-deploy.mjs`, Worker noindex/write isolation; `check:preview` passed. | No preview URL or production release verified in this task. Keep customer Worker/branch identities; do not copy mother files wholesale. |
| `CAP-0002` local read-only GSC MCP | Mother-local tool source exists; owner confirms Golden One GSC property is not yet available. No `ops/gsc-site.json`, external registry, credentials or callable session tool. No website runtime change is needed. | Connection deferred until a real property is created and machine-local authorization is arranged. Do not invent mapping or claim GSC access. |
| `CAP-0003` typed/safe/built-page JSON-LD | Implemented on Golden One `main`: `20256ac`, audit correction `b6227a4`; 6/6 focused tests. | GitHub Actions run `36037373380` built and deployed successfully; 843 HTML, 4699 JSON-LD scripts, 0 audit errors. Live home/product sample returned 200. GSC rich-result eligibility not claimed. |

`CAP-0003` source/approval: Golden One was the first implementation at base `eaf6dd4`; owner approved the specified mother JSON-LD capability with `确认修改能力` and explicitly requested Golden One as first target. Behavior before: selected JSON-LD builders returned untyped records and the layout embedded raw `JSON.stringify`, with no full generated-page audit. After: selected builders use `schema-dts` compile-time contracts, the layout escapes script-breaking characters, merges the same-identity WebPage/CollectionPage node, and `npm run build` audits generated HTML. Inquiry-only products report absent rich-result inputs without fabricating price/reviews/ratings. Dependencies: dev-only `schema-dts@2.0.0`, `parse5@7.3.0`. Files: `src/data/seo.ts`, `src/layouts/BaseLayout.astro`, `src/lib/json-ld.mjs`, `scripts/audit-jsonld.mjs`, `scripts/test-json-ld.mjs`, `scripts/run-astro.mjs`, package manifests, README and this register. Protected Golden One content, URLs, Worker/D1/R2 identities, deployment workflow and visual styles were unchanged. No data migration. Rollback: revert only this branch's capability changes before merging; production remains on its prior `main`. Checks: `test:jsonld` 5/5, `check` 0 errors, `check:visual`, `check:class-names`, `check:preview`, `check:continuity` 53/53, `check:template` 0 errors all passed. Normal `build` did not complete because local Astro/workerd prerender could not connect to `localhost:8895`; an experimental Node prerender also cannot load `cloudflare:` modules. Built-HTML audit and Google rich-result eligibility remain unverified. README chapter 1 and chapter 6 usage updated. Source commit and push evidence must be appended after delivery.

Golden One is a new-site build, not a legacy continuity release. Mother CAP
parity remains a separate decision from industry/content/design construction.

Delivery addendum (2026-09-25 01:57 +08:00): owner explicitly requested Golden One `main` delivery. Initial `20256ac` CI run `36036620566` built pages but stopped before deploy on 169 false-positive canonical mismatches for intentionally noindex disabled locales. `b6227a4` corrected the audit to enforce canonical parity on indexable pages only; run `36037373380` completed build, 0-error generated-page audit and production Worker deployment. This supersedes the earlier pre-release status above. All 570 Product nodes remain quote-only without verified price/rating/review inputs; that is a rich-result eligibility gap, not a fabricated fix or an indexing diagnosis. No GSC property exists yet, per owner.

## Operational Status Location

The current integration/configuration/switch/verification overview and next
actions live only in [PROJECT-PROGRESS.md](PROJECT-PROGRESS.md). This ledger
retains engineering provenance, approvals/revisions, dependency and compatibility
evidence, migration and rollback. Dated assessments below are history, not a
second live state table. Link affected overview rows when recording a capability
change; README changes require actual supported-behavior or use-procedure changes.

## Entry template

```text
Date/time and timezone:
Local ID: CAND-NNNN or linked mother CAP-NNNN/revision:
State: candidate / proposed / applied / equivalent / customized / deferred / not-applicable / rolled-back
Assessment: NOT AUDITED / missing / partial / equivalent / customized / applied / deferred / not-applicable; evidence date:
Engineering implementation/revision evidence; current state link in PROJECT-PROGRESS.md:
Target baseline branch and HEAD; mother CAP ID/revision and dependency IDs:
Source branch and commit:
Behavior before -> after; inputs/outputs:
Affected files and dependency closure:
Protected Golden One settings/data and compatibility:
Mother ledger cross-reference and approval state:
Migration and rollback, including data:
Tests and production evidence (separate):
Risk, rollout window, stop condition and rollback evidence:
README update only if supported behavior or deployment/use steps changed:
Next step and owner:
```

When a real engineering capability is added, record it here and update the
existing README capability list plus matching operational instructions in
place. Preserve Golden One's eight chapters and site-specific details. Also
register a reusable candidate in the mother ledger when available. Never
label a candidate as integrated or production-verified.

## CAP-0004 / Revision 1 - Owner-controlled product editing and reviews

Date: 2026-10-04 +08:00; approved twice with `确认修改能力`.
Source mother baseline: `986a073ac0a7b37a60075ef002c75ebfb2d2e9bb`;
target baseline: `f758d1dcd845558d3c78fdfd4c2e1ff90be26cf7`; delivery target: `main`.
Integrated mother source: `2e3e7bddec6c259dfc4bf27d8ad18a693abf0c0e` (CAP-0004 rev1).
Release SHA and remote outcomes follow in the delivery receipt.
Before -> after: product-level minimal reviews, no proof/demo/SEO controls,
optional independent home aggregate. Keystatic owns the switch and default
type/model policy plus product exceptions; Manager is content-only/read-only.
Save API and Git write-back re-resolve owner policy against stale drafts.
Files/dependencies: generic product-editor/reviews modules, native Keystatic
fields, product-editor-settings.json, existing schema/D1/Manager/API, apply
scripts, public review/schema consumers, tests and existing governance/manual.
No new library, D1 table, resource binding or deployment workflow.
Existing safe JSON-LD helper reused; public customer composition retained.
Compatibility: old hidden metadata remains readable; absent old-draft reviews
are retained, explicit empty reviews clear the fallback. Customer content,
tables/media extensions, switches, credentials and front-end styling unchanged.
Verified: 15/15 review/editor tests; applicable visual/preview/template/SEO.
Complete type/build and release/preview status follow in receipt, not assumed.
Rollback: scoped revert of this repo's capability commit on current branch and
existing publish path; no reset or database rollback. Export later CMS reviews/
policy before rollback and preserve later customer changes.
Operational state: [PROJECT-PROGRESS.md](PROJECT-PROGRESS.md).

Delivery receipt (2026-10-04 20:25 +08:00):
- Source `2e3e7bddec6c259dfc4bf27d8ad18a693abf0c0e`; customer release `6cd7f6606c5b51f19ff0d6a14fd191b6549f2f5c`
  pushed to `yiloveM/goldenone260727/main`; Actions 37201263685 completed/success.
- Final 16/16 regression and full type/build checks passed. Existing customer main deployment succeeded; sampled public routes and desktop/mobile rendering verified.
- OFF retains unpublished same-product draft reviews while hiding fields/public schema;
  ON permits explicit clear. Owner policy is enforced at save and current-Git write-back.
- No real production D1 review write or authenticated Keystatic write claimed.
  Roll back this customer's release commit by scoped revert; retain newer CMS data.
