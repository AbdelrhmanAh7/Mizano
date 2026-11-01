import { getRequestConfig } from 'next-intl/server';
import { brandMessages } from './brand-messages';
import { locales, type Locale } from './config';

export default getRequestConfig(async ({ requestLocale }) => {
  let locale = await requestLocale;

  // Validate that the incoming locale is valid
  if (!locale || !locales.includes(locale as Locale)) {
    locale = 'en';
  }

  return {
    locale,
    messages: brandMessages((await import(`../messages/${locale}`)).default, locale),
  };
});
