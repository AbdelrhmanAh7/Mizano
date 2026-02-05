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
          <h1 className="text-3xl font-bold tracking-tight">Create BOM</h1>
          <p className="text-muted-foreground">
            Define a new bill of materials for manufacturing
          </p>
        </div>
      </div>

      {/* Form */}
      <BOMForm />
    </div>
  );
}
