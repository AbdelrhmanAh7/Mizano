'use client';

import { useLocale } from 'next-intl';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { countries } from '@/lib/data/countries';

const ARABIC_COUNTRIES: Record<string, string> = {
  US: 'الولايات المتحدة',
  EG: 'مصر',
  SA: 'المملكة العربية السعودية',
  AE: 'الإمارات العربية المتحدة',
  GB: 'المملكة المتحدة',
  DE: 'ألمانيا',
  FR: 'فرنسا',
  CA: 'كندا',
  AU: 'أستراليا',
  CN: 'الصين',
  IN: 'الهند',
  JP: 'اليابان',
};

interface CountrySelectProps {
  value?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
}

function useSafeLocale(): string {
  try {
    return useLocale();
  } catch {
    return 'en';
  }
}

export function CountrySelect({
  value,
  onValueChange,
  placeholder,
  disabled,
  id,
}: CountrySelectProps) {
  const locale = useSafeLocale();
  const isArabic = locale.startsWith('ar');
  const defaultPlaceholder = isArabic ? 'اختر الدولة' : 'Select country';
  const effectivePlaceholder = placeholder || defaultPlaceholder;

  const getCountryDisplay = (nameOrCode: string) => {
    const c = countries.find(
      (country) => country.name === nameOrCode || country.code === nameOrCode,
    );
    if (!c) return nameOrCode;
    const arName = ARABIC_COUNTRIES[c.code];
    return isArabic && arName ? `${c.flag} ${arName} (${c.name})` : `${c.flag} ${c.name}`;
  };

  return (
    <Select value={value || ''} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger id={id}>
        <SelectValue placeholder={effectivePlaceholder}>
          {value ? getCountryDisplay(value) : effectivePlaceholder}
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="max-h-[300px]">
        {countries.map((c) => {
          const arName = ARABIC_COUNTRIES[c.code];
          return (
            <SelectItem key={c.code} value={c.name}>
              {c.flag} {isArabic && arName ? `${arName} (${c.name})` : c.name}
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
