import type { Meta, StoryObj } from '@storybook/react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './card';
import { Input } from './input';
import { Label } from './label';

const meta: Meta<typeof Tabs> = {
  title: 'UI/Tabs',
  component: Tabs,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
  },
};

export default meta;
type Story = StoryObj<typeof Tabs>;

export const Default: Story = {
  render: () => (
    <Tabs defaultValue="overview" className="w-[400px]">
      <TabsList>
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="details">Details</TabsTrigger>
        <TabsTrigger value="history">History</TabsTrigger>
      </TabsList>
      <TabsContent value="overview">
        <p className="text-sm text-muted-foreground p-4">Overview content goes here.</p>
      </TabsContent>
      <TabsContent value="details">
        <p className="text-sm text-muted-foreground p-4">Details content goes here.</p>
      </TabsContent>
      <TabsContent value="history">
        <p className="text-sm text-muted-foreground p-4">History content goes here.</p>
      </TabsContent>
    </Tabs>
  ),
};

export const WithCards: Story = {
  render: () => (
    <Tabs defaultValue="account" className="w-[450px]">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="account">Account</TabsTrigger>
        <TabsTrigger value="password">Password</TabsTrigger>
      </TabsList>
      <TabsContent value="account">
        <Card>
          <CardHeader>
            <CardTitle>Account</CardTitle>
            <CardDescription>Make changes to your account settings here.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="space-y-1">
              <Label htmlFor="name">Name</Label>
              <Input id="name" defaultValue="John Doe" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="email">Email</Label>
              <Input id="email" defaultValue="john@example.com" />
            </div>
          </CardContent>
        </Card>
      </TabsContent>
      <TabsContent value="password">
        <Card>
          <CardHeader>
            <CardTitle>Password</CardTitle>
            <CardDescription>Change your password here.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="space-y-1">
              <Label htmlFor="current">Current password</Label>
              <Input id="current" type="password" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="new">New password</Label>
              <Input id="new" type="password" />
            </div>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  ),
};

export const InvoiceTabs: Story = {
  name: 'Invoice Detail Tabs',
  render: () => (
    <Tabs defaultValue="lines" className="w-[600px]">
      <TabsList>
        <TabsTrigger value="lines">Line Items</TabsTrigger>
        <TabsTrigger value="journal">Journal Entry</TabsTrigger>
        <TabsTrigger value="payments">Payments</TabsTrigger>
        <TabsTrigger value="audit">Audit Trail</TabsTrigger>
      </TabsList>
      <TabsContent value="lines" className="p-4">
        <p className="text-sm text-muted-foreground">Line items for the invoice.</p>
      </TabsContent>
      <TabsContent value="journal" className="p-4">
        <p className="text-sm text-muted-foreground">Auto-generated journal entry.</p>
      </TabsContent>
      <TabsContent value="payments" className="p-4">
        <p className="text-sm text-muted-foreground">Payment history for this invoice.</p>
      </TabsContent>
      <TabsContent value="audit" className="p-4">
        <p className="text-sm text-muted-foreground">Audit trail of all changes.</p>
      </TabsContent>
    </Tabs>
  ),
};
