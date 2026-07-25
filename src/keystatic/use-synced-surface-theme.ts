import { type RefObject, useEffect } from 'react';

type ThemePrefix = 'pm' | 'po' | 'r2' | 'ai' | 'sp' | 'tr' | 'language';
type Rgb = {
  r: number;
  g: number;
  b: number;
  a: number;
};

const white = { r: 255, g: 255, b: 255, a: 1 };
const black = { r: 0, g: 0, b: 0, a: 1 };

const parseRgb = (value: string): Rgb | null => {
  const match = value.match(/rgba?\(([^)]+)\)/i);
  if (!match) return null;

  const parts = match[1]
    .split(',')
    .map(part => part.trim())
    .map(Number);

  if (parts.length < 3 || parts.some(part => Number.isNaN(part))) return null;

  return {
    r: parts[0],
    g: parts[1],
    b: parts[2],
    a: parts[3] ?? 1,
  };
};

const mix = (from: Rgb, to: Rgb, amount: number): Rgb => ({
  r: Math.round(from.r + (to.r - from.r) * amount),
  g: Math.round(from.g + (to.g - from.g) * amount),
  b: Math.round(from.b + (to.b - from.b) * amount),
  a: 1,
});

const cssRgb = (value: Rgb) => `rgb(${Math.round(value.r)}, ${Math.round(value.g)}, ${Math.round(value.b)})`;

const luminance = (value: Rgb) => {
  const channel = (input: number) => {
    const next = input / 255;
    return next <= 0.03928 ? next / 12.92 : ((next + 0.055) / 1.055) ** 2.4;
  };

  return channel(value.r) * 0.2126 + channel(value.g) * 0.7152 + channel(value.b) * 0.0722;
};

const readHostBackground = (element: HTMLElement): Rgb => {
  let current: HTMLElement | null = element.parentElement;

  while (current) {
    const color = parseRgb(window.getComputedStyle(current).backgroundColor);
    if (color && color.a > 0.05) return color;
    current = current.parentElement;
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? { r: 36, g: 36, b: 36, a: 1 } : white;
};

const applyVars = (element: HTMLElement, prefix: ThemePrefix, hostBg: Rgb) => {
  const isDark = luminance(hostBg) < 0.45;
  const vars = isDark
    ? {
        bg: hostBg,
        panel: mix(hostBg, white, 0.04),
        mutedBg: mix(hostBg, white, 0.08),
        hover: mix(hostBg, white, 0.12),
        thumb: mix(hostBg, white, 0.09),
        border: mix(hostBg, white, 0.22),
        borderSoft: mix(hostBg, white, 0.16),
        text: 'rgb(242, 242, 242)',
        muted: 'rgb(184, 184, 184)',
      }
    : {
        bg: hostBg,
        panel: mix(hostBg, white, 0.88),
        mutedBg: mix(hostBg, black, 0.035),
        hover: mix(hostBg, black, 0.025),
        thumb: mix(hostBg, black, 0.055),
        border: mix(hostBg, black, 0.18),
        borderSoft: mix(hostBg, black, 0.1),
        text: 'rgb(23, 32, 51)',
        muted: 'rgb(102, 112, 133)',
      };

  element.style.setProperty(`--${prefix}-bg`, cssRgb(vars.bg));
  element.style.setProperty(`--${prefix}-panel`, cssRgb(vars.panel));
  element.style.setProperty(`--${prefix}-muted-bg`, cssRgb(vars.mutedBg));
  element.style.setProperty(`--${prefix}-hover`, cssRgb(vars.hover));
  element.style.setProperty(`--${prefix}-thumb`, cssRgb(vars.thumb));
  element.style.setProperty(`--${prefix}-border`, cssRgb(vars.border));
  element.style.setProperty(`--${prefix}-border-soft`, cssRgb(vars.borderSoft));
  element.style.setProperty(`--${prefix}-text`, vars.text);
  element.style.setProperty(`--${prefix}-muted`, vars.muted);
};

export const useSyncedSurfaceTheme = <T extends HTMLElement>(ref: RefObject<T | null>, prefix: ThemePrefix) => {
  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;

    let frame = 0;
    const sync = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => applyVars(element, prefix, readHostBackground(element)));
    };

    sync();

    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style', 'data-theme', 'data-color-scheme', 'data-mode'] });
    observer.observe(document.body, { attributes: true, attributeFilter: ['class', 'style', 'data-theme', 'data-color-scheme', 'data-mode'] });

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    media.addEventListener('change', sync);
    document.addEventListener('click', sync, true);

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      media.removeEventListener('change', sync);
      document.removeEventListener('click', sync, true);
    };
  }, [prefix, ref]);
};
