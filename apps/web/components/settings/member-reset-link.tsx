'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Check, Copy, KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useCreateResetLink } from '@/lib/hooks/use-users';

/**
 * Lets an admin hand a member a one-time password reset link (WhatsApp, in person) when the
 * organization has no mail set up. The link is shown once and never stored in the browser.
 */
export function MemberResetLinkButton({ userId, name }: { userId: string; name: string }) {
  const t = useTranslations('settings.team.resetLink');
  const locale = useLocale();
  const createLink = useCreateResetLink();
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const create = async () => {
    const result = await createLink.mutateAsync({ id: userId, locale });
    setCopied(false);
    setLink(result.link);
  };

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={() => void create().catch(() => undefined)}
        disabled={createLink.isPending}
        aria-label={t('button', { name })}
        title={t('button', { name })}
      >
        <KeyRound className="h-4 w-4" />
      </Button>
      <Dialog open={link !== null} onOpenChange={(open) => !open && setLink(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('title', { name })}</DialogTitle>
            <DialogDescription>{t('description')}</DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2">
            <Input readOnly dir="ltr" value={link ?? ''} aria-label={t('linkLabel')} />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0"
              onClick={() => {
                if (link) void navigator.clipboard?.writeText(link).then(() => setCopied(true));
              }}
            >
              {copied ? (
                <Check className="me-1 h-3.5 w-3.5" />
              ) : (
                <Copy className="me-1 h-3.5 w-3.5" />
              )}
              {copied ? t('copied') : t('copy')}
            </Button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLink(null)}>
              {t('close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
