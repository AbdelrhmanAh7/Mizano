'use client';

import { useTranslations, useLocale } from 'next-intl';
import { Link } from '@/i18n/routing';
import { LanguageSwitcher } from '@/components/layout/language-switcher';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Brain,
  Zap,
  BarChart3,
  Shield,
  Package,
  FileText,
  TrendingUp,
  Users,
  MessageSquare,
  Settings,
  Landmark,
  Lock,
  Wifi,
  Server,
} from 'lucide-react';

const featureCards = [
  { key: 'zeroTouch' as const, icon: Zap },
  { key: 'aiIntelligence' as const, icon: Brain },
  { key: 'financial' as const, icon: Landmark },
  { key: 'operations' as const, icon: Package },
  { key: 'security' as const, icon: Shield },
  { key: 'analytics' as const, icon: BarChart3 },
];

const aiCategories = [
  { key: 'coreFinancial' as const, icon: Landmark, count: '10' },
  { key: 'salesCrm' as const, icon: TrendingUp, count: '5' },
  { key: 'security' as const, icon: Shield, count: '3' },
  { key: 'nlp' as const, icon: FileText, count: '4' },
  { key: 'hr' as const, icon: Users, count: '3' },
  { key: 'operations' as const, icon: Settings, count: '5' },
  { key: 'chat' as const, icon: MessageSquare, count: '3' },
];

export default function OnboardingPage() {
  const t = useTranslations('onboarding');
  const locale = useLocale();
  const isRtl = locale === 'ar';

  return (
    <div className="min-h-screen bg-background" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* Nav */}
      <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-sm">
        <div className="container mx-auto flex items-center justify-between h-16 px-4">
          <span className="text-2xl font-bold text-primary">Mizano</span>
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
        <div className="absolute inset-0 bg-gradient-to-br from-blue-600/5 via-indigo-600/5 to-violet-700/5" />
        <div className="absolute inset-0 opacity-[0.03]">
          <div className="absolute top-20 start-10 w-72 h-72 bg-blue-500 rounded-full blur-3xl" />
          <div className="absolute bottom-10 end-10 w-96 h-96 bg-violet-500 rounded-full blur-3xl" />
        </div>
        <div className="container mx-auto px-4 py-24 md:py-32 text-center relative z-10">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6">
            <Brain className="h-4 w-4" />
            Mizano ERP
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

      {/* Stats Bar */}
      <section className="border-y bg-muted/30">
        <div className="container mx-auto px-4 py-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
            <div>
              <p className="text-3xl font-bold text-primary">33</p>
              <p className="text-sm text-muted-foreground mt-1">{t('stats.aiModels')}</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-primary">7</p>
              <p className="text-sm text-muted-foreground mt-1">{t('stats.aiCategories')}</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-primary">12+</p>
              <p className="text-sm text-muted-foreground mt-1">{t('stats.businessModules')}</p>
            </div>
            <div>
              <div className="flex items-center justify-center gap-1">
                <Lock className="h-5 w-5 text-primary" />
                <p className="text-xl font-bold text-primary">100%</p>
              </div>
              <p className="text-sm text-muted-foreground mt-1">{t('stats.localAi')}</p>
            </div>
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

      {/* AI Models Showcase */}
      <section className="bg-muted/30 border-y">
        <div className="container mx-auto px-4 py-20">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold">{t('aiShowcase.sectionTitle')}</h2>
            <p className="text-muted-foreground mt-2">{t('aiShowcase.sectionSubtitle')}</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {aiCategories.map(({ key, icon: Icon }) => (
              <Card key={key} className="group hover:shadow-md transition-shadow">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="rounded-lg bg-primary/10 p-2">
                      <Icon className="h-5 w-5 text-primary" />
                    </div>
                    <span className="text-xs font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                      {t(`aiShowcase.${key}.count`)}
                    </span>
                  </div>
                  <h3 className="font-semibold text-sm">{t(`aiShowcase.${key}.title`)}</h3>
                  <p className="text-xs text-muted-foreground mt-1.5">
                    {t(`aiShowcase.${key}.description`)}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Technology Highlights */}
      <section className="container mx-auto px-4 py-20">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold">{t('technology.sectionTitle')}</h2>
        </div>
        <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
          <div className="text-center">
            <div className="rounded-full bg-green-100 dark:bg-green-950 p-4 w-fit mx-auto mb-4">
              <Lock className="h-6 w-6 text-green-600" />
            </div>
            <p className="text-sm font-medium">{t('technology.localAi')}</p>
          </div>
          <div className="text-center">
            <div className="rounded-full bg-blue-100 dark:bg-blue-950 p-4 w-fit mx-auto mb-4">
              <Wifi className="h-6 w-6 text-blue-600" />
            </div>
            <p className="text-sm font-medium">{t('technology.offline')}</p>
          </div>
          <div className="text-center">
            <div className="rounded-full bg-purple-100 dark:bg-purple-950 p-4 w-fit mx-auto mb-4">
              <Server className="h-6 w-6 text-purple-600" />
            </div>
            <p className="text-sm font-medium">{t('technology.techStack')}</p>
          </div>
        </div>
        <div className="flex items-center justify-center gap-4 mt-10 flex-wrap">
          {['Next.js', 'NestJS', 'PostgreSQL', 'Redis', 'Prisma', 'TypeScript'].map((tech) => (
            <span
              key={tech}
              className="px-3 py-1.5 rounded-full border text-xs font-medium text-muted-foreground"
            >
              {tech}
            </span>
          ))}
        </div>
      </section>

      {/* CTA Footer */}
      <section className="bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-700 text-white">
        <div className="container mx-auto px-4 py-20 text-center">
          <h2 className="text-3xl font-bold">{t('cta.title')}</h2>
          <p className="mt-3 text-blue-100 text-lg">{t('cta.subtitle')}</p>
          <div className="mt-8 flex items-center justify-center gap-4">
            <Button size="lg" variant="secondary" asChild>
              <Link href="/register">{t('cta.getStarted')}</Link>
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="border-white/30 text-white hover:bg-white/10"
              asChild
            >
              <Link href="/login">{t('cta.login')}</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-6">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          Mizano ERP - AI-Powered Autonomous Accounting Platform
        </div>
      </footer>
    </div>
  );
}
