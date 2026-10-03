'use client';

import { useDocumentMoney } from '@/lib/hooks/use-organization';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DollarSign,
  Clock,
  TrendingUp,
  TrendingDown,
  Package,
  Users,
  FolderKanban,
  AlertTriangle,
  Flame,
  Landmark,
} from 'lucide-react';

// ─── Value formatting helpers ───────────────────────────────────────

function isCurrencyKey(key: string): boolean {
  return /amount|value|revenue|balance|cashIn|cashOut|netCashFlow|current|previous|budget|estimatedRevenue/i.test(
    key,
  );
}

function isPercentKey(key: string): boolean {
  return /increase|change|budgetUsed|rate/i.test(key);
}

function isDaysKey(key: string): boolean {
  return /days|avgDays/i.test(key);
}

function formatValue(key: string, value: unknown, money: (amount: number) => string): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'number') {
    if (isPercentKey(key)) return `${value.toFixed(1)}%`;
    if (isCurrencyKey(key)) return money(value);
    if (isDaysKey(key)) return `${Math.round(value)} days`;
    return Number.isInteger(value) ? value.toString() : value.toFixed(2);
  }
  return String(value);
}

function humanizeKey(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/[_-]/g, ' ')
    .replace(/^\w/, (c) => c.toUpperCase())
    .trim();
}

// ─── Icon mapping for scalar stat keys ──────────────────────────────

function getStatIcon(key: string) {
  if (/balance|bankBalance/i.test(key)) return <Landmark className="h-4 w-4 text-emerald-500" />;
  if (/cashIn|revenue/i.test(key)) return <TrendingUp className="h-4 w-4 text-green-500" />;
  if (/cashOut|expense/i.test(key)) return <TrendingDown className="h-4 w-4 text-red-500" />;
  if (/netCashFlow|amount|value|budget/i.test(key))
    return <DollarSign className="h-4 w-4 text-blue-500" />;
  if (/days|avgDays/i.test(key)) return <Clock className="h-4 w-4 text-amber-500" />;
  if (/burn/i.test(key)) return <Flame className="h-4 w-4 text-orange-500" />;
  if (/change|increase|rate/i.test(key)) return <TrendingUp className="h-4 w-4 text-purple-500" />;
  return null;
}

// ─── Array renderers ────────────────────────────────────────────────

interface SlowPayer {
  name: string;
  avgDays: number;
  days?: number[];
}

interface ExpenseAnomaly {
  accountName?: string;
  accountId?: string;
  current: number;
  previous: number;
  increase: number;
}

interface LowStockItem {
  name: string;
  sku?: string;
  currentStock: number;
  reorderPoint: number;
}

interface OverBudgetProject {
  name: string;
  hoursLogged: number;
  budget: number;
  budgetUsed: number;
  estimatedRevenue?: number;
}

interface MonthlyRevenue {
  month: string;
  revenue: number;
}

function SlowPayersTable({ data }: { data: SlowPayer[] }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <Users className="h-4 w-4" />
        Slow Paying Customers
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Customer</TableHead>
            <TableHead className="text-right">Avg. Payment Time</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((payer, i) => (
            <TableRow key={i}>
              <TableCell className="font-medium">{payer.name}</TableCell>
              <TableCell className="text-right">
                <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                  {Math.round(payer.avgDays)} days
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function AnomaliesTable({ data }: { data: ExpenseAnomaly[] }) {
  const money = useDocumentMoney();
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <AlertTriangle className="h-4 w-4" />
        Expense Anomalies
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Account</TableHead>
            <TableHead className="text-right">Previous</TableHead>
            <TableHead className="text-right">Current</TableHead>
            <TableHead className="text-right">Increase</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((a, i) => (
            <TableRow key={i}>
              <TableCell className="font-medium">{a.accountName || a.accountId || '—'}</TableCell>
              <TableCell className="text-right font-mono text-muted-foreground">
                {formatValue('amount', a.previous, money)}
              </TableCell>
              <TableCell className="text-right font-mono font-semibold">
                {formatValue('amount', a.current, money)}
              </TableCell>
              <TableCell className="text-right">
                <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                  +{a.increase.toFixed(0)}%
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function LowStockTable({ data }: { data: LowStockItem[] }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <Package className="h-4 w-4" />
        Low Stock Items
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Item</TableHead>
            <TableHead>SKU</TableHead>
            <TableHead className="text-right">Stock</TableHead>
            <TableHead className="text-right">Reorder Point</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((item, i) => (
            <TableRow key={i}>
              <TableCell className="font-medium">{item.name}</TableCell>
              <TableCell className="text-muted-foreground font-mono text-sm">
                {item.sku || '—'}
              </TableCell>
              <TableCell className="text-right">
                <Badge
                  variant="outline"
                  className={
                    item.currentStock <= 0
                      ? 'bg-red-50 text-red-700 border-red-200'
                      : 'bg-amber-50 text-amber-700 border-amber-200'
                  }
                >
                  {item.currentStock}
                </Badge>
              </TableCell>
              <TableCell className="text-right font-mono">{item.reorderPoint}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function ProjectsTable({ data }: { data: OverBudgetProject[] }) {
  const money = useDocumentMoney();
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <FolderKanban className="h-4 w-4" />
        Projects Over Budget
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Project</TableHead>
            <TableHead className="text-right">Hours</TableHead>
            <TableHead className="text-right">Budget</TableHead>
            <TableHead className="text-right">Used</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((p, i) => (
            <TableRow key={i}>
              <TableCell className="font-medium">{p.name}</TableCell>
              <TableCell className="text-right font-mono">{p.hoursLogged.toFixed(1)}h</TableCell>
              <TableCell className="text-right font-mono">
                {formatValue('budget', p.budget, money)}
              </TableCell>
              <TableCell className="text-right">
                <Badge
                  variant="outline"
                  className={
                    p.budgetUsed >= 100
                      ? 'bg-red-50 text-red-700 border-red-200'
                      : 'bg-amber-50 text-amber-700 border-amber-200'
                  }
                >
                  {p.budgetUsed.toFixed(0)}%
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function RevenueChart({ data }: { data: MonthlyRevenue[] }) {
  const money = useDocumentMoney();
  const max = Math.max(...data.map((m) => m.revenue), 1);
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <TrendingUp className="h-4 w-4" />
        Revenue Trend
      </div>
      <div className="flex items-end gap-2 h-32">
        {data.map((m, i) => (
          <div key={i} className="flex-1 flex flex-col items-center gap-1">
            <span className="text-[10px] font-mono text-muted-foreground">
              {formatValue('revenue', m.revenue, money)}
            </span>
            <div
              className="w-full bg-blue-500/80 rounded-t-sm transition-all"
              style={{ height: `${(m.revenue / max) * 100}%`, minHeight: 2 }}
            />
            <span className="text-[11px] text-muted-foreground">{m.month}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Scalar stat card ───────────────────────────────────────────────

function StatRow({ label, value }: { label: string; value: string; icon?: React.ReactNode }) {
  const icon = getStatIcon(label);
  return (
    <div className="flex items-center justify-between py-2.5 border-b last:border-0">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        {icon}
        {humanizeKey(label)}
      </div>
      <span className="font-mono font-semibold text-sm">{value}</span>
    </div>
  );
}

// ─── Main component ─────────────────────────────────────────────────

interface InsightDataViewerProps {
  data: Record<string, unknown>;
}

export function InsightDataViewer({ data }: InsightDataViewerProps) {
  const money = useDocumentMoney();
  const entries = Object.entries(data);
  const scalarEntries = entries.filter(([, v]) => typeof v !== 'object' || v === null);
  const arrayEntries = entries.filter(([, v]) => Array.isArray(v)) as [string, unknown[]][];

  // Check for known array shapes
  const knownArrays: React.ReactNode[] = [];
  const unknownArrays: [string, unknown[]][] = [];

  for (const [key, arr] of arrayEntries) {
    if (key === 'slowPayers' && arr.length > 0) {
      knownArrays.push(<SlowPayersTable key={key} data={arr as SlowPayer[]} />);
    } else if (key === 'anomalies' && arr.length > 0) {
      knownArrays.push(<AnomaliesTable key={key} data={arr as ExpenseAnomaly[]} />);
    } else if (key === 'items' && arr.length > 0 && 'currentStock' in (arr[0] as object)) {
      knownArrays.push(<LowStockTable key={key} data={arr as LowStockItem[]} />);
    } else if (key === 'projects' && arr.length > 0) {
      knownArrays.push(<ProjectsTable key={key} data={arr as OverBudgetProject[]} />);
    } else if (key === 'months' && arr.length > 0 && 'month' in (arr[0] as object)) {
      knownArrays.push(<RevenueChart key={key} data={arr as MonthlyRevenue[]} />);
    } else {
      unknownArrays.push([key, arr]);
    }
  }

  return (
    <div className="space-y-5" dir="ltr">
      {/* Scalar stats */}
      {scalarEntries.length > 0 && (
        <div className="rounded-lg border bg-card p-4">
          {scalarEntries.map(([key, value]) => (
            <StatRow key={key} label={key} value={formatValue(key, value, money)} />
          ))}
        </div>
      )}

      {/* Known array tables */}
      {knownArrays}

      {/* Unknown arrays — fallback to formatted JSON */}
      {unknownArrays.map(([key, arr]) => (
        <div key={key} className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">{humanizeKey(key)}</p>
          <pre className="bg-muted p-4 rounded-lg overflow-auto text-sm text-left">
            {JSON.stringify(arr, null, 2)}
          </pre>
        </div>
      ))}
    </div>
  );
}
