# BusinessWeb Manager 后台说明

`/manager/` 是给内容级管理员使用的独立后台。它不要求管理员登录 GitHub，适合维护产品、文章、图片和翻译草稿。

## 需要的 Cloudflare 资源

- D1 数据库：`businessweb-manager`
- D1 binding：`MANAGER_DB`
- R2 bucket：`businessweb-content`
- R2 binding：`CONTENT_BUCKET`
- Cloudflare Access：保护 `/manager/*` 和 `/api/manager/*`

## 初始化 D1

1. 在 Cloudflare 创建 D1 数据库。
2. 打开 D1 的 Console 或 Query 页面。
3. 复制 `manager-portal/schema.sql` 的全部 SQL。
4. 粘贴并执行。
5. 把 D1 的 `database_id` 写入根目录 `wrangler.toml`。
6. 推送代码并重新部署 Cloudflare Pages。

示例：

```toml
[[d1_databases]]
binding = "MANAGER_DB"
database_name = "businessweb-manager"
database_id = "replace-with-real-d1-database-id"
```

## 权限保护

推荐使用 Cloudflare Access 同时保护：

```text
/manager/*
/api/manager/*
```

也可以额外配置：

```text
MANAGER_ALLOWED_EMAILS=admin1@example.com,admin2@example.com
```

临时测试时可使用：

```text
MANAGER_ACCESS_BYPASS_TOKEN=long-random-token
```

生产环境建议优先使用 Cloudflare Access。

## 管理员日常流程

1. 打开 `/manager/`。
2. 登录 Cloudflare Access 或输入后台访问口令。
3. 上传图片到图片池。
4. 新建或编辑产品/文章草稿。
5. 保存草稿。
6. 应用到网站内容。
7. 审核 AI 翻译草稿。
8. 点击发布网站更新。

更多部署细节看根目录 `README.md`。
