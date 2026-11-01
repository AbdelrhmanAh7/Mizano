'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ArrowDown, ArrowUp, LayoutDashboard, RotateCcw } from 'lucide-react';
import { useDashboardLayout } from '@/lib/stores/use-dashboard-layout';

// Translation key of each widget (common.dashboard.customizer.widgets); unknown ids keep
// the label the layout store gives them.
const WIDGET_KEYS: Record<string, string> = {
  'kpi-row-1': 'kpiRow1',
  'kpi-row-2': 'kpiRow2',
  'cash-flow-revenue': 'cashFlowRevenue',
  'ar-ap-expenses': 'arApExpenses',
  'profit-customers': 'profitCustomers',
  'bank-inventory': 'bankInventory',
  'insights-transactions': 'insightsTransactions',
  'projects-bank-accounts': 'projectsBankAccounts',
};

export function WidgetCustomizer() {
  const t = useTranslations('common.dashboard.customizer');
  const { widgets, toggleWidget, moveWidget, resetLayout, saveToServer, isEditing, setEditing } =
    useDashboardLayout();

  const sorted = [...widgets].sort((a, b) => a.order - b.order);

  const handleClose = async (open: boolean) => {
    if (!open) {
      await saveToServer();
    }
    setEditing(open);
  };

  return (
    <Sheet open={isEditing} onOpenChange={handleClose}>
      <SheetTrigger asChild>
        <Button variant="outline" size="icon" title={t('title')} aria-label={t('title')}>
          <LayoutDashboard className="h-4 w-4" />
        </Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{t('title')}</SheetTitle>
          <SheetDescription>{t('description')}</SheetDescription>
        </SheetHeader>
        <ScrollArea className="h-[calc(100vh-240px)] mt-6 pr-4">
          <div className="space-y-3">
            {sorted.map((widget, index) => (
              <div
                key={widget.id}
                className="flex items-center justify-between rounded-lg border p-3"
              >
                <div className="flex items-center gap-3">
                  <Switch
                    checked={widget.visible}
                    onCheckedChange={() => toggleWidget(widget.id)}
                  />
                  <span className="text-sm font-medium">
                    {WIDGET_KEYS[widget.id] ? t(`widgets.${WIDGET_KEYS[widget.id]}`) : widget.label}
                  </span>
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    disabled={index === 0}
                    onClick={() => moveWidget(widget.id, 'up')}
                    aria-label={t('moveUp')}
                  >
                    <ArrowUp className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    disabled={index === sorted.length - 1}
                    onClick={() => moveWidget(widget.id, 'down')}
                    aria-label={t('moveDown')}
                  >
                    <ArrowDown className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
        <div className="mt-6">
          <Button variant="outline" className="w-full" onClick={resetLayout}>
            <RotateCcw className="h-4 w-4 mr-2" />
            {t('reset')}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
