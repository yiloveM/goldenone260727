import { getScopedRuntimeSecret } from './runtime-secret';
import type { RuntimeEnv } from './runtime-env';

const CAPTCHA_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const CAPTCHA_LENGTH = 4;
const CAPTCHA_TTL_MS = 10 * 60 * 1000;

const randomString = (length: number) => {
  const values = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(values, value => CAPTCHA_ALPHABET[value % CAPTCHA_ALPHABET.length]).join('');
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

const timingSafeEqual = (left: string, right: string) => {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return diff === 0;
};

export const getFormCaptchaSecret = async (env: RuntimeEnv, purpose: string) =>
  (await getScopedRuntimeSecret(env, purpose)) ||
  (!import.meta.env.PROD ? `businessweb-${purpose}-local-secret` : '');

export const createFormCaptcha = async (secret: string) => {
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

export const validateFormCaptcha = async (secret: string, answer: string, token: string) => {
  const normalized = answer.trim().toUpperCase();
  const parts = token.split('.');
  if (parts.length !== 4) return false;

  const [code, expiresText, nonce, signature] = parts;
  const expires = Number(expiresText);
  if (!/^[A-Z0-9]{4}$/.test(code) || !Number.isFinite(expires) || !nonce || !signature) return false;
  if (Date.now() > expires || normalized !== code) return false;

  const expected = await hmac(secret, `${code}.${expires}.${nonce}`);
  return timingSafeEqual(signature, expected);
};
