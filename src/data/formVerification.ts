import {verificationSettings as settings} from './site-policy';

export const turnstileEnabled = settings.turnstileEnabled === true;
export const formVerificationProvider = turnstileEnabled ? 'turnstile' : 'signed-captcha';
