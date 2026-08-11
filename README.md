# BusinessWeb 国际品牌网站模板

这是面向海外买家、经销商、项目团队和决策者的通用 B2B 商业网站模板。公开网站采用 Astro 6、Tailwind 和 Cloudflare Workers；图片放在 Cloudflare R2；内容管理员通过独立 Manager 专用域名与 UUID 工作；站长通过另一个独立 Keystatic 专用域名与 UUID 管理 Git 内容、行业基础信息、图片和发布。

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

AI 翻译：英语源内容 -> GitHub Actions 生成草稿 -> 人工审核 -> 手动 Publish Site -> 公开目标语言页
```

| 地址 | 谁使用 | 用途 |
| --- | --- | --- |
| `/` | 海外访客 | 国际品牌公开网站 |
| `https://站长后台专用域名/KEYSTATIC_UUID` | 站长/网站所有者 | Git 内容、行业基础、图片、翻译审核、发布 |
| `https://内容后台专用域名/MANAGER_UUID` | 内容级管理员 | D1 草稿、R2 图片、内容审批、翻译任务、发布记录 |
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
7. 页面显示执行成功后，D1 草稿表才可用。

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
| `RESEND_API_KEY` | Secret | 已配置 Resend 时的 API Key | 联系表单按需 |
| `CONTACT_FROM_EMAIL` | Variable | 已在 Resend 验证过的发件人地址 | 联系表单按需 |
| `CONTACT_TO_EMAIL` | Variable | 仅在收件邮箱不同于站点公开联系邮箱时填写 | 可选覆盖 |

不需要创建 `CONTACT_FORM_SECRET`、`R2_IMAGE_POOL_WRITE_TOKEN`、`MANAGER_ACCESS_BYPASS_TOKEN`、`MANAGER_ALLOWED_EMAILS` 或多个发布 token。生产 Manager 由专用 Host、UUID 和签名会话控制，不从浏览器读取 Token，也不依赖 Cloudflare Access 邮箱头。模板用一个 `BUSINESSWEB_GITHUB_TOKEN` 处理 Manager 写回、AI 任务、草稿读取和手动发布调度。

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

## 六、四种“保存/发布”不要混淆

| 你做的动作 | 数据去了哪里 | 是否立即公开 | 是否会自动部署 |
| --- | --- | --- | --- |
| Keystatic 普通产品/文章点击保存 | GitHub 的 `src/content/products/` 或 `src/content/blog/` | 内容已进入源代码 | 若 Workers Builds 已连接且匹配 watch paths，会自动构建部署 |
| Manager 普通编辑点击保存草稿 | D1 | 否 | 否；还没有写回 Git |
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

## 十、常见问题

| 现象 | 先检查 |
| --- | --- |
| Keystatic 完整 UUID 地址显示 Astro 标志与 `404: Not found, Path: /UUID` | 最新 Worker 是否已部署；`main` 是否为 `src/worker.ts`；`run_worker_first = true` 是否存在；专用 Host/UUID Secret 是否精确；不要改成 `/keystatic/UUID` |
| Keystatic 登录后不能保存 | GitHub App 是否安装到当前仓库；Client ID/secret、repo 名称和 Callback URL 是否一致；Callback 不带 UUID |
| Manager 完整 UUID 地址进不去 | `MANAGER_PORTAL_HOST` 是否与浏览器 Host 精确一致；UUID 和 `ADMIN_PORTAL_SESSION_SECRET` 是否为当前 Worker 加密 Secret；Custom Domain 是否 Active |
| 后台专用域名不带 UUID 却显示商业前台 | 立即停止分享该域名；检查 Domains & Routes 是否选择当前 Worker 的 Custom Domain、Host 配置、最新部署及 `run_worker_first = true` |
| Manager 显示 D1/R2 未连接 | `wrangler.toml` 的 D1 ID、R2 bucket 名称和 binding 名称 |
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

## 十一、给开发人员的边界

不要删除或替换以下能力：自定义 Keystatic 字段、`/manager/` 的 D1 草稿和 R2 图片流、AI 翻译 API/Actions、Cloudflare Workers 适配器、R2 路由、KV 会话 binding、D1 binding、联系表单和 Publish Site 流程。公开页面必须面向国际买家，而不是面向内部操作人员。

改动 Astro、Tailwind、内容 schema、部署配置、公开页面或语言配置后，运行第九节四条检查。正式生产前，确认 `src/data/industry-profile.json` 中所有事实已核实，移除示例内容，并保存生产检查输出。
