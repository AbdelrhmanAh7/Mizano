'use client';

import { useTranslations, useLocale } from 'next-intl';
import { Link } from '@/i18n/routing';
import { LanguageSwitcher } from '@/components/layout/language-switcher';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Brain,
  BarChart3,
  Shield,
  Package,
  FileText,
  Landmark,
  Lock,
  KeyRound,
  Server,
} from 'lucide-react';
import { BrandLogo } from '@/components/brand/brand-logo';
import { LegalLinks } from '@/components/legal/legal-links';
import { brandName, brandTagline } from '@mizano/shared-types';

const featureCards = [
  { key: 'documents' as const, icon: FileText },
  { key: 'ai' as const, icon: Brain },
  { key: 'financial' as const, icon: Landmark },
  { key: 'operations' as const, icon: Package },
  { key: 'security' as const, icon: Shield },
  { key: 'analytics' as const, icon: BarChart3 },
];

export default function OnboardingPage() {
  const t = useTranslations('onboarding');
  const locale = useLocale();
  const isRtl = locale === 'ar';
  const brand = brandName(locale);

  return (
    <div className="min-h-screen bg-background" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* Nav */}
      {/* Solid, not see-through: content scrolling under a translucent header showed through it (#676). */}
      <header className="sticky top-0 z-50 border-b bg-background">
        <div className="container mx-auto flex items-center justify-between h-16 px-4">
          <BrandLogo height={32} alt={brand} priority />
          <div className="flex items-center gap-3">
            <LanguageSwitcher />
            <Button variant="ghost" asChild>
              <Link href="/login">{t('hero.login')}</Link>
            </Button>
            <Button asChild>
              <Link href="/register">{t('hero.getStarted')}</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-brand/5 via-brand-dark/5 to-brand-deep/5" />
        <div className="absolute inset-0 opacity-[0.03]">
          <div className="absolute top-20 start-10 w-72 h-72 bg-brand rounded-full blur-3xl" />
          <div className="absolute bottom-10 end-10 w-96 h-96 bg-brand-gold rounded-full blur-3xl" />
        </div>
        <div className="container mx-auto px-4 py-24 md:py-32 text-center relative z-10">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-foreground text-sm font-medium mb-6">
            <BrandLogo variant="icon" height={20} alt="" />
            {brand}
          </div>
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight max-w-4xl mx-auto leading-tight">
            {t('hero.title')}
          </h1>
          <p className="mt-6 text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto">
            {t('hero.subtitle')}
          </p>
          <div className="mt-10 flex items-center justify-center gap-4">
            <Button size="lg" asChild>
              <Link href="/register">{t('hero.getStarted')}</Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="/login">{t('hero.login')}</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="container mx-auto px-4 py-20">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold">{t('features.sectionTitle')}</h2>
          <p className="text-muted-foreground mt-2">{t('features.sectionSubtitle')}</p>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {featureCards.map(({ key, icon: Icon }) => (
            <Card key={key} className="group hover:shadow-md transition-shadow">
              <CardContent className="pt-6">
                <div className="rounded-lg bg-primary/10 p-3 w-fit mb-4 group-hover:bg-primary/20 transition-colors">
                  <Icon className="h-6 w-6 text-primary" />
                </div>
                <h3 className="text-lg font-semibold">{t(`features.${key}.title`)}</h3>
                <p className="text-sm text-muted-foreground mt-2">
                  {t(`features.${key}.description`)}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Technology Highlights */}
      <section className="container mx-auto px-4 py-20">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold">{t('technology.sectionTitle')}</h2>
        </div>
        <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
          <div className="text-center">
            <div className="rounded-full bg-success/10 p-4 w-fit mx-auto mb-4">
              <Lock className="h-6 w-6 text-success" />
            </div>
            <p className="text-sm font-medium">{t('technology.localAi')}</p>
          </div>
          <div className="text-center">
            <div className="rounded-full bg-info/10 p-4 w-fit mx-auto mb-4">
              <KeyRound className="h-6 w-6 text-info" />
            </div>
            <p className="text-sm font-medium">{t('technology.offline')}</p>
          </div>
          <div className="text-center">
            <div className="rounded-full bg-primary/10 p-4 w-fit mx-auto mb-4">
              <Server className="h-6 w-6 text-primary" />
            </div>
            <p className="text-sm font-medium">{t('technology.techStack')}</p>
          </div>
        </div>
      </section>

      {/* CTA Footer */}
      <section className="bg-gradient-to-br from-brand-dark via-brand-dark to-brand-deep text-white">
        <div className="container mx-auto px-4 py-20 text-center">
          <h2 className="text-3xl font-bold">{t('cta.title')}</h2>
          <p className="mt-3 text-brand-foreground text-lg">{t('cta.subtitle')}</p>
          <div className="mt-8 flex items-center justify-center gap-4">
            <Button size="lg" variant="secondary" asChild>
              <Link href="/register">{t('cta.getStarted')}</Link>
            </Button>
            <Button
              size="lg"
              variant="outline"
              // The outline variant's own background is white: without bg-transparent the white
              // label sat on white and the button looked empty (#676).
              className="border-white/60 bg-transparent text-white hover:bg-white/10 hover:text-white"
              asChild
            >
              <Link href="/login">{t('cta.login')}</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-6">
        <div className="container mx-auto px-4 flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <BrandLogo variant="icon" height={18} alt="" />
          {brandTagline(locale)}
        </div>
        <LegalLinks className="pb-0" />
      </footer>
    </div>
  );
}
