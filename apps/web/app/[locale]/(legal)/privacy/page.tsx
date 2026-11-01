import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { LegalPage } from '@/components/legal/legal-page';

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const t = await getTranslations({ locale: params.locale, namespace: 'legal.privacy' });
  return { title: t('title'), description: t('description') };
}

export default async function Page({
  params,
}: {
  params: { locale: string };
}): Promise<JSX.Element> {
  return LegalPage({ locale: params.locale, page: 'privacy' });
}
