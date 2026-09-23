# Golden One Codex 工作规则（中文配套版）

英文 [AGENTS.md](AGENTS.md) 是本独立仓库的优先 AI 入口；本文件供站长核对。
本仓库对应 `yiloveM/goldenone260727`，是建设中的 Golden One 商业站，
不是空白母版。位于 `webtemp` 下时先读父目录 `AGENTS.md`、英文主指令和仓库映射；
单独克隆时仍须遵守本站 AGENTS，不假设会自动读取父目录。

## 仓库隔离与记录

- 远端写入前核对 Git 根、目标分支、暂存文件及 fetch/push 都属于
  `yiloveM/goldenone260727`；不得跨母版或其他客户推送。
- 新增可复用工程能力时在本站 `docs/CAPABILITY-REGISTER.md` 与母版
  待评估候选区双向登记；候选不等于已批准。本站能力实际变化后，
  在 README 既有能力清单和相关说明中就地更新，严格保留其八章与折叠布局。
- 每次任务写本站 `docs/PROJECT-PROGRESS.md`，母版存在时也写母版记录。
  网络先直连，失败再试 7890；gh 按实际 API/push 判断，不因沙箱故障
  反复登录。禁止改/删工作区外文件；批量删除须逐项展示目标及用途，
  等待原样 `确认`。末尾带 `静默处理无需汇报` 只省略例行更新，
  不省略检查、登记、必要授权和最终简报。

## Golden One 专属保护

本站独立交付，不自动追随母版版本。选定 CAP/revision 后按本站能力登记
核实代码、配置、数据和兼容性；`NOT AUDITED` 不等于缺失，代码存在、
已启用、预览验证、生产发布分别记。获准后在隔离分支做最小依赖适配，
测试旧数据与回滚，再按本站独立发布授权上线；细则读母版主指令第 13 节。
完善现有入口与记录，不另建治理文件；换电脑先读本站进度并核对分支、HEAD 和远端。
每次任务轻量查看母版 GSC MCP 是否可用；仅相关任务且 property 核实后
使用，本机工具/凭据缺失不授权修改本站运行时或生产。

- 保留金属工艺礼品品牌、产品结构、公共视觉、内容、上传设计图的询盘流程、
  URL 与 Cloudflare 资源身份。行业关键词、视觉重建、竞品/旧站迁移及
  全站 SEO/GEO 触发本站 Skill 和两阶段工作流。英语为源语言，
  `industry-profile.json` 是品牌/市场基础，
  `site-language-settings.json` 唯一决定启用语言。
- `/keystatic/` 是站长 Git-backed 后台，`/manager/` 是 D1 草稿、
  R2 媒体、审核和写回的内容管理员入口。生产按两个独立自定义域名、
  两个秘密 UUID 路径与已有登录保护。秘密只在 Worker Secrets，
  不引入 Access JWT 或浏览器保存 Manager bearer token。
- 保留 Astro 6 Workers、静态优先路由、KV/D1、翻译、R2、分析、
  发布、CAPTCHA、公开表单 D1 与 Resend 双写及受控下载。
  询盘只有两项必要操作真实成功才能报告成功。下载默认关闭；
  成功验证、D1 与邮件后才能按白名单释放文件 URL。
  Keystatic JSON singleton path 不带 `.json`。
- 现有语言、评价、分析、下载、R2 开关不能被母版默认值重置。
  Manager 导航应隐藏站长关闭的模块。私有后台/API/R2 不索引；
  不编造价格、评价、认证、客户或生产能力。上线前替换或核实示例联系信息。
- 生产只由 `site-publish.yml` 管理合格 `main` push 与明确 dispatch，
  预览只由 `site-preview.yml` 管理批准的 `preview/*`，
  目标独立 `goldenone-preview`；Workers Builds/Cloudflare Git 断开。
  预览只读、noindex/no-store、不写分析或私有数据。
  保护 `keep_vars = true`、`wrangler.toml` Account ID 和已有 Secret。
- 旧站迁移必须有授权和 URL；保留原 HTML、媒体、资料、路径映射与 R2
  包，尽量保留可用的 `.html` 主路径。旧站事实是文案依据，
  竞品只提供术语与风格线索；不编造或复制无授权内容。
- README 必须保持本站现有八章及折叠结构。实质公共/schema/部署变更后
  运行 `types:cloudflare -- --check`、`check`、`check:template`、
  `build`；生产前运行 `check:template:production`。
  第一阶段浏览器检查还覆盖桌面/手机、键盘、触摸、图库、表单、
  CAPTCHA、溢出、无脚本和减少动效。
