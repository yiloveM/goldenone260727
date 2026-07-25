import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const profilePath = path.join(root, 'src', 'data', 'industry-profile.json');
const languageSettingsPath = path.join(root, 'src', 'data', 'site-language-settings.json');
const supportedLocales = new Set(['en', 'zh', 'ar', 'hi', 'es', 'fr', 'bn', 'pt', 'ru', 'ur', 'de', 'tr', 'fil', 'ko', 'uz']);
const targetLocaleCodes = [...supportedLocales].filter(locale => locale !== 'en');
const allowedModes = new Set(['industrial-series', 'discrete-products', 'services', 'solutions', 'hybrid']);

const help = `
Create the reusable site's first industry brief. This does not invent product facts or perform SEO research.

Usage:
  npm run industry:brief -- --industry "Industry" --keywords "keyword one, keyword two" --locales "de,es"

Options:
  --industry      Required. Plain-language industry or commercial category.
  --keywords      Required. Comma-separated core English keywords.
  --locales       Optional shortcut for preselecting /keystatic/ -> 网站语言; English remains the source language.
  --brand         Optional public brand name.
  --mode          industrial-series | discrete-products | services | solutions | hybrid
  --markets       Optional comma-separated target markets.
  --buyers        Optional comma-separated buyer roles.
  --positioning   Optional one-sentence market position.
  --help          Show this help.

After this script, ask Codex to complete the phase-one visual build. Do not publish the generated placeholders as verified claims.
`.trim();

const args = process.argv.slice(2);
const option = name => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? String(args[index + 1] || '').trim() : '';
};
const list = value => Array.from(new Set(value.split(',').map(item => item.trim()).filter(Boolean)));
const title = value => value.replace(/\b\w/g, letter => letter.toUpperCase());

if (args.includes('--help') || args.includes('-h')) {
  console.log(help);
  process.exit(0);
}

const industry = option('industry');
const keywords = list(option('keywords'));
if (!industry || !keywords.length) {
  console.error('Both --industry and --keywords are required.');
  console.error(help);
  process.exit(1);
}

const locales = list(option('locales'));
const invalidLocales = locales.filter(locale => !supportedLocales.has(locale));
if (invalidLocales.length) {
  console.error(`Unsupported locale codes: ${invalidLocales.join(', ')}. Use the codes listed by --help.`);
  process.exit(1);
}

const mode = option('mode') || 'undetermined';
if (mode !== 'undetermined' && !allowedModes.has(mode)) {
  console.error(`Unsupported --mode: ${mode}. Use one of: ${Array.from(allowedModes).join(', ')}.`);
  process.exit(1);
}

const profile = JSON.parse(await readFile(profilePath, 'utf8'));
const languageSettings = JSON.parse(await readFile(languageSettingsPath, 'utf8'));
const keywordLabel = title(keywords[0]);
const categoryPlans = mode === 'services'
  ? [
      { name: `${keywordLabel} Services`, description: `Buyer-facing ${industry.toLowerCase()} services for international projects.`, highlights: ['Defined scope', 'Project support', 'Commercial clarity'] },
      { name: 'Advisory & Support', description: 'Planning, implementation, and lifecycle support.', highlights: ['Expert guidance', 'Documentation', 'Ongoing support'] },
    ]
  : [
      { name: `${keywordLabel} Products`, description: `Core ${industry.toLowerCase()} offerings for international buyers.`, highlights: ['Selection support', 'Technical detail', 'Quote-ready'] },
      { name: 'Engineered Solutions', description: 'Configurable and project-specific commercial solutions.', highlights: ['Application fit', 'Project support', 'International delivery'] },
      { name: 'Parts & Lifecycle Support', description: 'Accessories, replacement, and operational support.', highlights: ['Continuity', 'Documentation', 'After-sales'] },
    ];

profile.lifecycle = 'briefed';
profile.brand.name = option('brand') || profile.brand.name;
profile.brand.tagline = `${industry} for international buyers`;
profile.brand.description = option('positioning') || `Specialist ${industry.toLowerCase()} solutions for international B2B buyers.`;
profile.market.industry = industry;
profile.market.businessModel = mode;
delete profile.market.targetLocales;
profile.market.markets = list(option('markets'));
profile.market.buyerRoles = list(option('buyers')) || profile.market.buyerRoles;
profile.market.positioning = option('positioning') || `A specialist ${industry.toLowerCase()} partner for global B2B buyers.`;
profile.seo.coreKeywords = keywords;
profile.seo.longTailKeywords = [];
profile.seo.entityTopics = [industry, ...keywords];
profile.seo.searchIntentSummary = 'Pending current-market, SERP, and buyer-intent research by Codex.';
profile.seo.competitorReferences = [];
profile.seo.lastResearchDate = '';
profile.productArchitecture.offeringType = mode;
profile.productArchitecture.categoryPlans = categoryPlans;
profile.productArchitecture.commonAttributes = [];
profile.productArchitecture.modelAttributes = [];
profile.governance.factsVerified = false;
profile.governance.lastUpdated = new Date().toISOString().slice(0, 10);
profile.governance.notes = 'Industry brief initialized. Complete visual build, product architecture, and current SEO/GEO research before production publication.';

languageSettings.sourceLocale = 'en';
languageSettings.enabledLocales = Object.fromEntries(
  targetLocaleCodes.map(locale => [locale, locales.includes(locale)])
);

await Promise.all([
  writeFile(profilePath, `${JSON.stringify(profile, null, 2)}\n`, 'utf8'),
  writeFile(languageSettingsPath, `${JSON.stringify(languageSettings, null, 2)}\n`, 'utf8'),
]);
console.log(`Initialized industry brief for ${industry}.`);
console.log(`Core keywords: ${keywords.join(', ')}`);
console.log(`Selected website languages: ${locales.length ? locales.join(', ') : 'English only'}`);
console.log('Next: ask Codex to run the phase-one industry visual build, then upload verified content before phase-two SEO/GEO research.');
