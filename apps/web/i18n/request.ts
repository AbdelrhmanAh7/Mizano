import type { AbstractIntlMessages } from 'next-intl';
import { getRequestConfig } from 'next-intl/server';
import { brandMessages } from './brand-messages';
import { locales, type Locale } from './config';

/** The filled catalogs never change while the app runs: build each language once. */
const branded = new Map<string, unknown>();

async function brandedMessages(locale: string): Promise<AbstractIntlMessages> {
  let messages = branded.get(locale);
  if (!messages) {
    messages = brandMessages((await import(`../messages/${locale}`)).default, locale);
    branded.set(locale, messages);
  }
  return messages as AbstractIntlMessages;
}

export default getRequestConfig(async ({ requestLocale }) => {
  let locale = await requestLocale;

  // Validate that the incoming locale is valid
  if (!locale || !locales.includes(locale as Locale)) {
    locale = 'en';
  }

  return {
    locale,
    messages: await brandedMessages(locale),
  };
});
