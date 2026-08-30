import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, relative, sep } from 'node:path';

const projectRoot = process.cwd();
const errors = [];
const notices = [];

const parseCompareTarget = () => {
  const index = process.argv.indexOf('--compare');
  return index >= 0 ? process.argv[index + 1] : undefined;
};

const addError = message => errors.push(message);
const readText = file => readFileSync(file, 'utf8');

const contracts = [
  {
    area: 'Astro and Cloudflare runtime',
    file: 'astro.config.mjs',
    markers: ["imageService: 'compile'", "sessionKVBindingName: 'SESSION'", 'tailwindcss()', 'keystatic()', 'siteOriginConfig', 'retiredHosts', 'sitemap(', 'i18n:'],
  },
  {
    area: 'Cloudflare bindings',
    file: 'wrangler.toml',
    markers: ['account_id = "473b41497c5031874c630ecb9bc45ced"', 'main = "./src/worker.ts"', 'keep_vars = true', 'directory = "./dist"', 'run_worker_first = true', 'KEYSTATIC_PORTAL_HOST', 'MANAGER_PORTAL_HOST', 'binding = "CONTENT_BUCKET"', 'binding = "MANAGER_DB"', 'ANALYTICS_IP_MODE', 'nodejs_compat'],
  },
  {
    area: 'Private portal host gateway',
    file: 'src/worker.ts',
    markers: ['getScopedRuntimeSecret', 'admin-portal-session', 'KEYSTATIC_SECRET', 'PUBLIC_KEYSTATIC_GITHUB_APP_SLUG', '__Host-goldenone-portal', 'SameSite=Strict', 'portalLoginResponse', 'managerAnalyticsEnabled', 'contextWithEnv', 'x-robots-tag', 'getAdminPortalConfigSet', 'rewritePortalText', 'isProtectedPublicPath', 'isDirectPortalApiPath', 'capturePublicPageView', 'context.waitUntil'],
  },
  {
    area: 'Private portal configuration boundary',
    file: 'src/lib/admin-portals.ts',
    markers: ['KEYSTATIC_PORTAL_UUID', 'MANAGER_PORTAL_UUID', 'KEYSTATIC_PORTAL_HOST', 'MANAGER_PORTAL_HOST', 'ADMIN_PORTAL_HEADER', 'requireInternalPortalAccess'],
  },
  {
    area: 'Private portal browser API routing',
    file: 'src/lib/admin-client.ts',
    markers: ['PORTAL_UUID_PATTERN', 'currentPortalPrefix', 'adminApiUrl', 'adminRequestHeaders', 'readAdminJson'],
  },
  {
    area: 'Private portal response rewrite regression check',
    file: 'scripts/check-admin-portal-rewrite.mjs',
    markers: ['rewritePortalText', 'rewritePortalLocation', 'Admin portal gateway and response rewrite checks passed.'],
  },
  {
    area: 'Cloudflare runtime environment access',
    file: 'src/lib/runtime-env.ts',
    markers: ["cloudflare:workers", 'cloudflareEnv', 'cfContext?.env'],
  },
  {
    area: 'Keystatic owner workflow',
    file: 'keystatic.config.ts',
    markers: ["kind: 'github'", 'analyticsDashboardField', 'managerVisible', 'siteFoundation', 'siteLanguages', "path: 'src/data/site-language-settings'", 'aiTranslatorField', 'r2ImagePoolField', 'sitePublisherField', 'translationDraftReviewField', 'siteLanguageBulkActionsField', 'siteLanguageCheckboxField'],
  },
  {
    area: 'Keystatic website language bulk controls',
    file: 'src/keystatic/site-language-selector-field.tsx',
    markers: ['全选全部目标语言', '反选当前选择', 'languageBulkEvent', 'siteLanguageCheckboxField'],
  },
  {
    area: 'Keystatic Astro 6 Cloudflare compatibility',
    file: 'src/pages/api/keystatic/[...params].ts',
    markers: ['makeGenericAPIRouteHandler', 'KEYSTATIC_GITHUB_CLIENT_ID', 'KEYSTATIC_GITHUB_CLIENT_SECRET', 'KEYSTATIC_SECRET'],
  },
  {
    area: 'Keystatic Chinese navigation and browser dependency interop',
    file: 'keystatic.config.ts',
    markers: ["brand: { name: 'Golden One 内容管理' }", "'站点设置':", "'内容管理':", "'媒体资源':"],
  },
  {
    area: 'Keystatic local browser dependency optimization',
    file: 'astro.config.mjs',
    markers: ["exclude: ['@keystatic/astro', '@keystatic/core']", "include: ['slate-react']"],
  },
  {
    area: 'Keystatic content and product controls',
    file: 'keystatic.config.ts',
    markers: ['productManagerField', 'productOrderField', 'r2ImageUrlField', "path: 'src/content/products/*'", 'offeringType', 'modelStrategy'],
  },
  {
    area: 'Manager D1 service layer',
    file: 'src/lib/manager/d1.ts',
    markers: ['ensureManagerSchema', 'MANAGER_DB', 'ManagerProductDraftPayload', 'createDraftId'],
  },
  {
    area: 'Manager access and GitHub write-back',
    file: 'src/lib/manager/access.ts',
    markers: ['requireInternalPortalAccess', 'local-manager@goldenone.local', 'KEYSTATIC_SECRET', '内容管理员', 'import.meta.env.PROD'],
  },
  {
    area: 'Manager GitHub integration',
    file: 'src/lib/manager/github.ts',
    markers: ['githubHeaders', 'getRepoFullName', 'getDispatchToken'],
  },
  {
    area: 'R2 media API',
    file: 'src/pages/api/r2/assets.ts',
    markers: ['CONTENT_BUCKET', 'R2_IMAGE_POOL_WRITE_TOKEN', 'export const GET', 'export const POST'],
  },
  {
    area: 'R2 public delivery route',
    file: 'src/pages/r2/[...key].ts',
    markers: ['CONTENT_BUCKET', 'R2 object not found'],
  },
  {
    area: 'Manager public interface',
    file: 'src/pages/manager/index.astro',
    markers: ["/api/manager/status", "/api/manager/products", "/api/manager/r2/assets", '/api/manager/ai/translation-locales', 'portalApiUrl', 'managerAnalyticsEnabled', 'offeringType', 'modelStrategy'],
  },
  {
    area: 'Manager API routes',
    file: 'src/pages/api/manager/products.ts',
    markers: ['requireManagerAccess', 'getRuntimeEnv', 'modelStrategy'],
  },
  {
    area: 'Private first-party analytics',
    file: 'src/pages/api/analytics/summary.ts',
    markers: ['requireInternalPortalAccess', 'requireManagerAccess', 'readAnalyticsOverview', 'getSearchConsoleAnalytics'],
  },
  {
    area: 'Owner analytics reconciliation',
    file: 'src/pages/api/analytics/adjustments.ts',
    markers: ['requireOwner', 'upsertAnalyticsAdjustment', 'deleteAnalyticsAdjustment', 'Cross-origin writes are not allowed'],
  },
  {
    area: 'AI translation runtime',
    file: 'scripts/run-ai-translation.mjs',
    markers: ['GEMINI_API_KEYS', 'AI_TRANSLATION_SOURCE_TYPE', 'GOOGLE_AI_TRANSLATION_MODEL', 'modelStrategy'],
  },
  {
    area: 'AI translation workflow',
    file: '.github/workflows/ai-translation.yml',
    markers: ['workflow_dispatch:', 'GEMINI_API_KEYS', 'AI_TRANSLATION_SOURCE_TYPE'],
  },
  {
    area: 'Manager product write-back workflow',
    file: '.github/workflows/manager-apply-product-draft.yml',
    markers: ['workflow_dispatch:', 'MANAGER_PRODUCT_DRAFT_PAYLOAD', 'MANAGER_PRODUCT_DRAFT_ID'],
  },
  {
    area: 'Manager blog write-back workflow',
    file: '.github/workflows/manager-apply-blog-draft.yml',
    markers: ['workflow_dispatch:', 'MANAGER_BLOG_DRAFT_PAYLOAD', 'MANAGER_BLOG_DRAFT_ID'],
  },
  {
    area: 'Product semantic schema',
    file: 'src/content.config.ts',
    markers: ['loader: glob', 'generateId: ({ entry }) => entry', 'offeringType', 'modelStrategy', 'physical-product', 'service', 'solution'],
  },
  {
    area: 'Structured data and SEO logic',
    file: 'src/data/seo.ts',
    markers: ['siteOriginConfig', 'ProductGroup', 'Service', 'productStructuredData', 'FAQPage'],
  },
  {
    area: 'Search discovery outputs',
    file: 'src/pages/llms.txt.ts',
    markers: ['Primary resources', 'industryProfile'],
  },
  {
    area: 'Visual-layer isolation',
    file: 'src/layouts/BaseLayout.astro',
    markers: ["goldenone-redesign.css", 'data-visual-foundation="signature-product"', 'href: localizePath(Astro.url.pathname, locale)', 'structuredDataItems', 'brandAssets.icon', 'apple-touch-icon', 'site.webmanifest'],
  },
  {
    area: 'Tailwind homepage foundation',
    file: 'src/styles/home-tailwind.css',
    markers: ['tailwindcss/theme', 'tailwindcss/utilities', '@source'],
  },
  {
    area: 'English shared homepage adoption',
    file: 'src/pages/index.astro',
    markers: ["../components/IndustryHome.astro", '<IndustryHome'],
  },
  {
    area: 'Localized shared homepage adoption',
    file: 'src/templates/LocalizedHomePage.astro',
    markers: ["../components/IndustryHome.astro", '<IndustryHome'],
  },
  {
    area: 'Shared Tailwind homepage implementation',
    file: 'src/components/IndustryHome.astro',
    markers: ["../styles/home-tailwind.css", 'data-tailwind-homepage', 'tw:'],
  },
  {
    area: 'Owner-controlled review system',
    file: 'keystatic.config.ts',
    markers: ["customerReviews: singleton", "path: 'src/data/customer-reviews'", '启用前台评价系统（总开关）'],
  },
  {
    area: 'Manager review draft workflow',
    file: 'src/pages/manager/index.astro',
    markers: ['data-panel="reviews"', '/api/manager/review-drafts', '生成删除草稿'],
  },
  {
    area: 'Review SEO evidence gate',
    file: 'src/data/customerReviews.ts',
    markers: ['reviewSystemEnabled', "review.kind === 'verified'", 'review.seoEligible === true'],
  },
  {
    area: 'Cloudflare Worker publishing workflow',
    file: '.github/workflows/site-publish.yml',
    markers: ['push:', 'paths-ignore:', 'Generate Cloudflare bindings', 'npm run types:cloudflare', 'npm run build', 'npm run deploy:worker', 'CLOUDFLARE_API_TOKEN'],
  },
  {
    area: 'Wrangler variables available during Astro builds',
    file: 'scripts/run-astro.mjs',
    markers: ['loadWranglerVars', '...configuredWranglerVars', '...process.env', 'BUSINESSWEB_NODE_HEAP_MB', '--max-old-space-size=', 'verify-keystatic-build.mjs'],
  },
  {
    area: 'Keystatic browser build configuration verification',
    file: 'scripts/verify-keystatic-build.mjs',
    markers: ['PUBLIC_KEYSTATIC_GITHUB_REPO', 'PUBLIC_KEYSTATIC_GITHUB_APP_SLUG', 'clientBundle.includes'],
  },
];

const requiredFiles = [
  'src/worker.ts',
  'src/middleware.ts',
  'src/lib/admin-portals.ts',
  'src/lib/admin-client.ts',
  'src/lib/admin-portal-rewrite.ts',
  'src/lib/runtime-secret.ts',
  'src/keystatic/keystatic-path.ts',
  'src/data/site-language-settings.json',
  'src/data/site-origin.json',
  'src/integrations/keystatic-cloudflare.mjs',
  'src/pages/api/keystatic/[...params].ts',
  'src/pages/api/ai/translations.ts',
  'src/pages/api/manager/ai/translations.ts',
  'src/pages/api/manager/ai/translation-locales.ts',
  'src/pages/api/manager/status.ts',
  'src/pages/api/manager/r2/assets.ts',
  'src/pages/api/manager/review-drafts.ts',
  'src/pages/api/manager/review-drafts/[id]/apply.ts',
  'src/pages/api/analytics/summary.ts',
  'src/pages/api/analytics/adjustments.ts',
  'src/pages/manager/analytics.astro',
  'src/components/admin/AnalyticsDashboard.tsx',
  'src/lib/analytics/capture.ts',
  'src/lib/analytics/d1.ts',
  'src/lib/analytics/google-search-console.ts',
  'src/keystatic/analytics-dashboard-field.tsx',
  'src/keystatic/analytics-dashboard.json',
  'src/pages/manager/reviews.astro',
  'src/pages/api/deploy/site.ts',
  'src/pages/api/manager/deploy/site.ts',
  'src/pages/api/contact.ts',
  'src/pages/api/products/manager.ts',
  'src/keystatic/r2-image-pool-field.tsx',
  'src/keystatic/ai-translator-field.tsx',
  'src/keystatic/site-language-selector-field.tsx',
  'src/keystatic/site-publisher-field.tsx',
  'scripts/apply-manager-product-draft.mjs',
  'scripts/apply-manager-blog-draft.mjs',
  'scripts/apply-manager-review-draft.mjs',
  'scripts/audit-product-seo.mjs',
  'scripts/check-admin-portal-rewrite.mjs',
  'scripts/run-astro.mjs',
  'scripts/run-deploy.mjs',
  'scripts/run-wrangler.mjs',
  'scripts/run-wrangler-types.mjs',
  'scripts/run-wrangler-deploy-with-retry.mjs',
  'src/pages/robots.txt.ts',
  'src/pages/product-catalog.json.ts',
  'src/data/i18n.ts',
  'src/content.config.ts',
  'src/cloudflare-workers.d.ts',
  'worker-configuration.d.ts',
  'src/styles/home-tailwind.css',
  'src/data/customer-reviews.json',
  '.github/workflows/manager-apply-review-draft.yml',
  'public/template-icon.svg',
  'public/favicon-32x32.png',
  'public/apple-touch-icon.png',
  'public/icon-192.png',
  'public/icon-512.png',
  'public/site.webmanifest',
];

function auditProject(root, label) {
  let passedContracts = 0;
  for (const contract of contracts) {
    const file = resolve(root, contract.file);
    if (!existsSync(file)) {
      addError(`${label}: ${contract.area} is missing ${contract.file}`);
      continue;
    }
    const text = readText(file);
    const missing = contract.markers.filter(marker => !text.includes(marker));
    if (missing.length) {
      addError(`${label}: ${contract.area} is missing markers in ${contract.file}: ${missing.join(', ')}`);
      continue;
    }
    passedContracts += 1;
  }

  for (const file of requiredFiles) {
    if (!existsSync(resolve(root, file))) addError(`${label}: required functionality file is missing: ${file}`);
  }
  const managerUi = readText(resolve(root, 'src/pages/manager/index.astro'));
  for (const forbidden of ['businessweb-manager-token', 'managerTokenInput', 'managerConnectButton', 'managerLogoutButton']) {
    if (managerUi.includes(forbidden)) addError(`${label}: Manager must not store or request a browser bearer token: ${forbidden}`);
  }
  if (existsSync(resolve(root, 'src/data/site-language-settings.json.json'))) {
    addError(`${label}: unexpected duplicate language settings file exists: src/data/site-language-settings.json.json`);
  }

  try {
    const originConfig = JSON.parse(readText(resolve(root, 'src/data/site-origin.json')));
    const productionUrl = String(originConfig.productionUrl || '').trim();
    const productionOrigin = productionUrl ? new URL(productionUrl).origin : '';
    const productionHost = productionOrigin ? new URL(productionOrigin).hostname.toLowerCase() : '';
    const retiredHosts = Array.isArray(originConfig.retiredHosts)
      ? originConfig.retiredHosts.map(host => String(host).trim().toLowerCase()).filter(Boolean)
      : [];

    if (productionUrl && productionOrigin !== productionUrl) {
      addError(`${label}: src/data/site-origin.json productionUrl must be an origin without a path or trailing slash.`);
    }
    if (!Array.isArray(originConfig.retiredHosts)) {
      addError(`${label}: src/data/site-origin.json retiredHosts must be an array.`);
    }
    if (new Set(retiredHosts).size !== retiredHosts.length) {
      addError(`${label}: src/data/site-origin.json retiredHosts contains duplicates.`);
    }
    if (productionHost && retiredHosts.includes(productionHost)) {
      addError(`${label}: the active production host cannot also be listed in retiredHosts.`);
    }

    const wrangler = readText(resolve(root, 'wrangler.toml'));
    const wranglerSiteUrl = wrangler.match(/^SITE_URL\s*=\s*"([^"]*)"/m)?.[1] ?? null;
    if (wranglerSiteUrl !== productionOrigin) {
      addError(`${label}: wrangler.toml SITE_URL must match src/data/site-origin.json productionUrl.`);
    }

    const workflow = readText(resolve(root, '.github/workflows/site-publish.yml'));
    if (productionOrigin && (workflow.includes(`|| '${productionOrigin}'`) || workflow.includes(`|| "${productionOrigin}"`))) {
      addError(`${label}: the publish workflow must use the central site-origin fallback instead of duplicating SITE_URL.`);
    }

    const runtimeOriginLeaks = [];
    const scanRuntimeCode = directory => {
      for (const name of readdirSync(directory)) {
        const fullPath = resolve(directory, name);
        const stats = statSync(fullPath);
        if (stats.isDirectory()) {
          scanRuntimeCode(fullPath);
          continue;
        }
        if (!/\.(?:astro|[cm]?[jt]sx?)$/i.test(name)) continue;
        if (productionOrigin && readText(fullPath).includes(productionOrigin)) {
          runtimeOriginLeaks.push(relative(root, fullPath).split(sep).join('/'));
        }
      }
    };
    scanRuntimeCode(resolve(root, 'src'));
    if (runtimeOriginLeaks.length) {
      addError(`${label}: production origin is hard-coded outside site-origin.json: ${runtimeOriginLeaks.join(', ')}`);
    }
  } catch (error) {
    addError(`${label}: site origin configuration could not be validated: ${error.message}`);
  }

  const readme = resolve(root, 'README.md');
  if (!existsSync(readme)) {
    addError(`${label}: README.md is missing.`);
  } else {
    const text = readText(readme);
    for (const marker of ['check:template', 'industry:brief', 'R2', 'D1', 'AI', 'Astro 6', 'Cloudflare Workers', 'Tailwind']) {
      if (!text.includes(marker)) addError(`${label}: README.md is missing deployment guidance for ${marker}.`);
    }
    const requiredHeadings = [
      '## 一、Repo 功能汇总',
      '## 二、手把手部署教程',
      '## 三、Keystatic 站长使用教程',
      '## 四、Manager 内容管理员使用教程',
      '## 五、项目重要位置',
      '## 六、两阶段 Codex 建站流程',
      '## 七、避坑指南',
    ];
    let previousHeading = -1;
    for (const heading of requiredHeadings) {
      const index = text.indexOf(heading);
      if (index < 0 || index <= previousHeading) {
        addError(`${label}: README.md must preserve the owner-locked seven-chapter order; missing or misplaced ${heading}.`);
      }
      previousHeading = index;
    }
    if ((text.match(/<details>/g) || []).length < 4 || (text.match(/<\/details>/g) || []).length < 4) {
      addError(`${label}: README.md must keep the Keystatic, Manager, two-stage Codex, and troubleshooting sections collapsed.`);
    }
  }

  notices.push(`${label}: ${passedContracts}/${contracts.length} capability contracts passed; ${requiredFiles.length} required files present.`);
}

function manifest(root, excludeNestedBusinessweb) {
  const ignoredDirectories = new Set(['.git', 'node_modules', 'dist', '.astro', '.wrangler', '.wrangler-config']);
  const entries = [];
  const walk = directory => {
    for (const name of readdirSync(directory)) {
      if (ignoredDirectories.has(name)) continue;
      if (excludeNestedBusinessweb && directory === root && name === 'businessweb') continue;
      const fullPath = resolve(directory, name);
      const stats = statSync(fullPath);
      if (stats.isDirectory()) {
        walk(fullPath);
        continue;
      }
      const file = relative(root, fullPath).split(sep).join('/');
      const hash = createHash('sha256').update(readFileSync(fullPath)).digest('hex');
      entries.push(`${file}\t${hash}`);
    }
  };
  walk(root);
  return entries.sort();
}

function compareManifests(source, target) {
  const sourceEntries = new Set(manifest(source, true));
  const targetEntries = new Set(manifest(target, false));
  const missing = [...sourceEntries].filter(entry => !targetEntries.has(entry));
  const unexpected = [...targetEntries].filter(entry => !sourceEntries.has(entry));
  if (missing.length || unexpected.length) {
    addError(`Source/target SHA-256 manifests differ: ${missing.length} source-only and ${unexpected.length} target-only entries.`);
    return;
  }
  notices.push(`Cross-copy SHA-256 validation passed for ${sourceEntries.size} files.`);
}

auditProject(projectRoot, 'source');

const compareTarget = parseCompareTarget();
if (compareTarget) {
  const targetRoot = resolve(projectRoot, compareTarget);
  if (!existsSync(targetRoot)) {
    addError(`Comparison target does not exist: ${targetRoot}`);
  } else {
    auditProject(targetRoot, 'target');
    compareManifests(projectRoot, targetRoot);
  }
}

for (const notice of notices) console.log(notice);
if (errors.length) {
  console.error(`\nFeature continuity audit: ${errors.length} error(s).`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Feature continuity audit passed: ${contracts.length} functional contracts verified.`);
