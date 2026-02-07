'use client';

import { useMemo } from 'react';
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
  placeholder = 'Select city',
  disabled,
  id,
}: CitySelectProps) {
  const cities = useMemo(() => {
    if (!country) return [];
    // Find country code from name
    const countryObj = countries.find(
      (c) => c.name === country || c.code === country
    );
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
        placeholder={country ? 'Enter city name' : 'Select a country first'}
        disabled={disabled || !country}
      />
    );
  }

  return (
    <Select value={value || ''} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger id={id}>
        <SelectValue placeholder={placeholder} />
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
