# Golden One Project Progress

Append a factual entry after every Golden One task, using paths relative to
this Git root. Never record secrets. If the mother workspace is available,
also append its shared handoff log.

## Entry template

```text
Time (+08:00):
Branch/local HEAD; remote HEAD if freshly verified:
Goal and work completed:
Capability/README/register state:
Checks and result:
Commit/push/CI/production evidence (separate):
Open items and next action:
```

## 2026-09-21 04:18 +08:00 - Governance baseline

- Local branch/HEAD observed before editing: `main` / `eac9edf`; local
  working tree was clean before this task.
- Added customer governance entry/Chinese companion and capability/progress
  record files locally. No Golden One site code or README layout changed.
- The 2026-09-16 product-detail commit is a verified local baseline, not
  evidence that this governance task deployed or changed production.
- No remote or production state was freshly verified here; no customer push
  or deployment was requested.
- Next action: assess real future engineering increments, update README
  in place when capabilities change, and record actual tests/delivery here.

## 2026-09-23 17:29 +08:00 - Customer-local capability governance

- Target: Golden One `main` at `eac9edfea230e942ace9158e7d40a7b343c84b0d`; fetch/push origin matched `yiloveM/goldenone260727` locally. Remote branch freshness was not rechecked.
- Work: clarified independent new-site release and mother CAP adoption in bilingual AGENTS; added CAP-0001/0002 assessment queue. Both remain `NOT AUDITED`; a new-site build is not an emergency old-site continuity migration. No customer runtime or README changed.
- Checks/delivery: `git diff --check` exited 0 with line-ending warnings; docs-only, no build/browser/CI claimed. Local uncommitted changes only; no push or production deployment.
- Next step: keep normal research-first construction separate from any specifically approved CAP alignment. On a new PC copy `.git` and untracked records, then verify status, branch and origin before continuing.

## 2026-09-23 23:53 +08:00 - Remote backup addendum

- Governance-only commit `3c89107` pushed to this repository's `codex/governance-20260923`; four scoped files. No `main` push, CI, preview or production deployment was initiated. CAP-0001/0002 remain NOT AUDITED locally; a remote branch is not a release.

## 2026-09-24 02:18 +08:00 - Governance consolidation

- Pushed `b69bcc9` to Golden One's own `codex/governance-20260923`: only bilingual AGENTS changed, replacing the redundant protocol dependency with local execution rules and existing master references.
- Scoped diff checks passed; no production push or runtime change. Continue from this branch and local records, reconciling current main before a future merge; this handoff is a follow-up documentation commit.

## 2026-09-25 01:35 +08:00 - JSON-LD first customer pilot

- Target: `yiloveM/goldenone260727`, isolated `codex/jsonld-hardening-goldenone-20260925` from `eaf6dd4`; freshly checked remote `main=eac9edf`, governance branch `eaf6dd4`. Customer `main` and production were not edited.
- Work: approved CAP-0003 schema-dts typing, safe inline JSON-LD serialization, same-identity CollectionPage merge, built-HTML audit and focused tests. No brand, product facts, prices, ratings, routes, Worker bindings or deployment workflow changed. README and capability register updated in place. CAP-0001 preview source was verified equivalent; owner confirmed Golden One has no GSC property yet, so CAP-0002 connection is deferred. Mother remains a separate Git root.
- Checks: JSON-LD tests 5/5; `check` 0 errors; visual, class-name, preview, continuity 53/53, template 0 errors passed. Normal `build` failed during local workerd prerender because `localhost:8895/__astro_static_paths` was unreachable (EACCES/ECONNREFUSED); proxy did not fix loopback. Alternate Node prerender failed on `cloudflare:` module. No new complete HTML set exists, so generated-page audit, browser QA, CI and production behavior are not verified.
- Delivery state at record time: local branch changes only; commit/push to exact Golden One remote pending final diff review. No main merge, preview or deployment authorization. Ignored `.sandbox` files contain only local build diagnostics and are not part of Git delivery.
- Next step: on a machine/CI where Cloudflare workerd prerender works, run `npm ci`, `npm run test:jsonld`, `npm run check`, `npm run build`, then inspect representative Product/CollectionPage output and Google rich-results results. Resolve any new audit findings on this branch before considering a separately authorized main release. If copying the workspace, retain each independent `.git`; recheck branch, HEAD, remote and GSC machine-local setup.

## 2026-09-25 01:57 +08:00 - Main release and CI correction

- Owner redirected delivery to Golden One `main`. Fresh remote base `eac9edf` was fast-forwarded through prior governance commits and CAP-0003 `20256ac`; first CI run `36036620566` failed its new audit on 169 noindex-locale canonical false positives, so deploy was skipped and existing Worker remained live.
- Narrow audit correction `b6227a4` was pushed to this repository's `main`; focused tests 6/6. GitHub Actions run `36037373380` succeeded through build and production deploy. Generated HTML audit: 843 pages, 4699 JSON-LD scripts, 570 Product nodes, 570 without rich-result inputs, 0 errors. Live home and `/products/trolley-coin-keychains/` returned HTTP 200. No Golden One product facts, prices, ratings, artwork, Worker bindings or deployment workflow changed.
- Mother CAP-0003 was separately pushed to `ironstraight/businessweb/main` as backup commits `719a8fa` and `c469811`; mother publish runs were skipped. Other customers remained untouched. CAP-0001 preview source equivalent; CAP-0002 deferred because owner confirms no Golden One GSC property yet.
- Next: obtain verified per-product commercial data before adding Offer/Rating; separately create/verify GSC property before machine-local MCP mapping. On another computer verify independent Git roots, `main` SHA, fetch/push origin, this handoff, and external credentials; local Windows workerd loopback failure does not override successful Linux CI evidence.
