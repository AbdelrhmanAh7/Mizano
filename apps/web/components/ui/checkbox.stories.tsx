import type { Meta, StoryObj } from '@storybook/react';
import { Checkbox } from './checkbox';
import { Label } from './label';

const meta: Meta<typeof Checkbox> = {
  title: 'UI/Checkbox',
  component: Checkbox,
  tags: ['autodocs'],
  argTypes: {
    disabled: { control: 'boolean' },
    checked: { control: 'boolean' },
  },
};

export default meta;
type Story = StoryObj<typeof Checkbox>;

export const Default: Story = {};

export const Checked: Story = {
  args: {
    defaultChecked: true,
  },
};

export const Disabled: Story = {
  args: {
    disabled: true,
  },
};

export const WithLabel: Story = {
  render: () => (
    <div className="flex items-center space-x-2">
      <Checkbox id="terms" />
      <Label htmlFor="terms">Accept terms and conditions</Label>
    </div>
  ),
};

export const PermissionsList: Story = {
  name: 'RBAC Permissions',
  render: () => (
    <div className="space-y-3">
      <p className="text-sm font-medium">Sales Module Permissions</p>
      {['View', 'Create', 'Edit', 'Delete', 'Export'].map((action) => (
        <div key={action} className="flex items-center space-x-2">
          <Checkbox id={`sales-${action.toLowerCase()}`} defaultChecked={action === 'View'} />
          <Label htmlFor={`sales-${action.toLowerCase()}`}>sales.{action.toLowerCase()}</Label>
        </div>
      ))}
    </div>
  ),
};
