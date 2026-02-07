'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BOMForm } from '@/components/manufacturing/bom-form';

export default function NewBOMPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/manufacturing/bom">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">New Bill of Materials</h1>
          <p className="text-muted-foreground">
            Define a product recipe with raw materials
          </p>
        </div>
      </div>

      {/* Form */}
      <BOMForm />
    </div>
  );
}
