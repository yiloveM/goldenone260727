# 公开媒体登记与预览排障

协议版本 1。各仓独立使用 docs/media-paths.json，机器Schema为 docs/schemas/media-paths.schema.json；校验源码 scripts/media-path-registry.mjs。母版维护协议和通用能力，客户维护自己的真实地址与引用，禁止复制客户 CDN/行业目录。母版没有真实公开站，entries 保持空，不填示例域名。

## 事实来源与字段

登记是地址及用途的可核验证据，不是第二份资源配置。PUBLIC_R2_ASSET_BASE_URL 仍归 Wrangler，公开 origin 仍归现有 SITE_URL/site-origin 合同，单个媒体对象归原 CMS/内容字段。后台显示复用 publicMediaUrl；不能靠登记覆盖运行配置、修改 canonical 或开放私有后台资源路由。

顶层 schemaVersion、repository、entries；每项含 id、category、delivery、baseUrl、authority、pathPrefix、purpose、references、lastVerifiedAt、verification。Schema 拒绝未知字段、重复ID、越界路径、危险地址和虚构验证。category 是用途分类，如 product/banner/blog/download/logo/company，可使用有实际用途的新稳定小写key；它不规定 R2 目录名。baseUrl 无凭据/查询/fragment；路径和 object key 保留真实大小写。references 是真实消费者/数据的仓内路径与字段说明，不是可执行扫描指令。

delivery 分 r2-public、site-static、external-public。对应 authority 分别为 PUBLIC_R2_ASSET_BASE_URL、SITE_URL、observed-external。同用途允许多个实际来源，各用途也可共用同一分发基础地址；不能把合法静态图片误迁到CDN。

lastVerifiedAt 未验证为 null，verification 必须为 source-only/unverified/空samples；真实在线验证后才记录 UTC、源码SHA、范围、结果和样本状态/MIME。coverage 为 source-only、sampled-http、sampled-browser、full-active-http；result 为 unverified/pass/partial/fail。抽样通过不代表全量通过。源码SHA记录当时依据，无关HEAD前进不要求改表；每次build不更新时间、不制造Git差异。

## AI 操作顺序

建站/改版/迁移/图片故障前：读本站AGENTS及登记 → 核对真实Wrangler/origin/消费者/内容 → 运行只读检查 → 必要时检查实际HTTP与浏览器。没有表表示尚未采纳，不等于媒体能力缺失；不得用其它客户表补齐。新分类先登记再使用，登记与首次真实引用可原子提交；已有类别内新增普通图片不必逐文件手填第二份清单。

命令在选定仓库根运行：

    npm run media:check
    npm run media:audit -- --online --report Temp/media-audit/latest.json
    npm run test:media

media:check 只做确定性离线检查，不访问云或改变源码。未采纳旧站保持原构建；已采纳而格式/配置/已识别引用不一致应失败，不能静默修表。--online 最多抽取每项两个真实引用，有超时、体积、公开DNS及重定向限制，不带登录凭据；报告只能写本站Temp。不把目录根返回404当对象丢失，不把200 HTML回退当图片。鉴权/网络失败单独报告，不绕过权限或自动修改CORS。

检测已存产品/文章/译稿/原生JSON、Markdoc与正文图片、视觉override及fallback、实际背景/分类消费者及其选中的媒体、源码字面量；运行状态用 source-published/draft/retained/current-consumer，不能据此宣称已上线。历史原始媒体目录不整体当成当前引用，也不能凭未扫描就删除。新增未知消费者需人工补充覆盖；SOURCE_CHECKED仅证明本次已识别来源一致。

自动在线抽样排除未审核稿及译文记录；没有合适公开样本的项明确列为未验证。相对 CSS 依赖导入（如已有 flag-icons）由 Vite 处理，不能拼成 CDN 链接；报告单列 buildManagedAssets，交付时核对新构建的内联/输出资产。DNS 返回非公网地址时拒绝请求并标 ONLINE_UNVERIFIED（退出码2），不把环境拦截当对象404；不能为通过检查关闭保护。其它浏览器/准确本站HTTP证据单独记录，不冒充该命令通过。

## 清理与隐私

当前校验器只报告无已识别Git引用的待核项，cleanupAllowed 固定 false，不自动删除任何资料。确定废弃前还须核完整云草稿、分页计数、待发布批次、仍在线版本与共享/关闭功能中的保留引用；缺任何覆盖就保留并注明未审计。网络404或功能OFF不等于废弃。确认零有效引用后可在获批准范围内移除登记行，保留Git及原进度最小依据。移除引用/登记不授权删除R2对象、草稿、产品或归档。

如需云草稿完整性核查，仅用既有工具对本目标MANAGER_DB固定草稿表只读SELECT（产品、文章、视觉），核全量/并发变化；不运行建表API、不读询盘/隐私、不写云。没有完整证据时不能声称已清理废弃条目。正式能力与最小回执保留，临时详细报告可在Temp清理。

只登记实际公开媒体，不登记后台UUID/签名/Token/底层私有对象。关闭/空下载不填虚构 Download；protected 下载仍走原邮件/D1门控，底层引用仅在授权审计中保护，不公开探测或改为直链。登记文件不放public，不新增公开诊断API，不给Manager资源/功能权限。无需为本能力增加付费服务、AI调用、Worker或数据库。

下载模式读取固定的实际 catalogDownloads.ts 消费者；只有它明确导出 direct 才纳入公开目录。旧版 enabled-only、静态目录数组及无法确认的模式均按受保护/未验证处理，不能凭 JSON 的 enabled 或未被消费者采用的 mode 猜测直链。受保护引用单独留在本地 inventory.protectedReferences（不输出到公开登记/自动探测），即便同对象出现在历史源码字面量中也不自动公开。纠正误登记为公开的保护下载，是范围/分类修正，不表示对象已废弃或可物理删除。

## 产品预览验收及回退

同时验证私有域名下的缩略图/放大图/保存草稿预览/两种后台译稿预览，以及对应公开页面。/r2 走本站分发根；/images及根目录静态媒体走本站公开origin，不请求后台域名。保留主图与图库合同，详情图片按原组序保留标题、图注、单位，不提升包装/说明图为主图。URL显示规范化不改存储值。

分清字段缺失、源文暂不可读、资源404、MIME、CDN变换、权限、CSP/CORS与缓存；先证实再修。普通跨域img不等于fetch/像素读取；不要为了图片盲目扩大CORS或放开私有路由。保留认证、版本保护、no-store/noindex、现有发布链。后台提示面向管理员，完整URL/源码诊断留本地。

私有后台图片（含现有图片池选择器、缩略图、放大图、编辑字段）与只读草稿预览采用 no-referrer，避免向公开媒体发送后台入口或预览地址。预览文档通过 meta 设置，兼容既有 Blob 打开方式；不改变正常后台 API 的来源/权限检查或公开页面策略。同一对象若无 Referer/公开站 Referer 返回图片，而私有预览 Referer 返回403 HTML，先核对这一真实访问差异；不可误报文件丢失、关闭浏览器 ORB 或扩大 CDN/CORS 规则。回归须包含会拒绝私有 Referer 的双来源媒体服务器，并核实际图片 naturalWidth。

每站工程分支验证后按生命周期独立交付；母版只备份，online另获当前批次Push/生产授权。回滚按该站本项提交与后续CMS差异限定revert，登记/检查/消费者成组回退，保留D1/R2和原始内容；不自动回滚其它站。

参考：[MDN img](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/img)、[MDN base](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/base)、[Cloudflare R2 CORS](https://developers.cloudflare.com/r2/buckets/cors/)。规范不替代真实仓库和现场验证。
