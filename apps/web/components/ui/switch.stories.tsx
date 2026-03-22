import type { Meta, StoryObj } from '@storybook/react';
import { Switch } from './switch';
import { Label } from './label';

const meta: Meta<typeof Switch> = {
  title: 'UI/Switch',
  component: Switch,
  tags: ['autodocs'],
  argTypes: {
    disabled: { control: 'boolean' },
    checked: { control: 'boolean' },
  },
};

export default meta;
type Story = StoryObj<typeof Switch>;

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
      <Switch id="ai-suggestions" defaultChecked />
      <Label htmlFor="ai-suggestions">Enable AI suggestions</Label>
    </div>
  ),
};

export const SettingsPanel: Story = {
  name: 'Settings Panel',
  render: () => (
    <div className="space-y-4 w-[350px]">
      {[
        { id: 'notifications', label: 'Email notifications', checked: true },
        { id: 'ai', label: 'AI auto-categorization', checked: true },
        { id: 'dark-mode', label: 'Dark mode', checked: false },
        { id: 'rtl', label: 'RTL layout', checked: false },
      ].map((item) => (
        <div key={item.id} className="flex items-center justify-between">
          <Label htmlFor={item.id} className="flex-1">
            {item.label}
          </Label>
          <Switch id={item.id} defaultChecked={item.checked} />
        </div>
      ))}
    </div>
  ),
};
