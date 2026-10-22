import React from 'react';
import { render, screen } from '@testing-library/react';
import { getServerSession } from 'next-auth';
import DashboardPage from './page';

jest.mock('next-auth', () => ({
  getServerSession: jest.fn(),
}));

jest.mock('@/components/dashboard/dashboard-client', () => ({
  DashboardClient: () => <div data-testid="dashboard-client">Dashboard Content</div>,
}));

jest.mock('@tanstack/react-query', () => {
  const actual = jest.requireActual('@tanstack/react-query');
  return {
    ...actual,
    dehydrate: jest.fn(() => ({})),
    HydrationBoundary: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  };
});

describe('DashboardPage session privacy indicator', () => {
  it('renders accessToken and refreshToken status indicators when session is authenticated', async () => {
    (getServerSession as jest.Mock).mockResolvedValue({
      user: { id: 'u-1', name: 'Admin', email: 'admin@mizano.com' },
      accessToken: 'valid-access-token',
    });

    const PageComponent = await DashboardPage();
    render(PageComponent);

    expect(screen.getByText(/accessToken/i)).toBeInTheDocument();
    expect(screen.getByText(/refreshToken/i)).toBeInTheDocument();
    expect(screen.getByText(/refreshToken: omitted/i)).toBeInTheDocument();
  });
});
