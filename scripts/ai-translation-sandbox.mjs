import { GoogleGenAI } from '@google/genai';

const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || process.env.GOOGLE_API_KEY;
const model = (process.env.GOOGLE_AI_TRANSLATION_MODEL || process.env.GEMINI_MODEL || 'gemini-3.5-flash').replace(/^models\//, '');
const locale = process.env.BUSINESSWEB_AI_SANDBOX_LOCALE || 'zh-CN';

if (!apiKey) {
  console.error('Missing GEMINI_API_KEY. Set it only as a temporary environment variable before running this sandbox.');
  process.exit(1);
}

const systemPrompt = `
You are an expert B2B website translator for international industrial and commercial brands.
Translate source English content into the target language for a reusable business website template.
Return valid JSON only. Do not use Markdown fences.
Never translate JSON object keys. Only translate string values that contain human-readable English.
Preserve Markdown, HTML tags, tables, URLs, product model codes, series names, SKUs, pure numbers, units, electrical symbols, dimensional notation, phone numbers, email addresses, and website paths.
Preserve array order, object order, table row count, table column count, colspan, and rowspan.
For specification tables, translate natural-language labels and cell text only. Do not change measured values or units.
Write polished B2B website copy for distributors, project buyers, channel partners, procurement teams, and commercial operators.
Do not invent product data, certifications, prices, lead times, addresses, or claims.
`;

const source = {
  product: {
    title: 'VX Series Modular Industrial Control Cabinet',
    description:
      'The VX Series modular control cabinet is designed for distributors and project integrators that need stable assembly quality, configurable electrical layouts, and clear model data before quotation.',
    applications: [
      'Regional distributors preparing a comparable product proposal for commercial equipment projects.',
      'System integrators reviewing enclosure size, voltage, protection level, and accessory options before quotation.',
    ],
    specs: [
      { label: 'Main Material', value: 'Powder-coated steel' },
      { label: 'Protection Level', value: 'IP54 / IP65 optional' },
      { label: 'Rated Voltage', value: '220-480 V' },
      { label: 'Mounting Type', value: 'Floor-standing / wall-mounted' },
      { label: 'Package', value: 'Carton 820 x 620 x 1420 mm / GW 58 kg' },
    ],
    specTables: [
      {
        title: 'Model Specifications',
        columns: ['Model', 'Width', 'Height', 'Depth', 'Protection Level', 'Package'],
        headerRows: [],
        rows: [
          ['VX600', '600 mm', '1200 mm', '400 mm', 'IP54', 'Carton 680 x 480 x 1320 mm'],
          ['VX800', '800 mm', '1600 mm', '500 mm', 'IP65', 'Carton 880 x 580 x 1720 mm'],
        ],
      },
    ],
    content:
      'The VX Series helps channel partners present a structured industrial product offer with configurable options, clear model specifications, and stable documentation for repeat quotations.',
  },
  article: {
    title: 'How to Prepare Product Data for International B2B Buyers',
    description:
      'A practical guide for content managers building product pages with model tables, application notes, specification data, and quote-focused calls to action.',
    category: 'Commercial Guides',
    content:
      '## Product data readiness\n\nA strong B2B product page should connect buyer intent with clear technical evidence.\n\n| Field | Practical note |\n| --- | --- |\n| Model | Keep the model code unchanged across languages. |\n| Specification | Translate labels, but preserve units and measured values. |\n| Application | Explain the project scenario without inventing certifications. |\n| Package | Keep carton size, GW and NW in the original numeric format. |',
  },
};

const ai = new GoogleGenAI({ apiKey });
const response = await ai.models.generateContent({
  model,
  contents: `Target language: ${locale}\nTranslate this sandbox payload and keep the same JSON shape.\n\nSOURCE_JSON:\n${JSON.stringify(source)}`,
  config: {
    systemInstruction: systemPrompt,
    temperature: 0.1,
    responseMimeType: 'application/json',
  },
});

const raw = response.text?.trim() || '';
const clean = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
let parsed;
try {
  parsed = JSON.parse(clean);
} catch {
  console.error('Gemini did not return valid JSON.');
  console.error(clean.slice(0, 600));
  process.exit(1);
}

const untranslatedTerms = [
  'Protection Level',
  'Rated Voltage',
  'Mounting Type',
  'Package',
  'Product data readiness',
].filter(term => JSON.stringify(parsed).includes(term));

const productTable = parsed.product?.specTables?.[0];
const sourceTable = source.product.specTables[0];
const tableShapeOk =
  productTable?.rows?.length === sourceTable.rows.length &&
  productTable?.columns?.length === sourceTable.columns.length &&
  productTable?.rows?.every((row, index) => row.length === sourceTable.rows[index].length);

console.log(JSON.stringify({
  ok: untranslatedTerms.length === 0 && tableShapeOk,
  model,
  locale,
  productTitle: parsed.product?.title || '',
  articleTitle: parsed.article?.title || '',
  tableShapeOk,
  untranslatedTerms,
  productSpecPreview: parsed.product?.specs?.slice?.(0, 4) || [],
  articleExcerpt: String(parsed.article?.content || '').replace(/\s+/g, ' ').slice(0, 260),
}, null, 2));

if (untranslatedTerms.length || !tableShapeOk) process.exit(1);
