import { getEnvString, type RuntimeEnv } from './runtime-env';

const encoder = new TextEncoder();
const DERIVATION_SALT = encoder.encode('goldenone-runtime-secrets-v1');
const ROOT_KEY = 'KEYSTATIC_GITHUB_CLIENT_SECRET';

const base64Url = (bytes: ArrayBuffer) => {
  let binary = '';
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

export const hasScopedRuntimeSecret = (env: RuntimeEnv) => getEnvString(env, ROOT_KEY).length >= 32;

export const getScopedRuntimeSecret = async (env: RuntimeEnv, purpose: string) => {
  const root = getEnvString(env, ROOT_KEY);
  if (root.length < 32) return '';

  const key = await crypto.subtle.importKey('raw', encoder.encode(root), 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: DERIVATION_SALT,
      info: encoder.encode(purpose),
    },
    key,
    256
  );
  return base64Url(bits);
};
