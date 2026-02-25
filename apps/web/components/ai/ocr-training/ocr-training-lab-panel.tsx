'use client';

import { useState } from 'react';
import { Database, CheckCircle2, FileStack, TrendingUp, ChevronDown } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { OcrTrainingViewer } from './ocr-training-viewer';
import { VendorTrainingHistory } from './vendor-training-history';
import { OcrBatchTrainer } from './ocr-batch-trainer';
import { useOcrTrainingStats } from '@/lib/hooks/use-ocr-training';

export function OcrTrainingLabPanel() {
  const [selectedVendorId, setSelectedVendorId] = useState('');
  const [batchOpen, setBatchOpen] = useState(false);
  const { data: statsData } = useOcrTrainingStats();
  const stats = statsData?.data;

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10">
                <Database className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats?.totalVendorLayouts ?? '-'}</p>
                <p className="text-xs text-muted-foreground">Vendor Layouts</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-green-100">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats?.activeLayouts ?? '-'}</p>
                <p className="text-xs text-muted-foreground">Active (3+ samples)</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-100">
                <FileStack className="h-4 w-4 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats?.totalSamples ?? '-'}</p>
                <p className="text-xs text-muted-foreground">Total Samples</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-100">
                <TrendingUp className="h-4 w-4 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats?.recentCorrections ?? '-'}</p>
                <p className="text-xs text-muted-foreground">Corrections (7d)</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Training Interface */}
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <OcrTrainingViewer
            vendorId={selectedVendorId}
            onVendorChange={setSelectedVendorId}
            showVendorSelector
          />
        </div>
        <div className="lg:col-span-2">
          <VendorTrainingHistory vendorId={selectedVendorId} />
        </div>
      </div>

      {/* Batch Training (toggle section) */}
      <div>
        <Button
          variant="outline"
          className="w-full justify-between"
          onClick={() => setBatchOpen((prev) => !prev)}
        >
          <span className="flex items-center gap-2">
            <FileStack className="h-4 w-4" />
            Batch Training — Upload multiple images for a vendor
          </span>
          <ChevronDown
            className={`h-4 w-4 transition-transform ${batchOpen ? 'rotate-180' : ''}`}
          />
        </Button>
        {batchOpen && (
          <div className="pt-4">
            <OcrBatchTrainer preselectedVendorId={selectedVendorId} />
          </div>
        )}
      </div>
    </div>
  );
}
