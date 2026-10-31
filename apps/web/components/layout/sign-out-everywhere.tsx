'use client';

import { useState } from 'react';
import { signOut } from 'next-auth/react';
import { useLocale, useTranslations } from 'next-intl';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/components/ui/use-toast';
import { authApi } from '@/lib/api';

interface SignOutEverywhereDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Confirms, ends every session of the account on the server, then signs this browser out. */
export function SignOutEverywhereDialog({
  open,
  onOpenChange,
}: SignOutEverywhereDialogProps): JSX.Element {
  const locale = useLocale();
  const t = useTranslations('common.header');
  const tButtons = useTranslations('common.buttons');
  const { toast } = useToast();
  const [isPending, setIsPending] = useState(false);

  const confirm = async (event: React.MouseEvent) => {
    event.preventDefault();
    setIsPending(true);
    try {
      await authApi.logoutAll();
      await signOut({ callbackUrl: `/${locale}/login` });
    } catch {
      setIsPending(false);
      toast({ variant: 'destructive', title: t('signOutEverywhereFailed') });
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={(next) => !isPending && onOpenChange(next)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('signOutEverywhereTitle')}</AlertDialogTitle>
          <AlertDialogDescription>{t('signOutEverywhereBody')}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>{tButtons('cancel')}</AlertDialogCancel>
          <AlertDialogAction onClick={confirm} disabled={isPending}>
            {t('signOutEverywhereConfirm')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
