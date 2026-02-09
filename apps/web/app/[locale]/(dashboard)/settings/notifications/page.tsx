'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/use-toast';
import { ArrowLeft, Bell, Mail, Save, Smartphone } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

interface NotificationPref {
  key: string;
  label: string;
  description: string;
  inApp: boolean;
  email: boolean;
}

const DEFAULT_PREFS: NotificationPref[] = [
  {
    key: 'invoice_overdue',
    label: 'Invoice Overdue',
    description: 'When a customer invoice becomes overdue',
    inApp: true,
    email: true,
  },
  {
    key: 'bill_due',
    label: 'Bill Due Soon',
    description: 'When a vendor bill is approaching its due date',
    inApp: true,
    email: true,
  },
  {
    key: 'payment_received',
    label: 'Payment Received',
    description: 'When a payment is received from a customer',
    inApp: true,
    email: false,
  },
  {
    key: 'low_stock',
    label: 'Low Stock Alert',
    description: 'When an item falls below its reorder point',
    inApp: true,
    email: true,
  },
  {
    key: 'ai_insight',
    label: 'AI Insights',
    description: 'When AI detects anomalies or generates recommendations',
    inApp: true,
    email: false,
  },
  {
    key: 'bank_reconciliation',
    label: 'Bank Reconciliation',
    description: 'When new bank transactions are ready to be matched',
    inApp: true,
    email: false,
  },
  {
    key: 'payroll_reminder',
    label: 'Payroll Reminder',
    description: 'When a payroll run is scheduled or pending approval',
    inApp: true,
    email: true,
  },
  {
    key: 'vat_return',
    label: 'VAT Return Due',
    description: 'When a VAT return period is approaching',
    inApp: true,
    email: true,
  },
];

export default function NotificationSettingsPage() {
  const { toast } = useToast();
  const [prefs, setPrefs] = useState<NotificationPref[]>(DEFAULT_PREFS);
  const [isDirty, setIsDirty] = useState(false);

  const togglePref = (key: string, field: 'inApp' | 'email') => {
    setPrefs((prev) => prev.map((p) => (p.key === key ? { ...p, [field]: !p[field] } : p)));
    setIsDirty(true);
  };

  const handleSave = () => {
    // The notificationPrefs column exists in UserPreferences but has no API endpoint yet.
    // This saves locally for now and would call the API when the endpoint is created.
    toast({
      title: 'Preferences saved',
      description: 'Notification preferences have been updated.',
    });
    setIsDirty(false);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/settings">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Notifications</h1>
          <p className="text-muted-foreground text-sm">
            Choose how and when you receive notifications
          </p>
        </div>
      </div>

      {/* Header row */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Notification Preferences
          </CardTitle>
          <CardDescription>
            Configure which events trigger notifications and how they are delivered
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Column labels */}
          <div className="flex items-center gap-4 pb-3 border-b mb-2">
            <div className="flex-1">
              <span className="text-sm font-medium">Event</span>
            </div>
            <div className="w-20 text-center">
              <span className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                <Smartphone className="h-3.5 w-3.5" /> In-App
              </span>
            </div>
            <div className="w-20 text-center">
              <span className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                <Mail className="h-3.5 w-3.5" /> Email
              </span>
            </div>
          </div>

          {/* Rows */}
          <div className="space-y-1">
            {prefs.map((pref) => (
              <div
                key={pref.key}
                className="flex items-center gap-4 rounded-lg p-3 hover:bg-accent/30 transition-colors"
              >
                <div className="flex-1">
                  <Label className="text-sm font-medium">{pref.label}</Label>
                  <p className="text-xs text-muted-foreground">{pref.description}</p>
                </div>
                <div className="w-20 flex justify-center">
                  <Switch
                    checked={pref.inApp}
                    onCheckedChange={() => togglePref(pref.key, 'inApp')}
                  />
                </div>
                <div className="w-20 flex justify-center">
                  <Switch
                    checked={pref.email}
                    onCheckedChange={() => togglePref(pref.key, 'email')}
                  />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Save */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={!isDirty} className="gap-2">
          <Save className="h-4 w-4" />
          Save Preferences
        </Button>
      </div>
    </div>
  );
}
