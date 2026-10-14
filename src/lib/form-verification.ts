import { turnstileEnabled } from '../data/formVerification';
import { createFormCaptcha, getFormCaptchaSecret, validateFormCaptcha } from './form-captcha';
import { turnstilePublicConfiguration, verifyTurnstile } from './turnstile.mjs';
import type { RuntimeEnv } from './runtime-env';

type Action = 'contact' | 'download';
export const verificationUnavailable = 'Verification is temporarily unavailable. Please try again or contact us.';

export const publicFormVerification = async (env: RuntimeEnv, action: Action, request: Request) => {
  if (turnstileEnabled) return turnstilePublicConfiguration(env, action, request);
  const secret = await getFormCaptchaSecret(env, `${action}-form-captcha`);
  return secret ? { provider: 'signed-captcha' as const, action, ...await createFormCaptcha(secret) } : null;
};

export const verifyPublicForm = async (env: RuntimeEnv, action: Action, request: Request, form: FormData) => {
  if (env?.DEPLOYMENT_CONTEXT === 'preview') return { ok: false, status: 403 };
  if (turnstileEnabled) return verifyTurnstile(env, action, request, form.get('cf-turnstile-response'));
  const secret = await getFormCaptchaSecret(env, `${action}-form-captcha`);
  if (!secret) return { ok: false, status: 503 };
  const answer = form.get('captcha');
  const token = form.get('captchaToken');
  const ok = typeof answer === 'string' && typeof token === 'string' && answer.length <= 12 && token.length <= 300
    && await validateFormCaptcha(secret, answer, token);
  return { ok, status: ok ? 200 : 400 };
};
