'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Plus, Shield, Users } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

export default function TeamSettingsPage() {
  const t = useTranslations('settings');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild aria-label={t('common.goBack')}>
            <Link href="/settings">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{t('team.title')}</h1>
            <p className="text-muted-foreground text-sm">{t('team.description')}</p>
          </div>
        </div>
        <Button className="gap-2">
          <Plus className="h-4 w-4" />
          {t('team.inviteMember')}
        </Button>
      </div>

      {/* Roles Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            {t('team.roles')}
          </CardTitle>
          <CardDescription>{t('team.rolesDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { key: 'owner', color: 'default' as const },
              { key: 'admin', color: 'default' as const },
              { key: 'accountant', color: 'secondary' as const },
              { key: 'salesManager', color: 'secondary' as const },
              { key: 'purchaseManager', color: 'secondary' as const },
              { key: 'viewer', color: 'outline' as const },
            ].map((role) => (
              <div key={role.key} className="rounded-lg border p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant={role.color}>{t(`team.roleItems.${role.key}`)}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t(`team.roleItems.${role.key}Description`)}
                </p>
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
            {t('team.teamMembers')}
          </CardTitle>
          <CardDescription>{t('team.teamMembersDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">{t('team.comingSoon')}</p>
            <p className="text-xs mt-1">{t('team.comingSoonDescription')}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
