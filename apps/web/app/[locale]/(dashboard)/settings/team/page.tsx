'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Plus, Shield, Users } from 'lucide-react';
import Link from 'next/link';

export default function TeamSettingsPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild aria-label="Go back">
            <Link href="/settings">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Team & Roles</h1>
            <p className="text-muted-foreground text-sm">
              Manage team members and their permissions
            </p>
          </div>
        </div>
        <Button className="gap-2">
          <Plus className="h-4 w-4" />
          Invite Member
        </Button>
      </div>

      {/* Roles Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Roles
          </CardTitle>
          <CardDescription>Predefined roles with module-level permissions</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              {
                name: 'Owner',
                desc: 'Full access to all modules and settings',
                color: 'default' as const,
              },
              {
                name: 'Admin',
                desc: 'Manage settings, users, and all data',
                color: 'default' as const,
              },
              {
                name: 'Accountant',
                desc: 'Accounting, reports, bank reconciliation',
                color: 'secondary' as const,
              },
              {
                name: 'Sales Manager',
                desc: 'Sales, customers, invoices, quotes',
                color: 'secondary' as const,
              },
              {
                name: 'Purchase Manager',
                desc: 'Purchases, vendors, bills, expenses',
                color: 'secondary' as const,
              },
              {
                name: 'Viewer',
                desc: 'Read-only access to assigned modules',
                color: 'outline' as const,
              },
            ].map((role) => (
              <div key={role.name} className="rounded-lg border p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant={role.color}>{role.name}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">{role.desc}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Team Members Placeholder */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Team Members
          </CardTitle>
          <CardDescription>People with access to this organization</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Team member management coming soon.</p>
            <p className="text-xs mt-1">
              You&apos;ll be able to invite members, assign roles, and manage permissions here.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
