'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { authApi } from '@/lib/api';
import { LanguageSwitcher } from '@/components/layout/language-switcher';

// Same password policy as the API's RegisterDto, so the form never sends a password the server
// rejects with an untranslated "Validation Failed".
const registerSchema = z
  .object({
    firstName: z.string().min(2),
    lastName: z.string().min(2),
    email: z.string().email(),
    password: z
      .string()
      .min(8, 'passwordMin')
      .max(128, 'passwordMax')
      .regex(/[A-Z]/, 'passwordUppercase')
      .regex(/[a-z]/, 'passwordLowercase')
      .regex(/[0-9]/, 'passwordNumber'),
    confirmPassword: z.string(),
    organizationName: z.string().min(2),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ['confirmPassword'],
  });

const PASSWORD_RULES = [
  'passwordMin',
  'passwordMax',
  'passwordUppercase',
  'passwordLowercase',
  'passwordNumber',
] as const;
type PasswordRule = (typeof PASSWORD_RULES)[number];

function passwordRule(message: string | undefined): PasswordRule {
  return PASSWORD_RULES.find((rule) => rule === message) ?? 'passwordMin';
}

type RegisterForm = z.infer<typeof registerSchema>;

export default function RegisterPage() {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations('auth.register');
  const tErrors = useTranslations('auth.errors');
  const tValidation = useTranslations('validation');
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
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
      });

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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 p-4">
      <div className="absolute top-4 end-4">
        <LanguageSwitcher />
      </div>
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
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
