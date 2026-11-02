import type { Meta, StoryObj } from '@storybook/react';
import { Alert, AlertTitle, AlertDescription } from './alert';
import { AlertCircle, CheckCircle2, Info, TriangleAlert } from 'lucide-react';

const meta: Meta<typeof Alert> = {
  title: 'UI/Alert',
  component: Alert,
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'destructive'],
    },
  },
};

export default meta;
type Story = StoryObj<typeof Alert>;

export const Default: Story = {
  render: () => (
    <Alert>
      <Info className="h-4 w-4" />
      <AlertTitle>Heads up!</AlertTitle>
      <AlertDescription>You can add components to your app using the cli.</AlertDescription>
    </Alert>
  ),
};

export const Destructive: Story = {
  render: () => (
    <Alert variant="destructive">
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>Error</AlertTitle>
      <AlertDescription>
        Journal entry is unbalanced. Total debits ($1,000) do not equal total credits ($500).
      </AlertDescription>
    </Alert>
  ),
};

export const Success: Story = {
  render: () => (
    <Alert className="border-success/50 text-success [&>svg]:text-success">
      <CheckCircle2 className="h-4 w-4" />
      <AlertTitle>Invoice sent</AlertTitle>
      <AlertDescription>Invoice INV-042 has been sent to customer@example.com.</AlertDescription>
    </Alert>
  ),
};

export const Warning: Story = {
  render: () => (
    <Alert className="border-warning/50 text-warning [&>svg]:text-warning">
      <TriangleAlert className="h-4 w-4" />
      <AlertTitle>Low stock warning</AlertTitle>
      <AlertDescription>
        Item &quot;Widget Pro&quot; has fallen below the reorder point (5 units remaining).
      </AlertDescription>
    </Alert>
  ),
};
