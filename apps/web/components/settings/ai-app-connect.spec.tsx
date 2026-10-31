import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import enSettings from '@/messages/en/settings.json';
import arSettings from '@/messages/ar/settings.json';
import type { McpConnections } from '@/lib/api/mcp';

jest.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () =>
    Object.assign(
      (key: string, values?: Record<string, string>) =>
        values ? `${key}|${Object.values(values).join('|')}` : key,
      { has: () => false },
    ),
}));

const approve = jest.fn();
const deny = jest.fn();
const revoke = jest.fn();
const assign = jest.fn();
jest.mock('@/lib/leave-page', () => ({ leavePage: (url: string) => assign(url) }));
const mutation = (mutate: jest.Mock) => ({ mutate, isPending: false });
const ok = <T,>(data: T) => ({
  data,
  error: null,
  isLoading: false,
  isError: false,
  refetch: jest.fn(),
});

// Stable objects: a fresh object per render would re-run effects keyed on them.
const request = ok({
  requestId: 'req_1',
  clientName: 'Claude',
  redirectHost: 'claude.ai',
  requestedAccess: 'read' as const,
  organization: { id: 'org_1', name: 'Nile Trading' },
  user: { name: 'Mona', email: 'mona@example.com' },
  expiresAt: '2026-10-31T12:00:00.000Z',
});
let connections = ok<McpConnections>({
  serverUrl: 'https://api.example.com/mcp',
  canManageAll: false,
  connections: [
    {
      id: 'g_mine',
      clientName: 'Claude',
      access: 'drafts' as const,
      userName: 'Mona',
      isMine: true,
      createdAt: '2026-10-30T10:00:00.000Z',
      lastUsedAt: null,
    },
    {
      id: 'g_other',
      clientName: 'ChatGPT',
      access: 'read' as const,
      userName: 'Omar',
      isMine: false,
      createdAt: '2026-10-29T10:00:00.000Z',
      lastUsedAt: '2026-10-30T09:00:00.000Z',
    },
  ],
});
const approveMutation = mutation(approve);
const denyMutation = mutation(deny);
const revokeMutation = mutation(revoke);

jest.mock('@/lib/hooks/use-mcp', () => ({
  useMcpAuthRequest: () => request,
  useApproveMcpRequest: () => approveMutation,
  useDenyMcpRequest: () => denyMutation,
  useMcpConnections: () => connections,
  useRevokeMcpConnection: () => revokeMutation,
}));

// Imported after the mocks.
import { McpConsent } from './mcp-consent';
import { AiAppConnect } from './ai-app-connect';

function keysOf(o: unknown, prefix = ''): string[] {
  if (!o || typeof o !== 'object') return [prefix];
  return Object.entries(o as Record<string, unknown>).flatMap(([k, v]) =>
    keysOf(v, prefix ? `${prefix}.${k}` : k),
  );
}

describe('McpConsent', () => {
  beforeEach(() => {
    approve.mockReset();
    deny.mockReset();
    assign.mockReset();
  });

  it('allows with the chosen access and returns to the AI app', () => {
    render(<McpConsent requestId="req_1" />);
    expect(screen.getByText('title|Claude')).toBeInTheDocument();
    expect(screen.getByText('Nile Trading')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: /access\.drafts/ }));
    fireEvent.click(screen.getByRole('button', { name: 'allow' }));

    expect(approve).toHaveBeenCalledWith(
      { requestId: 'req_1', access: 'drafts' },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
    approve.mock.calls[0][1].onSuccess({ redirectUrl: 'https://claude.ai/cb?code=x&state=y' });
    expect(assign).toHaveBeenCalledWith('https://claude.ai/cb?code=x&state=y');
  });

  it('defaults to the requested access and locks both buttons once one is pressed', () => {
    render(<McpConsent requestId="req_1" />);
    fireEvent.click(screen.getByRole('button', { name: 'allow' }));
    expect(approve.mock.calls[0][0]).toEqual({ requestId: 'req_1', access: 'read' });
    expect(screen.getByRole('button', { name: 'cancel' })).toBeDisabled();
  });

  it('cancel sends the denial and returns to the AI app', () => {
    render(<McpConsent requestId="req_1" />);
    fireEvent.click(screen.getByRole('button', { name: 'cancel' }));
    expect(deny).toHaveBeenCalledWith('req_1', expect.any(Object));
    deny.mock.calls[0][1].onSuccess({ redirectUrl: 'https://claude.ai/cb?error=access_denied' });
    expect(assign).toHaveBeenCalledWith('https://claude.ai/cb?error=access_denied');
  });
});

describe('AiAppConnect', () => {
  it('shows the address and offers Disconnect only for own connections', () => {
    render(<AiAppConnect />);
    expect(screen.getByText('https://api.example.com/mcp')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'connected.disconnect' })).toHaveLength(1);
  });

  it('lets an admin disconnect every connection', () => {
    connections = { ...connections, data: { ...connections.data, canManageAll: true } };
    render(<AiAppConnect />);
    expect(screen.getAllByRole('button', { name: 'connected.disconnect' })).toHaveLength(2);
  });

  it('explains when the server has not turned the connection on', () => {
    connections = { ...connections, data: { ...connections.data, serverUrl: null } };
    render(<AiAppConnect />);
    expect(screen.getByText('notConfigured')).toBeInTheDocument();
    expect(screen.queryByText('https://api.example.com/mcp')).not.toBeInTheDocument();
  });
});

describe('MCP messages', () => {
  it.each(['aiApp', 'mcpConsent', 'mcpErrors'] as const)(
    '%s exists in English and Arabic',
    (ns) => {
      expect(keysOf(arSettings[ns]).sort()).toEqual(keysOf(enSettings[ns]).sort());
    },
  );

  it('keeps builder words off the plain screens', () => {
    const plain = [enSettings.aiApp, enSettings.mcpConsent, enSettings.mcpErrors];
    const text = JSON.stringify(plain).replace(/choose OAuth/g, '');
    expect(text).not.toMatch(/\b(HTTP|API|JSON|token|webhook|OAuth)\b/i);
  });
});
