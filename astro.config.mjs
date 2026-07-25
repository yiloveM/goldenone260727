import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import markdoc from '@astrojs/markdoc';
import sitemap from '@astrojs/sitemap';
import cloudflare from '@astrojs/cloudflare';
import keystatic from './src/integrations/keystatic-cloudflare.mjs';
import tailwindcss from '@tailwindcss/vite';
import siteLanguageSettings from './src/data/site-language-settings.json';
import siteLocaleConfig from './src/data/site-locales.json';

const site = process.env.SITE_URL || 'https://businessweb.workers.dev';
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
      include: ['lodash/debounce.js'],
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
