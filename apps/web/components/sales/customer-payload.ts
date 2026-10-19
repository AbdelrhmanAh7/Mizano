/**
 * Pure helpers for customer payload transformation (POST /customers, PATCH /customers/:id).
 * Transforms flat customer form data into nested DTO structure as required by CreateCustomerDto.
 * - Builds nested billingAddress and shippingAddress objects
 * - Leaves out empty and whitespace strings (undefined, not null)
 * - Drops an address when all of its fields are blank
 * - Drops notes because CreateCustomerDto does not accept notes (forbidNonWhitelisted: true)
 * - Only sends fields allowed by the DTO
 */

export interface CustomerAddressInput {
  street?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
}

export interface CustomerAddressPayload {
  street?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
}

export interface CustomerFormInput {
  name: string;
  displayName?: string | null;
  email?: string | null;
  phone?: string | null;
  currency?: string | null;
  taxId?: string | null;
  paymentTerms?: number | null;
  notes?: string | null;
  billingAddress?: CustomerAddressInput | null;
  shippingAddress?: CustomerAddressInput | null;
  priceListId?: string | null;
}

export interface CustomerPayload {
  name: string;
  displayName?: string;
  email?: string;
  phone?: string;
  currency?: string;
  taxId?: string;
  paymentTerms?: number;
  billingAddress?: CustomerAddressPayload;
  shippingAddress?: CustomerAddressPayload;
  priceListId?: string;
}

const optional = (v?: string | null): string | undefined =>
  v && v.trim() !== '' ? v.trim() : undefined;

export function buildAddressPayload(
  address?: CustomerAddressInput | null,
): CustomerAddressPayload | undefined {
  if (!address) return undefined;

  const street = optional(address.street);
  const city = optional(address.city);
  const state = optional(address.state);
  const postalCode = optional(address.postalCode);
  const country = optional(address.country);

  if (!street && !city && !state && !postalCode && !country) {
    return undefined;
  }

  const result: CustomerAddressPayload = {};
  if (street) result.street = street;
  if (city) result.city = city;
  if (state) result.state = state;
  if (postalCode) result.postalCode = postalCode;
  if (country) result.country = country;
  return result;
}

export function buildCustomerPayload(data: CustomerFormInput): CustomerPayload {
  const billingAddress = buildAddressPayload(data.billingAddress);
  const shippingAddress = buildAddressPayload(data.shippingAddress);

  const payload: CustomerPayload = {
    name: data.name ? data.name.trim() : '',
  };

  const displayName = optional(data.displayName);
  if (displayName) payload.displayName = displayName;

  const email = optional(data.email);
  if (email) payload.email = email;

  const phone = optional(data.phone);
  if (phone) payload.phone = phone;

  const currency = optional(data.currency);
  if (currency) payload.currency = currency;

  const taxId = optional(data.taxId);
  if (taxId) payload.taxId = taxId;

  if (typeof data.paymentTerms === 'number' && !Number.isNaN(data.paymentTerms)) {
    payload.paymentTerms = data.paymentTerms;
  }

  if (billingAddress) payload.billingAddress = billingAddress;
  if (shippingAddress) payload.shippingAddress = shippingAddress;

  const priceListId = optional(data.priceListId);
  if (priceListId) payload.priceListId = priceListId;

  return payload;
}
