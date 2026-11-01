import { withBrand } from '@mizano/shared-types';

/**
 * Fills `{brand}` and `{brandSlug}` in every text of a message catalog, so the product's name lives
 * only in the brand constant (packages/shared-types/src/brand.ts) and never in the catalog files.
 */
export function brandMessages<T>(messages: T, locale: string): T {
  if (typeof messages === 'string') return withBrand(messages, locale) as T;
  if (Array.isArray(messages)) return messages.map((item) => brandMessages(item, locale)) as T;
  if (messages && typeof messages === 'object') {
    return Object.fromEntries(
      Object.entries(messages).map(([key, value]) => [key, brandMessages(value, locale)]),
    ) as T;
  }
  return messages;
}
