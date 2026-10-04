# Golden One Project Status and Progress


Record meaningful resumption, release/recovery, capability, or governance state,
not every task or operation. One batch entry covers multi-page content/media,
mapping/parameter changes, consequential external-state changes, and unfinished
work. Completed low-risk copy/single-image fixes with no handoff or release
impact need no entry; Git is sufficient. Advice-only answers, download/conversion
steps, retries, and cleanup statistics do not belong here. Preserve history
and keep secrets out. The mother log, when available, holds only a summary.
Keep product facts/media URLs in their content files; retain minimal originals
and mappings while unfinished, without adding a permanent media ledger.

## 当前状态

更新：2026-10-04（+08:00）。源码基线：`a40783ebb4c67b826bb571648a068bce4a6e94b4`。
范围：`yiloveM/goldenone260727` 的 `main`；本次只整理文档，不改变任何开关。

这是一份交接快照，不是配置文件。接入、配置、开关分开看；“已启用”不等于
已完成线上验收。待接入/待配置/待启用表示确有后续需求；主动关闭、不适用、
未核查各自登记，不自动催办或启用。验证列保留证据日期，历史成功不冒充今天成功。
按功能归类，不逐产品/图片登记；开始任务先看此表和相关交接，只更新受影响行。
换电脑后先核对本仓库 Git/分支，再核查本次需要的外部访问，不因复制记录就假定凭据可用。
负责人：标明站长的事项由站长决定/配置，其余技术核查由接手 AI 在相关任务中执行。
工程来源、兼容与回退细节见 [能力账本](CAPABILITY-REGISTER.md)；
[README](../README.md) 只讲部署和使用，原有历史条目保留在下方。

| 功能/分支范围 | 接入 | 配置 | 开关 | 日期/验证依据 | 下一步/负责人 |
| --- | --- | --- | --- | --- | --- |
| 公开站、后台及发布链路 | 已接入 | 仓库配置已有；云端未重新核查 | 无统一开关 | 2026-10-04 读取源码；2026-09-25 发布证据见下方日志 | 后续相关任务再核查；本轮不部署 |
| 网站访问分析 | 已接入 | 仓库配置已有；云端未核查 | Manager 入口已启用（源码）；采集无此 JSON 开关 | `src/keystatic/analytics-dashboard.json` 仅含 `managerVisible: true` | 不套用 Aquamama 的较新开关字段；涉及分析时核查实际实现 |
| GSC / 本机只读 MCP（CAP-0002） | 后台能力已有；客户 MCP 映射待接入 | 待配置；站长此前确认暂无 property，授权未核查 | 本机工具非站点开关；后台状态未核查 | 2026-09-25 交接；本客户无 `ops/gsc-site.json` | 站长提出接入任务并提供 property 后处理；不重复索取 |
| 公共表单 CAPTCHA / D1 / 邮件 | 已接入 | 仓库配置已有；当前云端凭据、成功留存与投递未核查 | 必需保护，无绕过开关 | 2026-10-04 源码存在；不是线上成功流程证明 | 仅相关表单任务检查；未核查不等于缺密钥 |
| 受控 PDF 下载 | 已接入 | 文件白名单尚为空；非必需功能 | 主动关闭（源码），不是待启用 | `src/data/catalog-downloads.json`：`false`、空列表 | 有明确下载需求时再配置文件及启用；不主动催办 |
| JSON-LD 安全与构建审计（CAP-0003） | 已接入 | 已配置 | 必需构建检查 | 2026-09-25 Actions `36037373380`：843 HTML、4699 JSON-LD、0 错误 | 这是历史验证，不代表本轮重新验收；数据变化再检查 |
| 隔离预览（CAP-0001） | 已接入（历史等价实现核对） | 源码检查通过；云端未验证 | 按获准分支触发；非 CMS 开关 | 2026-09-25 能力账本及下方交接；预览工作流存在 | 仅收到预览任务后验证独立资源和工作流 |
| 评价 / 多语言 | CAP-0004 已发布 | 旧资料保持；首页评分选填、产品独立录入 | 评价开启（保持原值）；西班牙语已启用（源码），其余目标语关闭 | 2026-10-04：16/16 回归；main 已推送；现有 Actions 构建/部署成功，见下方回执 | 站长管理事实及示例替换；不自动改开关/语言 |
| 产品编辑策略（CAP-0004） | 已发布 | 默认 physical-product / series；具体产品例外优先 | Manager 只读，无独立启用开关 | 2026-10-04：API/写回回归、完整构建通过；已部署 | 站长 Keystatic 设策略；管理员维护内容 |

## Entry template

```text
Time (+08:00); target/scope:
Branch/baseline/change commit or unique entry heading:
Relevant checks; actual commit/push/CI/preview/production separately:
Pending/next action; rollback or external-state recovery when needed:
Affected overview rows; capability provenance link only when relevant.
```

## 2026-10-04 22:54 +08:00 - 代表产品闭环与 Manager 开关适配规则

- 仅 A 类治理：两项建议已采纳；阶段一同时适配前端/Manager 的入口、字段、草稿及写回；批量建产品前验证一个代表条目的两个后台至发布/前端闭环；阶段二保留已验收布局，改布局先说明并取得同意。
- 本仓交付目标 `main`；任务前基线 `61c0f99d499ee2e9706fa23e4f8b4499c2e9d1e6`，推前安全快进并保留站长评价配置 `fba8d4c4a439d56400273ffae18a55e4b0ffdf88`，总开关仍开启。本轮不改评价内容、运行代码、产品、开关、资源或站长暂缓事项，README 只改第六章稳定用法；保持原隔离及保存/发布流程。
- 文档 diff/围栏/双语、README 其它章节及独立仓库检查通过；本轮不重跑应用构建，不新增 CAP 或验收表。本条所在文档提交用 [skip ci] 只推上述目标，不请求部署。
- 后续建站按此规则及顶部状态继续；真实外部未验部分须如实标明，不冒充通过或拖延无关建设。按本条标题定位提交，在本仓正常 scoped revert 文档提交回退，保留后续 CMS 数据、不 reset 或改 D1。

## 2026-10-04 22:08 +08:00 - 建站治理分工与远端防误推

- 范围仅现有治理/两阶段方法文档；目标 `main`，前基线 `91b8de4d78be8943d41a8a5d2de968d2a1159939`。
- 文件职责、全新站完整工程基线与开/关适配、站长负责真实性/占位、Keystatic 控制与 Manager 内容职责已对齐；已有客户不自动全量升级。推送必须绑定真实根/common Git、repo/URL/ref，编号目录只是线索。
- README 只补第六章稳定使用方法；功能状态、CAP 实现、前端、产品、资源和站长延后事项均未改。不新增工程能力或重复登记表；额外治理建议尚未采纳。
- 验证为文档 diff/引用/围栏/双语与独立仓库检查，不重跑应用构建。此治理提交用 [skip ci] 推上述目标，不请求部署。
- 换电脑读顶部状态及本条；对应提交可按本条标题查 Git 历史，回退仅在本站正常 revert 本轮文档提交，不 reset、不改 D1。

## 2026-10-04 20:25 +08:00 - CAP-0004 产品编辑与评价统一交付

- 目标 `main`；改造前基线 `f758d1dcd845558d3c78fdfd4c2e1ff90be26cf7`；
  母版来源 `2e3e7bddec6c259dfc4bf27d8ad18a693abf0c0e`，本客户能力提交 `6cd7f6606c5b51f19ff0d6a14fd191b6549f2f5c`。
- 最终站长决定：关闭评价只隐藏；旧草稿重新保存时保留未发布评价，
  关闭期间不展示评价、不输出 Review/聚合评分；重新开启后可继续编辑。
  首页评分独立选填。Keystatic 决定类型/型号，Manager 只读；
  API 和最新 Git 写回防止旧草稿覆盖站长策略。
- 四仓共用契约但独立发布；本仓 16/16 回归通过；321 文件类型检查 0 错误；843 HTML / 4699 JSON-LD / 570 Product，审计 0 错误。
  适用 visual/preview/template/SEO/continuity 检查通过；原有提示保留。
- [Actions 37201263685](https://github.com/yiloveM/goldenone260727/actions/runs/37201263685) completed/success。
  main 已推送；现有 Actions 构建/部署成功。未更改唯一生产发布链路。
- 发布后首页/抽样产品 HTTP 200；1440/390 视口抽查无脚本错误及横向溢出，
  首屏产品与品牌图正常。公开页面保留可索引设置。
- 后台浏览器交互使用隔离 mock（母版/Aquamama/Golden One）及原生字段/写回回归；
  未向真实 D1 保存测试评价，未执行真实后台 Git 写回。CSS、产品正文/参数、
  媒体、资源绑定、评价开关和既有延后事项保持不变。
- 回退：在本仓当前分支正常 revert `6cd7f6606c5b51f19ff0d6a14fd191b6549f2f5c`，
  再按原发布链路验收；不 reset、不迁移/回滚 D1。先导出改造后新增评价/策略，
  保留后续 CMS 变更。
- 本轮完成；站长按原 README 使用，后续 AI 先读顶部状态及本条交接。
  本回执是 docs-only 提交，用 [skip ci] 防止重复发布。


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

## 2026-09-25 09:59 +08:00 - Building delivery and renamed workspace

- Directory goldenone002 -> goldenone002-building; independent origin remains yiloveM/goldenone260727, main baseline 267e23e. Whole-root move preserved .git, status, HEAD and README hash; no site resources, content or credentials changed.
- Bilingual AGENTS and existing README now require authorized work to be integrated and pushed to main without a second push question; temporary branch work is not completed delivery. Commercial launch is owner-designated, not inferred from a reachable Worker. Owner-confirmed concrete facts are accepted; AI completes research metadata instead of requiring customer proof-per-field.
- No new engineering CAP or backend fields. Historical eac9edf..267e23e diff confirms no changes to keystatic.config.ts/content schema/industry profile in the earlier JSON-LD adoption. This task only checks governance, paths, README structure and isolated diff; it does not rerun site builds.
- Delivery: main documentation commit with [skip ci] prepared; receipt follows. Recovery: revert that scoped commit against baseline 267e23e, not earlier CAP-0003 code. No database changes. On a copied workspace use this new path, preserve .git/local files and reconfigure external credentials; GSC still has no owner-created property.

## 2026-09-25 10:10 +08:00 - Main delivery verified

- Pushed 40cdc4a to this repository's main from 267e23e. Only bilingual AGENTS, existing README and this progress log changed; no runtime/customer data/schema/deployment change. Exact-SHA Actions query returned no runs, as intended for [skip ci].
- Recovery: git revert 40cdc4a, then authorized push to this origin, preserving later changes. Existing CAP-0003 implementation and prior successful site deployment are unchanged. This entry is a documentation-only receipt; continue from main in goldenone002-building on the next computer after checking its own .git and origin.


## 2026-10-03 22:32 +08:00 - Buyer Copy, Complete Media and Selective Handoffs

- Scope: Own bilingual AGENTS, existing two-phase prompt/workflow/skill and README now enforce buyer-facing copy, complete media groups above matching text without splitting modules, and selective handoffs. Existing log policy/template updated; no new governance file, mandatory CMS field, media register, or engineering capability.
- Baseline: freshly verified origin/main = `a8b18b0988b719ac3f94062b85d7474f57aed8d4`; change reference is the commit introducing this unique heading.
- Checks: PASS scoped documentation diff/UTF-8, English/Chinese core rules, README chapters/folds/fences, and independent origin/ref access. Full site build/browser/SEO tests NOT RUN (no runtime, content, media, data, or workflow changes).
- Delivery/recovery: documentation-only `[skip ci]` commit targeting this repository's `main`; verify its presence in that remote ref on resumption. No preview/production release requested. Scoped-revert the introducing commit on that same authorized ref; no R2/D1 recovery needed.
- Next: Resume on this customer's main after fetching and verifying the introducing commit. Existing eight-chapter README, customer facts, visual layer, routes, and resources are unchanged.

## 2026-10-04 - Unified Status and Progress

- Scope/baseline: yiloveM/goldenone260727/main at `a40783ebb4c67b826bb571648a068bce4a6e94b4`; current integration/configuration/switch/dated verification and next actions now live at the top of this same file, historical handoffs retained. Bilingual AGENTS, existing prompts where present, engineering-ledger references and stable README responsibilities aligned; no new governance file or engineering capability.
- Checks: PASS README chapter/fold/fence preservation, unchanged mail-setup sections, exact historical-entry preservation, six-column overview/source-switch consistency, document links and scoped documentation diff. Runtime/build/browser/Google/mail tests NOT RUN: no runtime, configuration, data, resources or deployment changed.
- Delivery/recovery: documentation-only `[skip ci]` commit/push to `yiloveM/goldenone260727/main`; change reference is the commit introducing this unique heading, to be checked against that exact remote ref on resumption. No site release; scoped-revert that introducing commit on the same authorized ref, preserving later work. No D1/R2 recovery required.
- Next: Resume from this customer's main and this overview; optional downloads remain intentionally off, GSC property remains owner-deferred pending a relevant task. Do not infer cloud access from source settings.
