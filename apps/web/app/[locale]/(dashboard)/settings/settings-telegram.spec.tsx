import React from 'react';
import { render, screen } from '@testing-library/react';
import SettingsPage from './page';
import TelegramSettingsPage from './telegram/page';

// Mock api
jest.mock('@/lib/api', () => ({
  get: jest.fn().mockResolvedValue({ data: { data: [] } }),
  post: jest.fn(),
  delete: jest.fn(),
}));

jest.mock('@/components/ui/use-toast', () => ({
  useToast: () => ({ toast: jest.fn() }),
}));

// Mock next/link
jest.mock('next/link', () => {
  return ({
    href,
    children,
    className,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  );
});

// Mock next-intl
const translations: Record<string, string> = {
  title: 'Settings',
  description: 'Manage your organization settings and preferences',
  'groups.general': 'General',
  'groups.financial': 'Financial',
  'groups.system': 'System',
  'hub.organization.title': 'Organization',
  'hub.organization.description': 'Company information',
  'hub.localization.title': 'Localization',
  'hub.localization.description': 'Display formats',
  'hub.branding.title': 'Branding',
  'hub.branding.description': 'Logo and colors',
  'hub.financial.title': 'Financial Settings',
  'hub.financial.description': 'Fiscal year',
  'hub.accounts.title': 'Default Accounts',
  'hub.accounts.description': 'GL accounts',
  'hub.invoicing.title': 'Invoice & Document',
  'hub.invoicing.description': 'Prefixes',
  'hub.ai.title': 'AI Features',
  'hub.ai.description': 'AI settings',
  'hub.notifications.title': 'Notifications',
  'hub.notifications.description': 'Notification preferences',
  'hub.team.title': 'Team & Roles',
  'hub.team.description': 'Manage team',
  'hub.performance.title': 'Performance',
  'hub.performance.description': 'Monitor DB',
  'hub.cache.title': 'Cache Management',
  'hub.cache.description': 'Manage caching',
  'hub.auditLogs.title': 'Audit Logs',
  'hub.auditLogs.description': 'Track user actions',
  'hub.telegram.title': 'Telegram Links',
  'hub.telegram.description': 'Connect Telegram chats',
  'settings.title': 'Settings',
  'settings.telegram.title': 'Telegram Links',
  'settings.telegram.description':
    'Connect Telegram chats to automatically intake invoice documents',
  'settings.telegram.generateCode': 'Generate Telegram Link Code',
  'settings.telegram.generating': 'Generating...',
  'settings.telegram.codeGenerated': 'Link code generated',
  'settings.telegram.codeInstruction': 'Send command',
  'settings.telegram.expiresIn': 'Expires in 15 minutes',
  'settings.telegram.copyCommand': 'Copy Command',
  'settings.telegram.copied': 'Copied',
  'settings.telegram.activeLinks': 'Active Telegram Links',
  'settings.telegram.noLinks': 'No Telegram chats currently linked',
  'settings.telegram.chatId': 'Chat ID',
  'settings.telegram.linkedAt': 'Linked Date',
  'settings.telegram.actions': 'Actions',
  'settings.telegram.unlink': 'Unlink',
  'navigation.settings': 'Settings',
};

jest.mock('next-intl', () => ({
  useTranslations: (ns?: string) => (key: string) => {
    const full = ns ? `${ns}.${key}` : key;
    return translations[full] || translations[key] || key;
  },
  useLocale: () => 'en',
}));

describe('Settings Telegram UI Integration', () => {
  it('renders Generate Telegram Link Code button directly on SettingsPage (/en/settings)', async () => {
    render(<SettingsPage />);

    // Finding 1 repro check: Look for 'Generate Telegram Link Code' button on /en/settings
    const button = await screen.findByRole('button', { name: /Generate Telegram Link Code/i });
    expect(button).toBeInTheDocument();
  });

  it('renders Telegram Links in settings navigation on SettingsPage', async () => {
    render(<SettingsPage />);

    // Finding 2 repro check: Look for 'Telegram Links' in navigation
    const nav = screen.getByRole('navigation', { name: /Settings navigation/i });
    expect(nav).toBeInTheDocument();
    expect(withinNav(nav, 'Telegram Links')).toBe(true);

    // Wait for effect to settle
    await screen.findByRole('button', { name: /Generate Telegram Link Code/i });
  });

  it('renders TelegramSettingsPage (/en/settings/telegram) with Telegram Link Manager', async () => {
    render(<TelegramSettingsPage />);

    const headings = screen.getAllByText('Telegram Links');
    expect(headings.length).toBeGreaterThanOrEqual(1);

    const button = await screen.findByRole('button', { name: /Generate Telegram Link Code/i });
    expect(button).toBeInTheDocument();
  });
});

function withinNav(element: HTMLElement, text: string): boolean {
  return element.textContent?.includes(text) ?? false;
}
