'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Calculator } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { useGenerateVATReturn } from '@/lib/hooks/use-tax';

export default function GenerateVATReturnPage() {
  const t = useTranslations('tax');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const { toast } = useToast();
  const generateReturn = useGenerateVATReturn();

  const now = new Date();
  const quarterStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
  const quarterEnd = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3 + 3, 0);

  const [startDate, setStartDate] = useState(quarterStart.toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(quarterEnd.toISOString().split('T')[0]);

  const handleGenerate = async () => {
    try {
      const result = await generateReturn.mutateAsync({ startDate, endDate });
      toast({ title: t('generate.generateSuccess') });
      const returnId = result?.id || result?.data?.id;
      if (returnId) {
        router.push(`/tax/returns/${returnId}`);
      } else {
        router.push('/tax/returns');
      }
    } catch (error: unknown) {
      toast({
        title: tCommon('errors.generic'),
        description:
          (error as { response?: { data?: { message?: string } } }).response?.data?.message ||
          t('generate.generateFail'),
        variant: 'destructive',
      });
    }
  };

  const setQuarter = (quarter: number) => {
    const year = now.getFullYear();
    const start = new Date(year, (quarter - 1) * 3, 1);
    const end = new Date(year, quarter * 3, 0);
    setStartDate(start.toISOString().split('T')[0]);
    setEndDate(end.toISOString().split('T')[0]);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild aria-label="Go back">
          <Link href="/tax/returns">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('generate.title')}</h1>
          <p className="text-muted-foreground">{t('generate.description')}</p>
        </div>
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>{t('generate.periodSelection')}</CardTitle>
          <CardDescription>{t('generate.periodDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Quick Quarter Selection */}
          <div className="space-y-2">
            <Label>{t('generate.quickSelectQuarter')}</Label>
            <div className="flex gap-2">
              {[1, 2, 3, 4].map((q) => (
                <Button key={q} variant="outline" size="sm" onClick={() => setQuarter(q)}>
                  Q{q} {now.getFullYear()}
                </Button>
              ))}
            </div>
          </div>

          {/* Date Range */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="startDate">{t('generate.startDate')} *</Label>
              <Input
                id="startDate"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="endDate">{t('generate.endDate')} *</Label>
              <Input
                id="endDate"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>

          <p className="text-sm text-muted-foreground">{t('generate.calculationNote')}</p>

          <div className="flex justify-end gap-3">
            <Button variant="outline" asChild>
              <Link href="/tax/returns">{tCommon('buttons.cancel')}</Link>
            </Button>
            <Button
              onClick={handleGenerate}
              disabled={generateReturn.isPending || !startDate || !endDate}
            >
              <Calculator className="mr-2 h-4 w-4" />
              {generateReturn.isPending ? t('generate.generating') : t('generate.generateButton')}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
