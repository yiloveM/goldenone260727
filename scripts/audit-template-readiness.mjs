import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const production = process.argv.includes('--production');
const findings = [];
const requiredFiles = [
  'src/data/industry-profile.json',
  'src/data/industry-profile.ts',
  'src/data/site-language-settings.json',
  'src/data/site-origin.json',
  'src/data/site-locales.json',
  'src/content.config.ts',
  'src/cloudflare-workers.d.ts',
  'worker-configuration.d.ts',
  'src/integrations/keystatic-cloudflare.mjs',
  'src/pages/api/keystatic/[...params].ts',
  'src/styles/astrowind-visual-foundation.css',
  'src/styles/home-tailwind.css',
  '.nvmrc',
  'keystatic.config.ts',
  'src/keystatic/ai-translator-field.tsx',
  'src/keystatic/r2-image-pool-field.tsx',
  'src/keystatic/site-language-selector-field.tsx',
  'src/keystatic/site-publisher-field.tsx',
  'src/pages/manager/index.astro',
  'src/lib/manager/d1.ts',
  'scripts/apply-manager-product-draft.mjs',
  'src/lib/manager/github.ts',
  'src/pages/api/ai/translations.ts',
  'src/pages/api/manager/ai/translations.ts',
  'src/pages/api/r2/assets.ts',
  'src/pages/api/manager/r2/assets.ts',
  'src/pages/api/deploy/site.ts',
  'src/pages/api/manager/deploy/site.ts',
  '.github/workflows/ai-translation.yml',
  '.github/workflows/site-publish.yml',
  'manager-portal/schema.sql',
  'docs/CODEX-INDUSTRY-WORKFLOW.md',
  'docs/ASTROWIND-VISUAL-FOUNDATION.md',
  'scripts/audit-feature-continuity.mjs',
  'scripts/load-wrangler-vars.mjs',
  'scripts/run-astro.mjs',
  'scripts/verify-keystatic-build.mjs',
  'scripts/run-deploy.mjs',
  'scripts/run-wrangler.mjs',
  'scripts/run-wrangler-types.mjs',
  'public/template-icon.svg',
  'public/favicon-32x32.png',
  'public/apple-touch-icon.png',
  'public/icon-192.png',
  'public/icon-512.png',
  'public/site.webmanifest',
];

const add = (severity, location, message) => findings.push({ severity, location, message });
const source = file => readFile(path.join(root, file), 'utf8');

for (const file of requiredFiles) {
  try {
    await access(path.join(root, file));
  } catch {
    add('error', file, 'Required template capability is missing.');
  }
}
try {
  await access(path.join(root, 'src/data/site-language-settings.json.json'));
  add('error', 'src/data/site-language-settings.json.json', 'Unexpected duplicate language settings file exists.');
} catch {
  // The duplicate file is expected not to exist.
}

let profile;
try {
  profile = JSON.parse(await source('src/data/industry-profile.json'));
} catch (error) {
  add('error', 'src/data/industry-profile.json', `Invalid JSON: ${error.message}`);
}

let siteLocales;
try {
  siteLocales = JSON.parse(await source('src/data/site-locales.json'));
} catch (error) {
  add('error', 'src/data/site-locales.json', `Invalid JSON: ${error.message}`);
}

let languageSettings;
try {
  languageSettings = JSON.parse(await source('src/data/site-language-settings.json'));
} catch (error) {
  add('error', 'src/data/site-language-settings.json', `Invalid JSON: ${error.message}`);
}

let siteOrigin;
try {
  siteOrigin = JSON.parse(await source('src/data/site-origin.json'));
} catch (error) {
  add('error', 'src/data/site-origin.json', `Invalid JSON: ${error.message}`);
}

const placeholder = value => /^(|businessweb|your industry|sales@example\.com|replace with)/i.test(String(value || '').trim());
const validHex = value => /^#[0-9a-f]{6}$/i.test(String(value || '').trim());
const supportedLocales = new Set(['en', 'zh', 'ar', 'hi', 'es', 'fr', 'bn', 'pt', 'ru', 'ur', 'de', 'tr', 'fil', 'ko', 'uz']);
const targetLocaleCodes = [...supportedLocales].filter(locale => locale !== 'en');
let selectedTargetLocales = [];

if (siteOrigin) {
  const productionUrl = String(siteOrigin.productionUrl || '').trim();
  if (productionUrl) {
    try {
      const parsed = new URL(productionUrl);
      if (parsed.origin !== productionUrl || !['http:', 'https:'].includes(parsed.protocol)) {
        add('error', 'src/data/site-origin.json', 'productionUrl must be an HTTP(S) origin without a path or trailing slash.');
      }
      if (production && ['localhost', '127.0.0.1'].includes(parsed.hostname)) {
        add('error', 'src/data/site-origin.json', 'Replace the local build origin with the real public website URL before production.');
      }
    } catch {
      add('error', 'src/data/site-origin.json', 'productionUrl must be empty before first deployment or contain a valid public HTTP(S) origin.');
    }
  } else if (production) {
    add('error', 'src/data/site-origin.json', 'Set productionUrl to the real deployed website root before production.');
  }
  if (!Array.isArray(siteOrigin.retiredHosts)) {
    add('error', 'src/data/site-origin.json', 'retiredHosts must be an array of old host names.');
  }
}

if (languageSettings) {
  if (languageSettings.sourceLocale !== 'en') {
    add('error', 'src/data/site-language-settings.json', 'The source language must remain English.');
  }
  const flags = languageSettings.enabledLocales;
  if (!flags || typeof flags !== 'object' || Array.isArray(flags)) {
    add('error', 'src/data/site-language-settings.json', 'enabledLocales must be an object of locale checkbox values.');
  } else {
    const missingFlags = targetLocaleCodes.filter(locale => typeof flags[locale] !== 'boolean');
    const unsupportedFlags = Object.keys(flags).filter(locale => !targetLocaleCodes.includes(locale));
    if (missingFlags.length) {
      add('error', 'src/data/site-language-settings.json', `Missing language checkbox values: ${missingFlags.join(', ')}.`);
    }
    if (unsupportedFlags.length) {
      add('error', 'src/data/site-language-settings.json', `Unsupported language checkbox keys: ${unsupportedFlags.join(', ')}.`);
    }
    selectedTargetLocales = targetLocaleCodes.filter(locale => flags[locale] === true);
  }
}

if (profile) {
  const missing = [];
  if (placeholder(profile.brand?.name)) missing.push('brand.name');
  if (placeholder(profile.market?.industry)) missing.push('market.industry');
  if (!Array.isArray(profile.seo?.coreKeywords) || !profile.seo.coreKeywords.length) missing.push('seo.coreKeywords');
  if (!profile.market?.businessModel || profile.market.businessModel === 'undetermined') missing.push('market.businessModel');
  if (!Array.isArray(profile.productArchitecture?.categoryPlans) || !profile.productArchitecture.categoryPlans.length) missing.push('productArchitecture.categoryPlans');
  if (missing.length) add(production ? 'error' : 'warning', 'src/data/industry-profile.json', `Industry brief still needs: ${missing.join(', ')}.`);
  if (!['template', 'briefed', 'researched', 'production-ready'].includes(profile.lifecycle)) {
    add('error', 'src/data/industry-profile.json', `Unknown lifecycle value: ${profile.lifecycle}`);
  }
  if (profile.market?.primaryLocale !== 'en') add('error', 'src/data/industry-profile.json', 'The source language must remain English.');
  for (const field of ['accentColor', 'accentColorStrong', 'accentColorSoft']) {
    if (!validHex(profile.visual?.[field])) add('error', 'src/data/industry-profile.json', `visual.${field} must be a six-digit hex color.`);
  }
  if (production && profile.governance?.factsVerified !== true) {
    add('error', 'src/data/industry-profile.json', 'Set governance.factsVerified to true only after real claims, contacts, products, and SEO research are verified.');
  }

  if (siteLocales) {
    const requiredPhraseKeys = Array.isArray(siteLocales.requiredPhraseKeys) ? siteLocales.requiredPhraseKeys : [];
    const requiredFaqCount = Number(siteLocales.requiredFaqCount || 0);
    const localeEntries = siteLocales.locales && typeof siteLocales.locales === 'object' ? siteLocales.locales : {};
    if (!requiredPhraseKeys.length || !requiredFaqCount) {
      add('error', 'src/data/site-locales.json', 'The locale contract must list required static-copy keys and FAQ count.');
    }

    for (const locale of selectedTargetLocales) {
      const entry = localeEntries[locale];
      if (!entry || entry.approved !== true) {
        add(production ? 'error' : 'warning', 'src/data/site-locales.json', `Selected locale ${locale} needs an approved static UI, page-copy, and FAQ translation before it becomes public. It remains available for content translation setup.`);
        continue;
      }
      const phrases = entry.phrases && typeof entry.phrases === 'object' ? entry.phrases : {};
      const missingPhrases = requiredPhraseKeys.filter(key => typeof phrases[key] !== 'string' || !phrases[key].trim());
      if (missingPhrases.length) {
        add(production ? 'error' : 'warning', 'src/data/site-locales.json', `Selected locale ${locale} is missing ${missingPhrases.length} static translations (for example: ${missingPhrases.slice(0, 3).join(', ')}). It will not become public yet.`);
      }
      const faqs = Array.isArray(entry.faqs) ? entry.faqs : [];
      if (faqs.length !== requiredFaqCount || faqs.some(item => !String(item?.question || '').trim() || !String(item?.answer || '').trim())) {
        add(production ? 'error' : 'warning', 'src/data/site-locales.json', `Selected locale ${locale} must provide ${requiredFaqCount} non-empty localized FAQ items before it becomes public.`);
      }
    }
  }
}

const structuralChecks = [
  ['src/layouts/BaseLayout.astro', ['rel="canonical"', 'hreflang', 'application/ld+json', 'max-image-preview:large', 'astrowind-visual-foundation.css', 'brandAssets.icon', 'apple-touch-icon', 'site.webmanifest']],
  ['astro.config.mjs', ["imageService: 'compile'", "sessionKVBindingName: 'SESSION'", 'tailwindcss()', "from './src/integrations/keystatic-cloudflare.mjs'", "exclude: ['@keystatic/astro', '@keystatic/core']"]],
  ['wrangler.toml', ['./node_modules/@astrojs/cloudflare/dist/entrypoints/server.js', 'directory = "./dist"', 'CONTENT_BUCKET', 'MANAGER_DB']],
  ['src/lib/runtime-env.ts', ['cloudflare:workers', 'cfContext?.env']],
  ['src/styles/home-tailwind.css', ['tailwindcss/theme', 'tailwindcss/utilities', 'prefix(tw)']],
  ['src/pages/robots.txt.ts', ['Disallow: /keystatic/', 'Disallow: /manager/', 'Disallow: /api/', 'Disallow: /r2/']],
  ['src/pages/llms.txt.ts', ['product-catalog.json', 'Content notes']],
  ['src/data/seo.ts', ['productEntitiesEnabled = true', 'ProductGroup', 'FAQPage', 'Service']],
  ['keystatic.config.ts', ['siteFoundation', 'siteLanguages', "path: 'src/data/site-language-settings'", 'aiTranslator', 'sitePublisher', 'imagePool', 'siteLanguageBulkActionsField', 'siteLanguageCheckboxField']],
  ['src/keystatic/site-language-selector-field.tsx', ['全选全部目标语言', '反选当前选择', 'languageBulkEvent', 'siteLanguageCheckboxField']],
  ['src/integrations/keystatic-cloudflare.mjs', ["'/keystatic/[...params]'", '@keystatic/astro/internal/keystatic-astro-page.astro']],
  ['src/pages/api/keystatic/[...params].ts', ['makeGenericAPIRouteHandler', 'KEYSTATIC_GITHUB_CLIENT_ID', 'KEYSTATIC_GITHUB_CLIENT_SECRET', 'KEYSTATIC_SECRET']],
  ['src/content.config.ts', ['loader: glob', 'offeringType', 'modelStrategy']],
  ['src/lib/manager/d1.ts', ['offeringType', 'modelStrategy', 'normalizeProductDraftPayload']],
  ['src/pages/manager/index.astro', ['id="offeringType"', 'id="modelStrategy"']],
  ['scripts/apply-manager-product-draft.mjs', ['normalizeOfferingType', 'normalizeModelStrategy']],
  ['scripts/run-ai-translation.mjs', ['offeringType', 'modelStrategy']],
];
for (const [file, terms] of structuralChecks) {
  try {
    const contents = await source(file);
    for (const term of terms) if (!contents.includes(term)) add('error', file, `Required behavior marker missing: ${term}`);
  } catch {
    // The missing file error above is enough context.
  }
}

try {
  const forbidden = /aquamama|astrowave|chinapool|poolweb/i;
  const scanFiles = ['src/data/site.ts', 'src/data/i18n.ts', 'src/data/industry-profile.json'];
  for (const file of scanFiles) if (forbidden.test(await source(file))) add('error', file, 'Legacy brand content remains in the generic template.');
} catch {
  // Missing-file errors are already reported above.
}

try {
  const productEntries = await readdir(path.join(root, 'src', 'content', 'products'), { withFileTypes: true });
  const count = productEntries.filter(entry => entry.isFile() && entry.name.endsWith('.mdoc')).length;
  if (production && count === 0) add('warning', 'src/content/products', 'No published product files found. This is valid for a service-only website, otherwise upload verified offerings before launch.');
  if (production && productEntries.some(entry => entry.isFile() && /^template-example-/i.test(entry.name))) {
    add('error', 'src/content/products', 'Template example products remain. Replace or remove all template-example files before production publication.');
  }
} catch {
  add('error', 'src/content/products', 'Product content collection cannot be inspected.');
}

try {
  const blogEntries = await readdir(path.join(root, 'src', 'content', 'blog'), { withFileTypes: true });
  if (production && blogEntries.some(entry => entry.isFile() && /^template-example-/i.test(entry.name))) {
    add('error', 'src/content/blog', 'Template example articles remain. Replace or remove all template-example files before production publication.');
  }
} catch {
  add('error', 'src/content/blog', 'Blog content collection cannot be inspected.');
}

for (const finding of findings) console.log(`${finding.severity.toUpperCase().padEnd(7)} ${finding.location}: ${finding.message}`);
const errors = findings.filter(finding => finding.severity === 'error').length;
const warnings = findings.filter(finding => finding.severity === 'warning').length;
console.log(`\nTemplate readiness audit: ${errors} errors, ${warnings} warnings${production ? ' (production mode)' : ''}.`);
if (errors) process.exitCode = 1;
