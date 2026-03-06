'use client';

import { useEffect } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  BankRule,
  conditionFieldOptions,
  conditionOperatorOptions,
  actionTypeOptions,
} from '@/lib/hooks/use-bank-rules';

const conditionSchema = z.object({
  field: z.enum(['description', 'payee', 'amount', 'reference']),
  operator: z.enum(['contains', 'equals', 'startsWith', 'endsWith', 'greaterThan', 'lessThan']),
  value: z.string().min(1, 'Value is required'),
});

const actionSchema = z.object({
  type: z.enum(['categorize', 'createExpense', 'matchVendor', 'matchCustomer']),
  accountId: z.string().optional(),
  vendorId: z.string().optional(),
  customerId: z.string().optional(),
  description: z.string().optional(),
});

const bankRuleSchema = z.object({
  name: z.string().min(1, 'Rule name is required'),
  conditions: z.array(conditionSchema).min(1, 'At least one condition is required'),
  action: actionSchema,
  priority: z.number().min(1).default(1),
  isActive: z.boolean().default(true),
  autoCreate: z.boolean().default(false),
});

type BankRuleFormData = z.infer<typeof bankRuleSchema>;

interface BankRuleFormProps {
  rule?: BankRule | null;
  accounts: Array<{ id: string; name: string; code: string }>;
  vendors: Array<{ id: string; name: string }>;
  customers: Array<{ id: string; name: string }>;
  onSubmit: (data: BankRuleFormData) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
}

export function BankRuleForm({
  rule,
  accounts,
  vendors,
  customers,
  onSubmit,
  onCancel,
  isSubmitting,
}: BankRuleFormProps) {
  const isEditing = !!rule;

  const form = useForm<BankRuleFormData>({
    resolver: zodResolver(bankRuleSchema),
    defaultValues: {
      name: '',
      conditions: [{ field: 'description', operator: 'contains', value: '' }],
      action: { type: 'categorize', accountId: '' },
      priority: 1,
      isActive: true,
      autoCreate: false,
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'conditions',
  });

  const watchActionType = form.watch('action.type');

  useEffect(() => {
    if (rule) {
      form.reset({
        name: rule.name || '',
        conditions: rule.conditions || [{ field: 'description', operator: 'contains', value: '' }],
        action: rule.action || { type: 'categorize', accountId: '' },
        priority: rule.priority || 1,
        isActive: rule.isActive ?? true,
        autoCreate: rule.autoCreate ?? false,
      });
    }
  }, [rule, form]);

  const handleSubmit = (data: BankRuleFormData) => {
    onSubmit(data);
  };

  const addCondition = () => {
    append({ field: 'description', operator: 'contains', value: '' });
  };

  return (
    <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
      {/* Basic Information */}
      <Card>
        <CardHeader>
          <CardTitle>Rule Details</CardTitle>
          <CardDescription>Give your rule a descriptive name to identify it easily</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Rule Name *</Label>
            <Input
              id="name"
              placeholder="e.g., Office Supplies from Amazon"
              {...form.register('name')}
            />
            {form.formState.errors.name && (
              <p className="text-sm text-red-500">{form.formState.errors.name.message}</p>
            )}
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label>Active</Label>
              <p className="text-sm text-muted-foreground">
                Inactive rules won't be applied to transactions
              </p>
            </div>
            <Switch
              checked={form.watch('isActive')}
              onCheckedChange={(checked) => form.setValue('isActive', checked)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Conditions */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Conditions</CardTitle>
              <CardDescription>
                Define when this rule should be applied (all conditions must match)
              </CardDescription>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={addCondition}>
              <Plus className="mr-2 h-4 w-4" />
              Add Condition
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {fields.map((field, index) => (
            <div key={field.id} className="flex items-start gap-3">
              <div className="flex-1 grid grid-cols-3 gap-3">
                <Select
                  value={form.watch(`conditions.${index}.field`)}
                  onValueChange={(value: BankRuleFormData['conditions'][number]['field']) =>
                    form.setValue(`conditions.${index}.field`, value)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Field" />
                  </SelectTrigger>
                  <SelectContent>
                    {conditionFieldOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value={form.watch(`conditions.${index}.operator`)}
                  onValueChange={(value: BankRuleFormData['conditions'][number]['operator']) =>
                    form.setValue(`conditions.${index}.operator`, value)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Operator" />
                  </SelectTrigger>
                  <SelectContent>
                    {conditionOperatorOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Input placeholder="Value" {...form.register(`conditions.${index}.value`)} />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => fields.length > 1 && remove(index)}
                disabled={fields.length === 1}
                aria-label="Remove condition"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          {form.formState.errors.conditions && (
            <p className="text-sm text-red-500">{form.formState.errors.conditions.message}</p>
          )}
        </CardContent>
      </Card>

      {/* Action */}
      <Card>
        <CardHeader>
          <CardTitle>Action</CardTitle>
          <CardDescription>What should happen when a transaction matches this rule</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Action Type *</Label>
            <Select
              value={form.watch('action.type')}
              onValueChange={(value: BankRuleFormData['action']['type']) =>
                form.setValue('action.type', value)
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select action" />
              </SelectTrigger>
              <SelectContent>
                {actionTypeOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {(watchActionType === 'categorize' || watchActionType === 'createExpense') && (
            <div className="space-y-2">
              <Label>Account *</Label>
              <Select
                value={form.watch('action.accountId') || ''}
                onValueChange={(value) => form.setValue('action.accountId', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select account" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.code} - {account.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {watchActionType === 'matchVendor' && (
            <div className="space-y-2">
              <Label>Vendor *</Label>
              <Select
                value={form.watch('action.vendorId') || ''}
                onValueChange={(value) => form.setValue('action.vendorId', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select vendor" />
                </SelectTrigger>
                <SelectContent>
                  {vendors.map((vendor) => (
                    <SelectItem key={vendor.id} value={vendor.id}>
                      {vendor.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {watchActionType === 'matchCustomer' && (
            <div className="space-y-2">
              <Label>Customer *</Label>
              <Select
                value={form.watch('action.customerId') || ''}
                onValueChange={(value) => form.setValue('action.customerId', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select customer" />
                </SelectTrigger>
                <SelectContent>
                  {customers.map((customer) => (
                    <SelectItem key={customer.id} value={customer.id}>
                      {customer.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex items-center justify-between pt-4 border-t">
            <div>
              <Label>Auto-create transactions</Label>
              <p className="text-sm text-muted-foreground">
                Automatically create expenses when this rule matches
              </p>
            </div>
            <Switch
              checked={form.watch('autoCreate')}
              onCheckedChange={(checked) => form.setValue('autoCreate', checked)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving...' : isEditing ? 'Update Rule' : 'Create Rule'}
        </Button>
      </div>
    </form>
  );
}
