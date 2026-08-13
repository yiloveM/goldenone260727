import { getCollection, type CollectionEntry } from 'astro:content';
import type { APIRoute } from 'astro';
import { getProductModelCodes, INQUIRY_CART_MAX_ITEMS, INQUIRY_CART_MAX_QUANTITY } from '../../data/inquiryCart';
import { isProductPublished } from '../../data/productCategories';
import { siteInfo } from '../../data/site';
import { getRuntimeEnv } from '../../lib/runtime-env';

export const prerender = false;

type Env = Record<string, unknown> | undefined;

const CAPTCHA_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const CAPTCHA_LENGTH = 4;
const CAPTCHA_TTL_MS = 10 * 60 * 1000;
const DEFAULT_TO_EMAIL = siteInfo.email;
const MAX_ARTWORK_BYTES = 5 * 1024 * 1024;
const ARTWORK_FILE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
const ARTWORK_FILE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'pdf']);

interface ValidatedInquiryItem {
  productSlug: string;
  productTitle: string;
  series: string;
  model: string;
  quantity: number;
  productUrl: string;
}

interface ArtworkAttachment {
  filename: string;
  content: string;
  contentType: string;
}

const getEnvString = (env: Env, key: string) => (typeof env?.[key] === 'string' ? env[key].trim() : '');
const getCaptchaSecret = (env: Env) =>
  getEnvString(env, 'CONTACT_FORM_SECRET') ||
  getEnvString(env, 'KEYSTATIC_SECRET') ||
  'businessweb-contact-form-local-secret';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'cache-control': 'no-store',
      'content-type': 'application/json; charset=utf-8',
    },
  });

const randomString = (length: number, alphabet = CAPTCHA_ALPHABET) => {
  const values = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(values, value => alphabet[value % alphabet.length]).join('');
};

const base64Url = (bytes: ArrayBuffer) => {
  let binary = '';
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
};

const hmac = async (secret: string, payload: string) => {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  return base64Url(await crypto.subtle.sign('HMAC', key, encoder.encode(payload)));
};

const createCaptcha = async (secret: string) => {
  const code = randomString(CAPTCHA_LENGTH);
  const expires = Date.now() + CAPTCHA_TTL_MS;
  const nonce = `${Date.now().toString(36)}${randomString(8).toLowerCase()}`;
  const payload = `${code}.${expires}.${nonce}`;
  const signature = await hmac(secret, payload);
  return {
    code,
    token: `${payload}.${signature}`,
    expiresAt: new Date(expires).toISOString(),
  };
};

const timingSafeEqual = (left: string, right: string) => {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return diff === 0;
};

const validateCaptcha = async (secret: string, answer: string, token: string) => {
  const normalized = answer.trim().toUpperCase();
  const parts = token.split('.');
  if (parts.length !== 4) return false;

  const [code, expiresText, nonce, signature] = parts;
  const expires = Number(expiresText);
  if (!/^[A-Z0-9]{4}$/.test(code) || !Number.isFinite(expires) || !nonce || !signature) return false;
  if (Date.now() > expires) return false;
  if (normalized !== code) return false;

  const expected = await hmac(secret, `${code}.${expires}.${nonce}`);
  return timingSafeEqual(signature, expected);
};

const field = (formData: FormData, name: string, maxLength = 500) =>
  String(formData.get(name) || '')
    .replace(/\0/g, '')
    .trim()
    .slice(0, maxLength);

const toBase64 = (bytes: ArrayBuffer) => {
  let binary = '';
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary);
};

const readArtworkAttachment = async (formData: FormData): Promise<ArtworkAttachment | null> => {
  const submitted = formData.get('artwork');
  if (!submitted || typeof submitted === 'string' || !submitted.name || submitted.size === 0) return null;

  const filename = submitted.name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').slice(0, 120) || 'design-reference';
  const extension = filename.split('.').pop()?.toLowerCase() || '';
  if (submitted.size > MAX_ARTWORK_BYTES) throw new Error('Please upload a design file smaller than 5 MB.');
  if (!ARTWORK_FILE_EXTENSIONS.has(extension) || (submitted.type && !ARTWORK_FILE_TYPES.has(submitted.type))) {
    throw new Error('Please upload a JPG, PNG, WEBP, or PDF design file.');
  }

  return {
    filename,
    content: toBase64(await submitted.arrayBuffer()),
    contentType: submitted.type || (extension === 'pdf' ? 'application/pdf' : `image/${extension === 'jpg' ? 'jpeg' : extension}`),
  };
};

const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const line = (label: string, value: string) => `${label}: ${value || '-'}`;

const parseInquiryItems = (
  raw: string,
  products: CollectionEntry<'products'>[],
  origin: string
): ValidatedInquiryItem[] => {
  if (!raw) return [];

  let submitted: unknown;
  try {
    submitted = JSON.parse(raw);
  } catch {
    throw new Error('The selected product list is invalid. Please review the inquiry cart and try again.');
  }
  if (!Array.isArray(submitted) || submitted.length > INQUIRY_CART_MAX_ITEMS) {
    throw new Error(`Please select no more than ${INQUIRY_CART_MAX_ITEMS} products per inquiry.`);
  }

  const catalog = new Map(
    products
      .filter(product => isProductPublished(product) && product.data.offeringType === 'physical-product')
      .map(product => [product.id.replace(/\.mdoc$/, '').toLowerCase(), product] as const)
  );
  const normalized = new Map<string, ValidatedInquiryItem>();

  submitted.forEach(value => {
    if (!value || typeof value !== 'object') {
      throw new Error('The selected product list is invalid. Please review the inquiry cart and try again.');
    }
    const item = value as Record<string, unknown>;
    const submittedSlug = String(item.productSlug || '').trim().toLowerCase().slice(0, 160);
    const product = catalog.get(submittedSlug);
    if (!product) {
      throw new Error('One selected product is no longer available. Please remove it and try again.');
    }

    const submittedModel = String(item.model || '').trim().slice(0, 120);
    const validModel = submittedModel && product.data.modelStrategy === 'series'
      ? getProductModelCodes(product).find(model => model.toLowerCase() === submittedModel.toLowerCase()) || ''
      : '';
    if (submittedModel && !validModel) {
      throw new Error(`Model ${submittedModel} is not available for ${product.data.title}. Please review the selection.`);
    }

    const quantity = Number(item.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > INQUIRY_CART_MAX_QUANTITY) {
      throw new Error(`Each product quantity must be between 1 and ${INQUIRY_CART_MAX_QUANTITY}.`);
    }

    const productSlug = product.id.replace(/\.mdoc$/, '');
    const productUrl = new URL(`/products/${productSlug}/`, origin);
    if (validModel) productUrl.searchParams.set('model', validModel);
    const key = `${productSlug.toLowerCase()}::${validModel.toLowerCase()}`;
    const existing = normalized.get(key);
    if (existing) {
      existing.quantity = Math.min(INQUIRY_CART_MAX_QUANTITY, existing.quantity + quantity);
      return;
    }
    normalized.set(key, {
      productSlug,
      productTitle: product.data.title,
      series: product.data.series,
      model: validModel,
      quantity,
      productUrl: productUrl.toString(),
    });
  });

  return [...normalized.values()];
};

const sendInquiryEmail = async ({
  env,
  request,
  inquiry,
}: {
  env: Env;
  request: Request;
  inquiry: {
    name: string;
    email: string;
    phone: string;
    company: string;
    country: string;
    message: string;
    pageUrl: string;
    items: ValidatedInquiryItem[];
    artwork: ArtworkAttachment | null;
  };
}) => {
  const apiKey = getEnvString(env, 'RESEND_API_KEY');
  const from = getEnvString(env, 'CONTACT_FROM_EMAIL') || getEnvString(env, 'INQUIRY_FROM_EMAIL');
  const to = getEnvString(env, 'CONTACT_TO_EMAIL') || DEFAULT_TO_EMAIL;

  if (!apiKey) throw new Error('Missing RESEND_API_KEY.');
  if (!from) throw new Error('Missing CONTACT_FROM_EMAIL.');
  if (!to) throw new Error('Missing CONTACT_TO_EMAIL.');

  const submittedAt = new Date().toISOString();
  const ipAddress = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '';
  const cfCountry = request.headers.get('cf-ipcountry') || '';
  const userAgent = request.headers.get('user-agent') || '';
  const subjectParts = [
    `${siteInfo.name} inquiry`,
    inquiry.items.length ? `${inquiry.items.length} product selection${inquiry.items.length === 1 ? '' : 's'}` : '',
    inquiry.country || cfCountry,
    inquiry.company,
    inquiry.artwork ? 'design attached' : '',
  ].filter(Boolean);
  const subject = subjectParts.join(' - ').slice(0, 180);
  const productLines = inquiry.items.flatMap((item, index) => [
    `${index + 1}. ${item.productTitle}`,
    line('   Series', item.series),
    line('   Model', item.model || 'All models'),
    line('   Quantity', String(item.quantity)),
    line('   Product page', item.productUrl),
  ]);
  const details = [
    line('Submitted at', submittedAt),
    line('Name', inquiry.name),
    line('Email', inquiry.email),
    line('Phone / WhatsApp', inquiry.phone),
    line('Company / project', inquiry.company),
    line('Country / region', inquiry.country),
    line('Page', inquiry.pageUrl),
    line('Visitor IP', ipAddress),
    line('Cloudflare country', cfCountry),
    line('User agent', userAgent),
    line('Design reference', inquiry.artwork ? `${inquiry.artwork.filename} (attached)` : ''),
    ...(productLines.length ? ['', 'Requested products:', ...productLines] : []),
    '',
    'Message:',
    inquiry.message,
  ];
  const text = details.join('\n');
  const htmlRows = [
    ['Submitted at', submittedAt],
    ['Name', inquiry.name],
    ['Email', inquiry.email],
    ['Phone / WhatsApp', inquiry.phone],
    ['Company / project', inquiry.company],
    ['Country / region', inquiry.country],
    ['Page', inquiry.pageUrl],
    ['Visitor IP', ipAddress],
    ['Cloudflare country', cfCountry],
    ['User agent', userAgent],
    ['Design reference', inquiry.artwork ? `${inquiry.artwork.filename} (attached)` : ''],
  ]
    .map(([labelText, value]) => `<tr><th align="left">${escapeHtml(labelText)}</th><td>${escapeHtml(value || '-')}</td></tr>`)
    .join('');
  const productHtml = inquiry.items.length
    ? `
      <h3 style="margin:20px 0 8px;">Requested products</h3>
      <table cellpadding="8" cellspacing="0" style="width:100%;border-collapse:collapse;border:1px solid #dbe7ee;">
        <thead>
          <tr>
            <th align="left">Product / series</th>
            <th align="left">Model</th>
            <th align="left">Quantity</th>
          </tr>
        </thead>
        <tbody>
          ${inquiry.items.map(item => `
            <tr>
              <td style="border-top:1px solid #dbe7ee;">
                <a href="${escapeHtml(item.productUrl)}">${escapeHtml(item.productTitle)}</a>
                <br><small>${escapeHtml(item.series || '-')}</small>
              </td>
              <td style="border-top:1px solid #dbe7ee;">${escapeHtml(item.model || 'All models')}</td>
              <td style="border-top:1px solid #dbe7ee;">${item.quantity}</td>
            </tr>`).join('')}
        </tbody>
      </table>`
    : '';
  const html = `
    <div style="font-family:Arial,sans-serif;color:#0f172a;line-height:1.55;">
      <h2 style="margin:0 0 16px;">New ${escapeHtml(siteInfo.name)} website inquiry</h2>
      <table cellpadding="8" cellspacing="0" style="border-collapse:collapse;border:1px solid #dbe7ee;">${htmlRows}</table>
      ${productHtml}
      <h3 style="margin:20px 0 8px;">Message</h3>
      <p style="white-space:pre-wrap;">${escapeHtml(inquiry.message)}</p>
    </div>`;

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
      'user-agent': 'businessweb-contact-form/1.0',
      'idempotency-key': `inquiry-${Date.now().toString(36)}-${randomString(10).toLowerCase()}`,
    },
    body: JSON.stringify({
      from,
      to: [to],
      reply_to: inquiry.email,
      subject,
      text,
      html,
      attachments: inquiry.artwork ? [{ filename: inquiry.artwork.filename, content: inquiry.artwork.content, content_type: inquiry.artwork.contentType }] : undefined,
      tags: [{ name: 'source', value: 'contact_form' }],
    }),
  });

  if (!response.ok) throw new Error(await response.text());
  return response.json().catch(() => ({}));
};

export const GET: APIRoute = async ({ locals }) => {
  const env = getRuntimeEnv(locals);
  return json(await createCaptcha(getCaptchaSecret(env)));
};

export const POST: APIRoute = async ({ locals, request }) => {
  const env = getRuntimeEnv(locals);
  let formData: FormData;

  try {
    formData = await request.formData();
  } catch {
    return json({ ok: false, message: 'Please submit the inquiry form again.' }, 400);
  }

  if (field(formData, 'website', 120)) {
    return json({ ok: true, message: 'Thank you. Your inquiry has been received.' });
  }

  const captchaOk = await validateCaptcha(getCaptchaSecret(env), field(formData, 'captcha', 12), field(formData, 'captchaToken', 300));
  if (!captchaOk) {
    return json({ ok: false, message: 'The verification code is incorrect or expired. Please try the new code.' }, 400);
  }

  const origin = new URL(request.url).origin;
  const pagePath = field(formData, 'pagePath', 250) || '/contact/';
  let inquiryItems: ValidatedInquiryItem[];
  let artwork: ArtworkAttachment | null;
  try {
    inquiryItems = parseInquiryItems(field(formData, 'inquiryItems', 20000), await getCollection('products'), origin);
  } catch (error) {
    return json(
      {
        ok: false,
        message: error instanceof Error ? error.message : 'Please review the selected products and try again.',
      },
      400
    );
  }
  try {
    artwork = await readArtworkAttachment(formData);
  } catch (error) {
    return json({ ok: false, message: error instanceof Error ? error.message : 'Please review the uploaded design file.' }, 400);
  }
  const artworkDescription = field(formData, 'artworkDescription', 3000);
  const message = field(formData, 'message', 3000) || artworkDescription || (artwork ? 'A design reference was attached. Please review it and contact the buyer for project details.' : '');
  const inquiry = {
    name: field(formData, 'name', 120),
    email: field(formData, 'email', 160).toLowerCase(),
    phone: field(formData, 'phone', 80),
    company: field(formData, 'company', 160),
    country: field(formData, 'country', 120),
    message,
    pageUrl: pagePath.startsWith('http') ? pagePath : new URL(pagePath, origin).toString(),
    items: inquiryItems,
    artwork,
  };

  if (!inquiry.name || !inquiry.email || !inquiry.message) {
    return json({ ok: false, message: 'Please provide your name, email and project requirements.' }, 400);
  }

  if (field(formData, 'formType', 40) === 'artwork-brief' && inquiry.phone.length < 5) {
    return json({ ok: false, message: 'Please provide a phone or WhatsApp number.' }, 400);
  }

  if (!isEmail(inquiry.email)) {
    return json({ ok: false, message: 'Please enter a valid email address.' }, 400);
  }

  try {
    const email = await sendInquiryEmail({ env, request, inquiry });
    return json({
      ok: true,
      message: `Thank you. Your inquiry has been sent to ${siteInfo.name}.`,
      email,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || 'Unknown email delivery error.');
    const configurationError = /Missing RESEND_API_KEY|Missing CONTACT_FROM_EMAIL/i.test(message);
    return json(
      {
        ok: false,
        message: configurationError
          ? `Inquiry email is not configured yet. Please contact ${siteInfo.name} by WhatsApp or email.`
          : `The inquiry could not be sent right now. Please try again or contact ${siteInfo.name} by WhatsApp.`,
      },
      configurationError ? 500 : 502
    );
  }
};
