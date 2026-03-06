'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { PaymentMadeForm } from '@/components/purchases/payment-made-form';
import { useCreatePaymentMade } from '@/lib/hooks/use-payments-made';
import { useVendors } from '@/lib/hooks/use-vendors';
import { useQuery } from '@tanstack/react-query';
import { accountsApi } from '@/lib/api';

export default function NewPaymentMadePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const createPayment = useCreatePaymentMade();

  // Get preselected vendor and bill from query params
  const preselectedVendorId = searchParams.get('vendorId') || undefined;
  const preselectedBillId = searchParams.get('billId') || undefined;

  // Fetch vendors
  const { data: vendorsData, isLoading: vendorsLoading } = useVendors();

  // Fetch accounts
  const { data: accountsData, isLoading: accountsLoading } = useQuery({
    queryKey: ['accounts'],
    queryFn: async () => {
      const response = await accountsApi.getAll();
      return response.data;
    },
  });

  const vendors = vendorsData?.data || [];
  const accounts = accountsData?.data || [];

  const handleSubmit = async (data: Record<string, unknown>) => {
    try {
      await createPayment.mutateAsync(data);
      router.push('/purchases/payments');
    } catch (error) {
      // Error is handled in the hook
    }
  };

  if (vendorsLoading || accountsLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild aria-label="Go back">
          <Link href="/purchases/payments">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Record Payment</h1>
          <p className="text-muted-foreground">Record a payment made to a vendor</p>
        </div>
      </div>

      {/* Form */}
      <PaymentMadeForm
        vendors={vendors}
        accounts={accounts}
        onSubmit={handleSubmit}
        onCancel={() => router.push('/purchases/payments')}
        isSubmitting={createPayment.isPending}
        preselectedVendorId={preselectedVendorId}
        preselectedBillId={preselectedBillId}
      />
    </div>
  );
}
