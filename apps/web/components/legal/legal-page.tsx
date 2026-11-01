import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { BrandLogo } from '@/components/brand/brand-logo';
import { LanguageSwitcher } from '@/components/layout/language-switcher';
import { LegalLinks } from './legal-links';

/** When the terms or the privacy policy last changed (ISO date), shown at the top of both pages. */
export const LEGAL_UPDATED = '2026-11-01';

type Section = { heading: string } & Record<string, string>;

/** Terms of use and privacy policy: server-rendered text in one column that reads well on a phone. */
export async function LegalPage({
  locale,
  page,
}: {
  locale: string;
  page: 'terms' | 'privacy';
}): Promise<JSX.Element> {
  const t = await getTranslations({ locale, namespace: 'legal' });
  const tCommon = await getTranslations({ locale, namespace: 'common' });
  const sections = t.raw(`${page}.sections`) as Record<string, Section>;
  const updated = new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(
    new Date(`${LEGAL_UPDATED}T12:00:00Z`),
  );
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="mx-auto flex w-full max-w-3xl items-center justify-between gap-4 px-4 py-4">
        <Link href="/" aria-label={t('common.back')} className="rounded-md">
          <BrandLogo height={32} alt={tCommon('appName')} />
        </Link>
        <LanguageSwitcher />
      </header>
      <main className="flex-1">
        <article className="mx-auto max-w-3xl px-4 pb-16 pt-4 sm:pt-8">
          <p className="inline-block rounded-md border border-amber-300 bg-amber-50 px-3 py-1 text-sm font-medium text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
            {t('common.draftBadge')}
          </p>
          <h1 className="mt-4 text-3xl font-bold leading-snug sm:text-4xl">{t(`${page}.title`)}</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            {t('common.updated')} <time dateTime={LEGAL_UPDATED}>{updated}</time>
          </p>
          <p className="mt-5 text-lg leading-8">{t(`${page}.lead`)}</p>
          <p className="mt-3 leading-7 text-muted-foreground">{t('common.provider')}</p>
          {Object.entries(sections).map(([id, { heading, ...paragraphs }]) => (
            <section key={id} id={id} aria-labelledby={`${id}-title`} className="mt-9 scroll-mt-6">
              <h2 id={`${id}-title`} className="text-xl font-semibold">
                {heading}
              </h2>
              {Object.values(paragraphs).map((text, i) => (
                <p key={i} className="mt-3 leading-7">
                  {text}
                </p>
              ))}
            </section>
          ))}
          <section
            id="contact"
            aria-labelledby="contact-title"
            className="mt-9 scroll-mt-6 rounded-lg border bg-card p-5"
          >
            <h2 id="contact-title" className="text-xl font-semibold">
              {t('common.contactHeading')}
            </h2>
            <p className="mt-2 leading-7">{t('common.contactBody')}</p>
          </section>
          <p className="mt-6 text-sm leading-6 text-muted-foreground">{t('common.draftNote')}</p>
        </article>
      </main>
      <LegalLinks />
    </div>
  );
}
