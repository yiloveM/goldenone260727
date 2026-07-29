import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import markdoc from '@astrojs/markdoc';
import sitemap from '@astrojs/sitemap';
import cloudflare from '@astrojs/cloudflare';
import keystatic from './src/integrations/keystatic-cloudflare.mjs';
import tailwindcss from '@tailwindcss/vite';
import siteLanguageSettings from './src/data/site-language-settings.json';
import siteLocaleConfig from './src/data/site-locales.json';
import siteOriginConfig from './src/data/site-origin.json';

const configuredDefaultSite = String(siteOriginConfig.productionUrl || '').trim();
const defaultSite = new URL(configuredDefaultSite || 'http://localhost');
const environmentSite = String(process.env.SITE_URL || '').trim();
const requestedSite = new URL(environmentSite || configuredDefaultSite || defaultSite);
const retiredHosts = new Set(
  (siteOriginConfig.retiredHosts || []).map(host => String(host).trim().toLowerCase()).filter(Boolean)
);
const defaultHost = defaultSite.hostname.toLowerCase();
const requestedHost = requestedSite.hostname.toLowerCase();
if (retiredHosts.has(defaultHost)) {
  throw new Error(`site-origin.json cannot retire its own production host: ${defaultHost}`);
}
const site = retiredHosts.has(requestedHost) ? defaultSite.origin : requestedSite.origin;
if (retiredHosts.has(requestedHost)) {
  console.warn(`Ignoring retired SITE_URL host ${requestedHost}; using ${defaultSite.origin}.`);
}
if (!configuredDefaultSite && !environmentSite) {
  console.warn('SITE_URL is not configured; using http://localhost for non-production build metadata.');
}
const supportedLocales = ['en', 'zh', 'ar', 'hi', 'es', 'fr', 'bn', 'pt', 'ru', 'ur', 'de', 'tr', 'fil', 'ko', 'uz'];
const localeEntries = siteLocaleConfig.locales || {};
const requiredPhraseKeys = siteLocaleConfig.requiredPhraseKeys || [];
const requiredFaqCount = Number(siteLocaleConfig.requiredFaqCount || 0);
const isStaticLocaleReady = locale => {
  const entry = localeEntries[locale];
  if (!entry || entry.approved !== true) return false;
  if (requiredPhraseKeys.some(key => !String(entry.phrases?.[key] || '').trim())) return false;
  return Array.isArray(entry.faqs)
    && entry.faqs.length === requiredFaqCount
    && entry.faqs.every(item => String(item?.question || '').trim() && String(item?.answer || '').trim());
};
const selectedLocales = supportedLocales.filter(
  locale => locale !== 'en' && siteLanguageSettings.enabledLocales?.[locale] === true
);
const activeLocales = new Set([
  'en',
  ...selectedLocales.filter(isStaticLocaleReady),
]);

export default defineConfig({
  site,
  output: 'static',
  // Preserve Astro 5 image compilation instead of adopting Astro 6's new runtime image binding.
  adapter: cloudflare({
    imageService: 'compile',
    // Fresh Workers projects let Wrangler provision this session namespace.
    sessionKVBindingName: 'SESSION',
  }),
  vite: {
    plugins: [tailwindcss()],
    // Keystatic owns this virtual module. Do not let workerd's dependency optimizer prebundle it.
    optimizeDeps: {
      exclude: ['@keystatic/astro', '@keystatic/core'],
      include: ['slate-react'],
    },
  },
  i18n: {
    locales: ['en', 'zh', 'ar', 'hi', 'es', 'fr', 'bn', 'pt', 'ru', 'ur', 'de', 'tr', 'fil', 'ko', 'uz'],
    defaultLocale: 'en',
    routing: {
      prefixDefaultLocale: false,
    },
  },
  integrations: [
    react(),
    markdoc(),
    keystatic(),
    sitemap({
      filter: page => {
        const pathname = new URL(page, site).pathname;
        const firstSegment = pathname.split('/').filter(Boolean)[0];
        if (supportedLocales.includes(firstSegment) && !activeLocales.has(firstSegment)) return false;
        return ![
          '/manager/',
          '/keystatic/',
          '/api/',
          '/r2/',
        ].some(prefix => pathname.startsWith(prefix))
          && !pathname.endsWith('.txt')
          && !pathname.endsWith('.json');
      },
    }),
  ],
});
