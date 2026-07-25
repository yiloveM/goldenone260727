import { GoogleGenAI } from '@google/genai';
import YAML from 'yaml';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, writeFile, appendFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const CONTENT_ROOT = path.join(ROOT, 'src', 'content');
const PRODUCT_DIR = path.join(CONTENT_ROOT, 'products');
const BLOG_DIR = path.join(CONTENT_ROOT, 'blog');
const PRODUCT_TRANSLATION_DIR = path.join(CONTENT_ROOT, 'productTranslations');
const BLOG_TRANSLATION_DIR = path.join(CONTENT_ROOT, 'blogTranslations');
const RESULT_DIR = path.join(ROOT, '.github', 'ai-translation-results');
const GOOGLE_MODEL_FALLBACK = 'gemini-3.5-flash';
const MAX_RETRYABLE_TRANSLATION_ATTEMPTS = 3;
const locales = ['en', 'zh', 'ar', 'hi', 'es', 'fr', 'bn', 'pt', 'ru', 'ur', 'de', 'tr', 'fil', 'ko', 'uz'];
const languageSettings = JSON.parse(await readFile(path.join(ROOT, 'src', 'data', 'site-language-settings.json'), 'utf8'));
const nonEnglishLocales = locales.filter(
  locale => locale !== 'en' && languageSettings.enabledLocales?.[locale] === true
);
const localeMeta = {
  en: { label: 'English', htmlLang: 'en', dir: 'ltr' },
  zh: { label: 'Simplified Chinese', htmlLang: 'zh-CN', dir: 'ltr' },
  ar: { label: 'Arabic', htmlLang: 'ar', dir: 'rtl' },
  hi: { label: 'Hindi', htmlLang: 'hi', dir: 'ltr' },
  es: { label: 'Spanish', htmlLang: 'es', dir: 'ltr' },
  fr: { label: 'French', htmlLang: 'fr', dir: 'ltr' },
  bn: { label: 'Bengali', htmlLang: 'bn', dir: 'ltr' },
  pt: { label: 'Portuguese', htmlLang: 'pt-BR', dir: 'ltr' },
  ru: { label: 'Russian', htmlLang: 'ru', dir: 'ltr' },
  ur: { label: 'Urdu', htmlLang: 'ur', dir: 'rtl' },
  de: { label: 'German', htmlLang: 'de', dir: 'ltr' },
  tr: { label: 'Turkish', htmlLang: 'tr', dir: 'ltr' },
  fil: { label: 'Filipino', htmlLang: 'fil', dir: 'ltr' },
  ko: { label: 'Korean', htmlLang: 'ko', dir: 'ltr' },
  uz: { label: 'Uzbek', htmlLang: 'uz', dir: 'ltr' },
};

const industryGlossary = `
Industry meaning and terminology rules:
- Translate human-readable industry terms naturally for the target market.
- Keep brand placeholders, model codes, series codes, SKUs, voltages, dimensions, numbers, formulas, URLs, phone numbers, email addresses, and HTML/Markdown syntax unchanged.
- Keep common engineering units unchanged, including mm, cm, m, kg, g, W, kW, V, Hz, A, IP, N, Nm, L/min, m3/h, bar, psi, kPa, rpm, dB, and percent values.
- Package / Packing / Carton / GW / NW refer to packaging specification, carton size, gross weight, and net weight.
- Model / Item / Code / SKU / Product Code identify model rows and must stay stable across languages.
- Material, surface treatment, protection level, mounting type, rated voltage, capacity, flow rate, pressure, power, efficiency, tolerance, certification, and application labels should be translated only when they are natural-language labels.
- Do not transliterate a term when a normal industry translation exists in the target language.
`;

const systemPrompt = `
You are an expert B2B website translator for international industrial and commercial brands.
Translate source English content into the target language for a reusable business website template named BusinessWeb.
Return valid JSON only. Do not use Markdown fences.
Never translate JSON object keys. Only translate string values that contain human-readable English.
Preserve Markdown, Markdoc, HTML tags, tables, URLs, product model codes, series names, pure numbers, engineering units, electrical symbols, and dimensional notation.
Preserve array order, object order, table row count, table column count, colspan, and rowspan.
For industrial specification tables, translate natural-language labels and cell text only. Do not change measured values or units.
Write polished B2B website copy for distributors, project buyers, channel partners, procurement teams, and commercial operators.
Do not invent product data. If a field is unclear, translate conservatively from the source.
Never translate the phone number +86 159 764 10611 or any other telephone number into local numerals. Keep contact numbers in ASCII digits.
Never translate BusinessWeb, model names, SKU-like codes, R2 image URLs, or website paths.
When translating product names, translate the descriptive product category words but keep model/series codes intact.
For SEO title, description, highlights, FAQ, and article copy, use natural commercial language in the target market, not literal machine translation.
${industryGlossary}
`;

const envText = key => String(process.env[key] || '').trim();
const boolEnv = key => /^(1|true|yes)$/i.test(envText(key));
const splitInput = value => String(value || '').split(/[\s,;]+/).map(item => item.trim()).filter(Boolean);
const unique = items => [...new Set(items.filter(Boolean))];
const slugFromFile = file => path.basename(file, '.mdoc');
const sourceType = ['products', 'blog', 'all'].includes(envText('AI_TRANSLATION_SOURCE_TYPE'))
  ? envText('AI_TRANSLATION_SOURCE_TYPE')
  : 'all';
const sourceSlug = envText('AI_TRANSLATION_SOURCE_SLUG');
const requestId = envText('AI_TRANSLATION_REQUEST_ID') || 'manual';
const overwrite = boolEnv('AI_TRANSLATION_OVERWRITE');
const apiKeyOffsetInput = Number(envText('AI_TRANSLATION_API_KEY_OFFSET'));
const apiKeyOffset = Number.isFinite(apiKeyOffsetInput) ? Math.trunc(apiKeyOffsetInput) : Date.now();
const requestedLocaleInput = unique(splitInput(envText('AI_TRANSLATION_LOCALES')));
const invalidRequestedLocales = requestedLocaleInput.filter(locale => !nonEnglishLocales.includes(locale));
if (invalidRequestedLocales.length) {
  throw new Error(`Requested locales are not enabled in /keystatic/ -> 网站语言: ${invalidRequestedLocales.join(', ')}.`);
}
const requestedLocales = requestedLocaleInput;
const targetLocales = requestedLocales.length ? requestedLocales : [...nonEnglishLocales];
if (!targetLocales.length) {
  throw new Error('No target locales are enabled. Select at least one language in /keystatic/ -> 网站语言 before starting AI translation.');
}
const model = (envText('GOOGLE_AI_TRANSLATION_MODEL') || envText('GEMINI_MODEL') || GOOGLE_MODEL_FALLBACK).replace(/^models\//, '');

const splitApiKeys = value => String(value || '').split(/[\s,;]+/).map(item => item.trim()).filter(Boolean);
const getApiKeys = () => {
  const keys = [
    ...splitApiKeys(envText('GOOGLE_AI_API_KEYS')),
    ...splitApiKeys(envText('GEMINI_API_KEYS')),
    ...splitApiKeys(envText('GOOGLE_API_KEYS')),
  ];

  for (let index = 1; index <= 20; index += 1) {
    keys.push(
      envText(`GOOGLE_AI_API_KEY_${index}`),
      envText(`GEMINI_API_KEY_${index}`),
      envText(`GOOGLE_API_KEY_${index}`)
    );
  }

  keys.push(envText('GOOGLE_AI_API_KEY'), envText('GEMINI_API_KEY'), envText('GOOGLE_API_KEY'));
  return unique(keys);
};

let apiKeysCache;
const requestApiKeys = () => {
  if (!apiKeysCache) {
    apiKeysCache = getApiKeys();
    if (!apiKeysCache.length) {
      throw new Error('Missing GEMINI_API_KEYS or GEMINI_API_KEY in GitHub Actions repository secrets. Cloudflare Worker secrets are not available inside GitHub Actions. Add GEMINI_API_KEYS under GitHub repository Settings -> Secrets and variables -> Actions -> Secrets.');
    }
  }
  return apiKeysCache;
};

const errorMessage = error => error instanceof Error ? error.message : String(error || 'Unknown error');
const friendlyErrorMessage = message => {
  const raw = String(message || '');
  try {
    const parsed = JSON.parse(raw);
    const apiError = parsed?.error;
    if (apiError?.code === 503 || apiError?.status === 'UNAVAILABLE') {
      return 'The AI model is temporarily unavailable or overloaded. Retry the translation task later.';
    }
    if (apiError?.code === 429 || /quota|rate.?limit|resource_exhausted/i.test(`${apiError?.message || ''} ${apiError?.status || ''}`)) {
      return 'The AI quota or rate limit was reached. Retry later or configure additional AI keys.';
    }
    if (apiError?.code === 403 || /access denied|permission_denied|permission denied|denied access|forbidden/i.test(`${apiError?.message || ''} ${apiError?.status || ''}`)) {
      return 'The AI key or project was denied access. Configure a valid key and retry the failed language.';
    }
    if (/location is not supported/i.test(apiError?.message || '')) {
      return 'The AI API is not supported from the current task runtime. Check the backend environment configuration.';
    }
    if (apiError?.message) return apiError.message;
  } catch {
    // Keep the plain text fallback below.
  }
  if (/Missing GEMINI_API_KEYS|Missing GEMINI_API_KEY/i.test(raw)) {
    return 'No AI key is configured for the backend task. Add Gemini or Google AI keys and retry.';
  }
  if (/access denied|permission_denied|permission denied|denied access|forbidden|403/i.test(raw)) {
    return 'The AI key or project was denied access. Configure a valid key and retry the failed language.';
  }
  if (/invalid JSON|empty response|incomplete .*translation|missing required|translation failed|unable to translate|cannot translate|could not translate/i.test(raw)) {
    return 'The AI response was incomplete or invalid JSON. Regenerate the failed translation.';
  }
  if (/high demand|UNAVAILABLE|503/i.test(raw)) return 'The AI model is temporarily unavailable or overloaded. Retry later.';
  if (/quota|rate.?limit|429|resource_exhausted/i.test(raw)) return 'The AI quota or rate limit was reached. Retry later or configure additional AI keys.';
  return raw;
};
const isQuotaOrRateLimitError = error =>
  /\b(429|quota|rate.?limit|resource_exhausted|too many requests|exceeded|503|unavailable|high demand)\b/i.test(errorMessage(error));
const isAccessDeniedError = error =>
  /\b(403|access denied|permission_denied|permission denied|denied access|forbidden|unauthorized|not authorized)\b/i.test(errorMessage(error));
const isIncompleteTranslationError = error =>
  /\b(invalid JSON|empty response|incomplete .*translation|missing required|translation failed|unable to translate|cannot translate|could not translate)\b/i.test(errorMessage(error));
const isRetryableAiError = error => isQuotaOrRateLimitError(error) || isAccessDeniedError(error) || isIncompleteTranslationError(error);
const redactApiKeys = (message, apiKeys) =>
  apiKeys.reduce((safeMessage, apiKey) => safeMessage.split(apiKey).join('[redacted-api-key]'), message);
const retryAttemptLimit = (error, apiKeyCount) =>
  isQuotaOrRateLimitError(error) ? apiKeyCount : Math.min(apiKeyCount, MAX_RETRYABLE_TRANSLATION_ATTEMPTS);
const classifyAiError = error => {
  if (isQuotaOrRateLimitError(error)) return 'quota_or_rate_limit';
  if (isAccessDeniedError(error)) return 'access_denied';
  if (isIncompleteTranslationError(error)) return 'invalid_or_incomplete_response';
  return 'ai_error';
};
const withAttemptMetadata = (error, apiKeys, attempts, keySlots) => {
  const wrapped = new Error(redactApiKeys(errorMessage(error), apiKeys));
  wrapped.attempts = attempts;
  wrapped.keySlots = keySlots;
  wrapped.failureKind = classifyAiError(error);
  return wrapped;
};
const keyStartIndexFor = (locale, sourceOrdinal) => {
  const localeIndex = Math.max(0, targetLocales.indexOf(locale));
  return apiKeyOffset + sourceOrdinal * Math.max(1, targetLocales.length) + localeIndex;
};

const localeInstruction = locale =>
  `${localeMeta[locale].label} (${localeMeta[locale].htmlLang}, writing direction: ${localeMeta[locale].dir})`;

const stripJsonFence = value =>
  String(value || '')
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

const parseGeminiJson = raw => {
  const direct = stripJsonFence(raw);
  try {
    return JSON.parse(direct);
  } catch {
    const match = direct.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('AI returned invalid JSON.');
    try {
      return JSON.parse(match[0]);
    } catch {
      throw new Error('AI returned invalid JSON.');
    }
  }
};

const collectStringValues = value => {
  const values = [];
  const visit = item => {
    if (typeof item === 'string') {
      values.push(item);
      return;
    }
    if (Array.isArray(item)) {
      item.forEach(visit);
      return;
    }
    if (item && typeof item === 'object') {
      Object.values(item).forEach(visit);
    }
  };
  visit(value);
  return values;
};

const looksLikeAiFailureText = value =>
  /\b(access denied|permission_denied|permission denied|denied access|forbidden|unauthorized|quota exceeded|resource_exhausted|rate limit|translation failed|unable to translate|cannot translate|could not translate|api key|empty response|invalid json)\b/i.test(
    String(value || '')
  );

const assertStringField = (translated, field, missing) => {
  if (typeof translated?.[field] !== 'string' || !translated[field].trim()) {
    missing.push(field);
  }
};

const assertArrayFieldWhenSourceHasItems = (translated, sourcePayload, field, missing) => {
  if (Array.isArray(sourcePayload?.[field]) && sourcePayload[field].length && !Array.isArray(translated?.[field])) {
    missing.push(field);
  }
};

const validateAiTranslationResult = (currentSourceType, translated, sourcePayload) => {
  if (!translated || typeof translated !== 'object' || Array.isArray(translated)) {
    throw new Error(`AI returned incomplete ${currentSourceType} translation: top-level JSON object is missing.`);
  }
  if (translated.error || translated.errors) {
    throw new Error(`AI returned translation failed marker: ${JSON.stringify(translated.error || translated.errors).slice(0, 500)}`);
  }

  const failureText = collectStringValues(translated).find(looksLikeAiFailureText);
  if (failureText) {
    throw new Error(`AI returned translation failed text: ${failureText.slice(0, 500)}`);
  }

  const missing = [];
  assertStringField(translated, 'title', missing);
  assertStringField(translated, 'description', missing);
  assertStringField(translated, 'content', missing);

  if (currentSourceType === 'product') {
    assertStringField(translated, 'categoryName', missing);
    assertArrayFieldWhenSourceHasItems(translated, sourcePayload, 'applications', missing);
    assertArrayFieldWhenSourceHasItems(translated, sourcePayload, 'specs', missing);
    assertArrayFieldWhenSourceHasItems(translated, sourcePayload, 'specTables', missing);
    assertArrayFieldWhenSourceHasItems(translated, sourcePayload, 'highlights', missing);
    assertArrayFieldWhenSourceHasItems(translated, sourcePayload, 'faqs', missing);
  }
  if (currentSourceType === 'blog') {
    assertStringField(translated, 'category', missing);
  }

  if (missing.length) {
    throw new Error(`AI returned incomplete ${currentSourceType} translation: missing required field(s) ${missing.join(', ')}.`);
  }
};

const callGemini = async (apiKey, locale, currentSourceType, payload) => {
  const ai = new GoogleGenAI({ apiKey });
  const prompt = `
Target language: ${localeInstruction(locale)}
Source type: ${currentSourceType}

Translate this JSON payload. Return the same top-level JSON shape.
For product specTables, keep the exact same nested table structure and translate only natural-language text inside string values.
For blog or product content, preserve Markdown/Markdoc formatting and links. Do not add, remove, or replace brand names.

SOURCE_JSON:
${JSON.stringify(payload)}
`;

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      systemInstruction: systemPrompt,
      temperature: 0.15,
      responseMimeType: 'application/json',
    },
  });

  const output = response.text?.trim();
  if (!output) throw new Error('AI returned an empty response.');
  const translated = parseGeminiJson(output);
  validateAiTranslationResult(currentSourceType, translated, payload);
  return translated;
};

const callGeminiWithRotatingKey = async (locale, currentSourceType, payload, sourceOrdinal) => {
  const apiKeys = requestApiKeys();
  const startIndex = keyStartIndexFor(locale, sourceOrdinal);

  let lastError;
  const keySlots = [];
  for (let attempt = 0; attempt < apiKeys.length; attempt += 1) {
    const keySlot = (startIndex + attempt) % apiKeys.length;
    const apiKey = apiKeys[keySlot];
    keySlots.push(keySlot + 1);
    try {
      return {
        data: await callGemini(apiKey, locale, currentSourceType, payload),
        keySlot: keySlot + 1,
        attempts: attempt + 1,
      };
    } catch (error) {
      lastError = error;
      const maxAttempts = retryAttemptLimit(error, apiKeys.length);
      if (!isRetryableAiError(error) || attempt + 1 >= maxAttempts) {
        throw withAttemptMetadata(error, apiKeys, attempt + 1, keySlots);
      }
      const reason = isQuotaOrRateLimitError(error)
        ? 'quota/rate limit'
        : isAccessDeniedError(error)
          ? 'access denied'
          : 'invalid/incomplete response';
      console.warn(`AI ${reason} hit. Retrying with next configured key (${attempt + 2}/${maxAttempts}).`);
    }
  }

  throw withAttemptMetadata(lastError, apiKeys, keySlots.length, keySlots);
};

const parseMdoc = async filePath => {
  const raw = (await readFile(filePath, 'utf8')).replace(/^\uFEFF/, '');
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    throw new Error(`Invalid frontmatter file: ${filePath}`);
  }
  return {
    data: YAML.parse(match[1]) || {},
    body: match[2] || '',
  };
};

const readCollection = async dir => {
  const files = (await readdir(dir)).filter(file => file.endsWith('.mdoc')).sort();
  return Promise.all(files.map(async file => {
    const filePath = path.join(dir, file);
    const parsed = await parseMdoc(filePath);
    return {
      slug: slugFromFile(file),
      file,
      filePath,
      ...parsed,
    };
  }));
};

const text = (value, fallback = '') => (typeof value === 'string' && value.trim() ? value.trim() : fallback);
const arrayOfText = (value, fallback = []) =>
  Array.isArray(value) ? value.map(item => text(item)).filter(Boolean) : fallback;
const publicProductSpecs = specs =>
  Array.isArray(specs) ? specs.filter(spec => String(spec?.label || '').trim() !== 'Target Audience') : [];

const normalizeSpecTables = (sourceTables = [], translatedTables) => {
  const tables = Array.isArray(translatedTables) ? translatedTables : [];
  return sourceTables.map((sourceTable, tableIndex) => {
    const translatedTable = tables[tableIndex] || {};
    return {
      ...sourceTable,
      title: text(translatedTable.title, sourceTable.title),
      columns: (sourceTable.columns || []).map((column, columnIndex) => text(translatedTable.columns?.[columnIndex], column)),
      headerRows: (sourceTable.headerRows || []).map((headerRow, rowIndex) => ({
        cells: (headerRow.cells || []).map((cell, cellIndex) => ({
          ...cell,
          text: text(translatedTable.headerRows?.[rowIndex]?.cells?.[cellIndex]?.text, cell.text),
        })),
      })),
      rows: (sourceTable.rows || []).map((row, rowIndex) =>
        row.map((cell, cellIndex) => text(translatedTable.rows?.[rowIndex]?.[cellIndex], cell))
      ),
    };
  });
};

const normalizeProductTranslation = (product, translated) => {
  const sourceSpecs = publicProductSpecs(product.data.specs);
  return {
    title: text(translated?.title, product.data.title),
    description: text(translated?.description, product.data.description),
    offeringType: product.data.offeringType || 'physical-product',
    modelStrategy: product.data.modelStrategy || 'series',
    categoryName: text(translated?.categoryName, product.data.category),
    series: text(translated?.series, product.data.series),
    applications: arrayOfText(translated?.applications, product.data.applications || []),
    specs: sourceSpecs.map((sourceSpec, index) => ({
      label: text(translated?.specs?.[index]?.label, sourceSpec.label),
      value: text(translated?.specs?.[index]?.value, sourceSpec.value),
    })),
    specTables: normalizeSpecTables(product.data.specTables || [], translated?.specTables),
    highlights: arrayOfText(translated?.highlights, product.data.highlights || []),
    faqs: (product.data.faqs || []).map((sourceFaq, index) => ({
      question: text(translated?.faqs?.[index]?.question, sourceFaq.question),
      answer: text(translated?.faqs?.[index]?.answer, sourceFaq.answer),
    })),
    content: text(translated?.content, product.body || product.data.description),
  };
};

const normalizeBlogTranslation = (post, translated) => ({
  title: text(translated?.title, post.data.title),
  description: text(translated?.description, post.data.description),
  category: text(translated?.category, post.data.category),
  content: text(translated?.content, post.body || post.data.description),
});

const productSourcePayload = product => ({
  title: product.data.title,
  description: product.data.description,
  offeringType: product.data.offeringType || 'physical-product',
  modelStrategy: product.data.modelStrategy || 'series',
  categoryName: product.data.category,
  series: product.data.series,
  applications: product.data.applications || [],
  specs: publicProductSpecs(product.data.specs),
  specTables: product.data.specTables || [],
  highlights: product.data.highlights || [],
  faqs: product.data.faqs || [],
  content: product.body || '',
});

const blogSourcePayload = post => ({
  title: post.data.title,
  description: post.data.description,
  category: post.data.category,
  content: post.body || '',
});

const yamlScalar = value => {
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return JSON.stringify(String(value ?? ''));
};

const yamlValue = (key, value, indent = 0) => {
  const pad = ' '.repeat(indent);
  const childPad = ' '.repeat(indent + 2);

  if (Array.isArray(value)) {
    if (!value.length) return [`${pad}${key}: []`];
    const lines = [`${pad}${key}:`];
    for (const item of value) {
      if (Array.isArray(item)) {
        lines.push(`${childPad}- [${item.map(yamlScalar).join(', ')}]`);
      } else if (item && typeof item === 'object') {
        lines.push(`${childPad}-`);
        for (const [childKey, childValue] of Object.entries(item)) {
          lines.push(...yamlValue(childKey, childValue, indent + 4));
        }
      } else {
        lines.push(`${childPad}- ${yamlScalar(item)}`);
      }
    }
    return lines;
  }

  if (value && typeof value === 'object') {
    const lines = [`${pad}${key}:`];
    for (const [childKey, childValue] of Object.entries(value)) {
      lines.push(...yamlValue(childKey, childValue, indent + 2));
    }
    return lines;
  }

  return [`${pad}${key}: ${yamlScalar(value)}`];
};

const toFrontmatter = data => Object.entries(data).flatMap(([key, value]) => yamlValue(key, value)).join('\n');
const toMdoc = (frontmatter, content) => `---\n${toFrontmatter(frontmatter)}\n---\n\n${String(content || '').trim()}\n`;
const translationId = (locale, slug) => `${locale}--${slug}.mdoc`;

const writeProductTranslation = async (product, locale, translated) => {
  const outputPath = path.join(PRODUCT_TRANSLATION_DIR, translationId(locale, product.slug));
  await mkdir(PRODUCT_TRANSLATION_DIR, { recursive: true });
  await writeFile(outputPath, toMdoc({
    title: translated.title,
    sourceSlug: product.slug,
    sourceTitle: product.data.title,
    locale,
    published: false,
    generatedAt: new Date().toISOString(),
    description: translated.description,
    offeringType: translated.offeringType,
    modelStrategy: translated.modelStrategy,
    categoryName: translated.categoryName,
    series: translated.series,
    applications: translated.applications,
    specs: translated.specs,
    specTables: translated.specTables,
    highlights: translated.highlights,
    faqs: translated.faqs,
  }, translated.content), 'utf8');
  return path.relative(ROOT, outputPath).replace(/\\/g, '/');
};

const writeBlogTranslation = async (post, locale, translated) => {
  const outputPath = path.join(BLOG_TRANSLATION_DIR, translationId(locale, post.slug));
  await mkdir(BLOG_TRANSLATION_DIR, { recursive: true });
  await writeFile(outputPath, toMdoc({
    title: translated.title,
    sourceSlug: post.slug,
    sourceTitle: post.data.title,
    locale,
    published: false,
    generatedAt: new Date().toISOString(),
    description: translated.description,
    category: translated.category,
  }, translated.content), 'utf8');
  return path.relative(ROOT, outputPath).replace(/\\/g, '/');
};

const appendStepSummary = async summary => {
  if (!process.env.GITHUB_STEP_SUMMARY) return;
  await appendFile(process.env.GITHUB_STEP_SUMMARY, summary, 'utf8');
};

const writeResultFile = async result => {
  await mkdir(RESULT_DIR, { recursive: true });
  const resultPath = path.join(RESULT_DIR, `${requestId}.json`);
  await writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  return path.relative(ROOT, resultPath).replace(/\\/g, '/');
};

const generated = [];
const skipped = [];
const errors = [];
let matchedSourceCount = 0;
let sourceOrdinal = 0;

console.log(`AI translation task: requestId=${requestId}, sourceType=${sourceType}, locales=${targetLocales.join(',')}, slug=${sourceSlug || '(batch)'}, overwrite=${overwrite}`);

if (sourceType === 'all' || sourceType === 'products') {
  const products = (await readCollection(PRODUCT_DIR)).filter(product => product.data.published !== false);
  const selectedProducts = sourceSlug ? products.filter(product => product.slug === sourceSlug) : products;
  if (sourceSlug) matchedSourceCount += selectedProducts.length;

  for (const product of selectedProducts) {
    const currentSourceOrdinal = sourceOrdinal;
    sourceOrdinal += 1;
    const sourcePayload = productSourcePayload(product);
    for (const locale of targetLocales) {
      const outputPath = path.join(PRODUCT_TRANSLATION_DIR, translationId(locale, product.slug));
      if (!overwrite && existsSync(outputPath)) {
        skipped.push({ type: 'product', locale, slug: product.slug, reason: 'draft already exists' });
        continue;
      }

      try {
        console.log(`Translating product ${product.slug} -> ${locale}`);
        const aiResult = await callGeminiWithRotatingKey(locale, 'product', sourcePayload, currentSourceOrdinal);
        const translated = normalizeProductTranslation(product, aiResult.data);
        const path = await writeProductTranslation(product, locale, translated);
        generated.push({ type: 'product', locale, slug: product.slug, path, keySlot: aiResult.keySlot, attempts: aiResult.attempts });
      } catch (error) {
        errors.push({
          type: 'product',
          locale,
          slug: product.slug,
          message: errorMessage(error),
          attempts: Number(error?.attempts || 1),
          keySlots: Array.isArray(error?.keySlots) ? error.keySlots : [],
          failureKind: error?.failureKind || classifyAiError(error),
        });
      }
    }
  }
}

if (sourceType === 'all' || sourceType === 'blog') {
  const posts = await readCollection(BLOG_DIR);
  const selectedPosts = sourceSlug ? posts.filter(post => post.slug === sourceSlug) : posts;
  if (sourceSlug) matchedSourceCount += selectedPosts.length;

  for (const post of selectedPosts) {
    const currentSourceOrdinal = sourceOrdinal;
    sourceOrdinal += 1;
    const sourcePayload = blogSourcePayload(post);
    for (const locale of targetLocales) {
      const outputPath = path.join(BLOG_TRANSLATION_DIR, translationId(locale, post.slug));
      if (!overwrite && existsSync(outputPath)) {
        skipped.push({ type: 'blog', locale, slug: post.slug, reason: 'draft already exists' });
        continue;
      }

      try {
        console.log(`Translating blog ${post.slug} -> ${locale}`);
        const aiResult = await callGeminiWithRotatingKey(locale, 'blog', sourcePayload, currentSourceOrdinal);
        const translated = normalizeBlogTranslation(post, aiResult.data);
        const path = await writeBlogTranslation(post, locale, translated);
        generated.push({ type: 'blog', locale, slug: post.slug, path, keySlot: aiResult.keySlot, attempts: aiResult.attempts });
      } catch (error) {
        errors.push({
          type: 'blog',
          locale,
          slug: post.slug,
          message: errorMessage(error),
          attempts: Number(error?.attempts || 1),
          keySlots: Array.isArray(error?.keySlots) ? error.keySlots : [],
          failureKind: error?.failureKind || classifyAiError(error),
        });
      }
    }
  }
}

if (sourceSlug && !matchedSourceCount) {
  throw new Error(`No product or article found for slug: ${sourceSlug}`);
}

const resultStatus = errors.length
  ? (generated.length || skipped.length ? 'partial_success' : 'failure')
  : 'success';
const resultStatusLabel = {
  success: 'success',
  partial_success: 'partial success',
  failure: 'failure',
}[resultStatus];

const summary = [
  '## AI translation drafts',
  '',
  `- Request ID: ${requestId}`,
  `- Status: ${resultStatusLabel}`,
  `- Generated: ${generated.length}`,
  `- Skipped: ${skipped.length}`,
  `- Errors: ${errors.length}`,
  '',
  ...generated.slice(0, 40).map(item => `- generated ${item.type} / ${item.locale} / ${item.slug}`),
  ...skipped.slice(0, 40).map(item => `- skipped ${item.type} / ${item.locale} / ${item.slug}: ${item.reason}`),
  ...errors.slice(0, 20).map(item => `- error ${item.type} / ${item.locale} / ${item.slug}: ${item.message}`),
  '',
].join('\n');

const result = {
  requestId,
  sourceType,
  sourceSlug,
  locales: targetLocales,
  overwrite,
  model,
  apiKeyCount: apiKeysCache?.length || 0,
  keyPolicy: 'Selected languages are processed sequentially. For the same source page, each target language starts from a different configured AI key slot when enough keys are available.',
  resultStatus,
  resultStatusLabel,
  generatedAt: new Date().toISOString(),
  generated,
  skipped,
  errors: errors.map(item => ({
    ...item,
    friendlyMessage: friendlyErrorMessage(item.message),
  })),
};

const resultPath = await writeResultFile(result);
console.log(JSON.stringify(result, null, 2));
console.log(`AI translation result written to ${resultPath}`);
await appendStepSummary(summary);

if (resultStatus === 'failure') {
  process.exitCode = 1;
}
