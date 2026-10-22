/**
 * Pure helpers for customer payload transformation (POST /customers, PATCH /customers/:id).
 * Transforms customer form data into nested DTO structure matching CreateCustomerDto and UpdateCustomerDto.
 * - Builds nested billingAddress and shippingAddress objects
 * - Sets blank or cleared optional fields (displayName, email, phone, taxId, priceListId, address fields)
 *   to null (rather than omitting them) so that clearing fields in CustomerForm on existing customers
 *   correctly clears values in the database via Prisma
 * - Preserves undefined when a property was not supplied at all
 * - Drops notes because CreateCustomerDto / UpdateCustomerDto do not accept notes (forbidNonWhitelisted: true)
 * - Only sends fields allowed by the DTO whitelist
 */

export interface CustomerAddressInput {
  street?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
}

export interface CustomerAddressPayload {
  street: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
}

export interface CustomerFormInput {
  name: string;
  displayName?: string | null;
  email?: string | null;
  phone?: string | null;
  currency?: string | null;
  taxId?: string | null;
  paymentTerms?: number | string | null;
  notes?: string | null;
  billingAddress?: CustomerAddressInput | null;
  shippingAddress?: CustomerAddressInput | null;
  priceListId?: string | null;
}

export interface CustomerPayload {
  name: string;
  displayName?: string | null;
  email?: string | null;
  phone?: string | null;
  currency?: string;
  taxId?: string | null;
  paymentTerms?: number;
  billingAddress?: CustomerAddressPayload;
  shippingAddress?: CustomerAddressPayload;
  priceListId?: string | null;
}

export const clearableString = (v?: string | null): string | null | undefined => {
  if (v === undefined) return undefined;
  if (v === null) return null;
  const trimmed = v.trim();
  return trimmed === '' ? null : trimmed;
};

export function buildAddressPayload(
  address?: CustomerAddressInput | null,
): CustomerAddressPayload | undefined {
  if (address === undefined) return undefined;
  if (address === null) {
    return {
      street: null,
      city: null,
      state: null,
      postalCode: null,
      country: null,
    };
  }

  return {
    street: clearableString(address.street) ?? null,
    city: clearableString(address.city) ?? null,
    state: clearableString(address.state) ?? null,
    postalCode: clearableString(address.postalCode) ?? null,
    country: clearableString(address.country) ?? null,
  };
}

export function buildCustomerPayload(data: CustomerFormInput): CustomerPayload {
  const payload: CustomerPayload = {
    name: data.name ? data.name.trim() : '',
  };

  const displayName = clearableString(data.displayName);
  if (displayName !== undefined) payload.displayName = displayName;

  const email = clearableString(data.email);
  if (email !== undefined) payload.email = email;

  const phone = clearableString(data.phone);
  if (phone !== undefined) payload.phone = phone;

  if (data.currency !== undefined && data.currency !== null) {
    const trimmed = data.currency.trim();
    if (trimmed !== '') payload.currency = trimmed;
  }

  const taxId = clearableString(data.taxId);
  if (taxId !== undefined) payload.taxId = taxId;

  if (typeof data.paymentTerms === 'number' && !Number.isNaN(data.paymentTerms)) {
    payload.paymentTerms = data.paymentTerms;
  } else if (data.paymentTerms !== undefined && data.paymentTerms !== null) {
    const parsed = Number(data.paymentTerms);
    if (!Number.isNaN(parsed)) {
      payload.paymentTerms = parsed;
    }
  }

  if (data.billingAddress !== undefined) {
    payload.billingAddress = buildAddressPayload(data.billingAddress);
  }

  if (data.shippingAddress !== undefined) {
    payload.shippingAddress = buildAddressPayload(data.shippingAddress);
  }

  const priceListId = clearableString(data.priceListId);
  if (priceListId !== undefined) payload.priceListId = priceListId;

  return payload;
}
