interface TurnstileApi {
  render(container: HTMLElement, options: Record<string, unknown>): string;
  reset(id: string): void;
  remove(id: string): void;
}
const captchaWindow = window as Window & { turnstile?: TurnstileApi };
let library: Promise<TurnstileApi> | undefined;
const loadLibrary = () => {
  if (captchaWindow.turnstile) return Promise.resolve(captchaWindow.turnstile);
  if (library) return library;
  library = new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement('script');
    let settled = false;
    const timer = window.setTimeout(() => fail(), 15_000);
    const fail = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      script.remove();
      library = undefined;
      reject(new Error('Verification unavailable'));
    };
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.addEventListener('error', fail, { once: true });
    script.addEventListener('load', () => {
      if (settled) return;
      if (!captchaWindow.turnstile) return fail();
      settled = true;
      window.clearTimeout(timer);
      resolve(captchaWindow.turnstile);
    }, { once: true });
    document.head.append(script);
  });
  return library;
};
const widgetLanguage = (locale: string) => {
  if (locale === 'fil') return 'tl';
  return ['ar', 'zh', 'en', 'hi', 'es', 'fr', 'pt', 'ru', 'de', 'tr', 'ko', 'ja', 'ms', 'nl', 'el', 'th'].includes(locale) ? locale : 'auto';
};

export class FormVerification extends HTMLElement {
  private widgetId?: string;
  private sitekey?: string;
  private pending?: Promise<void>;
  private controller?: AbortController;
  private expiryTimer?: number;
  private generation = 0;
  private configured = false;
  private bound = false;
  get ready() {
    if (!this.configured) return false;
    if (this.dataset.provider === 'turnstile') return Boolean(this.querySelector<HTMLInputElement>('[name="cf-turnstile-response"]')?.value);
    return Boolean(this.querySelector<HTMLInputElement>('[name="captchaToken"]')?.value)
      && /^[A-Za-z0-9]{4}$/.test(this.querySelector<HTMLInputElement>('[name="captcha"]')?.value || '');
  }
  private change(failed = false) {
    const status = this.querySelector<HTMLElement>('[data-verification-status]');
    if (status) {
      status.textContent = failed ? this.dataset.error || '' : '';
      status.hidden = !failed;
    }
    this.dispatchEvent(new CustomEvent('verificationchange', { bubbles: true, detail: { ready: this.ready } }));
  }
  private token(value = '', failed = false) {
    const input = this.querySelector<HTMLInputElement>('[name="cf-turnstile-response"]');
    if (input) input.value = value;
    this.change(failed);
  }
  connectedCallback() {
    if (this.bound) return;
    this.bound = true;
    this.querySelector('[data-verification-refresh]')?.addEventListener('click', () => this.refresh().catch(() => undefined));
    this.querySelector('[name="captcha"]')?.addEventListener('input', () => this.change());
    const disclosure = this.closest<HTMLDetailsElement>('details[data-contact-action]');
    disclosure?.addEventListener('toggle', () => {
      if (disclosure.open) this.refresh().catch(() => undefined);
      else this.suspend();
    });
  }
  disconnectedCallback() { this.suspend(); }
  suspend() {
    this.generation += 1;
    this.controller?.abort();
    window.clearTimeout(this.expiryTimer);
    if (this.widgetId !== undefined) captchaWindow.turnstile?.remove(this.widgetId);
    this.widgetId = undefined;
    this.sitekey = undefined;
    this.pending = undefined;
    this.configured = false;
    for (const input of this.querySelectorAll<HTMLInputElement>('input')) input.value = '';
    this.change();
  }
  async refresh() {
    const dialog = this.closest('dialog');
    const disclosure = this.closest<HTMLDetailsElement>('details[data-contact-action]');
    if ((dialog && !dialog.open) || (disclosure && !disclosure.open)) return;
    if (this.pending) return this.pending;
    this.token();
    this.configured = false;
    window.clearTimeout(this.expiryTimer);
    for (const input of this.querySelectorAll<HTMLInputElement>('input')) input.value = '';
    this.change();
    const generation = this.generation;
    const controller = new AbortController();
    this.controller = controller;
    const work = async () => {
      try {
        const response = await fetch(this.dataset.endpoint || '', {
          headers: { accept: 'application/json' }, credentials: 'same-origin',
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)]),
        });
        const config = await response.json();
        if (!response.ok || config.provider !== this.dataset.provider || config.action !== this.dataset.action) throw new Error('Verification unavailable');
        if (controller.signal.aborted || generation !== this.generation || !this.isConnected) return;
        if (config.provider === 'signed-captcha') {
          if (!/^[A-Z0-9]{4}$/.test(config.code) || typeof config.token !== 'string') throw new Error('Verification unavailable');
          const code = this.querySelector<HTMLElement>('[data-verification-code]');
          const token = this.querySelector<HTMLInputElement>('[name="captchaToken"]');
          if (!code || !token) throw new Error('Verification unavailable');
          code.textContent = config.code;
          token.value = config.token;
          this.configured = true;
          const expiry = Date.parse(config.expiresAt);
          if (!Number.isFinite(expiry) || expiry <= Date.now()) throw new Error('Verification expired');
          this.expiryTimer = window.setTimeout(() => {
            this.configured = false;
            token.value = '';
            this.change(true);
          }, Math.min(expiry - Date.now(), 600_000));
          this.change();
          return;
        }
        if (config.provider !== 'turnstile' || !config.sitekey) throw new Error('Verification unavailable');
        const api = await loadLibrary();
        const container = this.querySelector<HTMLElement>('[data-verification-widget]');
        if (controller.signal.aborted || generation !== this.generation || !container || !this.isConnected) return;
        this.configured = true;
        if (this.widgetId !== undefined && this.sitekey === config.sitekey) {
          api.reset(this.widgetId);
          return;
        }
        if (this.widgetId !== undefined) api.remove(this.widgetId);
        this.sitekey = config.sitekey;
        const update = (token = '', failed = false) => {
          if (generation === this.generation && this.isConnected) this.token(token, failed);
        };
        this.widgetId = api.render(container, {
          sitekey: config.sitekey, action: config.action, theme: 'auto',
          size: container.getBoundingClientRect().width < 300 ? 'compact' : 'flexible',
          language: widgetLanguage(this.dataset.language || 'auto'), 'response-field': false,
          callback: (token: string) => update(token),
          'expired-callback': () => update(), 'error-callback': () => update('', true),
          'timeout-callback': () => update('', true),
        });
      } catch (error) {
        if (!controller.signal.aborted && generation === this.generation) {
          this.configured = false;
          this.change(true);
        }
        throw error;
      } finally {
        if (generation === this.generation) this.pending = undefined;
      }
    };
    this.pending = work();
    return this.pending;
  }
}
if (!customElements.get('form-verification')) customElements.define('form-verification', FormVerification);
