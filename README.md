# Golden One 网站部署与运营手册

Golden One 是面向海外品牌、活动、奖项、促销品经销商和采购团队的定制金属礼品商业网站。公开站、Keystatic 站长后台、Manager 内容后台、AI 翻译、D1 草稿、R2 图片与访问分析均由本仓库统一维护。

> **README 结构由站长锁定。** 本文件必须始终按以下七章及当前顺序维护：一、Repo 功能汇总；二、手把手部署教程；三、Keystatic 站长使用教程（折叠）；四、Manager 内容管理员使用教程（折叠）；五、项目重要位置；六、两阶段 Codex 建站流程（折叠）；七、避坑指南（折叠）。任何 AI 或自动化只能在改动所属章节更新内容，不得擅自改名、调序、拆分、合并或新增同级章节。部署边界、后台入口、变量配置、发布规则和已验证的故障结论必须保留；新增文字只写完成部署或使用所必需的步骤。

## 一、Repo 功能汇总

### 1. 技术架构

| 层级 | 实现 |
| --- | --- |
| 前台 | Astro 6、React、Tailwind CSS、Markdoc、多语言静态页面 |
| 运行环境 | Cloudflare Worker + Static Assets |
| 图片与附件 | Cloudflare R2，绑定名 `CONTENT_BUCKET` |
| 草稿与分析 | Cloudflare D1，绑定名 `MANAGER_DB` |
| 站长后台 | Keystatic GitHub mode，独立域名、UUID、用户名和密码 |
| 内容后台 | Manager，D1 草稿、R2 图片、审批写回 Git，独立域名、UUID、用户名和密码 |
| 自动化 | GitHub Actions：内容写回、AI 翻译，以及唯一的 Worker 构建部署链路 |
| 邮件 | Resend，可发送询盘内容和不超过 5 MB 的 JPG、PNG、WebP、PDF 艺术稿附件 |

### 2. 网站能力

- Golden One 定制徽章、奖牌、挑战币、钥匙扣和金属礼品产品架构。
- 产品分类、型号、材料、工艺、参数表、应用、FAQ、图库、详情图和排序管理。
- 博客、客户评价、询盘购物车、艺术稿上传、联系邮件和 R2 图片池。
- 英语为唯一源语言；站长以复选框启用目标语言，当前已启用西班牙语。
- AI 仅生成翻译草稿；审核与明确发布之前不会自动公开。
- Keystatic 直接管理 Git 内容；Manager 先写 D1 草稿，再经专用 Actions 写回 Git。
- 两套后台共用登录用户名 `PUBLIC_KEYSTATIC_GITHUB_APP_SLUG` 和密码 `KEYSTATIC_SECRET`，但使用不同 Host 和 UUID。

### 3. SEO/GEO 能力

- canonical、`hreflang`、多语言 sitemap、`robots.txt`、`llms.txt` 和机器可读产品目录。
- Organization、ProductGroup/Product、Service、BreadcrumbList、FAQPage 等结构化数据。
- 产品、文章、图片替代文本、内链和语言发布状态由同一内容源生成。
- 第一方无 Cookie 访问分析：浏览量、日访客、落地页、来源、关键词、国家、设备、语言、引荐站、Campaign 和最近访问。
- SEO 决策摘要、Google Search Console 搜索词机会、点击率与排名分析。
- 默认 `network` IP 模式，保存 IPv4 /24 或 IPv6 /48 网段；分析保留期为 365 天。
- 当前评价文件仍含明确标记的演示评价，`seoEligible` 为 `false`，上线前必须替换或删除。

### 4. 角色与入口

| 地址 | 使用者 | 作用 |
| --- | --- | --- |
| `https://goldenone.arkalpooltech.workers.dev/` | 海外访客 | Golden One 公开网站 |
| `https://admin.ebr.kdns.fr/KEYSTATIC_UUID` | 站长 | Git 内容、语言、翻译审核、分析、发布 |
| `https://manager.ebr.kdns.fr/MANAGER_UUID` | 内容管理员 | D1 草稿、R2、翻译、评价、发布 |
| `/r2/...` | 浏览器 | 当前 R2 资源代理地址 |

公开站上的 `/keystatic/`、`/manager/` 和受保护后台 API 必须返回 404。后台专用域名的根路径、错误 UUID 和无会话 API 也必须返回 404 或私有错误，不能回落到公开商业站。

### 5. 当前 Cloudflare 与 GitHub 配置

| 项目 | 当前值 |
| --- | --- |
| GitHub 仓库 | `yiloveM/goldenone260727` |
| 主分支 | `main` |
| Worker | `goldenone` |
| Cloudflare Account ID | `473b41497c5031874c630ecb9bc45ced` |
| R2 bucket | `goldenone` |
| R2 binding | `CONTENT_BUCKET` |
| D1 database | `goldenone` |
| D1 binding | `MANAGER_DB` |
| D1 Database ID | `2c5ddd64-6fe0-4fd9-af99-c100496ec872` |
| Keystatic Host | `admin.ebr.kdns.fr` |
| Manager Host | `manager.ebr.kdns.fr` |
| GitHub App slug / 后台用户名 | `goldenone260727` |
| GitHub Actions 部署 Secret | `CLOUDFLARE_API_TOKEN` |

### 6. 部署职责边界（站长锁定）

- `.github/workflows/site-publish.yml` 是唯一网站构建和部署系统：符合路径规则的 `main` push 自动运行，站长或 Manager 也可用 `workflow_dispatch` 明确发布。
- Cloudflare Workers Builds 和 Git repository connection 必须保持断开。Cloudflare 只运行 Worker、保存 D1/R2/KV 绑定、域名、Variables 和 Secrets，不进行第二次 Git 构建。
- GitHub Actions 每次发布只执行一次 `npm run build`；构建成功后才运行 Wrangler。部署重试不会重新构建。
- 产品、文章、翻译、网站语言和 `src/keystatic/*.json` 写回不自动部署，等待站长或内容管理员点击“发布网站更新”。
- `src/data/customer-reviews.json` 不在忽略路径中，评价写回 Git 后会自动部署。
- 内容写回 Actions 只修改 Git，不在写回任务内构建或部署。
- 部署 workflow 只读取 GitHub Secret `CLOUDFLARE_API_TOKEN`。Account ID 固定在 `wrangler.toml`，不再创建 `CLOUDFLARE_ACCOUNT_ID` Secret 或 Variable。
- 这条边界未经站长针对本次改动明确同意，任何 AI 或自动化不得修改。

## 二、手把手部署教程

以下步骤按“从现有资源重新部署或迁移到新 Worker”的实际顺序编写。Golden One 已断开 Cloudflare Workers 的 Git 存储库链接，后续不要重新连接。

### 第 1 步：核对仓库与本地项目

1. GitHub 仓库必须是 `yiloveM/goldenone260727`，默认分支必须是 `main`。
2. 本地项目目录是 `D:\aquamamaweb\goldenone`。
3. 检查 `wrangler.toml` 中的 Worker 名称、Account ID、R2 bucket、D1 Database ID、两个后台 Host 和公开站 URL。
4. 不要把 Aquamama、BusinessWeb 或其他客户的 Account ID、bucket、D1 ID、域名和 GitHub App 凭据复制进来。
5. 本地验证命令：

```powershell
npm clean-install
npm run types:cloudflare -- --check
npm run check
npm run check:template
npm run build
```

### 第 2 步：核对 Cloudflare 存储资源

1. 登录 Account ID 为 `473b41497c5031874c630ecb9bc45ced` 的 Cloudflare Account。
2. 打开 **Storage & databases -> R2**，确认 bucket `goldenone` 存在且 R2 已激活。
3. 打开 **Storage & databases -> D1**，确认数据库 `goldenone` 的 ID 是 `2c5ddd64-6fe0-4fd9-af99-c100496ec872`。
4. 在 D1 Console 执行仓库 `manager-portal/schema.sql` 的完整 SQL。脚本使用 `CREATE TABLE IF NOT EXISTS`，对已有正确表结构可重复执行。
5. Astro 的 `SESSION` KV 由 Cloudflare adapter 和 Wrangler 管理。除非部署日志明确要求，不要手工伪造 KV ID。

D1/R2 已存在不会阻止 Worker 创建或部署；绑定错误只会在 Wrangler 部署日志中报错，不会让 GitHub push“完全没有触发记录”。

### 第 3 步：确认 Cloudflare 原生 Git 构建已关闭

1. Cloudflare -> **Workers & Pages -> goldenone -> Settings -> Builds**。
2. 页面不得显示活动的 Git repository connection；若仍显示，点击 **Disconnect**。
3. 不配置 Build command、Deploy command、Build watch paths 或 Cloudflare Build Token。
4. 后续构建日志只在 GitHub 仓库的 **Actions** 页面查看，Cloudflare Build History 为 0 是正常现象。

### 第 4 步：创建唯一部署 API Token

1. Cloudflare 右上角头像 -> **My Profile -> API Tokens -> Create Token**。
2. 选择官方 **Edit Cloudflare Workers** 模板。
3. Account Resources 只选择 Account ID `473b41497c5031874c630ecb9bc45ced`。
4. 确认 Token 能编辑该 Account 的 Workers；使用模板给出的关联权限，不要拿 Global API Key、Build Token、R2 S3 Token 或 AI Key 代替。
5. 创建后立即复制一次完整 Token，保存到密码管理器。

### 第 5 步：配置 GitHub Actions

1. GitHub -> `yiloveM/goldenone260727` -> **Settings -> Secrets and variables -> Actions**。
2. 在 **Secrets** 新建一个 Repository secret：
   - Name：`CLOUDFLARE_API_TOKEN`
   - Secret：第 4 步生成的 Token
3. 不创建 `CLOUDFLARE_ACCOUNT_ID`；Account ID 已在 `wrangler.toml`。
4. GitHub -> **Settings -> Actions -> General**：
   - 允许 Actions 运行。
   - Workflow permissions 允许仓库工作流按 YAML 请求写入内容；Manager 与 AI 翻译写回需要 `contents: write`。
5. Cloudflare 部署凭据到此只有一条 GitHub Secret。

### 第 6 步：执行第一次 GitHub Actions 部署

1. 打开 GitHub 仓库 -> **Actions -> Publish Golden One Site**。
2. 如果推送的提交已经自动启动，直接打开该 Run；否则点击 **Run workflow -> main -> Run workflow**。
3. 日志必须按顺序出现：
   - Install dependencies
   - Verify Cloudflare authentication
   - Generate Cloudflare bindings
   - Build the Astro site
   - Deploy the Worker and static assets
4. `wrangler whoami` 若报 `9109`、invalid token 或 permission denied，更新 `CLOUDFLARE_API_TOKEN` 后在同一个 Actions 页面点 **Re-run failed jobs**。
5. 成功后回到 Cloudflare，确认 Worker `goldenone` 已存在且最新 Version 已部署。
6. 不要因为 Cloudflare Build History 没记录而重新连接 Git；本方案的日志本来就在 GitHub。

### 第 7 步：恢复或确认三个域名

1. Cloudflare -> Worker `goldenone` -> **Settings -> Domains & Routes**。
2. 公开站至少保留 `goldenone.arkalpooltech.workers.dev`。以后绑定正式域名时，再同步修改 `wrangler.toml` 的 `SITE_URL` 和 `src/data/site-origin.json` 的 `productionUrl`。
3. 使用 **Custom Domain** 添加：
   - `admin.ebr.kdns.fr`
   - `manager.ebr.kdns.fr`
4. 两个后台 Host 必须与 `wrangler.toml` 完全一致，不写协议、路径或 UUID。
5. 等待两个 Custom Domain 都显示 Active。
6. 不要把后台专用域名配置成 Route，也不要手工 CNAME 到 `workers.dev`。

### 第 8 步：生成两个 UUID 和后台密码

在 PowerShell 执行：

```powershell
$KeyStaticUuid = [guid]::NewGuid().ToString()
$ManagerUuid = [guid]::NewGuid().ToString()
$bytes = New-Object byte[] 48
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$rng.GetBytes($bytes)
$PortalPassword = [Convert]::ToBase64String($bytes)
$rng.Dispose()
"KEYSTATIC_PORTAL_UUID=$KeyStaticUuid"
"MANAGER_PORTAL_UUID=$ManagerUuid"
"KEYSTATIC_SECRET=$PortalPassword"
```

1. 三个值存入密码管理器；两个 UUID 必须不同，密码至少 32 个字符。
2. 后台登录用户名无需新建 Secret，固定使用 `wrangler.toml` 的 `PUBLIC_KEYSTATIC_GITHUB_APP_SLUG`，当前是 `goldenone260727`。
3. 修改 UUID 或密码后，保存 Cloudflare 设置并部署新 Version；旧会话会失效。
4. 登录地址分别是：
   - `https://admin.ebr.kdns.fr/KEYSTATIC_PORTAL_UUID`
   - `https://manager.ebr.kdns.fr/MANAGER_PORTAL_UUID`

### 第 9 步：确认 Golden One GitHub App

1. GitHub 右上角头像 -> **Settings -> Developer settings -> GitHub Apps**。
2. 打开 Golden One 使用的 App；slug 必须与 `goldenone260727` 一致。
3. Homepage URL 填站长完整入口：`https://admin.ebr.kdns.fr/KEYSTATIC_PORTAL_UUID`。
4. Callback URL 必须是：`https://admin.ebr.kdns.fr/api/keystatic/github/oauth/callback`。
5. Callback 不带 UUID，不写 `/keystatic/`。
6. Repository permissions -> **Contents: Read and write**。
7. 安装范围只选 `yiloveM/goldenone260727`。
8. 复制 Client ID；生成并复制 Client Secret。Revoke user token 不等于卸载 App，只要 App 仍安装在仓库且 Client Secret 有效，Keystatic 可以重新授权。

### 第 10 步：创建 Manager 后端 GitHub Token

1. 在对 `yiloveM/goldenone260727` 有写权限的 GitHub 账号中创建 fine-grained personal access token。
2. Repository access 只选择 `goldenone260727`。
3. Repository permissions 至少设置：
   - Contents：Read and write
   - Actions：Read and write
   - Metadata：Read-only
4. 保存 Token，名称建议记录为 Golden One Manager backend。
5. 该 Token 在 Worker 中使用 `BUSINESSWEB_GITHUB_TOKEN` 这个兼容变量名，供 Manager 写回、翻译调度和 Publish Site 调度共同复用；不需要再建多个发布 Token。

### 第 11 步：一次性配置 Worker Variables 与 Secrets

Cloudflare -> Worker `goldenone` -> **Settings -> Variables and Secrets**。

**必需 Variable：**

| 名称 | 值 |
| --- | --- |
| `KEYSTATIC_GITHUB_CLIENT_ID` | 第 9 步 GitHub App Client ID |

**必需加密 Secret：**

| 名称 | 值 |
| --- | --- |
| `KEYSTATIC_PORTAL_UUID` | 第 8 步站长 UUID |
| `MANAGER_PORTAL_UUID` | 第 8 步内容管理员 UUID |
| `KEYSTATIC_GITHUB_CLIENT_SECRET` | 第 9 步 App Client Secret |
| `KEYSTATIC_SECRET` | 第 8 步后台密码 |
| `BUSINESSWEB_GITHUB_TOKEN` | 第 10 步 fine-grained token |

`KEYSTATIC_GITHUB_CLIENT_SECRET` 同时作为站内密钥根。Worker 用 HKDF-SHA256 分别派生后台会话签名、匿名访客标识和联系表单验证码密钥。

`KEYSTATIC_SECRET` 同时是双后台登录密码、Keystatic OAuth secret 和 R2 图片池写入的 fallback。所有值保存后部署新 Version。`keep_vars = true` 会让后续 GitHub Actions Wrangler 部署保留 Dashboard 中未写入 `wrangler.toml` 的 Variables；Worker Secrets 无论 `keep_vars` 是否开启都不会被 Wrangler 部署删除。

### 第 12 步：配置 AI 翻译

1. GitHub 仓库 -> **Settings -> Secrets and variables -> Actions -> Secrets**。
2. 新建 `GEMINI_API_KEYS`，多个 Gemini API Key 用英文逗号分隔。
3. 可选在 **Variables** 新建 `GOOGLE_AI_TRANSLATION_MODEL`；不填则使用代码默认模型。
4. Worker 中不需要 Gemini Key；翻译只在 `AI Translation Drafts` GitHub Action 中执行。
5. Keystatic 或 Manager 提交任务后，Action 只写入：
   - `src/content/productTranslations/**`
   - `src/content/blogTranslations/**`
   - `.github/ai-translation-results/**`
6. 这些路径不会自动部署。审核完成后点击“发布网站更新”。

### 第 13 步：确认 R2 图片与 CDN

当前最少配置已经可用：

- bucket：`goldenone`
- binding：`CONTENT_BUCKET`
- 公开资源前缀：`https://goldenone.arkalpooltech.workers.dev/r2`
- `PUBLIC_R2_IMAGE_DELIVERY_MODE = "original"`

如以后启用独立 R2 CDN：

1. 在 R2 bucket -> **Settings -> Custom Domains** 绑定 CDN 子域名。
2. 等待证书和域名 Active。
3. 把 `PUBLIC_R2_ASSET_BASE_URL` 改成 CDN 根地址。
4. 确认旧 `/r2` 图片、新上传图片和 PDF 都能打开。
5. 只有在自定义域名的 Cloudflare 图片转换验证成功后，才把 delivery mode 改为 `edge-webp`；R2 内仍保存原图。

### 第 14 步：启用访问分析与可选 GSC

1. `wrangler.toml` 已配置：
   - `ANALYTICS_ENABLED = "true"`
   - `ANALYTICS_IP_MODE = "network"`
   - `ANALYTICS_RETENTION_DAYS = "365"`
2. 公开 HTML 请求由 Worker 异步写入 `MANAGER_DB`，不会给访客设置分析 Cookie。
3. `network` 模式允许保存 365 天；若改成 `full`，代码会把保留期限制为最多 30 天。
4. Keystatic -> **数据分析** 中的“在 Manager 显示网站访问分析”默认为关闭；本仓库的 `src/keystatic/analytics-dashboard.json` 已设为 `true`，所以本站 Manager 显示入口。
5. 修改该开关后保存，再点击“发布网站更新”；直接改 JSON 也不会自动部署。

可选接入 Google Search Console：

1. 创建只读 Google service account，并下载 JSON。
2. 在对应 Search Console property 中把 service account email 添加为用户。
3. Worker Secret 新建 `GOOGLE_SEARCH_CONSOLE_SERVICE_ACCOUNT_JSON`，粘贴完整 JSON。
4. 在 `wrangler.toml` 的 `GSC_SITE_URL` 填精确 property，例如 `sc-domain:goldenonemfg.com` 或完整 URL-prefix property。
5. 部署后，分析页会读取并在 D1 缓存约 6 小时；不配置时其它第一方分析照常工作。

### 第 15 步：启用询盘邮件与艺术稿附件

1. 在 Resend 验证发件域名。
2. Worker Secret 新建 `RESEND_API_KEY`。
3. Worker Variable 新建 `CONTACT_FROM_EMAIL`，填写已验证域名的发件地址。
4. `CONTACT_TO_EMAIL` 可选；不填时发送到 Golden One 站点资料中的 `sales@goldenonemfg.com`。
5. 联系表单验证码使用派生密钥，不再配置 `CONTACT_FORM_SECRET`。
6. 测试普通询盘和一个小于 5 MB 的 JPG、PNG、WebP 或 PDF 艺术稿；邮件必须包含页面、询盘产品和附件。
7. Resend 未配置时接口会明确返回配置错误，不会伪装为发送成功。

### 第 16 步：确认保存与发布规则

`site-publish.yml` 自动忽略：

```text
README.md
AGENTS.md
docs/**
.agents/**
**/*.txt
manager-portal/**
src/content/products/**
src/content/blog/**
src/content/productTranslations/**
src/content/blogTranslations/**
src/keystatic/*.json
src/data/site-language-settings.json
.github/ai-translation-results/**
```

因此：

| 操作 | 写入位置 | 是否自动部署 |
| --- | --- | --- |
| Keystatic/Manager 产品写回 | `src/content/products/**` | 否，等待 Publish Site |
| Keystatic/Manager 文章写回 | `src/content/blog/**` | 否，等待 Publish Site |
| AI 翻译和审核 | 翻译目录 | 否，等待 Publish Site |
| 网站语言或 Manager 分析开关 | 配置 JSON | 否，等待 Publish Site |
| 客户评价应用到网站 | `src/data/customer-reviews.json` | 是 |
| 前台、Worker、API、样式、配置代码 | 代码路径 | 是 |
| 点击“发布网站更新” | `workflow_dispatch` | 立即构建并部署当前 `main` |

### 第 17 步：全功能验收

1. 公开首页、产品、博客、联系表单和 sitemap 正常。
2. 公开站 `/keystatic/`、`/manager/`、`/api/manager/status` 返回 404。
3. 两个后台 Host 的根路径和错误 UUID 返回 404。
4. 两个正确 UUID 地址先显示 Golden One 登录面板。
5. 用户名填写 `goldenone260727`，密码填写 `KEYSTATIC_SECRET`。
6. Manager 能读取 D1 草稿、R2 图片、翻译语言和网站访问分析。
7. Keystatic 能完成 GitHub OAuth、保存内容、提交 AI 翻译和发布。
8. 提交一条不在忽略路径中的测试代码提交，GitHub Actions 自动运行；Cloudflare 不出现第二次 Git Build。
9. 运行：

```powershell
npm run types:cloudflare -- --check
npm run check
npm run check:template
npm run build
```

正式上线前还要运行 `npm run check:template:production`，并替换演示评价、核实公司事实、产品图、参数、认证和 SEO 研究状态。

## 三、Keystatic 站长使用教程

<details>
<summary>展开 Keystatic 站长教程</summary>

### 登录

1. 打开 `https://admin.ebr.kdns.fr/KEYSTATIC_PORTAL_UUID`。
2. 用户名填 `goldenone260727`，密码填 `KEYSTATIC_SECRET`。
3. 进入 Keystatic 后按提示完成 GitHub App 授权。
4. 不使用公开站 `/keystatic/`，也不从后台专用域名根路径进入。

### 品牌、网站语言与内容

1. **品牌与行业基础**：维护已核实公司资料、市场、关键词、产品架构和治理状态。
2. **网站语言**：英语不可关闭；勾选目标语言后保存。语言开关不会删除原翻译文件，也不会自动部署。
3. **产品管理/产品排序**：维护 Golden One 产品、图库、参数、型号、FAQ、发布状态与顺序。
4. **博客**：维护英语源文章和封面。
5. **评价系统**：演示评价只用于布局且不能进入 SEO；真实评价必须有可核实来源后才能设置 `seoEligible: true`。

### 图片池

1. 在 **图片池** 创建文件夹或上传图片/PDF。
2. 复制生成的 R2 URL，或在产品/文章字段中选择图片。
3. 删除和移动前确认没有产品、文章或前台区块继续引用该 URL。

### AI 翻译

1. 先在 **网站语言** 勾选目标语言。
2. 在 **AI 翻译助手** 选择产品、文章或指定 slug。
3. 默认不要勾选覆盖已有草稿；覆盖会重新消耗 API Token。
4. 提交后到 GitHub **AI Translation Drafts** 查看日志。
5. 在产品/文章翻译草稿中逐条预览、修改和审核。
6. 翻译提交与审核都不会自动部署；完成后使用 **发布网站更新**。

### 数据分析与校准

1. **数据分析** 显示 7、30、90、180、365 天范围。
2. 先看 SEO 决策摘要，再看落地页、来源、语言、引荐、Campaign 和 GSC 搜索词。
3. 只有站长可以添加或删除校准项；校准会记录审计信息。
4. “在 Manager 显示网站访问分析”控制内容管理员入口；保存后需发布网站。

### 发布网站更新

1. 确认产品、文章、语言和翻译草稿已经审核。
2. 点击 **发布网站更新**。
3. 页面会调度唯一的 `site-publish.yml`，不连接 Cloudflare Workers Builds。
4. 等待 GitHub Actions 成功后再检查公开站。

### 轮换后台凭据

1. 修改某个 UUID，只会更换对应完整入口。
2. 修改 `KEYSTATIC_SECRET` 会更换两个后台登录密码并使现有签名会话失效。
3. 修改 `KEYSTATIC_GITHUB_CLIENT_SECRET` 会使两个后台会话失效，并同时轮换三种派生运行时密钥；Keystatic 需重新授权。
4. 修改后关闭旧页面，从新完整入口重新登录。

</details>

## 四、Manager 内容管理员使用教程

<details>
<summary>展开 Manager 内容管理员教程</summary>

### 登录

1. 打开 `https://manager.ebr.kdns.fr/MANAGER_PORTAL_UUID`。
2. 用户名填 `goldenone260727`，密码填站长提供的后台密码。
3. 登录后页面显示“内容管理员”；看不到 Keystatic 的站长配置。
4. 页面提示登录过期时，关闭旧页并从完整入口重新登录。

### 产品、文章和图片

1. 产品/文章修改先保存为 D1 草稿，不会立刻影响公开站。
2. 点击应用后，专用 GitHub Action 将草稿写回仓库。
3. 产品、文章写回仍不会自动部署；完成一批内容后使用“发布网站更新”。
4. 图片池可上传、移动、删除和选择 R2 文件；删除前确认没有内容引用。
5. Golden One 产品中的金属礼品型号、工艺、参数、图库和艺术稿相关字段必须保留。

### AI 翻译与审核

1. 目标语言来自站长在 Keystatic 勾选的语言，不需要管理员填写 AI Key。
2. 提交任务后可关闭页面，GitHub Actions 在后台继续处理。
3. 在产品翻译草稿或文章翻译草稿中预览、编辑和审核。
4. 审核后仍需“发布网站更新”才会公开。

### 客户评价

1. 先保存评价草稿，再点击应用到网站。
2. 评价写回 `customer-reviews.json` 后会自动触发网站部署。
3. 只有真实、可核实且有来源的评价才能进入 SEO；演示评价保持 `seoEligible: false`。

### 网站访问分析

1. 只有站长开关为开启时，左侧显示“网站访问分析”。
2. 查看访问趋势、落地页、来源、关键词、国家、设备、语言、引荐和 Campaign。
3. SEO 决策摘要用于判断先优化哪个页面、标题、摘要、语言或流量来源。
4. Manager 为只读分析界面，数据校准由站长在 Keystatic 完成。

### 发布网站更新

1. 确认本批产品、文章和翻译都已写回 Git。
2. 点击 **发布网站更新**。
3. 等待页面显示成功；失败时把 GitHub Actions 日志交给站长，不要重复保存草稿。
4. 发布按钮调用唯一 GitHub Actions 部署链路，不会触发 Cloudflare Git Build。

</details>

## 五、项目重要位置

| 位置 | 作用 |
| --- | --- |
| `wrangler.toml` | Worker、Account ID、非敏感变量、R2/D1 绑定、`keep_vars` |
| `.github/workflows/site-publish.yml` | 唯一网站构建部署 workflow |
| `.github/workflows/ai-translation.yml` | AI 翻译草稿 |
| `.github/workflows/manager-apply-*.yml` | Manager 产品、文章、评价写回 |
| `src/worker.ts` | 双后台 Host/UUID/登录/会话、公开路径隔离、分析采集 |
| `src/lib/runtime-secret.ts` | HKDF 派生运行时密钥 |
| `src/lib/admin-portals.ts` | 后台 Host、UUID 和内部访问校验 |
| `src/lib/admin-portal-rewrite.ts` | Keystatic URL 重写与 Manager 防重复 UUID |
| `src/pages/manager/index.astro` | Manager 内容工作台 |
| `src/components/admin/AnalyticsDashboard.tsx` | 两套后台共用分析 UI |
| `src/lib/analytics/d1.ts` | D1 分析聚合 |
| `src/lib/analytics/capture.ts` | 无 Cookie 访问采集与保留期 |
| `src/pages/api/manager/ai/translation-locales.ts` | 受保护的 Manager 语言列表 |
| `keystatic.config.ts` | 站长字段、导航、语言和 Manager 分析开关 |
| `src/keystatic/analytics-dashboard.json` | Manager 分析入口当前状态 |
| `src/data/industry-profile.json` | Golden One 品牌、市场、产品架构与治理事实 |
| `src/data/site-language-settings.json` | 唯一目标语言启用源 |
| `src/data/site-origin.json` | 公开站生产 origin 与退役 Host |
| `src/content/products/` | 英语产品 |
| `src/content/blog/` | 英语文章 |
| `src/content/productTranslations/` | 产品翻译草稿/内容 |
| `src/content/blogTranslations/` | 文章翻译草稿/内容 |
| `src/data/customer-reviews.json` | 评价总开关、汇总与评价记录 |
| `src/pages/api/contact.ts` | 询盘验证码、Resend 和艺术稿附件 |
| `manager-portal/schema.sql` | Manager 草稿与访问分析 D1 表结构 |
| `scripts/run-wrangler-deploy-with-retry.mjs` | 仅瞬时错误部署重试 |
| `scripts/audit-feature-continuity.mjs` | 核心能力连续性检查 |
| `scripts/audit-template-readiness.mjs` | 建站和生产就绪检查 |
| `.agents/skills/businessweb-seo-geo/SKILL.md` | 两阶段建站执行规则 |
| `AGENTS.md` | AI 必须遵守的 Golden One 系统边界 |

## 六、两阶段 Codex 建站流程

<details>
<summary>展开两阶段 Codex 建站流程</summary>

### 第一阶段：行业视觉与信息架构

在真实产品资料全部上传前，把行业、核心英文关键词和需要的目标语言发给 Codex。设计参考是可选项，不需要为了启动第一阶段临时寻找参考站。

可直接使用：

```text
请为 Golden One 执行第一阶段建站。行业：Metal Gifts and Crafts。
核心英文关键词：lapel pin, challenge coin, medal, keychain, custom enamel pin,
custom metal lapel pin, military challenge coins, 3d challenge coin,
custom sports medals, running medals, leather keychain, anime keychain,
promotional keychains。
目标语言：英语为源语言；需要时启用指定目标语言。
保留现有 Golden One 品牌、产品结构、后台、部署和艺术稿上传功能。
```

Codex 必须：

1. 先读取 `AGENTS.md`、README 和 `.agents/skills/businessweb-seo-geo/SKILL.md`。
2. 需要重新初始化行业资料时使用 `npm run industry:brief -- --industry "Metal Gifts and Crafts" --keywords "lapel pin,challenge coin,medal,keychain"`，然后更新 `src/data/industry-profile.json`；不得编造认证、产能、交期、价格、客户或案例。
3. 依据定制金属礼品买家任务设计分类、产品比较、询盘路径、视觉系统和页面信息架构。
4. 使用真实或明确标注为可替换的视觉资产；不把示例图当成 Golden One 已生产项目。
5. 保留 Keystatic、Manager、D1、R2、翻译、评价、联系附件和部署边界。
6. 运行完整检查并交付可供上传真实资料的站点。

### 第二阶段：全站 SEO 与 GEO

当公司事实、产品图、参数、认证、FAQ 和目标市场已经核实，且网站可访问后，再发送：

```text
请对 Golden One 执行全站 SEO 和 GEO 优化。
行业：Metal Gifts and Crafts。
核心关键词：使用 industry-profile.json 中已经核实的关键词。
先查最新 Google Search Central、Schema.org 和当前行业搜索结果，
再优化页面、内容、结构化数据、多语言、图片、内链和机器可读输出。
不要编造任何事实。
```

Codex 必须先调查最新搜索规范和真实 SERP，再完成关键词到页面映射、标题与摘要、产品架构、图片 alt、内链、结构化数据、`hreflang`、sitemap、`llms.txt` 和产品目录。它必须根据 Golden One 实际业务判断单品、系列、服务和解决方案关系，不得伪造报价、库存、评分、认证、性能或交期。

</details>

## 七、避坑指南

<details>
<summary>展开避坑指南</summary>

### 本次部署迁移结论

- 旧 Cloudflare Workers Builds 若 Build History 为 0，说明 Git push 没有创建 Build trigger，流程尚未执行 build command、deploy command 或 Token 鉴权。
- 因此“完全没有构建记录”的根因不是 `CLOUDFLARE_API_TOKEN` 填错，也不是已有 D1/R2/KV 绑定。错误 Token 或绑定只会让已经启动的构建/部署失败，并留下日志。
- Cloudflare Build Token、GitHub Actions 的 `CLOUDFLARE_API_TOKEN`、GitHub App Client Secret、Manager GitHub PAT、R2 S3 Token 和 AI Key 是不同凭据，不能互换。
- Golden One 已永久绕过 Cloudflare Dashboard GitHub App 构建机制，由 GitHub Actions + Wrangler 部署。Cloudflare Workers Builds 保持断开。

### 常见部署问题

| 现象 | 根因位置 | 处理 |
| --- | --- | --- |
| push 后 Actions 没运行 | `paths-ignore` 或 Actions 未启用 | 看提交是否全部命中忽略路径；需要时手动 Run workflow |
| `wrangler whoami` 报 9109 | GitHub Secret Token 无效/账号不对 | 重建准确 Account 范围的 API Token |
| D1/R2 not found | `wrangler.toml` 的名称、ID 或 Account 错 | 核对 Golden One 资源，不要换绑定名 |
| Cloudflare Build History 为 0 | 正常 | 构建日志只在 GitHub Actions |
| 同一提交部署两次 | Cloudflare Git Build 被重新连接 | 断开 Builds，只保留 `site-publish.yml` |
| Dashboard Variable 部署后消失 | `keep_vars` 被删除 | 恢复 `keep_vars = true`；Secrets 本来不会被 deploy 删除 |
| 自动重试仍失败 | 鉴权、权限或绑定错误 | 重试器只处理网络、429、500/502/503/504；按首个确定性错误修复 |
| 构建卡在远程图片 | 图片 URL、HTTP 状态或网络问题 | 看具体 URL；不要通过启用第二套 CI 掩盖 |

### 后台登录与 API

- 正确入口是“后台专用 Host + 对应 UUID”，不是 `/keystatic/` 或 `/manager/`。
- 登录用户名取 `PUBLIC_KEYSTATIC_GITHUB_APP_SLUG`，密码取 `KEYSTATIC_SECRET`；修改 Cloudflare Secret 后必须部署新 Version 并重新登录。
- `KEYSTATIC_GITHUB_CLIENT_SECRET` 长度不足或缺失时，后台会话、访客标识和联系表单校验都不可用。
- Manager 请求必须添加当前 UUID 前缀。过去直接请求 `/api/ai/translation-locales` 会得到纯文本后台错误，随后前端把它当 JSON 解析，出现 `Unexpected token 'A'`；现在统一使用受保护的 `/api/manager/ai/translation-locales` 和安全 JSON 解析。
- Manager HTML 不再由 Worker批量改写 `/api/` 字符串；否则会把自身前缀函数也改写并产生双 UUID。
- Worker 必须把运行时 `env` 传给 Astro，再由 API 同时校验配置、Host 和内部标记；不能只靠浏览器 Header 放行。
- GitHub App Callback 必须是站长 Host 的 `/api/keystatic/github/oauth/callback`，不带 UUID。Revoke user token 后通常只需重新授权，不必反复卸载 App。

### 内容、语言和 SEO

- 产品、文章、翻译、语言和 Manager 分析开关故意不自动部署；“Git 已保存”不等于“公开站已发布”。
- 评价 JSON 故意触发自动部署；误把它加入忽略路径会让评价保存后长期不更新。
- 英语始终是源语言。关闭目标语言不会删除已有翻译文件。
- 当前演示评价不是商业证明，不得用于 Review 结构化数据；上线前必须换成可核实评价。
- `SITE_URL` 与 `site-origin.json` 的 `productionUrl` 必须一致，否则 canonical、sitemap、OAuth 和预览会出现不同 origin。
- R2 的 PDF 不应使用图片转换；切换 `edge-webp` 前必须验证自定义 CDN 与原图回退。
- 不把任何生产 Secret、UUID、PAT、API Key 或艺术稿写进仓库、README、`wrangler.toml` 或聊天记录。

</details>
