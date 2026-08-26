# BusinessWeb 国际品牌网站模板

这是面向海外买家、经销商、项目团队和决策者的通用 B2B 商业网站模板。公开网站采用 Astro 6、Tailwind 和 Cloudflare Workers；图片放在 Cloudflare R2；内容管理员通过独立 Manager 专用域名与 UUID 工作；站长通过另一个独立 Keystatic 专用域名与 UUID 管理 Git 内容、行业基础信息、图片和发布。公开页面访问由 Worker 异步写入现有 D1，两个后台共用一套访问分析界面，Google Search Console 可选接入真实搜索词、曝光、点击率和排名。

默认公开语言只有英语。站长在 `/keystatic/` 的 **网站语言** 页面用复选框管理其它语言。`/manager/` 和 AI 翻译只显示站长已勾选的语言；公开语言切换器、`hreflang` 和站点地图只纳入固定 UI、页面文案与 FAQ 已完成审核的语言。

## 先看这张图

```text
客户提供真实资料
        |
        +--> 站长 Keystatic 专用域名/UUID --> GitHub 内容文件 ------> 自动部署或手动发布 ------> 公开网站
        |
        +--> Manager 专用域名/UUID --------> D1 草稿 -> 审核/写回 Git -> 发布 -------------> 公开网站
        |
        +--> 图片 --------------------------> R2 图片池 -------------------------------> CDN 图片地址

公开 HTML 请求 --> Worker 无 Cookie 采集 --> D1 原始日志 + 站长校准项 --> Keystatic / Manager 同一统计结果
Google Search Console ---------------------> 只读 API + 6 小时 D1 缓存 -------> 两个后台搜索表现

AI 翻译：英语源内容 -> GitHub Actions 生成草稿 -> 人工审核 -> 手动 Publish Site -> 公开目标语言页
```

| 地址 | 谁使用 | 用途 |
| --- | --- | --- |
| `/` | 海外访客 | 国际品牌公开网站 |
| `https://站长后台专用域名/KEYSTATIC_UUID` | 站长/网站所有者 | Git 内容、行业基础、图片、翻译审核、发布、访问分析与付费数据校准 |
| `https://内容后台专用域名/MANAGER_UUID` | 内容级管理员 | D1 草稿、R2 图片、内容审批、翻译任务、发布记录、只读访问分析 |
| `/r2/...` | 浏览器 | R2 图片代理地址，不应被搜索收录 |

公开主域上的 `/keystatic/`、`/manager/` 及受保护后台 API 会直接返回不可索引的 404；后台专用域名的根路径和错误 UUID 也不会回落到商业前台。不要公开、推广或搜索收录完整后台 UUID 地址；`/api/` 与 `/r2/` 也已在 robots 中排除。

## 一、复制给新客户

每个客户必须使用一个独立 GitHub 仓库、独立 Cloudflare Worker、独立 R2/KV/D1 资源和独立密钥。不要让两个客户共用生产资源。

### 方式 A：GitHub 网页复制，推荐

1. 打开本模板的 GitHub 仓库主页。
2. 点击右上角 **Use this template**。如果仓库没有显示该按钮，使用方式 B。
3. 选择 **Create a new repository**。
4. 填写新客户的仓库名称，例如 `client-industry-site`，选择客户自己的 GitHub 组织或账号。
5. 点击 **Create repository from template**。
6. 打开新仓库的 **Settings -> Actions -> General**，确认 Actions 允许工作流运行，且 **Workflow permissions** 允许读取和写入仓库内容。

### 方式 B：已有客户仓库时复制文件

1. 在客户的 GitHub 组织内创建一个空仓库，不要勾选 README、`.gitignore` 或 License。
2. 在本机复制整个模板目录到新客户目录。
3. 必须保留隐藏目录和文件：`.github/`、`.agents/`、`AGENTS.md`、`wrangler.toml`、`keystatic.config.ts`、`manager-portal/` 和全部 `src/`、`scripts/` 文件。
4. 不要复制 `node_modules/`、`dist/`、`.wrangler/`、本机 `.env`、真实密钥或旧客户的 R2 图片。
5. 把复制后的目录推送到客户的新仓库的 `main` 分支。

复制后，先在 GitHub 网页检查：`.github/workflows/` 中存在 `site-publish.yml` 和 `ai-translation.yml`；`src/pages/manager/index.astro`、`keystatic.config.ts` 和 `manager-portal/schema.sql` 都存在。缺任一项都不要开始部署。

## 二、部署前准备

站长需要以下账号和资料。内容管理员不需要这些资料。

| 需要的东西 | 用在哪里 |
| --- | --- |
| GitHub 组织/账号 | 保存代码、Keystatic、GitHub Actions |
| Cloudflare 账号 | Worker、R2、KV、D1、Custom Domains、DNS 和 Secrets |
| 一个公开网站正式域名，推荐 | 商业网站正式上线 |
| 两个后台专用域名 | 一个只给站长，一个只给内容管理员；本方案要求来自不同主域名，并位于同一 Cloudflare Account |
| GitHub App | Keystatic 的 Git 登录和内容写回 |
| GitHub fine-grained token | `/manager/` 的发布、翻译、草稿写回 |
| Gemini API Key，可选 | AI 翻译 |

先在浏览器同时登录 GitHub 与 Cloudflare，再继续下面步骤。

## 三、Cloudflare 网页部署

以下所有步骤都在 Cloudflare Dashboard 的网页中完成。

### 步骤 1：创建 R2 图片桶

1. 打开 **Storage & databases -> R2**。
2. 如果 Cloudflare 要求启用 R2 或确认计费，先完成提示。
3. 点击 **Create bucket**。
4. 名称填写一个只属于本客户的名字，例如 `client-industry-content`。
5. 点击 **Create bucket**，把名字记下来。

以后 `/keystatic/` 和 `/manager/` 的图片库会把真实图片上传到这个 bucket。

### 步骤 2：SESSION KV 无需手工创建

Astro 6 的 Cloudflare adapter 会声明名为 `SESSION` 的会话 KV。新建 Worker 首次部署时，Wrangler 会自动创建并绑定它，因此不要提前创建同名 KV，也不要在 `wrangler.toml` 中填写占位 KV ID。

### 步骤 3：创建 D1 数据库并导入表结构

1. 打开 **Storage & databases -> D1**。
2. 点击 **Create database**，名称例如 `client-site-manager`。
3. 打开刚创建的数据库，复制 **Database ID**。
4. 点击数据库的 **Console** 或 **Query**。
5. 在 GitHub 新仓库中打开 `manager-portal/schema.sql`，点击 **Raw**，复制全部 SQL。
6. 粘贴到 Cloudflare D1 的 SQL 输入框并点击 **Execute**。
7. 页面显示执行成功后，D1 草稿和访问分析表才可用。分析代码也会在首次读取或写入时执行幂等的 `CREATE TABLE IF NOT EXISTS`，但新站仍应先完整导入 schema，便于在上线前发现绑定或权限错误。

### 步骤 4：在 GitHub 网页编辑 `wrangler.toml`

打开仓库中的 `wrangler.toml`，点击铅笔图标编辑。只替换下列值，binding 名称 `CONTENT_BUCKET` 和 `MANAGER_DB` 绝对不要改。`SESSION` 由 Astro 和 Wrangler 自动配置，不需要写在此文件中。

```toml
name = "client-industry-site"

[vars]
SITE_URL = ""
PUBLIC_KEYSTATIC_GITHUB_REPO = "你的组织/客户新仓库"
PUBLIC_KEYSTATIC_GITHUB_APP_SLUG = "你的-keystatic-github-app-slug"
PUBLIC_R2_ASSET_BASE_URL = "https://cdn.example.com"
KEYSTATIC_PORTAL_HOST = "owner-admin.example.com"
MANAGER_PORTAL_HOST = "content-admin.example.net"
ANALYTICS_ENABLED = "true"
ANALYTICS_IP_MODE = "network"
ANALYTICS_RETENTION_DAYS = "180"
GSC_SITE_URL = ""

[[r2_buckets]]
binding = "CONTENT_BUCKET"
bucket_name = "步骤 1 创建的 bucket 名称"

[[d1_databases]]
binding = "MANAGER_DB"
database_name = "步骤 3 创建的数据库名称"
database_id = "步骤 3 的 Database ID"
```

首次部署前还不知道真实 `workers.dev` 地址，因此 `SITE_URL` 和 `src/data/site-origin.json` 的 `productionUrl` 都保持空字符串，`retiredHosts` 保持空数组。`PUBLIC_R2_ASSET_BASE_URL` 暂时保留明显的 CDN 占位值。`PUBLIC_KEYSTATIC_GITHUB_REPO` 必须立即改成**当前这个仓库**：例如仓库网址是 `https://github.com/customer-org/client-industry-site`，这里就填写 `customer-org/client-industry-site`。每次复制给新客户都必须重新填写，不能照抄模板仓库或上一个客户的仓库名。它带 `PUBLIC_` 是因为 Keystatic 登录页必须在浏览器中知道目标仓库；仓库名不是密钥。

`KEYSTATIC_PORTAL_HOST` 和 `MANAGER_PORTAL_HOST` 先保留占位值，等步骤 5.2 选好两个后台域名后再替换。这里只写**主机名**，不写 `https://`、路径、斜杠或 UUID。两个值必须不同。点击 **Commit changes**，直接提交到 `main`。

`wrangler.toml` 是这些非敏感配置的唯一来源。Astro 构建、Worker 运行时、Keystatic、Manager、AI 翻译和发布接口都会读取这一处；不要再去 Cloudflare **Build Variables and Secrets** 或 GitHub Actions Variables 重复创建 `SITE_URL`、仓库名、App slug 或 R2 地址。

### 步骤 5：连接 Cloudflare Workers Builds，完成第一次部署

1. 打开 **Workers & Pages -> Create application**，在 **Import a repository** 旁点击 **Get started**。
2. 连接 GitHub，选择**当前客户的新仓库**和 `main` 分支。
3. Worker 名称必须与 `wrangler.toml` 第一行的 `name` 完全相同。若页面给出的名称不同，先返回 GitHub 修改 `wrangler.toml` 并提交，再继续。
4. 页面中的构建设置填写：

| 输入项 | 填写值 |
| --- | --- |
| Root directory | `/` |
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy` |

5. 点击 **Save and Deploy**，打开 **Deployments**，等待状态显示成功。
6. 点击部署结果中的 `workers.dev` 地址，复制完整的根网址，例如 `https://client-industry-site.<你的账户>.workers.dev`。不要在末尾添加 `/keystatic/`。

第一次部署不需要事先创建任何 Cloudflare API Token、GitHub Actions Secret 或 Build Variable。Workers Builds 会为自己的 Git 部署创建所需凭据；本模板的构建脚本会直接读取 `wrangler.toml`。

#### 5.1 设置自动部署的监听路径

在同一 Worker 的 **Settings -> Builds -> Build watch paths** 使用白名单。**Include paths** 填入：

```text
src/*
public/*
scripts/*
package.json
package-lock.json
astro.config.mjs
keystatic.config.ts
markdoc.config.mjs
tsconfig.json
wrangler.toml
worker-configuration.d.ts
.nvmrc
```

**Exclude paths** 填入：

```text
README.md
docs/*
.agents/*
manager-portal/*
.github/*
src/content/productTranslations/*
src/content/blogTranslations/*
```

这样普通产品、文章内容会自动部署，但 AI 翻译草稿不会在生成或审核过程中意外上线。

#### 5.2 配置两个后台 Custom Domain、UUID 与签名会话

本步骤是后台隔离的核心。Keystatic 和 Manager 各用一个完整专用地址：

```text
https://owner-admin.customer-owner.net/KEYSTATIC_UUID
https://content-admin.customer-ops.com/MANAGER_UUID
```

两个 UUID 必须不同，两个后台主机必须来自不同主域名。它们可以与公开商业网站域名完全不同，但对应的两个 DNS Zone 必须位于当前 Worker 所在的同一个 Cloudflare Account。

##### A. 先选主机名并部署 Worker 识别规则

1. 在记事本写下两个尚未使用的完整主机名。不要用公开站点主域，不要用 CDN 域名，也不要复用其他项目的后台域名。
2. 在 Cloudflare 分别打开这两个 Zone 的 **DNS -> Records**，确认精确主机名没有现存 A、AAAA、CNAME 或其他冲突记录。若已承载真实服务，不要删除；改选新主机名。
3. 回到 GitHub 编辑 `wrangler.toml`，只把下面两个占位值换成刚选的**纯主机名**：

```toml
KEYSTATIC_PORTAL_HOST = "owner-admin.customer-owner.net"
MANAGER_PORTAL_HOST = "content-admin.customer-ops.com"
```

4. 不要添加 `https://`、`/UUID` 或尾部斜杠。提交到 `main`，在 Worker 的 **Deployments** 等待本次部署成功后再继续。这样域名一旦接入，Worker 已知道它是后台 Host，不会把根路径误当成商业前台。

##### B. 在本机生成三个互不复用的 Secret

打开 Windows PowerShell，逐行执行：

```powershell
[guid]::NewGuid().ToString()
[guid]::NewGuid().ToString()
$bytes = New-Object byte[] 48; $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create(); $rng.GetBytes($bytes); [Convert]::ToBase64String($bytes); $rng.Dispose()
```

把第一行输出标记为 `KEYSTATIC_PORTAL_UUID`，第二行标记为 `MANAGER_PORTAL_UUID`，第三行标记为 `ADMIN_PORTAL_SESSION_SECRET`，存进密码管理器。不要把这三个**生产值**写进 `wrangler.toml`、`.env.example`、README、GitHub Actions、聊天记录或普通链接清单；仓库里的固定 UUID 仅供本地示例，生产绝不能复用。

##### C. 先把三个值保存为 Worker 加密 Secret

1. Cloudflare Dashboard -> **Workers & Pages -> goldenone -> Settings -> Variables and Secrets**。
2. 点击 **Add**，名称填写 `KEYSTATIC_PORTAL_UUID`，类型选择 **Secret**，值粘贴第一行 UUID，保存。
3. 同样新增 `MANAGER_PORTAL_UUID`，值粘贴第二行 UUID。
4. 同样新增 `ADMIN_PORTAL_SESSION_SECRET`，值粘贴第三行长随机字符串。
5. 若页面要求创建新版本或部署，按提示部署；回到 **Deployments**，确认最新版本成功。三个值都必须显示为已加密，不能显示为普通 Variable。

##### D. 添加域名时必须选 Custom Domain，不选 Route

对两个主机名分别执行一次：

1. 打开 **Workers & Pages -> goldenone -> Settings -> Domains & Routes**。
2. 点击 **Add** 或 **Add route** 后，在弹出的类型选择中明确选择 **Custom Domain**。
3. 输入第一个完整主机名，例如 `owner-admin.customer-owner.net`，确认添加；再用同样方式添加 `content-admin.customer-ops.com`。
4. **不要选择 Route。** Route 用于让 Worker 拦截某个已有源站的 URL pattern；这里需要 Worker 本身成为整个专用主机的 origin，因此必须使用 Custom Domain。
5. 不要提前手工创建 CNAME，也不要把后台域名指向 `workers.dev`。Cloudflare Custom Domain 会为该 Worker 创建或管理所需 DNS 记录和证书。
6. 等待两个条目的状态都变成 **Active**。处于 Initializing、Pending 或证书错误时不要开始后台授权。

`wrangler.toml` 的 `[assets] run_worker_first = true` 必须保留。它让每个请求先经过 `src/worker.ts` 的 Host、UUID 和签名会话判断，再读取 Astro 静态资源；删除它会破坏专用域名根路径隔离。

##### E. 立即做未授权检查

在无痕窗口逐项打开：

1. `https://owner-admin.customer-owner.net/`：必须是纯文本 404，不能出现 Goldenone 商业前台。
2. `https://owner-admin.customer-owner.net/随便写的错误UUID`：必须是 404。
3. `https://content-admin.customer-ops.com/`：必须是纯文本 404，不能出现 Goldenone 商业前台。
4. `https://content-admin.customer-ops.com/随便写的错误UUID`：必须是 404。
5. 公开网站的 `/keystatic/`、`/manager/`、`/api/manager/status`：必须是 404。
6. 两个正确的完整 UUID 地址：应建立各自 12 小时 `Secure; HttpOnly; SameSite=Strict` 签名会话。Manager 可打开；Keystatic 在步骤 6、7 未完成时可以提示 GitHub/OAuth 配置未完成，但不应显示 Astro `404: Not found, Path: /UUID`。

如果专用域名根路径显示商业前台，先停止分享后台地址：检查 Custom Domain 是否连到**当前 Worker**、`wrangler.toml` 的 Host 是否精确一致、最新部署是否成功，以及 `run_worker_first = true` 是否仍存在。不要用重定向把根路径转去公开站，根路径必须保持 404。

官方依据：[Workers Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)、[Static Assets 先执行 Worker](https://developers.cloudflare.com/workers/static-assets/routing/worker-script/)。

### 步骤 6：创建 GitHub App，配置 Keystatic 登录

每个客户必须使用独立 GitHub App。不要复用模板 App、旧客户 App、Client ID、Client secret 或 `KEYSTATIC_SECRET`，避免一个客户的权限或密钥影响另一个客户。

1. GitHub 右上角头像 -> **Settings -> Developer settings -> GitHub Apps -> New GitHub App**。
2. App name 填写一个新的、不与其他 App 重复的名称，建议包含客户简称。
3. Homepage URL 填写步骤 5.2 记录的**站长后台完整 UUID 地址**，例如 `https://owner-admin.customer-owner.net/KEYSTATIC_UUID`。这里要有 UUID，不写 `/keystatic/`。
4. Callback URL 填写下面的完整地址：

```text
https://owner-admin.customer-owner.net/api/keystatic/github/oauth/callback
```

Callback URL 只使用站长后台专用域名，路径必须逐字是 `/api/keystatic/github/oauth/callback`，**不能添加 UUID**。这是 Keystatic GitHub mode 的固定 OAuth 回调；Worker 只对此路径保留受控例外，登录后的管理页面仍必须经 UUID 会话进入。

5. Repository permissions 中给 **Contents** 选择 **Read and write**。
6. 创建 App，复制 **Client ID**，生成并立即复制 **Client secret**。两项都标记为当前客户，存进密码管理器。
7. 点击 **Install App**，选择 **Only select repositories**，只勾选**当前这个客户仓库**。只创建 App 而没有安装到当前仓库，仍会出现“Keystatic isn't able to access this repo”。
8. 记下 App 的 slug：App 设置页网址中 `/apps/` 后面的短名称就是 slug。
9. 回到当前仓库编辑 `wrangler.toml`，确认 `PUBLIC_KEYSTATIC_GITHUB_REPO` 是当前真实 `owner/repo`，把 `PUBLIC_KEYSTATIC_GITHUB_APP_SLUG` 改为这个 slug；同时将 `SITE_URL` 改为步骤 5 的公开站点网址，并把 `PUBLIC_R2_ASSET_BASE_URL` 改为同一网址加 `/r2`，例如 `https://client-industry-site.<你的账户>.workers.dev/r2`。两个后台 Host 保持步骤 5.2 的值，不要改成公开站点 Host。
10. 编辑 `src/data/site-origin.json`，把 `productionUrl` 改为同一个网站根地址。提交到 `main`，等待第二次自动部署成功。

> 若页面提示 Keystatic 仍配置为 `your-org/businessweb`，或提示没有 `PUBLIC_KEYSTATIC_GITHUB_APP_SLUG`，说明打开的是修复前构建产物，或本步骤第 9、10 项尚未提交成功。当前模板会在构建时读取 `wrangler.toml`，并在生产构建仍为占位仓库或缺少 slug 时直接报错，不再生成错误站点。重新检查当前仓库名和 slug，提交后等待新部署。

### 步骤 7：只添加真正需要的 Worker Secrets

打开 **Workers & Pages -> 你的 Worker -> Settings -> Variables and Secrets -> Add**。下表中的 **Secret** 必须选择加密类型，不能写入 GitHub 文件。非敏感的仓库名、App slug、站点地址和 R2 地址已经在 `wrangler.toml`，这里不要重复添加。

| 名称 | 类型 | 填什么 | 是否必需 |
| --- | --- | --- | --- |
| `KEYSTATIC_PORTAL_UUID` | Secret | 步骤 5.2 生成的第一个 UUID | 必需；若已添加只核对，不重复创建 |
| `MANAGER_PORTAL_UUID` | Secret | 步骤 5.2 生成的第二个 UUID | 必需；若已添加只核对，不重复创建 |
| `ADMIN_PORTAL_SESSION_SECRET` | Secret | 步骤 5.2 生成的独立长随机值 | 必需；只签名双后台短期会话 |
| `KEYSTATIC_SECRET` | Secret | 按步骤 7.1 另行生成的随机字符串 | Keystatic 必需；同时复用于表单校验和图片池写入，但不复用于 UUID 会话 |
| `KEYSTATIC_GITHUB_CLIENT_ID` | Secret | 步骤 6 的 Client ID | Keystatic 必需 |
| `KEYSTATIC_GITHUB_CLIENT_SECRET` | Secret | 步骤 6 的 Client secret | Keystatic 必需 |
| `BUSINESSWEB_GITHUB_TOKEN` | Secret | 仅授权当前仓库的 fine-grained GitHub token | manager 发布、翻译、草稿写回 |
| `ANALYTICS_HASH_SECRET` | Secret | 另行生成的 32 字符以上随机值 | 访问分析必需；只用于每日访客 HMAC，不得复用后台签名 Secret |
| `GOOGLE_SEARCH_CONSOLE_SERVICE_ACCOUNT_JSON` | Secret | GSC 只读 service account 的完整 JSON | 可选；只有配置 GSC 集成时添加 |
| `RESEND_API_KEY` | Secret | 已配置 Resend 时的 API Key | 联系表单按需 |
| `CONTACT_FROM_EMAIL` | Variable | 已在 Resend 验证过的发件人地址 | 联系表单按需 |
| `CONTACT_TO_EMAIL` | Variable | 仅在收件邮箱不同于站点公开联系邮箱时填写 | 可选覆盖 |

不需要创建 `CONTACT_FORM_SECRET`、`R2_IMAGE_POOL_WRITE_TOKEN`、`MANAGER_ACCESS_BYPASS_TOKEN`、`MANAGER_ALLOWED_EMAILS` 或多个发布 token。生产 Manager 由专用 Host、UUID 和签名会话控制，不从浏览器读取 Token，也不依赖 Cloudflare Access 邮箱头。模板用一个 `BUSINESSWEB_GITHUB_TOKEN` 处理 Manager 写回、AI 任务、草稿读取和手动发布调度。

#### 首页上传图纸附件的去向

首页 **Start with your artwork** 区域允许访客上传 JPG、PNG、WEBP 或 PDF，单个文件最大 5 MB。提交后，Cloudflare Worker 的 `/api/contact` 会在本次请求中读取并校验附件，再通过 Resend 把附件随询盘邮件一起发送；收件人会在邮件客户端中收到原文件附件。

- 收件邮箱优先使用 Worker 变量 `CONTACT_TO_EMAIL`；没有设置时，使用网站公开企业邮箱。
- 上传文件**不会**写入 R2、D1、GitHub 仓库或 Worker 本地磁盘，网站也没有附件下载列表。
- R2 图片池只用于网站公开图片和 PDF 素材，与访客提交的设计附件完全分开。
- 如果 Resend 或发件邮箱没有配置成功，表单会返回发送失败，附件不会在网站端保留。

因此，后续查找访客上传的图纸，应直接到 `CONTACT_TO_EMAIL` 对应的收件箱查看询盘邮件附件。

#### 7.1 生成 `KEYSTATIC_SECRET`

不要手写短密码。请在 Windows PowerShell 中复制执行下面**整段**命令；它会输出一条可直接粘贴的随机值：

```powershell
$bytes = New-Object byte[] 48; $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create(); $rng.GetBytes($bytes); [Convert]::ToBase64String($bytes); $rng.Dispose()
```

输出只显示一次；复制它，作为 `KEYSTATIC_SECRET` 的值保存。它必须与 `ADMIN_PORTAL_SESSION_SECRET` 不同。不要把它提交到 GitHub，也不要发给内容管理员。

#### 7.2 创建 `BUSINESSWEB_GITHUB_TOKEN`

1. GitHub 右上角头像 -> **Settings -> Developer settings -> Personal access tokens -> Fine-grained tokens -> Generate new token**。
2. Token name 可填写 `businessweb-manager-publish`，Expiration 按客户维护周期选择。
3. Resource owner 选择当前客户仓库所属的 GitHub 账号或组织；Repository access 选择 **Only select repositories**，只选择当前客户的新仓库。
4. 在 **Repository permissions** 中设置 **Contents: Read and write** 与 **Actions: Read and write**。
5. 点击 **Generate token**，立刻复制完整 Token，在 Worker 的 Variables and Secrets 中作为 **Secret** 新增 `BUSINESSWEB_GITHUB_TOKEN`。

这个 Token 只给 `/manager/` 的发布、翻译与草稿写回使用。不要把它放进 GitHub Actions Secrets，不要使用范围覆盖所有仓库的旧式 Global token。

### 步骤 8：按功能添加 GitHub Actions 配置

1. 打开当前仓库 **Settings -> Actions -> General**，在 **Workflow permissions** 选择 **Read and write permissions**，点击 **Save**。AI 翻译需要把草稿写回当前仓库。
2. 需要 AI 翻译时，进入 **Settings -> Secrets and variables -> Actions -> Secrets -> New repository secret**，只添加一个 `GEMINI_API_KEYS`。一个 key 直接粘贴；多个 key 用英文逗号分隔。其它 `GEMINI_API_KEY_1`、`GOOGLE_API_KEY` 或模型变量都不是必填项。
3. 普通产品和文章保存后会由 Workers Builds 自动部署，不需要 Cloudflare API Token。只有要使用 `/manager/` 或 `/keystatic/` 中的 **Publish Site** 手动发布按钮时，才继续完成下面两项。

#### 8.1 手动 Publish Site：创建 Cloudflare API Token

1. 登录 Cloudflare，点击右上角**头像 -> My Profile（个人资料）-> API Tokens**。
2. 点击 **Create Token（创建令牌）**。
3. 在 **Edit Cloudflare Workers** 模板右侧点击 **Use template（使用模板）**。
4. 在 **Account Resources** 中只选择当前客户网站所在的 Cloudflare Account。
5. 点击 **Continue to summary -> Create Token**。完整 Token 只显示一次，立即复制。
6. 回到 GitHub 当前仓库 **Settings -> Secrets and variables -> Actions -> Secrets**，创建 `CLOUDFLARE_API_TOKEN`，粘贴完整 Token。

#### 8.2 手动 Publish Site：填写 Cloudflare Account ID

1. Cloudflare 左侧进入 **Account Home**，找到当前 Account，点击右侧 **... -> Copy account ID**。
2. 回到 GitHub 当前仓库 **Settings -> Secrets and variables -> Actions -> Variables**，创建 `CLOUDFLARE_ACCOUNT_ID`，粘贴该 ID。

不要把 Account ID 误填成 D1 Database ID。前者只供 GitHub Actions 部署，后者已经写在 `wrangler.toml`。如果暂不配置这两项，自动部署仍正常；只有手动 **Publish Site** 会失败。多语言翻译目录已从自动监听中排除，所以要发布审核后的翻译时必须配置手动发布。

### 步骤 9：确认后台不使用 Cloudflare Access，并保管完整入口

本项目有意不依赖 Cloudflare Access。后台边界是专用 Host + 不可猜 UUID + Worker 签名会话；Keystatic 内部仍有 GitHub OAuth 和仓库写权限作为第二层。请按下面顺序确认：

1. 打开 **Zero Trust -> Access -> Applications**，确认没有覆盖两个后台专用域名的 Self-hosted Application；也不要给公开站点整站添加会改写后台 OAuth 的 Access 规则。
2. 打开 Worker 的 **Settings -> Domains & Routes**，确认两个后台条目都是 **Custom Domain / Active**，不是 Route。
3. 只把 Manager 完整地址通过密码管理器的安全共享功能发给指定内容管理员。不要只发域名，不要把链接放进公司官网、搜索可见文档、普通群聊、邮件签名或浏览器公共书签同步。
4. 站长完整 Keystatic 地址只保存在站长的密码管理器。内容管理员不需要知道 Keystatic UUID、GitHub App Client secret、`KEYSTATIC_SECRET`、`ADMIN_PORTAL_SESSION_SECRET` 或 `BUSINESSWEB_GITHUB_TOKEN`。
5. UUID 本质上是入口 bearer secret，不等于人员身份、MFA 或细粒度账号审计。Keystatic 因 GitHub OAuth 多一层身份校验；Manager 在当前模型中拿到完整 URL 即可建立 12 小时会话。因此 Manager URL 泄露时必须立即轮换，不能只清浏览器 Cookie。
6. 轮换时同时生成新的对应 UUID 和新的 `ADMIN_PORTAL_SESSION_SECRET`，在 Worker Secrets 中更新并部署。更新签名 Secret 会立即使两个后台所有旧 Cookie 失效；然后只向仍获授权的人员重新安全分享新地址。

更改 GitHub App 的 Homepage/Callback 或后台 UUID **不会自动撤销 GitHub App 安装或授权**。只要仍是同一个 App 且安装在同一个仓库，通常不需要卸载重装；但更换 `KEYSTATIC_SECRET` 会使 Keystatic 加密会话失效，站长下一次需要重新点击 GitHub 登录，这是正常安全结果。

### 步骤 10：首次部署后按顺序验收

完成步骤 1 至 9，且第二次自动部署显示成功后，再开始上传真实资料。用浏览器逐项检查：

1. 打开网站根地址，确认页面可以加载；这时仍是模板示例内容，不能对外推广。
2. 用站长的 GitHub 账号打开 `https://站长后台专用域名/KEYSTATIC_PORTAL_UUID`，点击 **Login with GitHub**；授权后应能进入管理界面。若失败，先检查步骤 6 的仓库安装、Callback URL 和 App slug，再检查步骤 7 的三个 Keystatic OAuth Secret 及步骤 5.2 的入口 Secret。
3. 打开 `https://内容后台专用域名/MANAGER_PORTAL_UUID`，确认不要求输入浏览器口令，随后能看到内容管理员界面。关闭页面再访问专用域名根路径，根路径仍必须是 404。
4. 在 Manager 的 **Assets** 试传一张无敏感信息的测试图片，确认图片可显示，再删除测试文件。
5. 确认 GitHub Actions 页面可以看到 `Publish Site` 与 `AI Translation Drafts` 两个工作流。只测试已经按步骤 8 配置过的可选功能。
6. 在公开网站打开两三个页面，稍后进入 Keystatic **站点设置 -> 数据分析** 和 Manager **数据分析**；两边应显示相同统计，近期访问的 IP 与国家应在同一列。若配置了 GSC，再确认 Google 搜索表现可读取。

只有站长需要步骤 1 至 10 的账户、密钥和部署权限。内容管理员从本 README 的“内容管理员使用”部分开始，不需要接触 Cloudflare、GitHub App、API Token 或任何 Secret。

### R2 CDN、防盗链、边缘 WebP 与 PDF：建设期先不要开启

当前 GoldenOne 仍使用 `https://goldenone.arkalpooltech.workers.dev/r2`。这是建设期 Worker 代理，不是你自己的 Cloudflare Zone，不能可靠配置 R2 自定义 CDN、WAF、缓存或 Images Transformations。**在网站绑定真实正式域名之前，保持 `PUBLIC_R2_IMAGE_DELIVERY_MODE = "original"`，不要开启原生 Hotlink Protection，也不要尝试把 `workers.dev` 填进 R2 Custom Domains。**

正式域名可打开后，执行本 README 第八节的“GoldenOne R2 CDN 小白部署”。那里会一步一步完成 CDN、缓存、SEO 安全防盗链和可选 WebP；不需要手动处理两个可视化后台的日常图片/PDF 使用。

## 四、两阶段 Codex 建站流程

### 第一阶段：行业视觉与信息架构

在真实产品上传前，站长对 Codex 发送一条消息，格式如下：

```text
行业：工业离心泵制造商；核心关键词：API 610 pump, process pump, centrifugal pump；其它语种：德语、西班牙语
```

Codex 必须完成：

1. 运行或等效执行 `industry:brief`，英语保持唯一源语言。
2. 更新 `src/data/industry-profile.json`：行业、关键词、买家角色、市场、产品架构、视觉方向。
3. 读取 `/keystatic/ -> 网站语言` 的选择；若第一阶段输入同时指定其它语种，`industry:brief --locales` 只用于预先勾选同一页面，站长仍可随时在可视化页面修改。
4. 为每个勾选语言补全 `src/data/site-locales.json` 中的 UI、固定页面文案和 4 条 FAQ 的真实本地化文本，并标记 `approved: true`。未完成时，该语言仍可供 `/manager/` 生成产品和文章翻译草稿，但不会进入公开语言切换器、`hreflang` 或站点地图；生产自检会阻止不完整语言上线。
5. 把 `public/template-logo.svg` 和 `public/template-icon.svg` 一起替换为客户品牌；网站图标必须取自同一 logo 的可辨认图形，并同步生成 `favicon-32x32.png`、`apple-touch-icon.png`、`icon-192.png`、`icon-512.png` 及更新 `site.webmanifest`。
6. 按行业重做前端视觉与公开信息架构，但不能删除 `/keystatic/`、`/manager/`、R2、D1、KV、AI 翻译、联系表单或发布流程。

首次阶段可以通过 `/keystatic/ -> Brand and industry foundation` 复查或补充行业基础资料，并通过 `/keystatic/ -> 网站语言` 确认实际启用语种。为了查看前端视觉层和字段长度，`template` 或 `briefed` 阶段可以保留明显可识别的示例邮箱、电话、WhatsApp、办公地址和运营地址；这些内容只作为模板示例，不能改写成看似真实但未经核实的企业资料。不要杜撰公司能力、认证、价格、客户或案例，正式上线前必须替换或核实全部示例联系方式。

### 第二阶段：全站 SEO 与 GEO

客户已经提供真实公司资料、产品图片、产品参数、证书和 FAQ，且网站已部署后，再对 Codex 发送：

```text
全站SEO和GEO优化 + 工业离心泵制造商 + API 610 pump, process pump, centrifugal pump
```

Codex 在此阶段必须先查最新 Google Search Central 规范、Schema.org 和当前行业搜索结果，再优化关键词到页面、文案、产品架构、图片替代文本、内链、结构化数据、`hreflang`、站点地图、`llms.txt` 和机器可读产品目录。它必须根据实际业务判断是工业品系列、单品、服务、解决方案或混合模式；不得伪造报价、库存、评分、认证或性能。

## 五、站长日常操作：按网页按钮做

### 先处理模板示例

仓库内有 2 个产品示例和 2 篇文章示例，用来展示字段结构。它们的文件名以 `template-example-` 开头，内容明确标识为演示。真实上线前必须在 `/keystatic/` 删除或替换它们；生产自检会阻止它们上线。

### 在 `/keystatic/` 填真实内容

1. 打开密码管理器中保存的 `https://站长后台专用域名/KEYSTATIC_PORTAL_UUID`，使用对当前 GitHub 仓库有写入权限的账号登录。
2. 先打开 **Brand and industry foundation**，保存品牌、行业、目标市场、联系资料和已核实的定位。
3. 打开 **Image pool**，上传真实图片到 R2。
4. 在 **Products and offerings** 新建或编辑产品：先选公开分类、供应类型、型号结构、主图、应用、参数表和 FAQ，再保存。
5. 在 **Articles** 新建或编辑真实文章，填写封面、日期、分类和正文，再保存。
6. 仅保存客户已提供或已核实的事实。空缺的性能、认证、价格、交期和市场覆盖范围不要猜测。

### 在 `/keystatic/` 选择网站语言

1. 打开站长后台完整 UUID 地址，在左侧 **Foundation** 分组点击 **网站语言**。
2. **English（英语）· en** 是固定源语言，不能关闭；不要把其它语言当作新的源内容。
3. 每种语言都同时显示英文名、中文名和语言代码。可以逐项勾选，也可以使用 **全选全部目标语言** 或 **反选当前选择**；没有多语需求时全部不勾选，网站就是英语单语。
4. 点击页面底部 **Save**。保存会提交 `src/data/site-language-settings.json`，这是全站唯一的启用语言配置。
5. 自动部署完成后，`/manager/` 和 `/keystatic/ -> AI translator` 只显示刚才勾选的语言。取消勾选后，这些语言也会从新翻译任务选项中消失。
6. 刚勾选但固定文案尚未审核的语言，会先用于产品和文章翻译准备，不会立即出现在公开站点。完成 `site-locales.json` 的固定 UI、页面文案和 FAQ 翻译并设为 `approved: true` 后，再次部署才会公开。
7. 正式上线前运行 `npm run check:template:production`。它会阻止“已勾选但固定本地化不完整”的语言上线。

这一分层是有意设计的：**站长的复选框决定要做哪些语言，翻译审核状态决定哪些语言已经可以公开。** 因此不会因为一次误勾选就发布整站英文回退页面，也不需要给 `/manager/` 增加语言管理权限。

### 内容管理员使用手册：在 `/manager/` 工作

内容管理员只需要站长通过密码管理器安全共享的 Manager 完整 UUID 地址，不需要 GitHub、Cloudflare 控制台、API Token、GitHub App 或任何 Secret。站长负责配置、入口轮换和发布权限；内容管理员负责创建、补全和审核业务资料。

1. 内容管理员打开 `https://内容后台专用域名/MANAGER_PORTAL_UUID`。正确入口会自动建立 12 小时签名会话；页面不要求输入后台口令。
2. 使用 **Products** 或 **Articles** 创建 D1 草稿；草稿此时不在公开站点，也不等于 Git 内容。
3. 在 **Assets** 上传或挑选 R2 图片。
4. 内容负责人审核后执行页面中的写回/审批操作，系统才会通过 GitHub Actions 把草稿转换为仓库内容。
5. 到 **Publish site updates** 可查看并发起手动发布。
6. 点击 **数据分析** 查看与站长相同的访客、浏览量、时间趋势、来源、落地页、国家、设备、可见关键词、GSC 搜索词和近期访问；Manager 不能修改站长校准项。

### 网站访问分析：默认免费方案与操作边界

本项目默认不把 GA4 当作唯一数据源，也不要求额外部署 Umami、Plausible 或 Matomo。当前实现直接复用已经存在的 Cloudflare Worker 和 `MANAGER_DB` D1 binding：没有第三方前端脚本、没有分析 Cookie、没有额外服务器，也不会因广告拦截器阻断浏览器分析脚本。公开请求的响应不等待分析写入；Worker 使用 `waitUntil()` 在响应后异步记录，因此分析系统故障不会阻断商业网站页面。

#### 两个后台看什么

- Keystatic **站点设置 -> 数据分析** 与 Manager **数据分析** 使用同一个 `/api/analytics/summary`，统计周期均可选 7、30、90 或 180 天。
- 两边显示相同的校准后页面浏览、独立访客、落地访问、趋势图、热门页面、落地页、来源、国家、设备、浏览器、可见关键词、GSC 关键词/页面和近期 40 条访问。
- 近期访问把 **IP / 国家** 放在同一列。默认 `network` 模式仅保存 IPv4 `/24` 或 IPv6 `/48` 网段；不是完整个人 IP。
- 站长比 Manager 多一个 **付费数据校准** 编辑区。Manager 看到校准后的相同总数和趋势，但只能读取，不能新增、修改或删除校准项。

#### 站长用付费工具校准数据

校准不是修改原始日志。D1 的 `site_analytics_adjustments` 单独保存日期、指标、正负调整值、付费数据来源、校准原因、创建时间和更新时间；只追加的 `site_analytics_adjustment_audit` 保留每次新增、编辑和删除时的完整快照；原始 `site_analytics_events` 保持不变。支持校准 **页面浏览、独立访客、落地访问**，并可编辑或删除错误校准项。摘要、上期对比和每日趋势会叠加当前有效校准值，页面/来源/IP 等明细仍表示真实采集事件。

**保存校准后立即生效，不需要点击 Publish Site，也不需要等待 Git 或 Worker 重新部署。** 校准项直接写入 D1；站长页面会自动重新读取，Manager 刷新页面或切换周期后看到相同结果。只有修改源代码、Git 内容或 `wrangler.toml` 才涉及网站发布。

#### 默认采集规则

1. 只记录公开主域中状态成功、内容类型为 HTML 的 `GET` 请求；`/keystatic/`、`/manager/`、`/api/`、`/r2/`、`/_astro/` 和后台专用域名不计入访客。
2. 跳过常见机器人、`DNT: 1` 和 Global Privacy Control 请求。
3. 保存页面路径，不保存页面查询字符串；保存 UTM source/medium/campaign/term、外部 referrer host、搜索来源仍可见的查询词、Cloudflare 国家/地区/城市、colo、设备、浏览器和操作系统。不保存原始 User-Agent。
4. 日去重访客按 UTC 日期，用 `ANALYTICS_HASH_SECRET` 对 IP 与 User-Agent 做每日 HMAC。每日轮换可以统计访客日，但同一访客跨天会重新计数，不能把 30 天结果理解为 30 天长期身份追踪。Secret 缺失或短于 32 字符时仍记录浏览量，但访客键留空且访客数不计数，不使用弱摘要降级。
5. `ANALYTICS_RETENTION_DAYS` 可设 7 至 365 天，默认 180 天。每次事件都会通过 D1 原子日期门检查是否需要执行当天的过期清理，同一天只有第一个成功获得门的请求实际删除，不需要独立 Cron。

#### IP 模式

| `ANALYTICS_IP_MODE` | 保存内容 | 建议 |
| --- | --- | --- |
| `none` | 不保存 IP，仍保存每日 HMAC 访客键及 Cloudflare 国家等粗粒度地理数据 | 隐私要求最高时使用；后台不显示 IP，但仍可统计日去重访客 |
| `network` | IPv4 `/24` 或 IPv6 `/48` 网段 | 默认；两个后台显示同一个网段与国家 |
| `full` | 完整 IP | 仅在已完成适用地区隐私告知、访问控制和合法性审查后使用；代码强制最多保留 30 天，两个后台都会显示完整 IP |

若使用 `full`，需要把完整 IP 收集目的、保留期和有权查看的人写进实际隐私政策。国家来自 Cloudflare 边缘地理信息，不能替代法律意义上的精确位置或身份识别。

#### 第一次启用

1. 保持 `wrangler.toml` 中 `ANALYTICS_ENABLED = "true"`、`ANALYTICS_IP_MODE = "network"`、`ANALYTICS_RETENTION_DAYS = "180"`。
2. 按步骤 3 重新执行最新 `manager-portal/schema.sql`。所有语句均为幂等，已存在的 Manager 草稿不会被删除。
3. 生成与 `KEYSTATIC_SECRET`、`ADMIN_PORTAL_SESSION_SECRET` 不同的随机值：

```powershell
$bytes = New-Object byte[] 48
[Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
[Convert]::ToBase64String($bytes)
```

4. 把输出作为 Worker 加密 Secret `ANALYTICS_HASH_SECRET`，部署最新版本。不要把生产值写进 `.env.example`、`wrangler.toml` 或 GitHub。
5. 访问公开 HTML 页面后再打开后台。首次事件写入、首次仪表盘查询和首次校准保存都会兜底创建缺少的分析表。

#### 可选接入 Google Search Console

GSC 才是 Google 自然搜索关键词、搜索结果曝光、点击、CTR、平均排名和 Google 落地页的权威来源。普通 referrer 经常不会携带查询词，因此本地 **可见关键词** 不能代替 GSC。Search Console API 只保证返回内部限制下的热门行，极少量或匿名化查询不会全部出现；本界面读取截至 3 天前的 finalized 数据，并在 D1 缓存 6 小时。

1. 先在 Search Console 验证正式站点，推荐 Domain property。
2. 在 Google Cloud 项目启用 Search Console API，创建 service account 并下载 JSON key。
3. 在 Search Console 当前 property 的 **Settings -> Users and permissions -> Add user**，把 JSON 中的 `client_email` 添加为只读用户。
4. 在 `wrangler.toml` 把 `GSC_SITE_URL` 设为 property 的精确标识。Domain property 示例是 `sc-domain:example.com`；URL-prefix property 必须包含完整协议和末尾斜杠。
5. 在 Worker 添加加密 Secret `GOOGLE_SEARCH_CONSOLE_SERVICE_ACCOUNT_JSON`，值为完整 JSON；部署后打开两个后台确认数据。

代码只申请 `webmasters.readonly`，不会修改 Search Console。官方说明：[Search Analytics API](https://developers.google.com/webmaster-tools/v1/searchanalytics/query)、[Search Console 用户权限](https://support.google.com/webmasters/answer/7687615?hl=zh-Hans)。

#### 为什么不默认使用其它常见方案

| 方案 | 适合什么 | 本项目结论 |
| --- | --- | --- |
| Worker + D1 | 精确近期事件、IP/国家、自有后台、站长校准 | **默认主数据源**；复用已有 Worker 与 D1，免费、无前端脚本、权限边界最短 |
| Google Search Console | Google 查询词、点击、曝光、CTR、排名 | **推荐可选补充**；不能替代全站访问日志 |
| GA4 | 广告归因、Google Ads、复杂事件生态 | 不默认；GA4 在记录前丢弃 IP，无法满足本项目 IP 查看要求，并可能引入 Cookie/同意管理。官方说明：[GA4 区域数据收集](https://support.google.com/analytics/answer/11598602?hl=zh-Hans) |
| Cloudflare Web Analytics | 免费隐私友好的 Web Vitals 和 Cloudflare 控制台总览 | 可选旁路观察，不作为后台 IP/逐条访问数据源。官方说明：[Web Analytics](https://developers.cloudflare.com/web-analytics/about/) |
| Cloudflare Analytics Engine | 高基数聚合和更高流量写入 | 达到 D1 免费写入瓶颈后的迁移候选；自适应采样不适合保证逐条近期访问和人工校准审计 |
| Umami / Plausible / Matomo | 通用自托管分析产品 | 不默认；需要新增服务、数据库或运维面。当前每日哈希、不保存原始 User-Agent 的做法参考了这类隐私分析系统的常见模式 |

截至 2026-08-26，D1 Workers Free 包含每天 500 万行读取、10 万行写入和账户总计 5 GB 存储。事件表有两个索引，一个页面访问通常不只消耗一次 row write；Manager 草稿和分析也共用此数据库额度。应在 Cloudflare D1 **Metrics -> Row Metrics** 查看真实用量。达到上限时 D1 会拒绝查询直到 UTC 次日重置，因此高流量站应先降低保留期，再评估 Analytics Engine、单独付费分析服务或 Workers Paid。以 Cloudflare 最新文档为准：[D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/)。

## 六、四种“保存/发布”不要混淆

| 你做的动作 | 数据去了哪里 | 是否立即公开 | 是否会自动部署 |
| --- | --- | --- | --- |
| Keystatic 普通产品/文章点击保存 | GitHub 的 `src/content/products/` 或 `src/content/blog/` | 内容已进入源代码 | 若 Workers Builds 已连接且匹配 watch paths，会自动构建部署 |
| Manager 普通编辑点击保存草稿 | D1 | 否 | 否；还没有写回 Git |
| Keystatic 数据分析保存校准项 | D1 当前校准表 + 只追加审计表 | 是；两个后台统计立即使用 | **否；不需要 Publish Site** |
| AI 翻译生成/审核草稿 | `productTranslations/` 或 `blogTranslations/` | 否；生成仅是草稿 | 否；上述目录被 watch paths 排除 |
| **Publish Site** | 触发 `site-publish.yml` | 对已审核、已写入仓库的内容执行部署 | 是，GitHub Actions 明确构建并部署 Worker |

因此：**保存不是发布，翻译生成不是审核，审核不是部署。**

正常英文产品或文章保存后，Cloudflare 自动部署已经足够。AI 翻译必须先在 **Product translation drafts** 或 **Article translation drafts** 逐条核实、勾选发布并保存，最后进入 **Publish site updates** 点击 **Publish Site**。手动 Publish Site 不会替你保存未保存的表单，也不会替你批准翻译；它只构建并部署已经审核过的仓库状态。

## 七、AI 翻译操作

1. 站长先到 `/keystatic/ -> 网站语言` 勾选目标语言并保存。只保留默认英语时，AI 翻译界面提示尚未配置目标语言是正常现象。
2. 打开 `/keystatic/ -> AI translator` 或 `/manager/ -> AI 翻译`。
3. 两个界面都只显示 **网站语言** 页面已勾选的语言。选择产品、文章或指定 slug。
4. 点击提交，GitHub Actions 生成目标语言草稿；草稿不会直接公开。
5. 在翻译草稿审核页面逐条检查：术语、型号、单位、规格表、产品限制、FAQ、HTML/Markdoc 格式和自然语言是否正确。
6. 只对确认无误的草稿勾选发布并保存。
7. 打开 **Publish site updates**，点击 **Publish Site**，等待状态变为成功。

AI 翻译保留型号、SKU、单位、链接和数字，但仍必须人工审核，不可把模型输出当作事实来源。

## 八、正式域名与 R2 CDN

### 给网站绑定正式域名

1. **Workers & Pages -> 你的 Worker -> Settings -> Domains & Routes -> Add**。
2. 域名生效后，回到 GitHub 编辑 `src/data/site-origin.json`：把 `productionUrl` 改为正式根地址，并把旧 `SITE_URL` 中的 `workers.dev` 主机名加入 `retiredHosts`。这里只填写 Cloudflare 实际分配给你的旧主机名，不要带 `https://` 和路径。
3. 编辑 `wrangler.toml`，把 `SITE_URL` 改成同一个正式根地址。
4. 不要因为公开网站域名变化而修改 GitHub App。Homepage 与 Callback 始终使用步骤 5.2 的站长后台专用域名；只有站长后台域名或 UUID 改变时才更新对应配置。
5. 提交后等待部署完成。`site-origin.json` 与 `wrangler.toml` 的 `SITE_URL` 必须使用同一个公开正式根地址；两个后台 Host 和 GitHub App 保持独立，不需要在 GitHub Actions 或 Cloudflare Build Variables 再建一份 `SITE_URL`。

语言菜单使用 `/zh/`、`/de/...` 这类同站相对地址，因此更换域名不会把访客带回旧站。Canonical、`hreflang`、站点地图和分享链接需要绝对地址；构建脚本会从 `wrangler.toml` 读取 `SITE_URL`，如果它仍指向 `retiredHosts` 中的旧域名，构建会自动改用 `productionUrl` 并输出警告。

### GoldenOne R2 CDN 小白部署：正式域名可用后再照着点

> **当前状态：** GoldenOne 现在使用 `goldenone.arkalpooltech.workers.dev/r2` 作为建设期地址。不要把 `workers.dev` 当作 CDN 域名。以下步骤必须等网站已绑定真实正式域名后执行，例如网站 `https://www.goldenone.com`、媒体 `https://cdn.goldenone.com`。

公开图片与前台 PDF 要允许买家和 Google 访问；这里减少普通外站盗链并统一缓存，不把公开文件变成私有文件。敏感合同、报价或客户资料不要上传 R2。

### 先在记事本写好两项

| 项目 | 示例 | 不能填 |
| --- | --- | --- |
| 网站正式地址 | `https://www.goldenone.com` | `workers.dev`、临时地址 |
| R2 CDN 地址 | `https://cdn.goldenone.com` | `r2.dev`、S3 API 地址、别的项目域名 |

两项必须属于同一个已经添加到 Cloudflare 的真实域名。

### 第 1 步：先让网站正式域名能打开

1. 完成本节上方“给网站绑定正式域名”。
2. 浏览器打开正式网站地址，确认首页能加载。
3. GitHub 中检查 `wrangler.toml` 的 `SITE_URL` 已为该正式地址，提交并等 Worker 部署成功。
4. 没完成这一步就停止，不能在 `goldenone.arkalpooltech.workers.dev` 下创建 `cdn` 子域名。

### 第 2 步：给现有 R2 bucket 接 CDN 子域名

1. Cloudflare 左上角确认是 GoldenOne 所在 Account。
2. 进入 **R2 object storage -> goldenone -> Settings**。
3. 在 **Custom Domains** 点 **Add** 或 **Connect Domain**。
4. 输入 `cdn.goldenone.com`。只填域名，不填 `https://`，不加 `/r2`。
5. Cloudflare 显示 DNS 记录后直接点 **Connect Domain**。不要手工创建 CNAME，不要指向 `r2.dev`。
6. 等状态变为 **Active**。
7. 在 **Public Development URL**，如为 Allowed，点 **Disable**，输入 `disallow`，最后应显示 **Not allowed** 或 **Disabled**。

R2 根地址不列出文件是正常现象。

### 第 3 步：从建设期 `/r2` 切到 CDN 地址

1. GitHub 打开 `wrangler.toml` 并点击编辑。
2. 把两行改为实际 CDN 地址；第二行先保持 `original`：

```toml
PUBLIC_R2_ASSET_BASE_URL = "https://cdn.goldenone.com"
PUBLIC_R2_IMAGE_DELIVERY_MODE = "original"
```

3. 提交到 `main`，在 **Workers & Pages -> goldenone -> Deployments** 等待部署成功。
4. 不要在 Cloudflare Build Variables、GitHub Actions Variables 或浏览器代码重复添加 R2 地址。

### 第 4 步：让图片和 PDF 被 CDN 缓存

1. 打开 **Rules -> Cache Rules -> Create rule**。
2. Rule name 填 `GoldenOne R2 public media cache`。
3. 选择 **Custom filter expression**，粘贴：

```text
http.host eq "cdn.goldenone.com"
```

4. **Cache eligibility** 选 **Eligible for cache**；旧界面显示 **Cache Everything** 时选它。
5. **Browser TTL**、**Edge TTL** 都选 **Respect existing headers**。
6. 点 **Deploy**。

更新媒体时请换新文件名并更新内容链接，不要覆盖同名文件。

### 第 5 步：SEO 安全的防盗链，只创建这条 WAF 规则

**不要开启** Cloudflare 的全局 **Hotlink Protection**。官方说明该开关会让 Google Images、Pinterest、Facebook 等无法展示图片预览。

1. 打开 **Security -> WAF -> Custom rules -> Create rule**。
2. Rule name 填 `GoldenOne R2 public media hotlink guard`。
3. Filter 选 **Custom filter expression**。
4. 粘贴下方整段。只改网站与 CDN 两处域名：

```text
(http.host eq "cdn.goldenone.com"
 and http.request.method in {"GET" "HEAD"}
 and http.referer ne ""
 and not cf.client.bot
 and not starts_with(lower(http.referer), "https://www.goldenone.com/")
 and not starts_with(lower(http.referer), "https://cdn.goldenone.com/")
 and not starts_with(lower(http.referer), "https://www.google.")
 and not starts_with(lower(http.referer), "https://images.google.")
 and not starts_with(lower(http.referer), "https://lens.google."))
```

5. 打开 **Choose action** 下拉菜单：
   - 有 **Log**：选择 **Log**，点 **Deploy**，保持 7 天；这是 Enterprise 套餐可用的无拦截观察模式。
   - 没有 **Log**：这是 Cloudflare Free、Pro、Business 的正常套餐限制，不是配置出错。点 **Save as Draft**，先不要部署 Block；继续读下一步的“无 Log 检查”。
6. 观察与检查：
   - **有 Log**：7 天后到 **Security -> Events** 按规则名筛选。没有正常客户、Google 或合作方请求被记录时才改成 **Block**。
   - **无 Log**：挑一个访问量较低的时段，把草稿的 Action 选 **Block** 并 Deploy；马上打开 GoldenOne 首页、一个含图片的产品/文章页、一个前台 PDF，以及一张 CDN 图片的直接链接。它们必须都正常打开。任一项异常就立刻把规则切回 **Draft**。
7. 不要选 **Managed Challenge** 或 **JS Challenge**，因为图片和 PDF 请求无法完成交互验证。合作方确实被误拦时，先停用/改回 Draft，再由熟悉规则表达式的人添加该合作方的精确 `https://` 域名例外后重新检查。

规则允许空 Referer、Cloudflare 已验证机器人、Google Images 与 Lens，不影响 SEO、OG、图片搜索或前台 PDF。它只能减少普通网页盗链，不能阻止伪造 Referer 的脚本。不要给 CDN 域名加 Cloudflare Access，也不要把 CDN 域名与两个后台 Custom Domain 混用。

### 第 6 步：可选开启边缘 WebP，R2 只保存原图

1. 打开 **Images -> Transformations**，选择 CDN 所在 Zone，点 **Enable transformations**。
2. 找一张能直接打开的 JPG、JPEG 或 PNG，例如：

```text
https://cdn.goldenone.com/products/sample.jpg
```

3. 新标签页打开：

```text
https://cdn.goldenone.com/cdn-cgi/image/format=webp,quality=82/products/sample.jpg
```

4. 图片正常显示后，按 `F12` -> **Network** -> 刷新 -> 点击请求，在 **Headers** 确认 `content-type: image/webp`。
5. 只有确认成功，才把：

```toml
PUBLIC_R2_IMAGE_DELIVERY_MODE = "original"
```

改为：

```toml
PUBLIC_R2_IMAGE_DELIVERY_MODE = "edge-webp"
```

6. 提交 `main`，等待部署完成并打开产品页检查。测试失败、Images 要求开通你暂不使用的付费能力，或图片异常时保持/改回 `original`；不要删除或重传媒体。

WebP 在 Cloudflare 边缘生成和缓存，R2 不保存第二份 WebP，PDF 不参与转换，原图 URL 继续用于 canonical、OG、schema 和内容数据。

### GoldenOne 完成检查

- [ ] 网站正式域名和 CDN 子域名在同一个 Cloudflare Account。
- [ ] CDN Custom Domain 为 Active，`r2.dev` 已关闭。
- [ ] `PUBLIC_R2_ASSET_BASE_URL` 是 `https://cdn.你的域名`，没有 `/r2`。
- [ ] Cache Rule 只匹配 CDN 子域名。
- [ ] 原生 Hotlink Protection 关闭，WAF 先 Log 7 天。
- [ ] CDN 没有 Cloudflare Access。
- [ ] 测试返回 `image/webp` 后才启用 `edge-webp`。

官方参考：[R2 自定义域名](https://developers.cloudflare.com/r2/buckets/public-buckets/)、[R2 缓存](https://developers.cloudflare.com/cache/interaction-cloudflare-products/r2/)、[Cloudflare Images 转换](https://developers.cloudflare.com/images/optimization/transformations/overview/)、[WAF 自定义规则的套餐动作差异](https://developers.cloudflare.com/waf/custom-rules/)、[Hotlink Protection 限制](https://developers.cloudflare.com/waf/tools/scrape-shield/hotlink-protection/)、[Google 图片 SEO 与 CDN](https://developers.google.com/search/docs/appearance/google-images)。

## 九、上线前最后检查

站长在本机或 CI 中执行：

```powershell
npm run types:cloudflare -- --check
npm run check
npm run check:template
npm run check:admin-portals
npm run build
npm run check:template:production
```

`npm run check:template -- --production` 与最后一条等价；现在生产参数会正确传递到模板审计脚本。生产检查会阻止以下情况：行业/品牌仍是占位符、示例联系方式仍未替换或核实、目标语言没有完整静态本地化、事实未标为已核实，或 `template-example-` 演示内容仍存在。`npm run build` 结束前还会检查 Keystatic 浏览器包中是否确实写入当前仓库名和 GitHub App slug，避免部署成功后才发现登录页仍指向模板仓库。

最后用浏览器检查：

1. 首页、产品页、文章页、FAQ、About、Contact 都可访问。
2. 两个后台专用域名的根路径和错误 UUID 都返回 404；两个正确 UUID 可进入；公开主域的 `/keystatic/`、`/manager/` 和后台 API 返回 404。
3. 语言切换器只显示已启用语言，且每种语言页面的 UI、固定文案和 FAQ 已本地化。
4. 真实图片从 R2/CDN 加载。
5. 联系表单实际投递到指定收件箱。
6. Google Search Console、站点地图和最终 canonical 域名均使用正式域名。

## 十、评价系统 reviews：小白手把手维护教程

这套评价系统只维护一份正式数据，文件是：

```text
src/data/customer-reviews.json
```

修改这一份文件后，会自动同步到：

- 首页最下面的评价模块，位置在工厂图片轮播之后、Footer 之前；
- 每一个英文产品详情页最下面；
- 每一个已启用语言的产品详情页最下面；
- 符合严格条件的产品评价可以同时生成 Schema.org `Review` JSON-LD，供后续 SEO 使用。

不需要逐页复制评价。平时也不需要手改文件：站长从 `/keystatic/` 直接管理正式数据，内容管理员从 `/manager/` 提交 D1 草稿。

### 10.1 最简单的入口和权限

**站长操作：**

1. 打开站长专用域名的完整 UUID 地址，进入 `/keystatic/`。
2. 左侧点击 **站点设置 -> 评价系统**。
3. 最上方 **启用前台评价系统（总开关）** 控制整个网站。
4. 关闭并保存后：首页和全部产品详情页的评价模块一起隐藏，Review JSON-LD 也一起停止输出；评价数据不会删除。
5. 重新勾选并保存后，评价恢复显示。
6. 站长可以在 **评价列表** 中新增、修改、排序或删除正式评价，最后点击 Keystatic 的 **Save**，等待 Git 提交和部署完成。

**内容管理员操作：**

1. 打开内容后台专用域名的完整 UUID 地址，进入 `/manager/`。
2. 左侧点击 **客户评价**。也可以直接打开该完整 UUID 地址后面的 `/reviews/`，即 Manager 的评价管理页。
3. 点击 **新建评价草稿**，填写内容后点击 **保存评价草稿**。此时只写入 D1，不会直接改公开网站。
4. 检查草稿后点击 **应用到网站**，系统会触发 `manager-apply-review-draft.yml`，把该条评价写回 `src/data/customer-reviews.json`。
5. 要删除正式评价时，先选择该评价，再点击 **生成删除草稿**，确认后点击该草稿的 **应用到网站**。正式数据不会在第一步就被删除。
6. 内容管理员看得到总开关状态，但不能修改总开关；开关只属于站长。

### 10.2 先认识两个完全不同的数据

打开 Keystatic 的 **评价系统**，最上面有两块数据。

第一块是店铺总评分：

`店铺总评分` 包含评分、来源、店铺评价页链接和最后核实日期。评价数量不需要填写，系统会自动统计 `评价列表` 中的记录总数。

它只表示 Golden One 阿里巴巴店铺的公开总评分，不表示任意一个具体产品有 240 条评价。

第二块是单条买家评价：

`评价列表` 中的每一项就是一张评价卡片。

当前建站阶段含有明确标注 **Sample review layout** 的五星样式预览。它们的 `kind` 是 `demo`，`seoEligible` 固定为 `false`，不会生成 Review SEO。正式上线前应删除演示项或替换为可核实的真实评价。

### 10.3 更新阿里巴巴店铺总评分

建议每月检查一次，按下面步骤操作：

1. 浏览器打开 Keystatic **店铺总评分 -> 店铺评价页链接** 对应的阿里巴巴公开页面。
2. 记下公开显示的评分，例如 `5.0`。
3. 在 Keystatic **店铺总评分** 中修改评分。
4. 把 `checkedOn` 改成当天日期，格式必须是 `YYYY-MM-DD`，例如 `2026-08-13`。
5. 不要寻找或填写“店铺评价数量”；前台数量由下方评价列表自动统计，新增或删除评价后会自动变化。
6. 不要把 `source` 改成客户姓名，不要把 `profileUrl` 改成网站自己的产品页。

### 10.4 新增一条真实评价：最稳妥的做法

先从阿里巴巴订单后台或公开评价页面确认评价原文。不要凭记忆改写，不要把相同句子复制成多个买家，不要用 AI 生成买家评价。

在 Keystatic **评价系统 -> 评价列表** 点击 **Add**；或者在 Manager 点击 **新建评价草稿**。按下面对应关系填写：

每一行是什么意思：

| 字段 | 必填 | 怎么填 |
| --- | --- | --- |
| `id` | 是 | 每条评价必须不同。推荐 `alibaba-年份-三位序号`，例如 `alibaba-2026-001` |
| `published` | 是 | 勾选后前台显示；想暂时隐藏就取消勾选，不必删除 |
| `kind` | 是 | 真实评价选 `verified`；只看样式选 `demo`，演示数据永不进入 SEO |
| `rating` | 是 | 下拉选择 `4 星` 或 `5 星` |
| `quote` | 是 | 买家真实原文，不要翻译或改写 |
| `source` | 是 | 阿里巴巴评价填写 `Alibaba.com` |
| `sourceUrl` | 是 | 能核验评价的阿里巴巴页面或订单评价地址，不要写网站首页 |
| `buyerLabel` | 推荐 | 买家公开名称；若平台只显示匿名名称，就照平台原样填写，不要猜真实姓名 |
| `country` | 可选 | 平台公开显示才填写，例如 `'United States'`；没有就删除这一行 |
| `date` | SEO 必填 | 评价公开日期，固定 `YYYY-MM-DD`；无法核实就不要猜 |
| `projectType` | 推荐 | 真实订单类型，例如 `'Custom lapel pins'`，不确定就写较宽泛的 `'Custom metal gift project'` |
| `productSlugs` | 产品绑定必填 | 明确评价了哪些本站产品；只展示店铺评价时保持 `[]` |
| `seoEligible` | 是 | 刚录入时固定写 `false`；全部证据核验后才考虑改成 `true` |

保存前再次确认 `kind=verified`、`published=true`、`seoEligible=false`。等所有 SEO 证据完整后才打开 SEO 资格。

### 10.5 批量导入很多阿里巴巴高星评价

正式数据源是 `src/data/customer-reviews.json`。少量内容优先用 Keystatic 或 Manager；大量数据可由开发人员整理 JSON 后一次导入。

1. 先在表格中整理 `id`、评分、原文、来源地址、买家公开名称、国家、日期、订单类型和对应产品。
2. 删除重复评价。判断重复时同时比较买家、日期和原文。
3. 只保留已确认属于 Golden One 的真实评价。
4. 每条转换成与正式 JSON 相同的对象结构，或逐条从 Keystatic 添加。
5. JSON 导入时放入 `reviews` 数组，保证每条 `id` 唯一。
6. 新导入的每一条先用 `seoEligible: false`。
7. 建议最新评价放最上面；页面会按数组从上到下显示。
8. 一次导入后必须运行第 10.10 节的三条检查命令。

阿里巴巴公开评价页会用 JavaScript 动态加载正文。如果直接保存网页只能看到评分、数量和 `loading...`，不要据此生成或补写评价原文。应从可见评价界面、订单后台导出或站长保存的真实评价记录录入。

### 10.6 修改一条评价

1. 在 Keystatic 评价列表或 Manager 客户评价页用 `id` 找到目标。
2. 只修改需要更正的字段。
3. 若修改了 `quote`、`buyerLabel`、`date`、`sourceUrl` 或 `productSlugs`，先把 `seoEligible` 改回 `false`。
4. 重新核对阿里巴巴来源后，再决定是否恢复 `seoEligible: true`。
5. 不要修改其他评价的 `id`，否则后续无法稳定追踪重复数据。

### 10.7 删除一条评价

删除时必须从 `{` 开始一直删到这一条结尾的 `},`，不能只删除 `quote`。

删除前：

```ts
  {
    id: 'alibaba-2026-002',
    rating: 5,
    quote: '这条评价要删除。',
    source: 'Alibaba.com',
    sourceUrl: 'https://评价来源',
    productSlugs: [],
    seoEligible: false,
  },
```

把上面整块删除即可。删除后检查前后两条之间仍然是 `},` 接下一条 `{`。

### 10.8 让评价出现在某个产品详情页

网站产品文件在：

```text
src/content/products/
```

文件名去掉 `.mdoc` 就是产品 slug。例如：

```text
src/content/products/custom-challenge-coin.mdoc
```

对应 slug 是：

```text
custom-challenge-coin
```

把它填到评价的 `productSlugs`：

```ts
productSlugs: ['custom-challenge-coin'],
```

同一条真实订单评价明确涵盖两个产品时可以写两个：

```ts
productSlugs: ['custom-challenge-coin', 'custom-lapel-pin'],
```

没有明确产品证据时保持：

```ts
productSlugs: [],
```

未绑定产品的真实评价仍可显示在首页。产品详情页在没有专属评价时会显示店铺级评价集合；这只是页面上的供应商口碑展示，不会自动生成该产品的 Review SEO 数据。

### 10.9 什么时候可以打开 SEO：`seoEligible: true`

只有下面 7 项全部满足，才允许改成 `true`：

1. `quote` 是买家评价原文，不是翻译、概括、销售改写或 AI 生成。
2. `sourceUrl` 可以追溯到阿里巴巴评价或订单证据。
3. `buyerLabel` 与平台公开显示一致。
4. `date` 已核实，格式是 `YYYY-MM-DD`。
5. `rating` 已核实。
6. `productSlugs` 明确对应评价中的实际产品。
7. 这条评价在该产品公开页面中真实可见。

满足后这样写：

```ts
productSlugs: ['custom-challenge-coin'],
seoEligible: true,
```

系统会把它加入对应产品的 Schema.org `Review` JSON-LD。系统不会把店铺汇总评分自动变成所有产品的 `AggregateRating`。

产品级 `AggregateRating` 仍由该产品 `.mdoc` 文件中的下面两个字段控制：

```yaml
aggregateRatingValue: ''
aggregateRatingCount: 0
```

只有拿到“这个具体产品或产品组”的真实汇总评分时才能填写。不能把阿里巴巴店铺总评分复制进去，不能用挑选出来的几条五星评价手算一个汇总评分。

### 10.10 每次修改后必须运行检查

在项目根目录打开 PowerShell，依次运行：

```powershell
npm run check
npm run check:template
npm run build
```

三条都成功后再提交和发布。若改动涉及正式 SEO 上线，再额外运行：

```powershell
npm run check:seo
npm run check:rich-results
```

发布后打开首页和任意产品详情页，检查：

1. 总评分、评价数量和来源链接正确。
2. 左右按钮、鼠标滚动和手机触摸横滑正常。
3. 买家原文没有被截断成错误内容。
4. 没有重复卡片、空白卡片或测试文字。
5. 产品页只输出明确绑定且 `seoEligible: true` 的 Review JSON-LD。

### 10.11 常见错误怎么处理

| 报错或现象 | 处理方法 |
| --- | --- |
| `Expected ","` 或构建提示语法错误 | 检查上一条评价结尾是否有 `},`，检查字符串是否成对使用单引号 |
| 评价原文中有 `don't` 导致报错 | 改成 `don\'t`，或者把这一段字符串改用反引号包住 |
| 首页有评价但产品页没有 | 检查 `productSlugs` 是否与 `.mdoc` 文件名完全一致，不能包含 `.mdoc` |
| 产品页显示了评价但 SEO 没有 Review | 检查 `seoEligible`、`buyerLabel`、`date`、`sourceUrl` 和 `productSlugs` 是否全部满足第 10.9 节 |
| 所有产品页都显示相同评价 | 这是店铺级回退展示；给真实产品评价填写正确的 `productSlugs` 后，该产品优先显示自己的评价 |
| 前台评价数量不正确 | 检查评价列表中是否有多余或遗漏记录；数量由系统自动统计列表总数，Keystatic 不再提供手填数量字段 |
| 想先保存不完整评价 | 可以录入，但必须保持 `seoEligible: false`；不确定的字段直接省略，不要猜 |
| 想改评价模块布局 | 修改 `src/components/CustomerReviews.astro` 和 `src/styles/goldenone-redesign.css`；只维护数据时不要碰这两个文件 |

### 10.12 评价来源记录

- 店铺评分来源：Golden One 阿里巴巴公开供应商评价页，具体地址保存在 Keystatic **店铺总评分 -> 店铺评价页链接**。
- 第三方平台评分、评价数量和评价正文会变化。每次更新都要修改 `checkedOn`，并保留核验依据。

### 10.13 更换首页工厂轮播图片

首页工厂轮播图片位于 `public/images/factory/`。直接用新图片覆盖目录中的 6 个同名 `.jpg` 文件即可，不需要修改代码；如果修改了文件名，则同时修改 `src/data/site.ts` 中的 `factoryGallery` 图片路径和图片标题。

## 十一、常见问题

| 现象 | 先检查 |
| --- | --- |
| Keystatic 完整 UUID 地址显示 Astro 标志与 `404: Not found, Path: /UUID` | 最新 Worker 是否已部署；`main` 是否为 `src/worker.ts`；`run_worker_first = true` 是否存在；专用 Host/UUID Secret 是否精确；不要改成 `/keystatic/UUID` |
| Keystatic 登录后不能保存 | GitHub App 是否安装到当前仓库；Client ID/secret、repo 名称和 Callback URL 是否一致；Callback 不带 UUID |
| Manager 完整 UUID 地址进不去 | `MANAGER_PORTAL_HOST` 是否与浏览器 Host 精确一致；UUID 和 `ADMIN_PORTAL_SESSION_SECRET` 是否为当前 Worker 加密 Secret；Custom Domain 是否 Active |
| 后台专用域名不带 UUID 却显示商业前台 | 立即停止分享该域名；检查 Domains & Routes 是否选择当前 Worker 的 Custom Domain、Host 配置、最新部署及 `run_worker_first = true` |
| Manager 显示 D1/R2 未连接 | `wrangler.toml` 的 D1 ID、R2 bucket 名称和 binding 名称 |
| 数据分析没有新访问 | `ANALYTICS_ENABLED`、`MANAGER_DB` binding、访问是否为公开 HTML GET、是否开启 DNT/GPC；后台与机器人请求不会采集 |
| 访客只显示网段而非完整 IP | 这是默认 `network` 隐私模式；只有完成隐私审查后才考虑 `full`，且完整 IP 最多保留 30 天 |
| 保存校准后 Manager 仍是旧数字 | 不需要 Publish Site；直接刷新 Manager 或切换统计周期。若仍旧，检查 D1 binding 和浏览器是否打开当前 Worker 版本 |
| GSC 显示未连接或无数据 | `GSC_SITE_URL` 是否与 property 精确一致、service account email 是否已加入该 property、JSON 是否作为 Worker Secret 完整保存；新站数据通常有延迟 |
| AI 翻译没有语言可选 | 站长进入 `/keystatic/ -> 网站语言` 勾选目标语言、点击 Save，并等待该提交部署完成 |
| 已勾选语言但公开站点没有显示 | 该语言的 `site-locales.json` 固定 UI、页面文案或 FAQ 尚未补全并审核；查看 `npm run check:template` 的警告 |
| 切换语言跳到旧域名或打不开 | 重新部署当前模板；检查 `src/data/site-origin.json` 和 `wrangler.toml`。语言菜单已使用同站相对路径，模板自检会阻止再次改回绝对域名 |
| 翻译任务失败 | GitHub token 权限、`GEMINI_API_KEYS`、Actions 日志和目标语言是否已启用 |
| 翻译审核后仍未公开 | 需要在 Publish site updates 点击 **Publish Site**；草稿目录不会自动部署 |
| 图片打不开 | `PUBLIC_R2_ASSET_BASE_URL`、R2 binding、Custom Domain 状态和对象路径 |
| 构建报 R2/D1 不存在 | Cloudflare 资源是否在同一 Account；D1 ID 或 R2 bucket 名称是否仍是占位符 |
| 部署提示创建 `SESSION` 时发生同名冲突 | 这通常是旧 Worker/Pages 迁移，不是新站问题；把现有 KV 的 ID 显式绑定到 `SESSION`，不要再创建或删除原 KV |

**Keystatic 维修说明：** Astro 6 已移除旧的 `locals.runtime.env`。项目通过本地 Cloudflare 兼容路由读取三个 Keystatic OAuth Secret；不要改回 `@keystatic/astro` 自动注入的 API 路由。若点击 GitHub 登录直接出现空白 HTTP 500，先确认已部署当前代码，再检查三个 OAuth Secret。GitHub App Homepage 填站长后台完整 UUID 地址；Callback 必须使用同一站长后台 Host 的 `/api/keystatic/github/oauth/callback`，且不能带 UUID。更新 UUID、Homepage 或 Callback 不要求重新安装同一个 GitHub App；更新 `KEYSTATIC_SECRET` 后需要重新登录。若完整 UUID 地址出现 Astro 404，问题发生在入口重写而不是 GitHub 授权，按上表第一行检查 Worker 与 Custom Domain。

**网站语言维修说明：** Keystatic 的 JSON singleton 路径必须写成无扩展名的 `src/data/site-language-settings`，`format: 'json'` 会自动补 `.json`。模板自检会阻止错误的 `site-language-settings.json.json`；保存语言并等待部署后，前台、Manager 和 AI 才会统一读取新配置。

**SESSION KV 说明：** 新站首次部署由 Astro 6 和 Wrangler 自动创建 `SESSION`，无需手工配置 ID。只有把已使用的 Pages/Worker 迁移到新 Worker 时，才应在 `wrangler.toml` 显式绑定原 KV ID，避免同名资源重复创建。

## 十二、给开发人员的边界

不要删除或替换以下能力：自定义 Keystatic 字段、`/manager/` 的 D1 草稿和 R2 图片流、AI 翻译 API/Actions、Cloudflare Workers 适配器、R2 路由、KV 会话 binding、D1 binding、联系表单和 Publish Site 流程。公开页面必须面向国际买家，而不是面向内部操作人员。

改动 Astro、Tailwind、内容 schema、部署配置、公开页面或语言配置后，运行第九节四条检查。正式生产前，确认 `src/data/industry-profile.json` 中所有事实已核实，移除示例内容，并保存生产检查输出。
