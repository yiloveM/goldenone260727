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
| `CAP-0003` typed/safe/built-page JSON-LD | Applied on isolated branch `codex/jsonld-hardening-goldenone-20260925` from `eaf6dd4`; source and test verification below. | Not merged into customer `main`, not preview-verified or production-released. Local workerd prerender cannot connect to its loopback service; rerun the normal build in a working environment before merge. |

`CAP-0003` source/approval: Golden One was the first implementation at base `eaf6dd4`; owner approved the specified mother JSON-LD capability with `确认修改能力` and explicitly requested Golden One as first target. Behavior before: selected JSON-LD builders returned untyped records and the layout embedded raw `JSON.stringify`, with no full generated-page audit. After: selected builders use `schema-dts` compile-time contracts, the layout escapes script-breaking characters, merges the same-identity WebPage/CollectionPage node, and `npm run build` audits generated HTML. Inquiry-only products report absent rich-result inputs without fabricating price/reviews/ratings. Dependencies: dev-only `schema-dts@2.0.0`, `parse5@7.3.0`. Files: `src/data/seo.ts`, `src/layouts/BaseLayout.astro`, `src/lib/json-ld.mjs`, `scripts/audit-jsonld.mjs`, `scripts/test-json-ld.mjs`, `scripts/run-astro.mjs`, package manifests, README and this register. Protected Golden One content, URLs, Worker/D1/R2 identities, deployment workflow and visual styles were unchanged. No data migration. Rollback: revert only this branch's capability changes before merging; production remains on its prior `main`. Checks: `test:jsonld` 5/5, `check` 0 errors, `check:visual`, `check:class-names`, `check:preview`, `check:continuity` 53/53, `check:template` 0 errors all passed. Normal `build` did not complete because local Astro/workerd prerender could not connect to `localhost:8895`; an experimental Node prerender also cannot load `cloudflare:` modules. Built-HTML audit and Google rich-result eligibility remain unverified. README chapter 1 and chapter 6 usage updated. Source commit and push evidence must be appended after delivery.

Golden One is a new-site build, not a legacy continuity release. Mother CAP
parity remains a separate decision from industry/content/design construction.

## Entry template

```text
Date/time and timezone:
Local ID: CAND-NNNN or linked mother CAP-NNNN/revision:
State: candidate / proposed / applied / equivalent / customized / deferred / not-applicable / rolled-back
Assessment: NOT AUDITED / missing / partial / equivalent / customized / applied / deferred / not-applicable; evidence date:
Implementation / configuration enabled / preview verified / production released (four distinct states):
Target baseline branch and HEAD; mother CAP ID/revision and dependency IDs:
Source branch and commit:
Behavior before -> after; inputs/outputs:
Affected files and dependency closure:
Protected Golden One settings/data and compatibility:
Mother ledger cross-reference and approval state:
Migration and rollback, including data:
Tests and production evidence (separate):
Risk, rollout window, stop condition and rollback evidence:
README capability-list and related-section update:
Next step and owner:
```

When a real engineering capability is added, record it here and update the
existing README capability list plus matching operational instructions in
place. Preserve Golden One's eight chapters and site-specific details. Also
register a reusable candidate in the mother ledger when available. Never
label a candidate as integrated or production-verified.
