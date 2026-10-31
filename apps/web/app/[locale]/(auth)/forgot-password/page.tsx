'use client';

import { useState } from 'react';
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
import { getApiErrorMessage } from '@/lib/api-error';
import { LanguageSwitcher } from '@/components/layout/language-switcher';

const forgotSchema = z.object({ email: z.string().email() });
type ForgotForm = z.infer<typeof forgotSchema>;

export default function ForgotPasswordPage() {
  const locale = useLocale();
  const t = useTranslations('auth.forgotPassword');
  const tErrors = useTranslations('auth.errors');
  const tValidation = useTranslations('validation');
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotForm>({ resolver: zodResolver(forgotSchema) });

  const onSubmit = async (data: ForgotForm) => {
    setIsLoading(true);
    try {
      await authApi.forgotPassword(data.email, locale);
      setSentTo(data.email);
    } catch (error: unknown) {
      toast({
        variant: 'destructive',
        title: tErrors('generic'),
        description: getApiErrorMessage(error, tErrors('generic')),
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
          <CardTitle className="text-2xl font-bold tracking-tight">
            {sentTo ? t('sentTitle') : t('title')}
          </CardTitle>
          {!sentTo && <CardDescription>{t('subtitle')}</CardDescription>}
        </CardHeader>
        <CardContent className="space-y-4">
          {sentTo ? (
            <div className="space-y-4 text-center">
              <p className="text-sm text-muted-foreground" role="status">
                {t('sentBody', { email: sentTo })}
              </p>
              <Button variant="outline" className="w-full" onClick={() => setSentTo(null)}>
                {t('tryAgain')}
              </Button>
            </div>
          ) : (
            <form method="post" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">{t('email')}</Label>
                <Input
                  id="email"
                  type="email"
                  dir="ltr"
                  autoComplete="email"
                  placeholder={t('emailPlaceholder')}
                  {...register('email')}
                />
                {errors.email && <p className="text-sm text-destructive">{tValidation('email')}</p>}
              </div>
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? t('sending') : t('sendResetLink')}
              </Button>
            </form>
          )}
          <div className="text-center text-sm">
            <Link href="/login" className="text-primary hover:underline">
              {t('backToLogin')}
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
