'use client';

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useInvoiceStatus,
  useQuoteConversion,
  useInvoiceVolume,
  usePaymentCollection,
  useChurnRisk,
  useCLVSegments,
} from '@/lib/hooks/use-dashboard-sections';
import { InvoiceStatusChart } from '@/components/dashboard/charts/invoice-status-chart';
import { QuoteConversionChart } from '@/components/dashboard/charts/quote-conversion-chart';
import { MonthlyInvoiceVolumeChart } from '@/components/dashboard/charts/monthly-invoice-volume-chart';
import { PaymentCollectionChart } from '@/components/dashboard/charts/payment-collection-chart';
import { CustomerChurnRiskChart } from '@/components/dashboard/charts/customer-churn-risk-chart';
import { CustomerLTVChart } from '@/components/dashboard/charts/customer-ltv-chart';

function ChartSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <Skeleton className="h-5 w-32" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-[250px] w-full rounded" />
      </CardContent>
    </Card>
  );
}

interface SalesSectionProps {
  enabled: boolean;
}

export function SalesSection({ enabled }: SalesSectionProps) {
  const { data: invoiceStatusData } = useInvoiceStatus(enabled);
  const { data: quoteData } = useQuoteConversion(enabled);
  const { data: volumeData } = useInvoiceVolume(enabled);
  const { data: collectionData } = usePaymentCollection(enabled);
  const { data: churnData } = useChurnRisk(enabled);
  const { data: clvData } = useCLVSegments(enabled);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {invoiceStatusData ? <InvoiceStatusChart data={invoiceStatusData} /> : <ChartSkeleton />}
        {quoteData ? <QuoteConversionChart data={quoteData} /> : <ChartSkeleton />}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {volumeData ? <MonthlyInvoiceVolumeChart data={volumeData} /> : <ChartSkeleton />}
        {collectionData ? <PaymentCollectionChart data={collectionData} /> : <ChartSkeleton />}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {churnData ? <CustomerChurnRiskChart data={churnData} /> : <ChartSkeleton />}
        {clvData ? <CustomerLTVChart data={clvData} /> : <ChartSkeleton />}
      </div>
    </div>
  );
}
