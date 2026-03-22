'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { ArrowLeft, Edit2, Plus, Shield, Trash2, Users } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  useRoles,
  useCreateRole,
  useUpdateRole,
  useDeleteRole,
  useSeedDefaultRoles,
} from '@/lib/hooks/use-roles';
import {
  useUsers,
  useCreateUser,
  useUpdateUser,
  useDeleteUser,
  getUserStatusColor,
} from '@/lib/hooks/use-users';

// ── Constants (must match backend AVAILABLE_MODULES / AVAILABLE_ACTIONS) ─────

const MODULES = [
  'accounting',
  'sales',
  'purchases',
  'inventory',
  'banking',
  'hr',
  'manufacturing',
  'projects',
  'tax',
  'reports',
  'crm',
  'settings',
  'users',
] as const;

const ACTIONS = ['view', 'create', 'edit', 'delete', 'export'] as const;

// ── Types ────────────────────────────────────────────────────────────────────

interface Permission {
  module: string;
  actions: string[];
}

interface Role {
  id: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  permissions: Permission[];
  _count?: { users: number };
}

interface User {
  id: string;
  name: string;
  email: string;
  status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
  role: { id: string; name: string } | null;
}

interface CreateUserFormData {
  name: string;
  email: string;
  password: string;
  roleId: string;
}

interface EditUserFormData {
  name: string;
  email: string;
  roleId: string;
  status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
}

interface RoleFormData {
  name: string;
  description: string;
}

// ── Permissions Matrix Hook ──────────────────────────────────────────────────

function usePermissionsMatrix(initial?: Permission[]) {
  // Map: module → Set of actions
  const [matrix, setMatrix] = useState<Record<string, Set<string>>>(() => {
    const m: Record<string, Set<string>> = {};
    if (initial) {
      for (const p of initial) {
        m[p.module] = new Set(p.actions);
      }
    }
    return m;
  });

  const toggle = (mod: string, action: string) => {
    setMatrix((prev) => {
      const next = { ...prev };
      const set = new Set(next[mod] ?? []);
      if (set.has(action)) {
        set.delete(action);
      } else {
        set.add(action);
      }
      if (set.size === 0) {
        delete next[mod];
      } else {
        next[mod] = set;
      }
      return next;
    });
  };

  const toggleModule = (mod: string) => {
    setMatrix((prev) => {
      const next = { ...prev };
      const current = next[mod];
      if (current && current.size === ACTIONS.length) {
        delete next[mod];
      } else {
        next[mod] = new Set(ACTIONS);
      }
      return next;
    });
  };

  const has = (mod: string, action: string): boolean => matrix[mod]?.has(action) ?? false;

  const isModuleFull = (mod: string): boolean => (matrix[mod]?.size ?? 0) === ACTIONS.length;

  const toPayload = (): Permission[] =>
    Object.entries(matrix)
      .filter(([, actions]) => actions.size > 0)
      .map(([module, actions]) => ({ module, actions: Array.from(actions) }));

  const reset = (perms?: Permission[]) => {
    const m: Record<string, Set<string>> = {};
    if (perms) {
      for (const p of perms) {
        m[p.module] = new Set(p.actions);
      }
    }
    setMatrix(m);
  };

  return { has, toggle, toggleModule, isModuleFull, toPayload, reset };
}

// ── Component ────────────────────────────────────────────────────────────────

export default function TeamSettingsPage() {
  const t = useTranslations('settings');

  // Data
  const { data: rolesData, isLoading: rolesLoading } = useRoles({ limit: 50 });
  const { data: usersData, isLoading: usersLoading } = useUsers({ limit: 50 });
  const seedDefaults = useSeedDefaultRoles();
  const createRole = useCreateRole();
  const updateRole = useUpdateRole();
  const deleteRole = useDeleteRole();
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const deleteUser = useDeleteUser();

  // Dialog state
  const [addRoleOpen, setAddRoleOpen] = useState(false);
  const [editRoleTarget, setEditRoleTarget] = useState<Role | null>(null);
  const [deleteRoleId, setDeleteRoleId] = useState<string | null>(null);
  const [addUserOpen, setAddUserOpen] = useState(false);
  const [editUserTarget, setEditUserTarget] = useState<User | null>(null);
  const [deleteUserId, setDeleteUserId] = useState<string | null>(null);

  const roles: Role[] = rolesData?.data ?? [];
  const users: User[] = usersData?.data ?? [];

  // ── Role forms ─────────────────────────────────────────────────────────────

  const addRoleForm = useForm<RoleFormData>({
    defaultValues: { name: '', description: '' },
  });
  const addRolePerms = usePermissionsMatrix();

  const editRoleForm = useForm<RoleFormData>();
  const editRolePerms = usePermissionsMatrix();

  const handleOpenAddRole = () => {
    addRoleForm.reset({ name: '', description: '' });
    addRolePerms.reset();
    setAddRoleOpen(true);
  };

  const handleCreateRole = async (data: RoleFormData) => {
    const permissions = addRolePerms.toPayload();
    if (permissions.length === 0) return;
    await createRole.mutateAsync({
      name: data.name,
      description: data.description || undefined,
      permissions,
    });
    setAddRoleOpen(false);
  };

  const handleOpenEditRole = (role: Role) => {
    setEditRoleTarget(role);
    editRoleForm.reset({
      name: role.name,
      description: role.description ?? '',
    });
    editRolePerms.reset(role.permissions);
  };

  const handleEditRole = async (data: RoleFormData) => {
    if (!editRoleTarget) return;
    const permissions = editRolePerms.toPayload();
    if (permissions.length === 0) return;
    await updateRole.mutateAsync({
      id: editRoleTarget.id,
      data: {
        name: data.name,
        description: data.description || undefined,
        permissions,
      },
    });
    setEditRoleTarget(null);
  };

  const handleDeleteRole = async () => {
    if (!deleteRoleId) return;
    await deleteRole.mutateAsync(deleteRoleId);
    setDeleteRoleId(null);
  };

  // ── User forms ─────────────────────────────────────────────────────────────

  const createUserForm = useForm<CreateUserFormData>({
    defaultValues: { name: '', email: '', password: '', roleId: '' },
  });

  const editUserForm = useForm<EditUserFormData>();

  const handleCreateUser = async (data: CreateUserFormData) => {
    await createUser.mutateAsync(data);
    createUserForm.reset();
    setAddUserOpen(false);
  };

  const handleOpenEditUser = (user: User) => {
    setEditUserTarget(user);
    editUserForm.reset({
      name: user.name,
      email: user.email,
      roleId: user.role?.id ?? '',
      status: user.status,
    });
  };

  const handleEditUser = async (data: EditUserFormData) => {
    if (!editUserTarget) return;
    await updateUser.mutateAsync({ id: editUserTarget.id, data });
    setEditUserTarget(null);
  };

  const handleDeleteUser = async () => {
    if (!deleteUserId) return;
    await deleteUser.mutateAsync(deleteUserId);
    setDeleteUserId(null);
  };

  // ── Helpers ────────────────────────────────────────────────────────────────

  const statusLabel = (s: string) => {
    const map: Record<string, string> = {
      ACTIVE: t('team.active'),
      INACTIVE: t('team.inactive'),
      SUSPENDED: t('team.suspended'),
    };
    return map[s] ?? s;
  };

  const isLoading = rolesLoading || usersLoading;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-[200px]" />
        <Skeleton className="h-[300px]" />
      </div>
    );
  }

  // ── Permissions Matrix UI (shared between add/edit role dialogs) ───────────

  const PermissionsMatrix = ({ perms }: { perms: ReturnType<typeof usePermissionsMatrix> }) => (
    <div className="border rounded-lg overflow-auto max-h-[320px]">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="sticky left-0 bg-background min-w-[120px]">
              {t('team.module')}
            </TableHead>
            {ACTIONS.map((a) => (
              <TableHead key={a} className="text-center w-[70px]">
                {t(`team.${a}`)}
              </TableHead>
            ))}
            <TableHead className="text-center w-[60px]">{t('team.selectAll')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {MODULES.map((mod) => (
            <TableRow key={mod}>
              <TableCell className="sticky left-0 bg-background font-medium capitalize text-sm">
                {mod}
              </TableCell>
              {ACTIONS.map((action) => (
                <TableCell key={action} className="text-center">
                  <Checkbox
                    checked={perms.has(mod, action)}
                    onCheckedChange={() => perms.toggle(mod, action)}
                  />
                </TableCell>
              ))}
              <TableCell className="text-center">
                <Checkbox
                  checked={perms.isModuleFull(mod)}
                  onCheckedChange={() => perms.toggleModule(mod)}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
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

      {/* ── Roles Card ──────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              {t('team.roles')}
            </CardTitle>
            <CardDescription>{t('team.rolesDescription')}</CardDescription>
          </div>
          <div className="flex gap-2">
            {roles.length === 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => seedDefaults.mutate()}
                disabled={seedDefaults.isPending}
              >
                {t('team.seedDefaults')}
              </Button>
            )}
            <Button size="sm" className="gap-1" onClick={handleOpenAddRole}>
              <Plus className="h-4 w-4" />
              {t('team.addRole')}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {roles.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">{t('team.noRoles')}</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {roles.map((role) => (
                <div key={role.id} className="rounded-lg border p-4 space-y-2 group relative">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{role.name}</span>
                    {role.isDefault && (
                      <Badge variant="secondary" className="text-xs">
                        {t('team.defaultRole')}
                      </Badge>
                    )}
                  </div>
                  {role.description && (
                    <p className="text-xs text-muted-foreground">{role.description}</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {t('team.permissions', {
                      count: role.permissions?.length ?? 0,
                    })}
                  </p>
                  {/* Edit / Delete actions */}
                  <div className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => handleOpenEditRole(role)}
                      aria-label={t('team.editRole')}
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive"
                      onClick={() => setDeleteRoleId(role.id)}
                      aria-label={t('team.deleteRole')}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Team Members Card ───────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              {t('team.teamMembers')}
            </CardTitle>
            <CardDescription>{t('team.teamMembersDescription')}</CardDescription>
          </div>
          <Button size="sm" className="gap-1" onClick={() => setAddUserOpen(true)}>
            <Plus className="h-4 w-4" />
            {t('team.addMember')}
          </Button>
        </CardHeader>
        <CardContent>
          {users.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">{t('team.noMembers')}</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('team.name')}</TableHead>
                  <TableHead>{t('team.email')}</TableHead>
                  <TableHead>{t('team.role')}</TableHead>
                  <TableHead>{t('team.status')}</TableHead>
                  <TableHead className="w-[100px]">{t('team.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">{user.name}</TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{user.role?.name ?? '—'}</Badge>
                    </TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${getUserStatusColor(user.status)}`}
                      >
                        {statusLabel(user.status)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => handleOpenEditUser(user)}
                          aria-label={t('team.editMember')}
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive"
                          onClick={() => setDeleteUserId(user.id)}
                          aria-label={t('team.deleteMember')}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/*  DIALOGS                                                             */}
      {/* ══════════════════════════════════════════════════════════════════════ */}

      {/* ── Add Role Dialog ─────────────────────────────────────────────────── */}
      <Dialog open={addRoleOpen} onOpenChange={setAddRoleOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('team.addRoleTitle')}</DialogTitle>
            <DialogDescription>{t('team.addRoleDescription')}</DialogDescription>
          </DialogHeader>
          <form onSubmit={addRoleForm.handleSubmit(handleCreateRole)} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('team.roleName')}</Label>
                <Input
                  placeholder={t('team.roleNamePlaceholder')}
                  {...addRoleForm.register('name', { required: true })}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('team.roleDescription')}</Label>
                <Input
                  placeholder={t('team.roleDescriptionPlaceholder')}
                  {...addRoleForm.register('description')}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t('team.permissionsMatrix')}</Label>
              <PermissionsMatrix perms={addRolePerms} />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAddRoleOpen(false)}>
                {t('team.cancel')}
              </Button>
              <Button type="submit" disabled={createRole.isPending}>
                {createRole.isPending ? t('team.saving') : t('team.save')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Edit Role Dialog ────────────────────────────────────────────────── */}
      <Dialog open={!!editRoleTarget} onOpenChange={(open) => !open && setEditRoleTarget(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('team.editRoleTitle')}</DialogTitle>
            <DialogDescription>{t('team.editRoleDescription')}</DialogDescription>
          </DialogHeader>
          <form onSubmit={editRoleForm.handleSubmit(handleEditRole)} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('team.roleName')}</Label>
                <Input
                  placeholder={t('team.roleNamePlaceholder')}
                  {...editRoleForm.register('name', { required: true })}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('team.roleDescription')}</Label>
                <Input
                  placeholder={t('team.roleDescriptionPlaceholder')}
                  {...editRoleForm.register('description')}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t('team.permissionsMatrix')}</Label>
              <PermissionsMatrix perms={editRolePerms} />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditRoleTarget(null)}>
                {t('team.cancel')}
              </Button>
              <Button type="submit" disabled={updateRole.isPending}>
                {updateRole.isPending ? t('team.saving') : t('team.save')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Delete Role Confirm ─────────────────────────────────────────────── */}
      <AlertDialog open={!!deleteRoleId} onOpenChange={(open) => !open && setDeleteRoleId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('team.deleteRoleTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('team.deleteRoleConfirm')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('team.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteRole}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t('team.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Add Member Dialog ───────────────────────────────────────────────── */}
      <Dialog open={addUserOpen} onOpenChange={setAddUserOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('team.addMemberTitle')}</DialogTitle>
            <DialogDescription>{t('team.addMemberDescription')}</DialogDescription>
          </DialogHeader>
          <form onSubmit={createUserForm.handleSubmit(handleCreateUser)} className="space-y-4">
            <div className="space-y-2">
              <Label>{t('team.name')}</Label>
              <Input
                placeholder={t('team.namePlaceholder')}
                {...createUserForm.register('name', { required: true })}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('team.email')}</Label>
              <Input
                type="email"
                placeholder={t('team.emailPlaceholder')}
                {...createUserForm.register('email', { required: true })}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('team.password')}</Label>
              <Input
                type="password"
                placeholder={t('team.passwordPlaceholder')}
                {...createUserForm.register('password', {
                  required: true,
                  minLength: 8,
                })}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('team.role')}</Label>
              <Select
                value={createUserForm.watch('roleId')}
                onValueChange={(v) => createUserForm.setValue('roleId', v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('team.selectRole')} />
                </SelectTrigger>
                <SelectContent>
                  {roles.map((role) => (
                    <SelectItem key={role.id} value={role.id}>
                      {role.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAddUserOpen(false)}>
                {t('team.cancel')}
              </Button>
              <Button type="submit" disabled={createUser.isPending}>
                {createUser.isPending ? t('team.saving') : t('team.save')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Edit Member Dialog ──────────────────────────────────────────────── */}
      <Dialog open={!!editUserTarget} onOpenChange={(open) => !open && setEditUserTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('team.editMemberTitle')}</DialogTitle>
            <DialogDescription>{t('team.editMemberDescription')}</DialogDescription>
          </DialogHeader>
          <form onSubmit={editUserForm.handleSubmit(handleEditUser)} className="space-y-4">
            <div className="space-y-2">
              <Label>{t('team.name')}</Label>
              <Input
                placeholder={t('team.namePlaceholder')}
                {...editUserForm.register('name', { required: true })}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('team.email')}</Label>
              <Input
                type="email"
                placeholder={t('team.emailPlaceholder')}
                {...editUserForm.register('email', { required: true })}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('team.role')}</Label>
              <Select
                value={editUserForm.watch('roleId')}
                onValueChange={(v) => editUserForm.setValue('roleId', v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('team.selectRole')} />
                </SelectTrigger>
                <SelectContent>
                  {roles.map((role) => (
                    <SelectItem key={role.id} value={role.id}>
                      {role.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t('team.status')}</Label>
              <Select
                value={editUserForm.watch('status')}
                onValueChange={(v) =>
                  editUserForm.setValue('status', v as 'ACTIVE' | 'INACTIVE' | 'SUSPENDED')
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ACTIVE">{t('team.active')}</SelectItem>
                  <SelectItem value="INACTIVE">{t('team.inactive')}</SelectItem>
                  <SelectItem value="SUSPENDED">{t('team.suspended')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditUserTarget(null)}>
                {t('team.cancel')}
              </Button>
              <Button type="submit" disabled={updateUser.isPending}>
                {updateUser.isPending ? t('team.saving') : t('team.save')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Delete Member Confirm ───────────────────────────────────────────── */}
      <AlertDialog open={!!deleteUserId} onOpenChange={(open) => !open && setDeleteUserId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('team.deleteConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('team.deleteConfirm')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('team.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteUser}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t('team.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
