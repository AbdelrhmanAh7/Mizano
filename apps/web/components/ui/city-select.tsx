'use client';

import { useMemo } from 'react';
import { useLocale } from 'next-intl';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { countries, citiesByCountry } from '@/lib/data/countries';

interface CitySelectProps {
  value?: string;
  onValueChange?: (value: string) => void;
  country?: string;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  'aria-label'?: string;
}

function useSafeLocale(): string {
  try {
    return useLocale();
  } catch {
    return 'en';
  }
}

export function CitySelect({
  value,
  onValueChange,
  country,
  placeholder,
  disabled,
  id,
  'aria-label': ariaLabel,
}: CitySelectProps) {
  const locale = useSafeLocale();
  const isArabic = locale.startsWith('ar');
  const hasCountry = Boolean(country && country.trim().length > 0);

  const cities = useMemo(() => {
    if (!hasCountry || !country) return [];
    const normalizedCountry = country.trim();
    // Find country code from name
    const countryObj = countries.find(
      (c) => c.name === normalizedCountry || c.code === normalizedCountry,
    );
    if (!countryObj) return [];
    return citiesByCountry[countryObj.code] || [];
  }, [hasCountry, country]);

  // If no country or no pre-seeded cities data for this country, fall back to text input
  if (cities.length === 0) {
    const defaultNoCountryPlaceholder = isArabic ? 'اختر الدولة أولاً' : 'Select a country first';
    const defaultCityPlaceholder = isArabic ? 'أدخل اسم المدينة' : 'Enter city name';
    const inputPlaceholder = hasCountry
      ? (placeholder ?? defaultCityPlaceholder)
      : defaultNoCountryPlaceholder;

    return (
      <Input
        id={id}
        value={value || ''}
        onChange={(e) => onValueChange?.(e.target.value)}
        placeholder={inputPlaceholder}
        disabled={disabled || !hasCountry}
        aria-label={ariaLabel}
      />
    );
  }

  const selectPlaceholder = placeholder ?? (isArabic ? 'اختر المدينة' : 'Select city');

  return (
    <Select value={value || ''} onValueChange={onValueChange} disabled={disabled || !hasCountry}>
      <SelectTrigger id={id} aria-label={ariaLabel}>
        <SelectValue placeholder={selectPlaceholder} />
      </SelectTrigger>
      <SelectContent className="max-h-[300px]">
        {cities.map((city) => (
          <SelectItem key={city} value={city}>
            {city}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
