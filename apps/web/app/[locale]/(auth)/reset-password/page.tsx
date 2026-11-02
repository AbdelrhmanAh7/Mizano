'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
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
import { getApiErrorCode, getApiErrorMessage } from '@/lib/api-error';
import { passwordRule, passwordSchema } from '@/lib/password-policy';
import { LanguageSwitcher } from '@/components/layout/language-switcher';
import { AuthCardLogo } from '@/components/brand/auth-card-logo';

const resetSchema = z
  .object({ password: passwordSchema, confirmPassword: z.string() })
  .refine((data) => data.password === data.confirmPassword, { path: ['confirmPassword'] });
type ResetForm = z.infer<typeof resetSchema>;

type Stage = 'loading' | 'form' | 'done' | 'invalid';

/** The token from `#token=…`: the fragment never reaches a server, a log or a Referer. */
function readTokenFromHash(): string | null {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  return params.get('token');
}

export default function ResetPasswordPage() {
  const t = useTranslations('auth.resetPassword');
  const tErrors = useTranslations('auth.errors');
  const tValidation = useTranslations('validation');
  const { toast } = useToast();
  const [token, setToken] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>('loading');
  const [isSaving, setIsSaving] = useState(false);
  // Survives Strict Mode's second effect run, which sees the fragment already cleared.
  const tokenRef = useRef<string | null>(null);

  useEffect(() => {
    tokenRef.current ??= readTokenFromHash();
    if (window.location.hash) {
      // Drop the token from the address bar and history.
      window.history.replaceState(null, '', window.location.pathname);
    }
    setToken(tokenRef.current);
    setStage(tokenRef.current ? 'form' : 'invalid');
  }, []);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetForm>({ resolver: zodResolver(resetSchema) });

  const onSubmit = async (data: ResetForm) => {
    if (!token) return;
    setIsSaving(true);
    try {
      await authApi.resetPassword(token, data.password);
      setStage('done');
    } catch (error: unknown) {
      if (getApiErrorCode(error) === 'PASSWORD_RESET_INVALID') {
        setStage('invalid');
      } else {
        toast({
          variant: 'destructive',
          title: tErrors('generic'),
          description: getApiErrorMessage(error, tErrors('generic')),
        });
      }
    } finally {
      setIsSaving(false);
    }
  };

  const title =
    stage === 'done' ? t('doneTitle') : stage === 'invalid' ? t('invalidTitle') : t('title');

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand/5 to-accent p-4">
      <div className="absolute top-4 end-4">
        <LanguageSwitcher />
      </div>
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
          <AuthCardLogo />
          <CardTitle className="text-2xl font-bold tracking-tight">{title}</CardTitle>
          {stage === 'form' && <CardDescription>{t('subtitle')}</CardDescription>}
        </CardHeader>
        <CardContent className="space-y-4">
          {stage === 'loading' && (
            <div className="flex justify-center py-6" aria-busy="true">
              <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {stage === 'form' && (
            <form method="post" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">{t('password')}</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  placeholder={t('passwordPlaceholder')}
                  {...register('password')}
                />
                {errors.password && (
                  <p className="text-sm text-destructive">
                    {tValidation(passwordRule(errors.password.message))}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">{t('confirmPassword')}</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  placeholder={t('confirmPasswordPlaceholder')}
                  {...register('confirmPassword')}
                />
                {errors.confirmPassword && (
                  <p className="text-sm text-destructive">{tValidation('passwordMismatch')}</p>
                )}
              </div>
              <Button type="submit" className="w-full" disabled={isSaving}>
                {isSaving ? t('saving') : t('submit')}
              </Button>
            </form>
          )}

          {stage === 'done' && (
            <div className="space-y-4 text-center">
              <p className="text-sm text-muted-foreground" role="status">
                {t('doneBody')}
              </p>
              <Button asChild className="w-full">
                <Link href="/login">{t('signIn')}</Link>
              </Button>
            </div>
          )}

          {stage === 'invalid' && (
            <div className="space-y-4 text-center">
              <p className="text-sm text-muted-foreground" role="alert">
                {t('invalidBody')}
              </p>
              <Button asChild className="w-full">
                <Link href="/forgot-password">{t('requestNew')}</Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
