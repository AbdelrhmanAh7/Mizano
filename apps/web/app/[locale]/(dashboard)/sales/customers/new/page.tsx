'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { CustomerForm } from '@/components/sales/customer-form';
import { useCreateCustomer } from '@/lib/hooks/use-customers';
import Link from 'next/link';

export default function NewCustomerPage() {
  const router = useRouter();
  const { toast } = useToast();

  const createCustomer = useCreateCustomer();

  const handleSubmit = async (data: any) => {
    try {
      await createCustomer.mutateAsync(data);
      toast({
        title: 'Customer created',
        description: 'The customer has been created successfully.',
      });
      router.push('/sales/customers');
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.response?.data?.message || 'Failed to create customer.',
        variant: 'destructive',
      });
    }
  };

  const handleCancel = () => {
    router.push('/sales/customers');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/sales/customers">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">New Customer</h1>
          <p className="text-muted-foreground">
            Add a new customer to your organization
          </p>
        </div>
      </div>

      {/* Form */}
      <CustomerForm
        onSubmit={handleSubmit}
        onCancel={handleCancel}
        isSubmitting={createCustomer.isPending}
      />
    </div>
  );
}
