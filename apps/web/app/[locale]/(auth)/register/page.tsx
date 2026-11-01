'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { authApi } from '@/lib/api';
import { LanguageSwitcher } from '@/components/layout/language-switcher';
import { AuthCardLogo } from '@/components/brand/auth-card-logo';
import { passwordRule, passwordSchema } from '@/lib/password-policy';

/** Countries a new organization can start in, with the base currency each one sets. */
const COUNTRIES = [
  { code: 'EG', currency: 'EGP' },
  { code: 'SA', currency: 'SAR' },
  { code: 'AE', currency: 'AED' },
] as const;

const registerSchema = z
  .object({
    firstName: z.string().min(2),
    lastName: z.string().min(2),
    email: z.string().email(),
    password: passwordSchema,
    confirmPassword: z.string(),
    organizationName: z.string().min(2),
    country: z.enum(['EG', 'SA', 'AE']),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ['confirmPassword'],
  });

type RegisterForm = z.infer<typeof registerSchema>;

export default function RegisterPage() {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations('auth.register');
  const tErrors = useTranslations('auth.errors');
  const tValidation = useTranslations('validation');
  const tLegal = useTranslations('legal.common');
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  // Country and currency names in the screen's language, from the browser's own data.
  const countryOptions = useMemo(() => {
    const regions = new Intl.DisplayNames([locale], { type: 'region' });
    const currencies = new Intl.DisplayNames([locale], { type: 'currency' });
    return COUNTRIES.map(({ code, currency }) => ({
      code,
      label: `${regions.of(code) ?? code} (${currencies.of(currency) ?? currency})`,
    }));
  }, [locale]);

  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: { country: 'EG' },
  });

  const onSubmit = async (data: RegisterForm) => {
    setIsLoading(true);
    try {
      await authApi.register({
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        password: data.password,
        organizationName: data.organizationName,
        country: data.country,
      });

      // Straight in: sign in with the new account and start on the dashboard, where the first-use
      // tour begins. Only if that sign-in fails is the person sent to Sign In (TestSprite theme 1).
      const signedIn = await signIn('credentials', {
        email: data.email,
        password: data.password,
        redirect: false,
      }).catch(() => undefined);
      if (signedIn?.ok && !signedIn.error) {
        toast({ title: t('accountCreated') });
        router.push(`/${locale}/dashboard`);
        router.refresh();
        return;
      }
      toast({
        title: t('accountCreated'),
        description: t('accountCreatedDescription'),
      });
      router.push(`/${locale}/login`);
    } catch (error: unknown) {
      const status = (error as { response?: { status?: number } }).response?.status;
      toast({
        variant: 'destructive',
        title: tErrors('generic'),
        description: status === 409 ? tErrors('emailExists') : tErrors('generic'),
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-teal-50 to-cyan-100 dark:from-gray-900 dark:to-gray-800 p-4">
      <div className="absolute top-4 end-4">
        <LanguageSwitcher />
      </div>
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
          <AuthCardLogo />
          <CardTitle className="text-3xl font-bold tracking-tight">{t('title')}</CardTitle>
          <CardDescription>{t('subtitle')}</CardDescription>
        </CardHeader>
        <CardContent>
          {/* method="post": a submit before hydration must never put the password in the URL. */}
          <form method="post" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName">{t('firstName')}</Label>
                <Input
                  id="firstName"
                  placeholder={t('firstNamePlaceholder')}
                  {...register('firstName')}
                />
                {errors.firstName && (
                  <p className="text-sm text-red-500">{tValidation('nameMin')}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">{t('lastName')}</Label>
                <Input
                  id="lastName"
                  placeholder={t('lastNamePlaceholder')}
                  {...register('lastName')}
                />
                {errors.lastName && (
                  <p className="text-sm text-red-500">{tValidation('nameMin')}</p>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="organizationName">{t('organizationName')}</Label>
              <Input
                id="organizationName"
                placeholder={t('organizationPlaceholder')}
                {...register('organizationName')}
              />
              {errors.organizationName && (
                <p className="text-sm text-red-500">{tValidation('organizationMin')}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="country">{t('country')}</Label>
              <Controller
                control={control}
                name="country"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="country" aria-describedby="country-hint">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {countryOptions.map((option) => (
                        <SelectItem key={option.code} value={option.code}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <p id="country-hint" className="text-xs text-muted-foreground">
                {t('countryHint')}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">{t('email')}</Label>
              <Input
                id="email"
                type="email"
                placeholder={t('emailPlaceholder')}
                {...register('email')}
              />
              {errors.email && <p className="text-sm text-red-500">{tValidation('email')}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">{t('password')}</Label>
              <Input
                id="password"
                type="password"
                placeholder={t('passwordPlaceholder')}
                {...register('password')}
              />
              {errors.password && (
                <p className="text-sm text-red-500">
                  {tValidation(passwordRule(errors.password.message))}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">{t('confirmPassword')}</Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder={t('confirmPasswordPlaceholder')}
                {...register('confirmPassword')}
              />
              {errors.confirmPassword && (
                <p className="text-sm text-red-500">{tValidation('passwordMismatch')}</p>
              )}
            </div>
            <p className="text-xs leading-5 text-muted-foreground">
              {tLegal.rich('agreement', {
                terms: (chunks) => (
                  <Link
                    href="/terms"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline"
                  >
                    {chunks}
                    <span className="sr-only"> ({tLegal('newTab')})</span>
                  </Link>
                ),
                privacy: (chunks) => (
                  <Link
                    href="/privacy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline"
                  >
                    {chunks}
                    <span className="sr-only"> ({tLegal('newTab')})</span>
                  </Link>
                ),
              })}
            </p>
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? t('creatingAccount') : t('signUp')}
            </Button>
          </form>
          <div className="mt-4 text-center text-sm">
            {t('hasAccount')}{' '}
            <Link href="/login" className="text-primary hover:underline">
              {t('signIn')}
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
