# Golden One 网站部署与运营手册

Golden One 是面向海外品牌、活动、奖项、促销品经销商和采购团队的定制金属礼品商业网站。公开站、Keystatic 站长后台、Manager 内容后台、AI 翻译、D1 草稿、R2 图片与访问分析均由本仓库统一维护。

> **README 结构由站长锁定。** 本文件必须始终按以下八章及当前顺序维护：一、Repo 功能汇总；二、手把手部署教程；三、Keystatic 站长使用教程（折叠）；四、Manager 内容管理员使用教程（折叠）；五、项目重要位置；六、两阶段 Codex 建站流程（折叠）；七、避坑指南（折叠）；八、预览功能（折叠）。任何 AI 或自动化只能在改动所属章节更新内容，不得擅自改名、调序、拆分、合并或新增同级章节。部署边界、后台入口、变量配置、发布规则和已验证的故障结论必须保留；新增文字只写完成部署或使用所必需的步骤。

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
| 邮件与留资 | Resend 将完整询盘发送到 `CONTACT_TO_EMAIL`；D1 同步保存访客资料、来源页和投递状态；保留不超过 5 MB 的 JPG、PNG、WebP、PDF 艺术稿附件 |

### 2. 网站能力

- Golden One 定制徽章、奖牌、挑战币、钥匙扣和金属礼品产品架构。
- 产品分类、型号、材料、工艺、参数表、应用、FAQ、图库、详情图和排序管理。
- 博客、客户评价、询盘购物车、艺术稿上传、共享 CAPTCHA、联系邮件、D1 留资和 R2 图片池。
- 英语为唯一源语言；站长以复选框启用目标语言，当前只额外启用西班牙语。新增的日语、马来语、荷兰语、希腊语和泰语预置均保持关闭。
- AI 仅生成翻译草稿；审核与明确发布之前不会自动公开。
- Keystatic 直接管理 Git 内容；Manager 先写 D1 草稿，再经专用 Actions 写回 Git。
- 两套后台共用登录用户名 `PUBLIC_KEYSTATIC_GITHUB_APP_SLUG` 和密码 `KEYSTATIC_SECRET`，但使用不同 Host 和 UUID。
- 可配置受控 PDF 下载默认关闭且白名单为空；客户资料 URL 只有在 CAPTCHA、D1 和 Resend 全部成功后才由服务端返回。
- Worker 优先读取 Astro 预渲染静态资源，避免 `/manager/`、文章和详情页被错误交给 SSR 后返回 404。

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
- 独立 `goldenone-preview` 只允许连接站长批准且已经存在的非 `main` 分支；分支不存在时不创建、不构建、不部署。预览可复用现有 R2/D1/分析配置，但不得接管生产域名或改变上述生产链路。

## 二、手把手部署教程

以下步骤按“从现有资源重新部署或迁移到新 Worker”的实际顺序编写。Golden One 的构建日志位于 GitHub Actions，Cloudflare 保持为接收 Wrangler 部署结果的运行平台。

### 第 1 步：核对仓库与本地项目

1. GitHub 仓库必须是 `yiloveM/goldenone260727`，默认分支必须是 `main`。
2. 本地项目目录是 `D:\cornerhardware\goldenone`。
3. 检查 `wrangler.toml` 中的 Worker 名称、Account ID、R2 bucket、D1 Database ID、两个后台 Host 和公开站 URL。
4. 本项目只使用本章列出的 Golden One Account ID、bucket、D1 ID、域名和 GitHub App 凭据。
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
5. Astro 的 `SESSION` KV 由 Cloudflare adapter 和 Wrangler 自动管理。

D1/R2 已存在不会阻止 Worker 创建或部署；绑定错误只会在 Wrangler 部署日志中报错，不会让 GitHub push“完全没有触发记录”。

### 第 3 步：确认 Cloudflare 原生 Git 构建已关闭

1. Cloudflare -> **Workers & Pages -> goldenone -> Settings -> Builds**。
2. 页面显示活动的 Git repository connection 时，点击 **Disconnect**。
3. 完成后页面应无 repository connection、Build command、Deploy command 和 Build Trigger。
4. 后续构建日志只在 GitHub 仓库的 **Actions** 页面查看，Cloudflare Build History 为 0 是正常现象。

### 第 4 步：创建唯一部署 API Token

1. Cloudflare 右上角头像 -> **My Profile -> API Tokens -> Create Token**。
2. 选择官方 **Edit Cloudflare Workers** 模板。
3. Account Resources 只选择 Account ID `473b41497c5031874c630ecb9bc45ced`。
4. 确认 Token 能编辑该 Account 的 Workers；部署凭据类型固定为此 API Token。
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
6. Cloudflare Build History 没有记录属于正常状态，完整日志以当前 GitHub Actions Run 为准。

### 第 7 步：恢复或确认三个域名

1. Cloudflare -> Worker `goldenone` -> **Settings -> Domains & Routes**。
2. 公开站至少保留 `goldenone.arkalpooltech.workers.dev`。以后绑定正式域名时，再同步修改 `wrangler.toml` 的 `SITE_URL` 和 `src/data/site-origin.json` 的 `productionUrl`。
3. 使用 **Custom Domain** 添加：
   - `admin.ebr.kdns.fr`
   - `manager.ebr.kdns.fr`
4. 两个后台 Host 必须与 `wrangler.toml` 完全一致，不写协议、路径或 UUID。
5. 等待两个 Custom Domain 都显示 Active。
6. 添加类型统一选择 **Custom Domain**，由 Cloudflare 自动管理 DNS 和证书。

### 第 8 步：一次生成全部后台登录凭据

打开 Windows PowerShell 5.1 或 PowerShell 7，整段粘贴后按一次 Enter：

```powershell
$bytes = New-Object byte[] 48
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
try {
  $rng.GetBytes($bytes)
  $credentials = [ordered]@{
    KEYSTATIC_PORTAL_UUID = [guid]::NewGuid().ToString()
    MANAGER_PORTAL_UUID   = [guid]::NewGuid().ToString()
    KEYSTATIC_SECRET      = [Convert]::ToBase64String($bytes).Replace('+', '-').Replace('/', '_')
  }
} finally {
  $rng.Dispose()
}

$lines = $credentials.GetEnumerator() | ForEach-Object { '{0}={1}' -f $_.Key, $_.Value }
$lines
if (Get-Command Set-Clipboard -ErrorAction SilentlyContinue) {
  $lines | Set-Clipboard
  Write-Host "以上三行已复制到剪贴板。"
}
```

1. 命令会一次输出三条带名称的值；系统支持剪贴板时还会自动复制。
2. 三个值存入密码管理器。填写 Cloudflare Secret 时，名称使用等号左侧，值只复制等号右侧。
3. 后台登录用户名无需新建 Secret，固定使用 `wrangler.toml` 的 `PUBLIC_KEYSTATIC_GITHUB_APP_SLUG`，当前是 `goldenone260727`。
4. 修改 UUID 或密码后，保存 Cloudflare 设置并部署新 Version；旧会话会失效。
5. 登录地址分别是：
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

`KEYSTATIC_GITHUB_CLIENT_SECRET` 同时作为站内密钥根。Worker 用 HKDF-SHA256 分别派生后台会话签名、匿名访客标识和公共表单 CAPTCHA 密钥；旧版的四个拆分 Secret 已不再需要。

`KEYSTATIC_SECRET` 同时是双后台登录密码、Keystatic OAuth secret 和 R2 图片池写入的 fallback，因此也不必额外创建 `R2_IMAGE_POOL_WRITE_TOKEN`。所有值保存后部署新 Version。`keep_vars = true` 会让后续 GitHub Actions Wrangler 部署保留 Dashboard 中未写入 `wrangler.toml` 的 Variables；Worker Secrets 无论 `keep_vars` 是否开启都不会被 Wrangler 部署删除。

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

当前 Worker 代理模式已经可用：

- bucket：`goldenone`
- binding：`CONTENT_BUCKET`
- 公开资源前缀：`https://goldenone.arkalpooltech.workers.dev/r2`
- `PUBLIC_R2_IMAGE_DELIVERY_MODE = "original"`

先用无痕窗口打开一个现有 `/r2/` 图片地址。能正常显示时，说明 Worker、`CONTENT_BUCKET` 和 bucket `goldenone` 的现有绑定有效。下面按步骤把它升级为独立 R2 CDN。

#### 13.1 准备 CDN 主机名

1. 选择 Golden One 专用 CDN 主机名，例如 `cdn.goldenonemfg.com`。
2. 打开 Cloudflare Account 首页，确认该根域名的 Zone 位于 Account ID `473b41497c5031874c630ecb9bc45ced`，状态为 **Active**。
3. 根域名尚未加入 Cloudflare 时，先进入 **Websites -> Add a domain**，输入根域名并完成页面要求的 nameserver 设置。
4. 等 Zone 变为 Active 后继续。R2 Custom Domain 只能连接同一 Cloudflare Account 中可管理的 Zone。

#### 13.2 把 CDN 主机名连接到 R2

1. Cloudflare 左侧进入 **Storage & databases -> R2 Object Storage**。
2. 点击 bucket `goldenone`。
3. 打开 **Settings**。
4. 找到 **Custom Domains**，点击 **Add** 或 **Connect Domain**。
5. 输入 CDN 主机名，例如 `cdn.goldenonemfg.com`；这里只填主机名。
6. 页面要求选择 Zone 时，选择 Golden One 正式域名。
7. 确认连接，等待状态从 Pending 变为 **Active**。
8. 在同一 Settings 页面找到 **Public Development URL**，确认状态为 **Disabled**。

#### 13.3 创建 CDN 缓存规则

1. 返回 Cloudflare Account，点击 CDN 主机名所属的网站 Zone。
2. 左侧进入 **Rules -> Cache Rules**。
3. 点击 **Create rule**。
4. Rule name 填 `Golden One R2 public media cache`。
5. 选择 **Custom filter expression**，填写：

```text
(http.host eq "cdn.goldenonemfg.com"
 and http.request.method in {"GET" "HEAD"})
```

6. 如果实际 CDN 主机名不同，把表达式中的示例换成真实值。
7. **Cache eligibility** 选择 **Eligible for cache**。
8. **Edge TTL** 选择 **Respect existing headers**。
9. **Browser TTL** 选择 **Respect existing headers**。
10. **Cache key / Caching level** 保持 **Standard**，不要全局忽略 Query String。
11. 点击 **Deploy**，回到规则列表确认状态为 Enabled。
12. 进入 **Caching -> Tiered Cache**；新版界面如归入 Smart Shield，则进入对应页面。启用 **Tiered Cache** 并选择 **Smart** topology。
13. 不为 R2 CDN 启用 Cache Reserve；R2 来源请求不使用该能力。
14. 同 key 曾返回 404、被覆盖或删除时，在 **Caching -> Configuration -> Purge Cache -> Custom Purge** 按 URL 清理缓存。

#### 13.4 配置不影响 SEO 的防盗链

##### 13.4.1 固定策略

1. **Security -> Settings** 中全局 **Hotlink Protection** 保持 **Off**。该全局开关覆盖格式有限，并可能阻止 Google Images、Pinterest 和 Facebook；Golden One 的公开媒体还包括 WebP、AVIF、SVG 和 PDF，因此使用下面的精确 WAF 规则。
2. R2 bucket 的 **Public Development URL (`r2.dev`)** 保持 **Disabled**，避免绕过自定义域名的 WAF 与缓存。
3. 始终允许空 `Referer`。直接打开图片/PDF、隐私浏览器、搜索抓取和 Cloudflare 图片请求都可能没有 Referer。
4. 允许 `cf.client.bot` 验证机器人，确保 Googlebot、Bingbot 等不进入阻断条件。
5. 公开产品图、文章图、Open Graph 图和公开 PDF 不加登录、Cookie、短时 HMAC 或一次性 URL，保持稳定、可抓取、可缓存。

##### 13.4.2 阻断非读取方法

1. 进入 **Security -> Security rules -> WAF -> Custom rules -> Create rule**。
2. Rule name 填 `Golden One CDN read methods only`。
3. 把示例主机名换成真实 CDN 后填写：

```text
(http.host eq "cdn.goldenonemfg.com"
 and not (http.request.method in {"GET" "HEAD" "OPTIONS"}))
```

4. Action 选择 **Block**。Manager 和 Keystatic 通过 Worker 的 R2 binding 上传，不通过 CDN 自定义域名，因此不受影响。

##### 13.4.3 观察后阻断明确第三方嵌入

1. 在 **Security Analytics / Security Events** 按 CDN Host 和非空 Referer 筛选，连续观察至少 48 小时；先记录主站、两个后台、搜索、社交预览和实际预览 Worker 来源。
2. 创建规则前，把下列主机替换为 Golden One 的真实公开站、后台和 CDN。表达式只匹配“非空 Referer、非验证机器人、且明确来自未授权第三方”的 GET/HEAD 请求：

```text
(http.host eq "cdn.goldenonemfg.com"
 and http.request.method in {"GET" "HEAD"}
 and http.referer ne ""
 and not cf.client.bot
 and not starts_with(lower(http.referer), "https://www.goldenonemfg.com/")
 and not starts_with(lower(http.referer), "https://goldenone.arkalpooltech.workers.dev/")
 and not starts_with(lower(http.referer), "https://admin.ebr.kdns.fr/")
 and not starts_with(lower(http.referer), "https://manager.ebr.kdns.fr/")
 and not starts_with(lower(http.referer), "https://cdn.goldenonemfg.com/")
 and not starts_with(lower(http.referer), "http://localhost:")
 and not starts_with(lower(http.referer), "http://127.0.0.1:")
 and not starts_with(lower(http.referer), "https://www.google.")
 and not starts_with(lower(http.referer), "https://images.google.")
 and not starts_with(lower(http.referer), "https://lens.google.")
 and not starts_with(lower(http.referer), "https://www.bing.com/")
 and not starts_with(lower(http.referer), "https://cn.bing.com/")
 and not starts_with(lower(http.referer), "https://www.facebook.com/")
 and not starts_with(lower(http.referer), "https://l.facebook.com/")
 and not starts_with(lower(http.referer), "https://www.pinterest.")
 and not starts_with(lower(http.referer), "https://pinterest.")
 and not starts_with(lower(http.referer), "https://www.linkedin.com/")
 and not starts_with(lower(http.referer), "https://lnkd.in/")
 and not starts_with(lower(http.referer), "https://x.com/")
 and not starts_with(lower(http.referer), "https://t.co/"))
```

3. `www.goldenonemfg.com` 只是待正式域名确认的示例；未绑定前删除该行，绑定后改成准确 Origin。预览分支不存在时不加预览来源；存在后只加入其准确 `workers.dev` Origin。
4. 合法经销商或合作平台确需嵌入时，只增加准确 HTTPS Origin 和尾部 `/`，不要用宽泛的 `contains`。
5. 套餐有 **Log** action 时先运行 24-72 小时；确认无误后 Rule name 填 `Golden One CDN explicit third-party hotlinks`，Action 选 **Block**。不要选 Managed Challenge 或 JavaScript Challenge，媒体请求无法完成挑战。
6. 误拦截时先关闭这一条第三方防盗链规则；缓存规则和读取方法规则不需回滚。

##### 13.4.4 不采用的方案

- CORS 不能阻止 `<img>` 盗链，不替代 WAF。
- R2 presigned URL 只适用于 S3 API 域名，不能直接用于 R2 自定义域名。
- WAF timed HMAC 适合未来独立的私有/付费下载前缀，不适合公开 SEO 图片、Open Graph 和公开 PDF。
- 不为隐藏 `/cdn-cgi/image/` 另建图片 Worker；这会增加缓存、递归转换和故障风险，不构成访问控制。

#### 13.5 修改 Golden One 配置

1. 打开本地 `wrangler.toml`。
2. 把公开资源前缀改成真实 CDN 根地址，保留原图模式：

```toml
PUBLIC_R2_ASSET_BASE_URL = "https://cdn.goldenonemfg.com"
PUBLIC_R2_IMAGE_DELIVERY_MODE = "original"
```

3. URL 包含 `https://`，末尾不加斜杠。
4. 提交到 `main`，等待 **Publish Golden One Site** 部署成功。
5. 旧 `workers.dev/r2` 地址仍可读取，部署后的新上传文件会使用 CDN 地址。

#### 13.6 上传图片和 PDF 验证

1. 登录 Manager 或 Keystatic 图片池。
2. 上传一张 JPG 或 PNG，再上传一个 PDF。
3. 复制两个公开 URL，确认主机名是 Golden One CDN 域名。
4. 使用无痕窗口分别打开，确认图片正常显示、PDF 正常下载。
5. 打开公开首页、产品页和文章页，确认所有图片均正常。
6. Cloudflare CDN Zone -> **Analytics & Logs**，确认该主机名开始出现请求。

#### 13.7 可选启用边缘 WebP

1. CDN Zone 左侧进入 **Media -> Images -> Transformations** 或 **Image Transformations**。
2. 按页面提示为当前 Zone 启用图片转换。
3. 使用刚上传的 JPG 测试：

```text
https://cdn.goldenonemfg.com/path/image.jpg
https://cdn.goldenonemfg.com/cdn-cgi/image/format=webp,quality=82/path/image.jpg
```

4. 浏览器按 `F12` -> **Network** -> 转换请求。
5. 响应状态为 200 且 `content-type` 为 `image/webp` 后，把配置改为：

```toml
PUBLIC_R2_IMAGE_DELIVERY_MODE = "edge-webp"
```

6. 转换未开通时维持 `original`。R2 中只保存原图，PDF 始终保持原格式。
7. 启用防盗链后同时验证原图和 `/cdn-cgi/image/` 转换 URL；两者都必须允许 Golden One、空 Referer 和验证机器人。

#### 13.8 防盗链与缓存验收

```powershell
$asset = 'https://cdn.goldenonemfg.com/<真实对象-key>'
curl.exe -I $asset
curl.exe -I -e 'https://goldenone.arkalpooltech.workers.dev/products/' $asset
curl.exe -I -e 'https://images.google.com/' $asset
curl.exe -I -e 'https://unauthorized.example/hotlink-test' $asset
```

1. 前三条应返回 `200`；第三方规则启用后最后一条应返回 `403`。第一条专门确认空 Referer 可直接访问。
2. 连续请求同一 URL，预热后检查 `CF-Cache-Status: HIT`；不要要求第一次请求就是 HIT。
3. 在无痕窗口检查首页、分类、产品详情、文章、分享预览、PDF、Manager、Keystatic 和实际存在的预览 Worker，确认没有坏图或 403。
4. Security Events 中被拦截请求必须都带非空未授权 Referer；发现合法来源时先停用规则再精确补 Origin。
5. 不给公开 CDN 对象添加 `X-Robots-Tag: noindex`、登录、Cookie 或签名参数。
6. 规则依据母版已核验的 Cloudflare 官方文档：[R2 public buckets](https://developers.cloudflare.com/r2/buckets/public-buckets/)、[R2 cache](https://developers.cloudflare.com/cache/interaction-cloudflare-products/r2/)、[Cache Rules](https://developers.cloudflare.com/cache/how-to/cache-rules/)、[Hotlink Protection](https://developers.cloudflare.com/waf/tools/scrape-shield/hotlink-protection/)、[verified bots](https://developers.cloudflare.com/waf/custom-rules/use-cases/allow-traffic-from-verified-bots/)、[R2 presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/)。

#### 13.9 按授权旧站映射上传 R2

仅在客户明确授权旧站迁移时执行：

```powershell
npm run oldsite:crawl -- --url "https://old.example.com" --authorized --rebuild
npm run oldsite:prepare -- --bucket "goldenone" --cdn-base "https://cdn.goldenonemfg.com"
cd .\oldsite\r2-upload\legacy
.\upload.ps1 -Bucket 'goldenone' -DryRun
.\upload.ps1 -Bucket 'goldenone'
```

`upload.ps1` 逐条读取 `r2-upload-manifest.json` 的 `packageFile -> r2ObjectKey`，因此从任意本地 A 文件夹运行都会上传到同一映射 key，不会带入盘符或本地包装目录。每个 key 结合原页面 slug、真实 `alt/title/caption` 或原文件名、同页语义角色和短内容哈希；上传前按关键词到页面映射复核 `seoKeyBasis`，不得塞入与媒体无关的关键词。完整流程见 `docs/OLD-SITE-MIGRATION.md`。

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
4. Worker Variable 新建 `CONTACT_TO_EMAIL`，填写实际询盘收件邮箱；这是必填项，不再回退到站点公开邮箱。
5. 联系表单统一使用共享 CAPTCHA，密钥由现有根 Secret 派生，不再配置 `CONTACT_FORM_SECRET`。
6. 确认第 2 步已执行最新版 `manager-portal/schema.sql`，D1 中存在 `public_form_submissions`。
7. 测试普通询盘和一个小于 5 MB 的 JPG、PNG、WebP 或 PDF 艺术稿；邮件必须包含来源页面、完整访客资料、询盘产品和附件，D1 还应记录艺术稿文件名与 `delivery_status`。
8. Resend 未配置、D1 保存失败或 CAPTCHA 无效时接口会明确失败，不会伪装为发送成功。

查询最近留资：

```sql
SELECT form_type, source_page, name, email, phone_whatsapp, company_project,
       country, selected_pdf, attachment_name, delivery_status, resend_email_id, created_at
FROM public_form_submissions
ORDER BY created_at DESC
LIMIT 50;
```

#### 15.1 按需启用受控 PDF 下载

1. 当前 `src/data/catalog-downloads.json` 保持 `enabled: false` 且列表为空，不会改变 Golden One 前台。
2. 确有需求时，先把已核实 PDF 上传到 R2/CDN，并逐个验证 HTTPS 地址。
3. Keystatic -> **站点设置 -> 受控下载**，保持总开关关闭，填写唯一 ID、真实文件名、访客标题、说明和 R2/CDN 地址。
4. 按买家流程把 `CatalogDownloadGate.astro` 接入指定客户页面并匹配当时的公共视觉；本次能力迁移不自动放置组件。
5. 验证 CAPTCHA、D1、Resend 和文件白名单后再勾选总开关并点击“发布网站更新”。
6. 成功前页面 HTML 不得包含 PDF 直链；成功邮件只发送访客资料和所选 PDF 名称，不发送 PDF 附件。
7. 关闭总开关并发布后，配置和历史留资保留，`/api/download` 返回 404。

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
src/data/catalog-downloads.json
.github/ai-translation-results/**
```

因此：

| 操作 | 写入位置 | 是否自动部署 |
| --- | --- | --- |
| Keystatic/Manager 产品写回 | `src/content/products/**` | 否，等待 Publish Site |
| Keystatic/Manager 文章写回 | `src/content/blog/**` | 否，等待 Publish Site |
| AI 翻译和审核 | 翻译目录 | 否，等待 Publish Site |
| 网站语言、受控下载或 Manager 分析开关 | 配置 JSON | 否，等待 Publish Site |
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
7. 关闭评价系统时 Manager 不显示评价入口；Manager 主界面与分析页左上角显示同一内容负责人名称。
8. Keystatic 能完成 GitHub OAuth、保存内容、提交 AI 翻译和发布，且保存 JSON singleton 不产生 `.json.json`。
9. 联系表单 CAPTCHA 可加载/刷新，成功提交同时进入 D1 和 `CONTACT_TO_EMAIL`。
10. 提交一条不在忽略路径中的测试代码提交，GitHub Actions 自动运行；Cloudflare 不出现第二次 Git Build。
11. 运行：

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
6. **受控下载**：按开关下方小字顺序操作，先上传并验证 PDF，再填写白名单，再确认页面组件、D1、Resend 和 CAPTCHA，最后才开启并发布。当前保持关闭且为空。

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
4. 本次后台统一会话 Cookie 后，升级前已登录的浏览器需要从完整 UUID 入口重新登录一次。
5. 修改后关闭旧页面，从新完整入口重新登录。

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

评价总开关关闭时，Manager 左侧不显示此入口；内容管理员不能绕过站长开关开启评价系统。

1. 先保存评价草稿，再点击应用到网站。
2. 评价写回 `customer-reviews.json` 后会自动触发网站部署。
3. 只有真实、可核实且有来源的评价才能进入 SEO；演示评价保持 `seoEligible: false`。

### 网站访问分析

1. 只有站长开关为开启时，左侧显示“网站访问分析”。
2. 查看访问趋势、落地页、来源、关键词、国家、设备、语言、引荐和 Campaign。
3. SEO 决策摘要用于判断先优化哪个页面、标题、摘要、语言或流量来源。
4. Manager 为只读分析界面，数据校准由站长在 Keystatic 完成。
5. 左上角公司名称与 Manager 主界面统一读取“品牌与行业基础”的内容负责人。

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
| `src/worker.ts` | 双后台统一登录/会话、静态资源优先、公开路径隔离、下载 API 与分析采集 |
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
| `src/data/catalog-downloads.json` | 受控下载总开关和服务端 PDF 白名单；当前关闭且为空 |
| `src/data/site-origin.json` | 公开站生产 origin 与退役 Host |
| `src/content/products/` | 英语产品 |
| `src/content/blog/` | 英语文章 |
| `src/content/productTranslations/` | 产品翻译草稿/内容 |
| `src/content/blogTranslations/` | 文章翻译草稿/内容 |
| `src/data/customer-reviews.json` | 评价总开关、汇总与评价记录 |
| `src/lib/form-captcha.ts` | 联系与下载表单共用的签名 CAPTCHA |
| `src/lib/public-form-submissions.ts` | 公开表单 D1 留资和 Resend 投递状态 |
| `src/pages/api/contact.ts` | 询盘 CAPTCHA、D1、Resend 和艺术稿附件 |
| `src/pages/api/download.ts` | 受控下载白名单、D1、Resend 与成功后 URL 返回 |
| `src/components/CatalogDownloadGate.astro` | 仅在明确启用时接入客户页面的通用下载门控组件 |
| `manager-portal/schema.sql` | Manager 草稿、访问分析与公开表单留资 D1 表结构 |
| `scripts/run-wrangler-deploy-with-retry.mjs` | 仅瞬时错误部署重试 |
| `scripts/audit-feature-continuity.mjs` | 核心能力连续性检查 |
| `scripts/audit-template-readiness.mjs` | 建站和生产就绪检查 |
| `scripts/crawl-authorized-oldsite.mjs` | 已授权旧站公开页面、元数据与媒体采集 |
| `scripts/prepare-oldsite-r2.mjs` | 逐页媒体目录、R2 key 映射、manifest 与 `upload.ps1` 生成 |
| `scripts/audit-oldsite-routes.mjs` | 原 URL、内容、媒体和 SEO 对应关系审计 |
| `scripts/run-preview-deploy.mjs` | 远端预览分支存在性与独立 Worker 门禁 |
| `docs/OLD-SITE-MIGRATION.md` | 授权旧站归档、原 URL 继承和 R2 上传流程 |
| `docs/AI-INDUSTRY-BUILD-PROMPT.md` | 第一阶段完整输入与 A/B/C/D 边界提示词 |
| `docs/ASTROWIND-INTEGRATION.md` | AstroWind 只作为工程参考的边界 |
| `docs/PUBLIC-VISUAL-FOUNDATION.md` | Golden One 公共视觉与通用能力隔离边界 |
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
旧站迁移 URL：无。
需要留资下载的资料：不启用。
指定参考站点：无；按当前行业与买家任务研究。
编辑前先按 A 决策规则、B 通用工程能力、C Golden One 公共实现、D 客户数据产物归类；如需修改技术栈、工程能力或部署边界，先说明差异并等待“确认修改能力”。
```

Codex 必须：

1. 先读取 `AGENTS.md`、README 和 `.agents/skills/businessweb-seo-geo/SKILL.md`。
2. 需要重新初始化行业资料时使用 `npm run industry:brief -- --industry "Metal Gifts and Crafts" --keywords "lapel pin,challenge coin,medal,keychain"`，然后更新 `src/data/industry-profile.json`；不得编造认证、产能、交期、价格、客户或案例。
3. 依据定制金属礼品买家任务设计分类、产品比较、询盘路径、视觉系统和页面信息架构。
4. 使用真实或明确标注为可替换的视觉资产；不把示例图当成 Golden One 已生产项目。
5. 保留 Keystatic、Manager、D1、R2、翻译、评价、联系附件和部署边界。
6. 如明确提供“旧站迁移+网址”，先按 `docs/OLD-SITE-MIGRATION.md` 保存公开页面、文案、参数、元数据、媒体和原 URL；旧站逐页真实文案是唯一改写底稿，Google 靠前同行业页面只用于学习买家语言、术语、信息密度和句式节奏。必须在旧文案基础上去 AI 化，不得脱离旧文案从零生成，也不得改变事实或抄写竞争者。
7. 检查导航/二级菜单、轮播、图库、标签、筛选、分享、询盘车、表单、CAPTCHA、键盘/触摸、错误状态、重复标题和模板遗留。
8. 运行完整检查并交付可供上传真实资料的站点。

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
| Manager 或预渲染详情页 404 | Worker 未先查 Static Assets | 保留 `ASSETS` binding、`html_handling = "none"` 和静态资源优先路由 |
| 保存后出现 `*.json.json` | Keystatic singleton path 错带 `.json` | path 去掉扩展名，迁移有效数据后删除重复文件 |
| CAPTCHA 无法加载 | 根 Secret、Host/API 路由或部署版本不一致 | 核对后台根 Secret 与公开 API，重新部署并测试加载、刷新和过期 |
| 受控下载返回 404 | 总开关关闭、白名单为空或页面未接入 | 按 Keystatic 小字顺序配置；无真实资料时保持关闭即为正常 |

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

## 八、预览功能

<details>
<summary><strong>展开预览分支与独立 Worker 配置</strong></summary>

### 适用边界

- 预览只用于客户查看非 `main` 分支的公共页面、响应式和浏览器功能。
- 生产仍由 `.github/workflows/site-publish.yml` 独占，生产 Worker `goldenone`、生产域名、资源 ID 和 `main` 发布规则不变。
- 预览使用独立 `goldenone-preview`。它可以复用当前 R2、D1、分析和公开运行变量，但不绑定生产自定义域名。

### 分支不存在时

远端预览分支不存在时，不创建、不构建、不部署预览 Worker，也不连接 Cloudflare Git。`npm run preview:deploy` 会在部署前检查远端分支并拒绝 `main`。

### 分支存在后首次创建

1. 创建并推送站长批准的非 `main` 预览分支。
2. 在该分支运行：

```powershell
npm run preview:deploy -- --branch "<preview-branch>" --worker "goldenone-preview"
```

3. 确认命令检测到远端分支、构建成功并部署到独立 Worker。
4. 用 `workers.dev` 预览地址检查全部公开页面和所需功能；不要添加生产自定义域名。

### 连接 Cloudflare Git

1. 只在远端预览分支已存在且需要持续客户预览时，进入 Cloudflare -> **Workers & Pages -> goldenone-preview -> Settings -> Build -> Connect**。
2. 连接 `yiloveM/goldenone260727`，Root directory 填 `/`。
3. Build command 填 `npm run build`。
4. Deploy command 填 `npm run preview:deploy -- --branch "$WORKERS_CI_BRANCH" --worker "goldenone-preview"`。
5. Production branch 只选择该预览分支，不选择 `main`。
6. 关闭 **Builds for non-production branches**，确保其它分支和 `main` 不触发该 Worker。
7. `goldenone` 生产 Worker 的 Cloudflare Git 继续保持断开；`main` 仍只由 GitHub Actions 发布。

Cloudflare 控制台会把所选分支称为 `goldenone-preview` 的 production branch，但它仍是流量、名称和职责独立的预览 Worker，不是 Golden One 正式生产环境。分支控制参考 [Cloudflare Workers Builds branches](https://developers.cloudflare.com/workers/ci-cd/builds/build-branches/)。

### 验收与停止

1. 验证预览 URL、R2 图片、语言、表单、后台隔离和浏览器交互，不把预览结果当作生产流量数据结论。
2. 合并或删除预览分支不会改变 `main` 的唯一生产发布链路。
3. 不再需要预览时，断开 `goldenone-preview` 的 Git 连接；是否删除独立 Worker 由站长决定。

</details>
