/**
 * Digits an Arabic document prints, stored in Organization.documentDigits: Western `latn` (0123)
 * or Arabic-Indic `arab` (٠١٢٣). English documents always print Western digits.
 */
export const DOCUMENT_DIGITS = ['latn', 'arab'] as const;
export type DocumentDigits = (typeof DOCUMENT_DIGITS)[number];

/** The stored setting, read defensively: anything but `arab` means Western digits. */
export function documentDigitsFrom(value: string | null | undefined): DocumentDigits {
  return value === 'arab' ? 'arab' : 'latn';
}
