import settings from './form-verification.json';

export const turnstileEnabled = settings.turnstileEnabled === true;
export const formVerificationProvider = turnstileEnabled ? 'turnstile' : 'signed-captcha';
