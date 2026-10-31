export type McpLocale = 'ar' | 'en';

/**
 * The language of an `Accept-Language` header (q-values honoured) or a `ui_locales` list.
 * Arabic is the default (owner rule: Arabic first).
 */
export function resolveLocale(header: string | undefined | null): McpLocale {
  if (!header) return 'ar';
  const ranked = header
    .split(/[,\s]+/)
    .map((part, index) => {
      const [tag, ...params] = part.trim().split(';');
      const q = params.map((p) => /^q=([\d.]+)$/.exec(p.trim())).find(Boolean);
      return { lang: tag.toLowerCase().split('-')[0], q: q ? Number(q[1]) : 1, index };
    })
    .filter((r) => r.lang && Number.isFinite(r.q) && r.q > 0)
    .sort((a, b) => b.q - a.q || a.index - b.index);
  const match = ranked.find((r) => r.lang === 'ar' || r.lang === 'en');
  return match ? (match.lang as McpLocale) : 'ar';
}
