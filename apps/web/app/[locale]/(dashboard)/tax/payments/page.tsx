'use client';

import Link from 'next/link';
import { CreditCard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export default function VATPaymentsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">VAT Payments</h1>
          <p className="text-muted-foreground">
            View payments made for VAT returns
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="py-12 text-center">
          <CreditCard className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">VAT Payments</h3>
          <p className="text-muted-foreground mb-4">
            Payments are recorded directly from filed VAT returns.
            Navigate to a filed VAT return to record a payment.
          </p>
          <Button asChild>
            <Link href="/tax/returns">View VAT Returns</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
