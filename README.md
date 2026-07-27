# BusinessWeb 国际品牌网站模板

这是面向海外买家、经销商、项目团队和决策者的通用 B2B 商业网站模板。公开网站采用 Astro 6、Tailwind 和 Cloudflare Workers；图片放在 Cloudflare R2；内容管理员在 `/manager/` 工作；站长在 `/keystatic/` 管理 Git 内容、行业基础信息、图片和发布。

默认公开语言只有英语。站长在 `/keystatic/` 的 **网站语言** 页面用复选框管理其它语言。`/manager/` 和 AI 翻译只显示站长已勾选的语言；公开语言切换器、`hreflang` 和站点地图只纳入固定 UI、页面文案与 FAQ 已完成审核的语言。

## 先看这张图

```text
客户提供真实资料
        |
        +--> 站长 /keystatic/ --------------> GitHub 内容文件 ------> 自动部署或手动发布 ------> 公开网站
        |
        +--> 内容管理员 /manager/ ----------> D1 草稿 -> 审核/写回 Git -> 发布 -------------> 公开网站
        |
        +--> 图片 --------------------------> R2 图片池 -------------------------------> CDN 图片地址

AI 翻译：英语源内容 -> GitHub Actions 生成草稿 -> 人工审核 -> 手动 Publish Site -> 公开目标语言页
```

| 地址 | 谁使用 | 用途 |
| --- | --- | --- |
| `/` | 海外访客 | 国际品牌公开网站 |
| `/keystatic/` | 站长/网站所有者 | Git 内容、行业基础、图片、翻译审核、发布 |
| `/manager/` | 内容级管理员 | D1 草稿、R2 图片、内容审批、翻译任务、发布记录 |
| `/r2/...` | 浏览器 | R2 图片代理地址，不应被搜索收录 |

不要把 `/keystatic/`、`/manager/`、`/api/` 或 `/r2/` 当作公开页面推广；模板已经在 robots 中排除它们。

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
| Cloudflare 账号 | Worker、R2、KV、D1、Access、域名 |
| 一个正式域名，推荐 | 正式上线、Access、GitHub App 回调 |
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
KEYSTATIC_GITHUB_REPO = "你的组织/客户新仓库"
PUBLIC_KEYSTATIC_GITHUB_APP_SLUG = "你的-keystatic-github-app-slug"
PUBLIC_R2_ASSET_BASE_URL = "https://cdn.example.com"

[[r2_buckets]]
binding = "CONTENT_BUCKET"
bucket_name = "步骤 1 创建的 bucket 名称"

[[d1_databases]]
binding = "MANAGER_DB"
database_name = "步骤 3 创建的数据库名称"
database_id = "步骤 3 的 Database ID"
```

首次部署前还不知道真实 `workers.dev` 地址，因此 `SITE_URL` 和 `src/data/site-origin.json` 的 `productionUrl` 都保持空字符串，`retiredHosts` 保持空数组。`PUBLIC_R2_ASSET_BASE_URL` 暂时保留明显的 CDN 占位值，取得实际网站地址或 R2 自定义域名后再替换。第一次构建只会在站点元数据中使用本机地址作为临时内部后备；取得 Cloudflare 实际分配的网址后，必须按步骤 7.1 填入真实地址并重新部署，之后才能对外使用。点击 **Commit changes**，直接提交到 `main`。

### 步骤 5：取得 Cloudflare API Token 和 Account ID

这两个值只给 GitHub Actions 的 **Publish Site** 工作流使用。它们不是 R2 密钥、不是 D1 Database ID，也不要填写进 `wrangler.toml`、网站代码或 Cloudflare Worker 的 Variables and Secrets。

#### 5.1 创建 `CLOUDFLARE_API_TOKEN`

1. 登录 Cloudflare，点击右上角**头像 -> My Profile（个人资料）-> API Tokens**。
2. 点击 **Create Token（创建令牌）**。
3. 在 **Edit Cloudflare Workers** 模板右侧点击 **Use template（使用模板）**。
4. 该官方模板会自动勾选部署 Worker 所需的权限。在 **Account Resources** 中选择本客户网站使用的目标 Cloudflare Account，不要选其他客户的账户。
5. 点击 **Continue to summary**，确认后点击 **Create Token**。
6. Cloudflare 只会完整显示一次 Token。立刻复制整段字符串，先放入密码管理器，名称记为 `CLOUDFLARE_API_TOKEN`。

#### 5.2 复制 `CLOUDFLARE_ACCOUNT_ID`

1. 在 Cloudflare 左侧进入 **Websites** 或 **Workers & Pages**，确认左上角当前选中的是本客户的 Account。
2. 点击左侧 **Account Home**。
3. 在账户列表中找到该 Account，点击该行右侧的 **...**，选择 **Copy account ID**。
4. 粘贴到临时安全位置。它通常是一串 32 位字符，名称记为 `CLOUDFLARE_ACCOUNT_ID`。

> 不要混淆三种 ID：`CLOUDFLARE_ACCOUNT_ID` 是 Cloudflare 账户 ID，供 GitHub Actions 部署用；D1 的 **Database ID** 填入 `wrangler.toml`；Worker 的公开网址是 `SITE_URL`，它不是 ID。

### 步骤 6：把 Cloudflare 部署凭据放入 GitHub Secrets

1. 打开**当前客户的新 GitHub 仓库**，点击 **Settings -> Secrets and variables -> Actions**。
2. 保持在 **Secrets** 标签，点击 **New repository secret**。
3. 逐项填写名称和值后点击 **Add secret**。名称必须全大写，不能有空格。

| 名称 | 粘贴什么 | 是否必需 |
| --- | --- | --- |
| `CLOUDFLARE_API_TOKEN` | 步骤 5.1 创建的完整 API Token | 是 |
| `CLOUDFLARE_ACCOUNT_ID` | 步骤 5.2 复制的 Account ID | 是 |
| `GEMINI_API_KEYS` | Gemini API Key；多个 key 用英文逗号分隔 | 需要 AI 翻译时 |

4. 切换到 **Variables** 标签，点击 **New repository variable**，添加：

| 名称 | 值 |
| --- | --- |
| `SITE_URL` | 首次部署后得到的公开网站根地址；后续绑定正式域名时改为正式域名 |

首次部署前还不知道公开网址时，先不要创建 `SITE_URL` 这个 Variable。模板允许用空地址完成第一次部署，以便取得 Cloudflare 实际分配的 `workers.dev` 地址；取得后必须在步骤 7.1 补齐真实地址并进行第二次部署。

5. 在同一仓库打开 **Settings -> Actions -> General**，找到 **Workflow permissions**，选择 **Read and write permissions** 并点击 **Save**。AI 翻译工作流需要把翻译草稿写回仓库；如果组织策略锁定该选项，请让组织管理员允许当前仓库使用写入权限。

### 步骤 7：连接 Cloudflare Workers Builds，完成第一次部署

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

#### 7.1 配置 Workers Builds 的构建期 `SITE_URL`

Astro 在构建网站时需要 `SITE_URL`，它与 Worker 运行时变量是两回事。首次部署成功后，打开 **Workers & Pages -> 你的 Worker -> Settings -> Build -> Build Variables and Secrets**，点击 **Add**，填写：

| Name | Value | 类型 |
| --- | --- | --- |
| `SITE_URL` | 步骤 7 得到的完整 `workers.dev` 根网址 | Variable |

随后回到 GitHub 仓库的 **Settings -> Secrets and variables -> Actions -> Variables**，也创建或修改同名 `SITE_URL`，值必须一字不差。两处都要填：前者用于 Cloudflare 自动部署，后者用于 `/manager/` 的 **Publish Site** 手动发布。

#### 7.2 设置自动部署的监听路径

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

### 步骤 8：创建 GitHub App，配置 Keystatic 登录

现在已有真实的公开网站地址，才创建 GitHub App，避免 Callback URL 填错。

1. GitHub 右上角头像 -> **Settings -> Developer settings -> GitHub Apps -> New GitHub App**。
2. App name 填写一个新的、不与其他客户重复的名称。
3. Homepage URL 填写步骤 7 的网站**根地址**，例如 `https://client-industry-site.<你的账户>.workers.dev`。不要填 `/keystatic/`；末尾 `/` 可有可无。
4. Callback URL 必须填写以下完整地址，只有域名部分替换为步骤 7 的根地址：

```text
https://你的公开网站地址/api/keystatic/github/oauth/callback
```

5. Repository permissions 中给 **Contents** 选择 **Read and write**。
6. 创建 App，复制 **Client ID**，生成并复制 **Client secret**。`Client secret` 离开页面后无法再次查看，复制后立即放进密码管理器。
7. 点击 **Install App**，只安装到当前客户的新仓库。
8. 记下 App 的 slug（GitHub App 设置页面网址中 `/apps/` 后面的短名称）。回到 GitHub 编辑 `wrangler.toml`，把 `PUBLIC_KEYSTATIC_GITHUB_APP_SLUG` 改为这个 slug；同时将 `[vars]` 中的 `SITE_URL` 改为步骤 7 的网址，并把 `PUBLIC_R2_ASSET_BASE_URL` 改为同一网址加 `/r2`，例如 `https://client-industry-site.<你的账户>.workers.dev/r2`。再把 `src/data/site-origin.json` 的 `productionUrl` 改为同一个网站根地址。提交到 `main`，等待第二次自动部署成功。

### 步骤 9：添加 Worker Variables 和 Secrets

此时 Worker 已在步骤 7 创建完成。打开 **Workers & Pages -> 你的 Worker -> Settings -> Variables and Secrets -> Add**，每次添加后点击 **Deploy**。下表中写明 **Secret** 的项目必须选 Secret，其他选 Variable。

| 名称 | 类型 | 填什么 | 是否必需 |
| --- | --- | --- | --- |
| `KEYSTATIC_SECRET` | Secret | 按步骤 9.1 生成的随机字符串 | 是 |
| `KEYSTATIC_GITHUB_CLIENT_ID` | Secret | 步骤 8 的 Client ID | Keystatic |
| `KEYSTATIC_GITHUB_CLIENT_SECRET` | Secret | 步骤 8 的 Client secret | Keystatic |
| `BUSINESSWEB_GITHUB_TOKEN` | Secret | 仅授权当前仓库的 fine-grained GitHub token | manager 发布、翻译、草稿写回 |
| `MANAGER_ALLOWED_EMAILS` | Variable | 允许内容管理员使用的邮箱，英文逗号分隔 | manager |
| `RESEND_API_KEY` | Secret | 已配置 Resend 时的 API Key | 联系表单按需 |
| `CONTACT_FROM_EMAIL` | Variable | 已在 Resend 验证过的发件人地址 | 联系表单按需 |
| `CONTACT_TO_EMAIL` | Variable | 接收询盘的邮箱 | 联系表单按需 |

#### 9.1 生成 `KEYSTATIC_SECRET`

不要手写短密码。请在 Windows PowerShell 中复制执行下面**整段**命令；它会输出一条可直接粘贴的随机值：

```powershell
$bytes = New-Object byte[] 48; $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create(); $rng.GetBytes($bytes); [Convert]::ToBase64String($bytes); $rng.Dispose()
```

输出只显示一次；复制它，作为 `KEYSTATIC_SECRET` 的值保存。不要把它提交到 GitHub，也不要发给内容管理员。

#### 9.2 创建 `BUSINESSWEB_GITHUB_TOKEN`

1. GitHub 右上角头像 -> **Settings -> Developer settings -> Personal access tokens -> Fine-grained tokens -> Generate new token**。
2. Token name 可填写 `businessweb-manager-publish`，Expiration 按客户维护周期选择。
3. Resource owner 选择当前客户仓库所属的 GitHub 账号或组织；Repository access 选择 **Only select repositories**，只选择当前客户的新仓库。
4. 在 **Repository permissions** 中设置 **Contents: Read and write** 与 **Actions: Read and write**。
5. 点击 **Generate token**，立刻复制完整 Token，在 Worker 的 Variables and Secrets 中作为 **Secret** 新增 `BUSINESSWEB_GITHUB_TOKEN`。

这个 Token 只给 `/manager/` 的发布、翻译与草稿写回使用。不要把它放进 GitHub Actions Secrets，不要使用范围覆盖所有仓库的旧式 Global token。

### 步骤 10：用 Cloudflare Access 保护内容后台

公开首页和 `/api/contact` 不要加整站 Access。只创建两条 Self-hosted Access Application：

1. **Zero Trust -> Access -> Applications -> Add an application -> Self-hosted**。
2. 第一条路径填 `/manager/*`，Allow policy 的邮箱与 `MANAGER_ALLOWED_EMAILS` 完全一致。
3. 第二条路径填 `/api/manager/*`，使用同一批邮箱。
4. 使用管理员邮箱打开 `https://你的域名/manager/`，应先出现 Cloudflare Access 登录页。

### 步骤 11：首次部署后按顺序验收

完成步骤 1 至 10，且第二次自动部署显示成功后，再开始上传真实资料。用浏览器逐项检查：

1. 打开网站根地址，确认页面可以加载；这时仍是模板示例内容，不能对外推广。
2. 用站长的 GitHub 账号打开 `/keystatic/`，点击 **Login with GitHub**；授权后应能进入管理界面。若出现 HTTP 500，先检查步骤 8 的 Callback URL 是否为 `/api/keystatic/github/oauth/callback`，以及步骤 9 的三个 Keystatic Secret 是否都已保存并部署。
3. 用已加入 Access policy 且已写入 `MANAGER_ALLOWED_EMAILS` 的邮箱打开 `/manager/`；先经过 Cloudflare Access，随后能看到内容管理员界面。
4. 在 `/manager/` 的 **Assets** 试传一张无敏感信息的测试图片，确认图片可显示，再删除测试文件。
5. 确认 GitHub Actions 页面可以看到 `Publish Site` 与 `AI Translation Drafts` 两个工作流。不要在未配置 `GEMINI_API_KEYS` 时提交 AI 翻译任务。

只有站长需要步骤 1 至 11 的账户、密钥和部署权限。内容管理员从本 README 的“内容管理员使用”部分开始，不需要接触 Cloudflare、GitHub App、API Token 或任何 Secret。

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

首次阶段可以通过 `/keystatic/ -> Brand and industry foundation` 复查或补充行业基础资料，并通过 `/keystatic/ -> 网站语言` 确认实际启用语种。没有真实企业资料时只使用中性占位说明，不要杜撰公司能力、认证、价格、客户、案例或联系方式。

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

1. 打开 `https://你的域名/keystatic/`，使用对当前 GitHub 仓库有写入权限的账号登录。
2. 先打开 **Brand and industry foundation**，保存品牌、行业、目标市场、联系资料和已核实的定位。
3. 打开 **Image pool**，上传真实图片到 R2。
4. 在 **Products and offerings** 新建或编辑产品：先选公开分类、供应类型、型号结构、主图、应用、参数表和 FAQ，再保存。
5. 在 **Articles** 新建或编辑真实文章，填写封面、日期、分类和正文，再保存。
6. 仅保存客户已提供或已核实的事实。空缺的性能、认证、价格、交期和市场覆盖范围不要猜测。

### 在 `/keystatic/` 选择网站语言

1. 打开 `/keystatic/`，在左侧 **Foundation** 分组点击 **网站语言**。
2. **English（英语）· en** 是固定源语言，不能关闭；不要把其它语言当作新的源内容。
3. 每种语言都同时显示英文名、中文名和语言代码。可以逐项勾选，也可以使用 **全选全部目标语言** 或 **反选当前选择**；没有多语需求时全部不勾选，网站就是英语单语。
4. 点击页面底部 **Save**。保存会提交 `src/data/site-language-settings.json`，这是全站唯一的启用语言配置。
5. 自动部署完成后，`/manager/` 和 `/keystatic/ -> AI translator` 只显示刚才勾选的语言。取消勾选后，这些语言也会从新翻译任务选项中消失。
6. 刚勾选但固定文案尚未审核的语言，会先用于产品和文章翻译准备，不会立即出现在公开站点。完成 `site-locales.json` 的固定 UI、页面文案和 FAQ 翻译并设为 `approved: true` 后，再次部署才会公开。
7. 正式上线前运行 `npm run check:template:production`。它会阻止“已勾选但固定本地化不完整”的语言上线。

这一分层是有意设计的：**站长的复选框决定要做哪些语言，翻译审核状态决定哪些语言已经可以公开。** 因此不会因为一次误勾选就发布整站英文回退页面，也不需要给 `/manager/` 增加语言管理权限。

### 内容管理员使用手册：在 `/manager/` 工作

内容管理员只需公司邮箱和 Cloudflare Access 登录，不需要 GitHub、Cloudflare 控制台、API Token、GitHub App 或任何 Secret。站长负责配置和发布权限；内容管理员负责创建、补全和审核业务资料。

1. 内容管理员打开 `https://你的域名/manager/`，先通过 Cloudflare Access。
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
4. 更新 GitHub App 的 Homepage URL 和 Callback URL。
5. 更新 GitHub Actions Variable `SITE_URL`，并在 **Workers & Pages -> 你的 Worker -> Settings -> Build -> Build Variables and Secrets** 更新同名 `SITE_URL`。
6. 提交后等待部署完成。`site-origin.json`、`wrangler.toml`、GitHub Actions Variable、Workers Builds Variable 与 GitHub App 必须使用同一个正式根地址。

语言菜单使用 `/zh/`、`/de/...` 这类同站相对地址，因此更换域名不会把访客带回旧站。Canonical、`hreflang`、站点地图和分享链接需要绝对地址，它们优先读取构建期 `SITE_URL`；如果该变量仍指向 `retiredHosts` 中的旧域名，构建会自动改用 `productionUrl` 并输出警告。

### 给 R2 图片绑定 CDN 域名

1. 在 Cloudflare 添加并接管域名，例如 `cdn.example.com`。
2. 打开 **R2 -> 本客户 bucket -> Settings -> Custom Domains**。
3. 添加 CDN 域名并等待 Active。
4. 编辑 `wrangler.toml` 的 `PUBLIC_R2_ASSET_BASE_URL`，例如 `https://cdn.example.com`。
5. 提交后，后续从图片池插入的图片会使用 CDN 地址。

不要把 R2 S3 API token 写入浏览器、GitHub、`wrangler.toml` 或内容字段。

## 九、上线前最后检查

站长在本机或 CI 中执行：

```powershell
npm run check
npm run check:template
npm run build
npm run check:template:production
```

`npm run check:template -- --production` 与最后一条等价；现在生产参数会正确传递到模板审计脚本。生产检查会阻止以下情况：行业/品牌仍是占位符、目标语言没有完整静态本地化、事实未标为已核实，或 `template-example-` 演示内容仍存在。

最后用浏览器检查：

1. 首页、产品页、文章页、FAQ、About、Contact 都可访问。
2. `/manager/` 与 `/api/manager/` 被 Access 保护。
3. 语言切换器只显示已启用语言，且每种语言页面的 UI、固定文案和 FAQ 已本地化。
4. 真实图片从 R2/CDN 加载。
5. 联系表单实际投递到指定收件箱。
6. Google Search Console、站点地图和最终 canonical 域名均使用正式域名。

## 十、常见问题

| 现象 | 先检查 |
| --- | --- |
| `/keystatic/` 登录后不能保存 | GitHub App 是否安装到当前新仓库；Client ID/secret、repo 名称和 Callback URL 是否一致 |
| `/manager/` 进不去 | Access policy 邮箱和 `MANAGER_ALLOWED_EMAILS` 是否一致；路径是否为 `/manager/*` |
| Manager 显示 D1/R2 未连接 | `wrangler.toml` 的 D1 ID、R2 bucket 名称和 binding 名称 |
| AI 翻译没有语言可选 | 站长进入 `/keystatic/ -> 网站语言` 勾选目标语言、点击 Save，并等待该提交部署完成 |
| 已勾选语言但公开站点没有显示 | 该语言的 `site-locales.json` 固定 UI、页面文案或 FAQ 尚未补全并审核；查看 `npm run check:template` 的警告 |
| 切换语言跳到旧域名或打不开 | 重新部署当前模板；检查 `src/data/site-origin.json`、两处构建变量和 `wrangler.toml`。语言菜单已使用同站相对路径，模板自检会阻止再次改回绝对域名 |
| 翻译任务失败 | GitHub token 权限、`GEMINI_API_KEYS`、Actions 日志和目标语言是否已启用 |
| 翻译审核后仍未公开 | 需要在 Publish site updates 点击 **Publish Site**；草稿目录不会自动部署 |
| 图片打不开 | `PUBLIC_R2_ASSET_BASE_URL`、R2 binding、Custom Domain 状态和对象路径 |
| 构建报 R2/D1 不存在 | Cloudflare 资源是否在同一 Account；D1 ID 或 R2 bucket 名称是否仍是占位符 |
| 部署提示创建 `SESSION` 时发生同名冲突 | 这通常是旧 Worker/Pages 迁移，不是新站问题；把现有 KV 的 ID 显式绑定到 `SESSION`，不要再创建或删除原 KV |

**Keystatic 维修说明：** Astro 6 已移除旧的 `locals.runtime.env`。模板通过本地 Cloudflare 兼容路由读取三个 Keystatic Worker Secret；不要改回 `@keystatic/astro` 自动注入的 API 路由。若点击 GitHub 登录直接出现空白 HTTP 500，先确认已部署当前模板，再检查三个 Secret，Homepage 不需要填写 `/keystatic/`，Callback 必须使用 `/api/keystatic/github/oauth/callback`。

**网站语言维修说明：** Keystatic 的 JSON singleton 路径必须写成无扩展名的 `src/data/site-language-settings`，`format: 'json'` 会自动补 `.json`。模板自检会阻止错误的 `site-language-settings.json.json`；保存语言并等待部署后，前台、Manager 和 AI 才会统一读取新配置。

**SESSION KV 说明：** 新站首次部署由 Astro 6 和 Wrangler 自动创建 `SESSION`，无需手工配置 ID。只有把已使用的 Pages/Worker 迁移到新 Worker 时，才应在 `wrangler.toml` 显式绑定原 KV ID，避免同名资源重复创建。

## 十一、给开发人员的边界

不要删除或替换以下能力：自定义 Keystatic 字段、`/manager/` 的 D1 草稿和 R2 图片流、AI 翻译 API/Actions、Cloudflare Workers 适配器、R2 路由、KV 会话 binding、D1 binding、联系表单和 Publish Site 流程。公开页面必须面向国际买家，而不是面向内部操作人员。

改动 Astro、Tailwind、内容 schema、部署配置、公开页面或语言配置后，运行第九节四条检查。正式生产前，确认 `src/data/industry-profile.json` 中所有事实已核实，移除示例内容，并保存生产检查输出。
