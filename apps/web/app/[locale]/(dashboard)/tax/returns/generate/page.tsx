'use client';

import { useState } from 'react';
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
      toast({ title: 'VAT return generated successfully' });
      const returnId = result?.id || result?.data?.id;
      if (returnId) {
        router.push(`/tax/returns/${returnId}`);
      } else {
        router.push('/tax/returns');
      }
    } catch (error: unknown) {
      toast({
        title: 'Error',
        description:
          (error as { response?: { data?: { message?: string } } }).response?.data?.message ||
          'Failed to generate VAT return',
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
          <h1 className="text-3xl font-bold tracking-tight">Generate VAT Return</h1>
          <p className="text-muted-foreground">
            Select a period to calculate VAT from invoices, bills, and expenses
          </p>
        </div>
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Period Selection</CardTitle>
          <CardDescription>Choose the period for the VAT return calculation</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Quick Quarter Selection */}
          <div className="space-y-2">
            <Label>Quick Select Quarter</Label>
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
              <Label htmlFor="startDate">Start Date *</Label>
              <Input
                id="startDate"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="endDate">End Date *</Label>
              <Input
                id="endDate"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>

          <p className="text-sm text-muted-foreground">
            The system will calculate Output VAT from sales invoices and credit notes, and Input VAT
            from purchase bills and expenses within this period.
          </p>

          <div className="flex justify-end gap-3">
            <Button variant="outline" asChild>
              <Link href="/tax/returns">Cancel</Link>
            </Button>
            <Button
              onClick={handleGenerate}
              disabled={generateReturn.isPending || !startDate || !endDate}
            >
              <Calculator className="mr-2 h-4 w-4" />
              {generateReturn.isPending ? 'Generating...' : 'Generate Return'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
