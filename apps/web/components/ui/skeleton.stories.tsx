import type { Meta, StoryObj } from '@storybook/react';
import { Skeleton } from './skeleton';

const meta: Meta<typeof Skeleton> = {
  title: 'UI/Skeleton',
  component: Skeleton,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof Skeleton>;

export const Default: Story = {
  args: {
    className: 'h-4 w-[250px]',
  },
};

export const Circle: Story = {
  args: {
    className: 'h-12 w-12 rounded-full',
  },
};

export const CardSkeleton: Story = {
  name: 'Card Loading',
  render: () => (
    <div className="flex flex-col space-y-3 w-[350px]">
      <Skeleton className="h-[125px] w-full rounded-xl" />
      <div className="space-y-2">
        <Skeleton className="h-4 w-[250px]" />
        <Skeleton className="h-4 w-[200px]" />
      </div>
    </div>
  ),
};

export const TableSkeleton: Story = {
  name: 'Table Loading',
  render: () => (
    <div className="space-y-3 w-[600px]">
      <div className="flex gap-4">
        <Skeleton className="h-8 w-[180px]" />
        <Skeleton className="h-8 w-[120px]" />
        <Skeleton className="h-8 w-[100px]" />
        <Skeleton className="h-8 flex-1" />
      </div>
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex gap-4">
          <Skeleton className="h-6 w-[180px]" />
          <Skeleton className="h-6 w-[120px]" />
          <Skeleton className="h-6 w-[100px]" />
          <Skeleton className="h-6 flex-1" />
        </div>
      ))}
    </div>
  ),
};

export const DashboardSkeleton: Story = {
  name: 'Dashboard Loading',
  render: () => (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-4 w-[80px]" />
            <Skeleton className="h-8 w-[120px]" />
            <Skeleton className="h-3 w-[100px]" />
          </div>
        ))}
      </div>
      <Skeleton className="h-[200px] w-full rounded-xl" />
    </div>
  ),
};
