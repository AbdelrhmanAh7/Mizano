import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import enSettings from '@/messages/en/settings.json';
import arSettings from '@/messages/ar/settings.json';
import { integrationsBaseUrl, unwrap } from '@/lib/api/integrations';

jest.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) =>
    values ? `${key}|${Object.values(values).join('|')}` : key,
}));
const toast = jest.fn();
jest.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast }) }));
jest.mock('@/lib/hooks/use-permissions', () => ({
  usePermissions: () => ({
    hasPermission: (p: string) => p === 'settings.edit' || p === 'settings.view',
  }),
}));

const createKey = jest.fn();
const createWebhook = jest.fn();
const sendBacklog = jest.fn();
const mutation = (mutate = jest.fn()) => ({ mutate, isPending: false });
const ok = <T,>(data: T) => ({ data, isLoading: false, isError: false, refetch: jest.fn() });

let deliveries = ok<unknown[]>([]);
let keys = ok<unknown[]>([]);
let endpoints = ok<unknown[]>([]);

jest.mock('@/lib/hooks/use-integrations', () => ({
  useIntegrationCatalog: () =>
    ok({
      apiVersion: '2026-10-28',
      eventTypes: ['invoice.paid', 'invoice.overdue'],
      scopes: ['invoices:read', 'notes:write'],
      encryptionConfigured: false,
    }),
  useIntegrationKeys: () => keys,
  useWebhookEndpoints: () => endpoints,
  useWebhookDeliveries: () => deliveries,
  useCreateIntegrationKey: () => mutation(createKey),
  useRevokeIntegrationKey: () => mutation(),
  useCreateWebhookEndpoint: () => mutation(createWebhook),
  useUpdateWebhookEndpoint: () => mutation(),
  useDeleteWebhookEndpoint: () => mutation(),
  useTestWebhookEndpoint: () => mutation(),
  useSendOverdueBacklog: () => mutation(sendBacklog),
  useRedeliverWebhook: () => mutation(),
}));

// Imported after the mocks.
import { FlowlineConnect } from './flowline-connect';

function keysOf(o: unknown, prefix = ''): string[] {
  if (!o || typeof o !== 'object') return [prefix];
  return Object.entries(o as Record<string, unknown>).flatMap(([k, v]) =>
    keysOf(v, prefix ? `${prefix}.${k}` : k),
  );
}

describe('FlowlineConnect', () => {
  beforeEach(() => {
    createKey.mockReset();
    createWebhook.mockReset();
    deliveries = ok([]);
    keys = ok([]);
    endpoints = ok([]);
    sendBacklog.mockReset();
    toast.mockReset();
  });

  it('sends the overdue backlog only after an explicit confirmation (audit F2)', () => {
    endpoints = ok([
      {
        id: 'w1',
        name: 'FlowLine',
        url: 'https://flow.example/api/public/webhooks/x',
        secretHint: 'whs…ab12',
        eventTypes: ['invoice.overdue'],
        isActive: true,
        createdAt: '2026-10-31T00:00:00.000Z',
        updatedAt: '2026-10-31T00:00:00.000Z',
      },
    ]);
    render(<FlowlineConnect />);
    fireEvent.click(screen.getByRole('button', { name: 'step2.backlog' }));
    expect(sendBacklog).not.toHaveBeenCalled();
    expect(screen.getByText('step2.backlogDescription')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'step2.backlog' }));
    expect(sendBacklog).toHaveBeenCalledWith('w1', expect.any(Object));

    // The API refuses an endpoint that was disabled meanwhile: its code gets en/ar copy.
    const { onError } = sendBacklog.mock.calls[0][1] as { onError: (e: unknown) => void };
    onError({ response: { data: { code: 'WEBHOOK_ENDPOINT_INACTIVE', message: 'Enable it' } } });
    expect(toast).toHaveBeenLastCalledWith(
      expect.objectContaining({ description: 'step2.backlogInactive', variant: 'destructive' }),
    );
    onError({ response: { data: { message: 'Webhook endpoint not found' } } });
    expect(toast).toHaveBeenLastCalledWith(
      expect.objectContaining({ description: 'Webhook endpoint not found' }),
    );
  });

  it('has every string in English and Arabic', () => {
    expect(keysOf(arSettings.flowline).sort()).toEqual(keysOf(enSettings.flowline).sort());
    expect(arSettings.hub.flowline.title).toBeTruthy();
  });

  it('shows the API address, warns when encryption is not configured, and shows empty states', () => {
    render(<FlowlineConnect />);
    expect(screen.getByText('encryptionMissing')).toBeInTheDocument();
    expect(screen.getByText('step1.empty')).toBeInTheDocument();
    expect(screen.getByText('step2.empty')).toBeInTheDocument();
    expect(screen.getByText('log.empty')).toBeInTheDocument();
    expect(screen.getByDisplayValue(/\/integrations\/v1$/)).toBeInTheDocument();
  });

  it('creates a key with all scopes selected by default', () => {
    render(<FlowlineConnect />);
    fireEvent.click(screen.getByRole('button', { name: 'step1.create' }));
    expect(createKey).toHaveBeenCalledWith(
      { name: 'FlowLine', scopes: ['invoices:read', 'notes:write'] },
      expect.any(Object),
    );
  });

  it('requires URL and a 16+ character secret before adding a webhook', () => {
    render(<FlowlineConnect />);
    const add = screen.getByRole('button', { name: 'step2.add' });
    expect(add).toBeDisabled();
    fireEvent.change(screen.getByLabelText('step2.url'), {
      target: { value: 'https://flow.example/api/public/webhooks/x' },
    });
    fireEvent.change(screen.getByLabelText('step2.secret'), {
      target: { value: 'whsec_0123456789abcdef' },
    });
    expect(add).not.toBeDisabled();
    fireEvent.click(add);
    expect(createWebhook).toHaveBeenCalledWith(
      {
        name: 'FlowLine',
        url: 'https://flow.example/api/public/webhooks/x',
        secret: 'whsec_0123456789abcdef',
        eventTypes: ['invoice.paid', 'invoice.overdue'],
      },
      expect.any(Object),
    );
  });

  it('shows a load error with retry instead of an empty list', () => {
    keys = {
      data: undefined as unknown as unknown[],
      isLoading: false,
      isError: true,
      refetch: jest.fn(),
    };
    render(<FlowlineConnect />);
    expect(screen.queryByText('step1.empty')).not.toBeInTheDocument();
    expect(screen.getAllByText('loadFailed').length).toBeGreaterThan(0);
  });

  it('labels a queued delivery that already failed once as retrying', () => {
    deliveries = ok([
      {
        id: 'd1',
        eventId: 'evt_1',
        eventType: 'invoice.paid',
        status: 'PENDING',
        attempts: 1,
        maxAttempts: 8,
        nextAttemptAt: new Date().toISOString(),
        lastStatusCode: 503,
        lastError: 'HTTP 503',
        deliveredAt: null,
        createdAt: new Date().toISOString(),
        endpoint: { id: 'e', name: 'FlowLine' },
      },
    ]);
    render(<FlowlineConnect />);
    expect(screen.getByText('log.status.RETRYING')).toBeInTheDocument();
    expect(screen.getByText('HTTP 503')).toBeInTheDocument();
  });
});

describe('integrations api helpers', () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
  });

  it('derives the FlowLine-facing base URL', () => {
    delete process.env.NEXT_PUBLIC_INTEGRATIONS_BASE_URL;
    process.env.NEXT_PUBLIC_API_URL = 'https://mizano.example.com/api';
    expect(integrationsBaseUrl()).toBe('https://mizano.example.com/api/integrations/v1');
    process.env.NEXT_PUBLIC_API_URL = '/api';
    expect(integrationsBaseUrl('https://pi.example')).toBe(
      'https://pi.example/api/integrations/v1',
    );
    process.env.NEXT_PUBLIC_INTEGRATIONS_BASE_URL = 'https://public.example/api/integrations/v1/';
    expect(integrationsBaseUrl()).toBe('https://public.example/api/integrations/v1');
  });

  it('unwraps an optional data envelope', () => {
    expect(unwrap<number[]>([1])).toEqual([1]);
    expect(unwrap<{ a: number }>({ data: { a: 1 } })).toEqual({ a: 1 });
  });
});
