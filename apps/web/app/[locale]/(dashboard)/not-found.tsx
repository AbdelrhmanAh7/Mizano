'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { FileQuestion, Home } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

export default function DashboardNotFound() {
  const t = useTranslations('common');

  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <Card className="max-w-md w-full">
        <CardContent className="pt-6 text-center space-y-4">
          <div className="flex justify-center">
            <div className="rounded-full bg-muted p-3">
              <FileQuestion className="h-6 w-6 text-muted-foreground" />
            </div>
          </div>
          <div>
            <h2 className="text-lg font-semibold">{t('notFound.title')}</h2>
            <p className="text-sm text-muted-foreground mt-1">{t('notFound.description')}</p>
          </div>
          <div className="flex items-center justify-center gap-2">
            <Button variant="outline" className="gap-2" asChild>
              <Link href="/dashboard">
                <Home className="h-4 w-4" />
                {t('dashboard.title')}
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
