import type { RuntimeEnv } from './runtime-env';

type D1DatabaseLike = {
  prepare: (query: string) => {
    bind: (...values: unknown[]) => {
      run: () => Promise<unknown>;
    };
    run: () => Promise<unknown>;
  };
};

export type PublicFormSubmission = {
  formType: 'contact' | 'download';
  sourcePage: string;
  name: string;
  email: string;
  phoneWhatsapp?: string;
  companyProject?: string;
  country?: string;
  message?: string;
  selectedPdf?: string;
  attachmentName?: string;
  inquiryItems?: unknown[];
};

export const normalizePublicSourcePage = (value: string, origin: string, fallbackPath: string) => {
  try {
    const url = new URL(value || fallbackPath, origin);
    if (url.origin !== origin) throw new Error('Unexpected source origin.');
    return new URL(`${url.pathname}${url.search}`, origin).toString();
  } catch {
    return new URL(fallbackPath, origin).toString();
  }
};

const getDatabase = (env: RuntimeEnv) => env?.MANAGER_DB as D1DatabaseLike | undefined;

const ensureSchema = async (db: D1DatabaseLike) => {
  await db.prepare(
    `CREATE TABLE IF NOT EXISTS public_form_submissions (
      id TEXT PRIMARY KEY,
      form_type TEXT NOT NULL,
      source_page TEXT NOT NULL,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone_whatsapp TEXT NOT NULL DEFAULT '',
      company_project TEXT NOT NULL DEFAULT '',
      country TEXT NOT NULL DEFAULT '',
      message TEXT NOT NULL DEFAULT '',
      selected_pdf TEXT NOT NULL DEFAULT '',
      attachment_name TEXT NOT NULL DEFAULT '',
      inquiry_items_json TEXT NOT NULL DEFAULT '[]',
      delivery_status TEXT NOT NULL DEFAULT 'pending',
      resend_email_id TEXT NOT NULL DEFAULT '',
      delivery_error TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      email_sent_at TEXT
    )`
  ).run();
  await db.prepare(
    'CREATE INDEX IF NOT EXISTS idx_public_form_submissions_created_at ON public_form_submissions(created_at DESC)'
  ).run();
  await db.prepare(
    'CREATE INDEX IF NOT EXISTS idx_public_form_submissions_source ON public_form_submissions(form_type, source_page)'
  ).run();
};

export const createPublicFormSubmission = async (env: RuntimeEnv, submission: PublicFormSubmission) => {
  const db = getDatabase(env);
  if (!db) throw new Error('Public form D1 storage is unavailable.');

  await ensureSchema(db);
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  await db.prepare(
    `INSERT INTO public_form_submissions (
      id, form_type, source_page, name, email, phone_whatsapp, company_project,
      country, message, selected_pdf, attachment_name, inquiry_items_json, delivery_status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`
  ).bind(
    id,
    submission.formType,
    submission.sourcePage,
    submission.name,
    submission.email,
    submission.phoneWhatsapp || '',
    submission.companyProject || '',
    submission.country || '',
    submission.message || '',
    submission.selectedPdf || '',
    submission.attachmentName || '',
    JSON.stringify(submission.inquiryItems || []),
    createdAt
  ).run();
  return id;
};

export const markPublicFormDelivery = async (
  env: RuntimeEnv,
  id: string,
  status: 'sent' | 'failed',
  details = ''
) => {
  const db = getDatabase(env);
  if (!db) return;

  if (status === 'sent') {
    await db.prepare(
      `UPDATE public_form_submissions
       SET delivery_status = 'sent', resend_email_id = ?, delivery_error = '', email_sent_at = ?
       WHERE id = ?`
    ).bind(details.slice(0, 160), new Date().toISOString(), id).run();
    return;
  }

  await db.prepare(
    `UPDATE public_form_submissions
     SET delivery_status = 'failed', delivery_error = ?, email_sent_at = NULL
     WHERE id = ?`
  ).bind(details.slice(0, 1000), id).run();
};
