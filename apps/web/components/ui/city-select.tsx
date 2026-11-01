'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
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
}

export function CitySelect({
  value,
  onValueChange,
  country,
  placeholder,
  disabled,
  id,
}: CitySelectProps) {
  const t = useTranslations('common.a11y');
  const cities = useMemo(() => {
    if (!country) return [];
    // Find country code from name
    const countryObj = countries.find((c) => c.name === country || c.code === country);
    if (!countryObj) return [];
    return citiesByCountry[countryObj.code] || [];
  }, [country]);

  // If no cities data for this country, fall back to text input
  if (cities.length === 0) {
    return (
      <Input
        id={id}
        value={value || ''}
        onChange={(e) => onValueChange?.(e.target.value)}
        placeholder={country ? t('enterCity') : t('selectCountryFirst')}
        disabled={disabled || !country}
      />
    );
  }

  return (
    <Select value={value || ''} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger id={id}>
        <SelectValue placeholder={placeholder ?? t('selectCity')} />
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
