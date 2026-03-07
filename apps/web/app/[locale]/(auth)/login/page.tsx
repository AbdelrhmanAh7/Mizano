'use client';

import { Suspense, useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { LanguageSwitcher } from '@/components/layout/language-switcher';
import { Brain, BarChart3, Shield, Zap, Eye, EyeOff } from 'lucide-react';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

type LoginFormData = z.infer<typeof loginSchema>;

function getSafeRedirectUrl(callbackUrl: string | null, fallback: string): string {
  if (!callbackUrl) return fallback;
  if (callbackUrl.startsWith('/') && !callbackUrl.startsWith('//')) {
    return callbackUrl;
  }
  return fallback;
}

const features = [
  {
    icon: Brain,
    titleKey: 'features.ai.title' as const,
    descKey: 'features.ai.desc' as const,
  },
  {
    icon: Zap,
    titleKey: 'features.automation.title' as const,
    descKey: 'features.automation.desc' as const,
  },
  {
    icon: BarChart3,
    titleKey: 'features.insights.title' as const,
    descKey: 'features.insights.desc' as const,
  },
  {
    icon: Shield,
    titleKey: 'features.security.title' as const,
    descKey: 'features.security.desc' as const,
  },
];

function LoginForm() {
  const router = useRouter();
  const locale = useLocale();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl');
  const t = useTranslations('auth.login');
  const tCommon = useTranslations('common');
  const tErrors = useTranslations('auth.errors');
  const tValidation = useTranslations('validation');
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginFormData) => {
    setIsLoading(true);
    try {
      const result = await signIn('credentials', {
        email: data.email,
        password: data.password,
        redirect: false,
      });

      if (result?.error) {
        toast({
          variant: 'destructive',
          title: tErrors('invalidCredentials'),
          description: tErrors('invalidCredentials'),
        });
      } else {
        const redirectTo = getSafeRedirectUrl(callbackUrl, `/${locale}/dashboard`);
        router.push(redirectTo);
        router.refresh();
      }
    } catch {
      toast({
        variant: 'destructive',
        title: tCommon('errors.generic'),
        description: tErrors('generic'),
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left panel — brand showcase */}
      <div className="hidden lg:flex lg:w-[55%] relative bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-700 p-12 flex-col justify-between overflow-hidden">
        {/* Background pattern */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 left-0 w-96 h-96 bg-white rounded-full -translate-x-1/2 -translate-y-1/2" />
          <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-white rounded-full translate-x-1/4 translate-y-1/4" />
          <div className="absolute top-1/2 left-1/2 w-64 h-64 bg-white rounded-full -translate-x-1/2 -translate-y-1/2" />
        </div>

        <div className="relative z-10">
          <h1 className="text-4xl font-bold text-white tracking-tight">{tCommon('appName')}</h1>
          <p className="mt-2 text-blue-100 text-lg">{t('brandTagline')}</p>
        </div>

        <div className="relative z-10 space-y-6">
          {features.map((feature) => (
            <div key={feature.titleKey} className="flex items-start gap-4">
              <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-white/15 backdrop-blur-sm flex items-center justify-center">
                <feature.icon className="h-5 w-5 text-white" />
              </div>
              <div>
                <h3 className="text-white font-semibold text-sm">{t(feature.titleKey)}</h3>
                <p className="text-blue-100 text-sm mt-0.5">{t(feature.descKey)}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="relative z-10">
          <p className="text-blue-200 text-xs">{t('brandFooter')}</p>
        </div>
      </div>

      {/* Right panel — login form */}
      <div className="flex-1 flex flex-col">
        {/* Top bar */}
        <div className="flex items-center justify-between p-6">
          <span className="lg:hidden text-2xl font-bold text-primary">{tCommon('appName')}</span>
          <div className="ms-auto">
            <LanguageSwitcher />
          </div>
        </div>

        {/* Form centered */}
        <div className="flex-1 flex items-center justify-center px-6 pb-12">
          <div className="w-full max-w-sm space-y-8">
            <div>
              <h2 className="text-2xl font-bold tracking-tight">{t('title')}</h2>
              <p className="text-muted-foreground mt-1 text-sm">{t('subtitle')}</p>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email">{t('email')}</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder={t('emailPlaceholder')}
                  autoComplete="email"
                  {...register('email')}
                  className="h-11"
                />
                {errors.email && <p className="text-sm text-destructive">{tValidation('email')}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">{t('password')}</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder={t('passwordPlaceholder')}
                    autoComplete="current-password"
                    {...register('password')}
                    className="h-11 pe-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute end-1 top-1/2 -translate-y-1/2 h-8 w-8 text-muted-foreground"
                    onClick={() => setShowPassword(!showPassword)}
                    tabIndex={-1}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
                {errors.password && (
                  <p className="text-sm text-destructive">{tValidation('required')}</p>
                )}
              </div>

              <Button type="submit" className="w-full h-11 font-medium" disabled={isLoading}>
                {isLoading ? (
                  <span className="flex items-center gap-2">
                    <span className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    {t('signingIn')}
                  </span>
                ) : (
                  t('signIn')
                )}
              </Button>
            </form>

            <div className="text-center text-sm text-muted-foreground">
              {t('noAccount')}{' '}
              <Link href="/register" className="text-primary font-medium hover:underline">
                {t('signUp')}
              </Link>
            </div>

            <div className="text-center">
              <Link
                href="/onboarding"
                className="text-xs text-muted-foreground hover:text-primary transition-colors"
              >
                {t('learnMore')}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-background">
          <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
