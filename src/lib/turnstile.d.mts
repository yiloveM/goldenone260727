type Env = Record<string, unknown> | undefined;
type Action = 'contact' | 'download';
export function turnstileConfiguration(env: Env, action: Action, request: Request): {
  sitekey: string; secret: string; action: Action; hostname: string;
} | null;
export function turnstilePublicConfiguration(env: Env, action: Action, request: Request): {
  provider: 'turnstile'; sitekey: string; action: Action;
} | null;
export function verifyTurnstile(env: Env, action: Action, request: Request, token: unknown, send?: typeof fetch): Promise<{
  ok: boolean; status: number;
}>;
