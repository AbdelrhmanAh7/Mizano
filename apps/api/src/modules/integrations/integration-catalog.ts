/**
 * The public contract of the FlowLine connector. Changing a name here is a breaking change for
 * every installed FlowLine flow: add new names instead of renaming.
 */
export const INTEGRATION_API_VERSION = '2026-10-28';

export const WEBHOOK_EVENT_TYPES = [
  'customer.created',
  'customer.updated',
  'invoice.created',
  'invoice.updated',
  'invoice.sent',
  'invoice.paid',
  'invoice.overdue',
  'invoice.voided',
  'payment.received',
  'payment.voided',
] as const;
export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number];

/** Sent only by "Send test event"; never part of a subscription. */
export const TEST_EVENT_TYPE = 'mizano.test';

export const INTEGRATION_SCOPES = [
  'customers:read',
  'customers:write',
  'invoices:read',
  'invoices:write',
  'balances:read',
  'notes:write',
] as const;
export type IntegrationScope = (typeof INTEGRATION_SCOPES)[number];

/**
 * A key acts as the user who created it, so on top of its scope the creator's role must still
 * hold the permission the equivalent web route requires. Revoking the user's permission (or
 * deactivating the user) disables the key without touching it.
 */
export const SCOPE_PERMISSION: Record<IntegrationScope, string> = {
  'customers:read': 'sales.view',
  'customers:write': 'sales.create',
  'invoices:read': 'sales.view',
  'invoices:write': 'sales.create',
  'balances:read': 'sales.view',
  'notes:write': 'sales.view',
};

export const NOTE_ENTITY_TYPES = ['customer', 'invoice'] as const;
