'use client';

import { useState, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { countries, countriesByCode } from '@/lib/data/countries';

interface PhoneInputProps {
  value?: string;
  onChange?: (value: string) => void;
  defaultCountry?: string;
  placeholder?: string;
  id?: string;
  disabled?: boolean;
}

function parsePhoneValue(value: string): { countryCode: string; number: string } {
  if (!value) return { countryCode: 'EG', number: '' };

  // Try to match dial code
  for (const country of countries) {
    if (value.startsWith(country.dialCode)) {
      return {
        countryCode: country.code,
        number: value.slice(country.dialCode.length).replace(/\s/g, ''),
      };
    }
  }
  return { countryCode: 'EG', number: value.replace(/[^\d]/g, '') };
}

export function PhoneInput({
  value = '',
  onChange,
  defaultCountry = 'EG',
  placeholder,
  id,
  disabled,
}: PhoneInputProps) {
  const parsed = useMemo(() => parsePhoneValue(value), [value]);
  const [selectedCountry, setSelectedCountry] = useState(parsed.countryCode || defaultCountry);
  const [phoneNumber, setPhoneNumber] = useState(parsed.number);

  const country = countriesByCode[selectedCountry];
  const maxLength = country ? Math.max(...country.phoneLength) : 15;

  const handleCountryChange = (code: string) => {
    setSelectedCountry(code);
    const c = countriesByCode[code];
    if (c && onChange) {
      onChange(phoneNumber ? `${c.dialCode}${phoneNumber}` : '');
    }
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/[^\d]/g, '');
    const trimmed = raw.slice(0, maxLength);
    setPhoneNumber(trimmed);
    if (onChange) {
      const c = countriesByCode[selectedCountry];
      onChange(trimmed ? `${c.dialCode}${trimmed}` : '');
    }
  };

  const isValid = useMemo(() => {
    if (!phoneNumber) return true;
    return country?.phoneLength.includes(phoneNumber.length) ?? true;
  }, [phoneNumber, country]);

  return (
    <div className="flex gap-2">
      <Select value={selectedCountry} onValueChange={handleCountryChange} disabled={disabled}>
        <SelectTrigger className="w-[130px] shrink-0">
          <SelectValue>{country ? `${country.flag} ${country.dialCode}` : 'Select'}</SelectValue>
        </SelectTrigger>
        <SelectContent className="max-h-[300px]">
          {countries.map((c) => (
            <SelectItem key={c.code} value={c.code}>
              {c.flag} {c.name} ({c.dialCode})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="flex-1">
        <Input
          id={id}
          type="tel"
          inputMode="numeric"
          placeholder={placeholder || `${maxLength} digits`}
          value={phoneNumber}
          onChange={handlePhoneChange}
          disabled={disabled}
          className={!isValid ? 'border-destructive focus-visible:ring-destructive' : ''}
        />
        {!isValid && phoneNumber && (
          <p className="text-xs text-destructive mt-1">
            Phone number should be {country.phoneLength.join(' or ')} digits for {country.name}
          </p>
        )}
      </div>
    </div>
  );
}
