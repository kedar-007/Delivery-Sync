
import type { Translations } from './types';

// ── Deep-path resolver ─────────────────────────────────────────────────────────

export type DeepKeys<T, Prefix extends string = ''> =
  T extends string ? Prefix :
  { [K in keyof T]: K extends string
      ? DeepKeys<T[K], Prefix extends '' ? K : `${Prefix}.${K}`>
      : never
  }[keyof T];

export type TranslationKey = DeepKeys<Translations>;

export function resolve(obj: Record<string, unknown>, path: string): string {
  const value = path.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], obj);
  return typeof value === 'string' ? value : path;
}

// ── Interpolation ──────────────────────────────────────────────────────────────
// Replaces {key} placeholders with values from params.
// Supports pluralization via pipe: "1 item | {count} items"

export function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;

  // Pluralization: "singular | plural"
  if ('count' in params && template.includes('|')) {
    const parts = template.split('|').map(s => s.trim());
    const count = Number(params.count);
    template = count === 1 ? parts[0] : (parts[1] ?? parts[0]);
  }

  return template.replace(/\{(\w+)\}/g, (_, key) => {
    const val = params[key];
    return val !== undefined ? String(val) : `{${key}}`;
  });
}

// ── RTL locales ────────────────────────────────────────────────────────────────

export const RTL_LOCALES = new Set(['ar', 'he', 'fa', 'ur']);

export function isRtl(locale: string): boolean {
  return RTL_LOCALES.has(locale);
}

// ── Browser locale detection ───────────────────────────────────────────────────

export function detectBrowserLocale(supported: string[]): string | null {
  const candidates = navigator.languages ?? [navigator.language];
  for (const lang of candidates) {
    const base = lang.split('-')[0].toLowerCase();
    if (supported.includes(base)) return base;
  }
  return null;
}
