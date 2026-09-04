import type { APIRoute } from 'astro';
import { catalogDownloadById, catalogDownloadsAvailable } from '../../data/catalogDownloads';
import { siteInfo } from '../../data/site';
import { createFormCaptcha, getFormCaptchaSecret, validateFormCaptcha } from '../../lib/form-captcha';
import {
  createPublicFormSubmission,
  markPublicFormDelivery,
  normalizePublicSourcePage,
} from '../../lib/public-form-submissions';
import { getEnvString, getRuntimeEnv, type RuntimeEnv } from '../../lib/runtime-env';

export const prerender = false;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'cache-control': 'no-store',
      'content-type': 'application/json; charset=utf-8',
    },
  });

const field = (formData: FormData, name: string, maxLength = 500) =>
  String(formData.get(name) || '')
    .replace(/\0/g, '')
    .trim()
    .slice(0, maxLength);

const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const hasPhoneNumber = (value: string) => value.replace(/\D/g, '').length >= 6;

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const sendDownloadRequestEmail = async ({
  env,
  submission,
}: {
  env: RuntimeEnv;
  submission: {
    name: string;
    email: string;
    phoneWhatsapp: string;
    country: string;
    message: string;
    pageUrl: string;
    document: NonNullable<ReturnType<typeof catalogDownloadById>>;
  };
}) => {
  const apiKey = getEnvString(env, 'RESEND_API_KEY');
  const from = getEnvString(env, 'CONTACT_FROM_EMAIL') || getEnvString(env, 'INQUIRY_FROM_EMAIL');
  const to = getEnvString(env, 'CONTACT_TO_EMAIL');

  if (!apiKey) throw new Error('Missing RESEND_API_KEY.');
  if (!from) throw new Error('Missing CONTACT_FROM_EMAIL.');
  if (!to) throw new Error('Missing CONTACT_TO_EMAIL.');

  const rows = [
    ['Submitted at', new Date().toISOString()],
    ['Name', submission.name],
    ['Email', submission.email],
    ['Phone / WhatsApp', submission.phoneWhatsapp],
    ['Country', submission.country],
    ['Selected PDF', submission.document.fileName],
    ['Source page', submission.pageUrl],
  ];
  const text = [
    ...rows.map(([label, value]) => `${label}: ${value}`),
    '',
    'Message:',
    submission.message || '-',
  ].join('\n');
  const htmlRows = rows
    .map(([label, value]) => `<tr><th align="left">${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`)
    .join('');
  const html = `
    <div style="font-family:Arial,sans-serif;color:#0f172a;line-height:1.55;">
      <h2 style="margin:0 0 16px;">New ${escapeHtml(siteInfo.name)} document download request</h2>
      <table cellpadding="8" cellspacing="0" style="border-collapse:collapse;border:1px solid #dbe7ee;">${htmlRows}</table>
      <h3 style="margin:20px 0 8px;">Message</h3>
      <p style="white-space:pre-wrap;">${escapeHtml(submission.message || '-')}</p>
    </div>`;

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
      'user-agent': 'businessweb-download-form/1.0',
      'idempotency-key': `catalog-download-${crypto.randomUUID()}`,
    },
    body: JSON.stringify({
      from,
      to: [to],
      reply_to: submission.email,
      subject: `${siteInfo.name} document download - ${submission.document.fileName} - ${submission.country}`.slice(0, 180),
      text,
      html,
      tags: [
        { name: 'source', value: 'download_form' },
        { name: 'document', value: submission.document.id },
      ],
    }),
  });

  if (!response.ok) throw new Error(await response.text());
  return response.json().catch(() => ({}));
};

const handleDownloadCaptcha = async (env: RuntimeEnv) => {
  const secret = await getFormCaptchaSecret(env, 'download-form-captcha');
  if (!secret) return json({ ok: false, message: 'Download CAPTCHA is not configured.' }, 503);
  return json(await createFormCaptcha(secret));
};

const handleDownloadSubmission = async (request: Request, env: RuntimeEnv) => {
  const requestOrigin = new URL(request.url).origin;
  const submittedOrigin = request.headers.get('origin');
  if (submittedOrigin && submittedOrigin !== requestOrigin) {
    return json({ ok: false, message: 'Cross-origin submissions are not allowed.' }, 403);
  }

  const contentLength = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(contentLength) && contentLength > 32_768) {
    return json({ ok: false, message: 'The submitted form is too large.' }, 413);
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return json({ ok: false, message: 'Please submit the download form again.' }, 400);
  }

  if (field(formData, 'website', 120)) {
    return json({ ok: false, message: 'The download request could not be processed.' }, 400);
  }

  const captchaSecret = await getFormCaptchaSecret(env, 'download-form-captcha');
  if (!captchaSecret) return json({ ok: false, message: 'Download CAPTCHA is not configured.' }, 503);
  const captchaOk = await validateFormCaptcha(
    captchaSecret,
    field(formData, 'captcha', 12),
    field(formData, 'captchaToken', 300)
  );
  if (!captchaOk) {
    return json({ ok: false, message: 'The CAPTCHA is incorrect or expired. Please try the new CAPTCHA.' }, 400);
  }

  const document = catalogDownloadById(field(formData, 'documentId', 80));
  if (!document) return json({ ok: false, message: 'Please select an available PDF.' }, 400);

  const pagePath = field(formData, 'pagePath', 250) || '/downloads/';
  const submission = {
    name: field(formData, 'name', 120),
    email: field(formData, 'email', 160).toLowerCase(),
    phoneWhatsapp: field(formData, 'phoneWhatsapp', 80),
    country: field(formData, 'country', 120),
    message: field(formData, 'message', 3000),
    pageUrl: normalizePublicSourcePage(pagePath, requestOrigin, '/downloads/'),
    document,
  };

  if (!submission.name || !submission.email || !submission.phoneWhatsapp || !submission.country) {
    return json({ ok: false, message: 'Please provide your name, email, phone or WhatsApp, and country.' }, 400);
  }
  if (!isEmail(submission.email)) {
    return json({ ok: false, message: 'Please enter a valid email address.' }, 400);
  }
  if (!hasPhoneNumber(submission.phoneWhatsapp)) {
    return json({ ok: false, message: 'Please enter a valid phone or WhatsApp number.' }, 400);
  }

  let submissionId: string;
  try {
    submissionId = await createPublicFormSubmission(env, {
      formType: 'download',
      sourcePage: submission.pageUrl,
      name: submission.name,
      email: submission.email,
      phoneWhatsapp: submission.phoneWhatsapp,
      country: submission.country,
      message: submission.message,
      selectedPdf: document.fileName,
    });
  } catch {
    return json({ ok: false, message: 'The download request could not be saved right now. Please try again.' }, 503);
  }

  try {
    const email = await sendDownloadRequestEmail({ env, submission });
    await markPublicFormDelivery(env, submissionId, 'sent', String((email as { id?: unknown })?.id || '')).catch(() => undefined);
    return json({
      ok: true,
      message: 'Thank you. Your download is ready.',
      downloadUrl: document.url,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || 'Unknown email delivery error.');
    await markPublicFormDelivery(env, submissionId, 'failed', message).catch(() => undefined);
    const configurationError = /Missing RESEND_API_KEY|Missing CONTACT_FROM_EMAIL|Missing CONTACT_TO_EMAIL/i.test(message);
    return json(
      {
        ok: false,
        message: configurationError
          ? `Download email delivery is not configured yet. Please contact ${siteInfo.name}.`
          : 'The request could not be sent right now. Please try again.',
      },
      configurationError ? 500 : 502
    );
  }
};

export const handleDownloadRequest = (request: Request, env: RuntimeEnv) => {
  if (!catalogDownloadsAvailable) {
    return json({ ok: false, message: 'Controlled downloads are not enabled.' }, 404);
  }
  if (request.method === 'GET') return handleDownloadCaptcha(env);
  if (request.method === 'POST') return handleDownloadSubmission(request, env);
  return new Response(null, {
    status: 405,
    headers: {
      allow: 'GET, POST',
      'cache-control': 'no-store',
    },
  });
};

export const GET: APIRoute = ({ locals, request }) => handleDownloadRequest(request, getRuntimeEnv(locals));
export const POST: APIRoute = ({ locals, request }) => handleDownloadRequest(request, getRuntimeEnv(locals));
