// ============================================
// The product's public name. Every screen, email, document and AI-app text reads it from here, so
// a later rename is this file only. Repo, package, env, database and code identifiers keep their
// own names on purpose.
// ============================================

export interface Brand {
  /** The name as written in each language (Arabic script and Latin). */
  readonly name: { readonly ar: string; readonly en: string };
  /** One line under the name, in each language. */
  readonly tagline: { readonly ar: string; readonly en: string };
  /** Lower-case Latin identifier for places that need a plain word: the connector name in AI apps. */
  readonly slug: string;
}

export const BRAND: Brand = {
  name: { ar: 'جردة', en: 'Jarda' },
  tagline: {
    ar: 'جردة: حساباتك واضحة، وإقفال الشهر أسرع.',
    en: 'Jarda: clear books, a faster month-end.',
  },
  slug: 'jarda',
};

/** Name of the product in the given language (anything but `ar` gets the English name). */
export function brandName(locale: string): string {
  return locale === 'ar' ? BRAND.name.ar : BRAND.name.en;
}

/** Tagline of the product in the given language. */
export function brandTagline(locale: string): string {
  return locale === 'ar' ? BRAND.tagline.ar : BRAND.tagline.en;
}

/**
 * Fills the brand placeholders of one catalog text: `{brand}` is the name in the text's language,
 * `{brandSlug}` the plain Latin word used in commands and connector names.
 */
export function withBrand(text: string, locale: string): string {
  return text.replace(/\{brand\}/g, brandName(locale)).replace(/\{brandSlug\}/g, BRAND.slug);
}
