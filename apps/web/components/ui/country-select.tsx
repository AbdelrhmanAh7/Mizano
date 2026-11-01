'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useMemo } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { countries } from '@/lib/data/countries';

interface CountrySelectProps {
  value?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
}

export function CountrySelect({
  value,
  onValueChange,
  placeholder,
  disabled,
  id,
}: CountrySelectProps) {
  const t = useTranslations('common.a11y');
  const locale = useLocale();
  const label = placeholder ?? t('selectCountry');
  // The stored value stays the English name; only the shown name follows the screen language.
  const regionNames = useMemo(() => {
    try {
      return new Intl.DisplayNames([locale], { type: 'region' });
    } catch {
      return null;
    }
  }, [locale]);
  const shownName = (code: string, fallback: string): string => regionNames?.of(code) ?? fallback;
  const selected = value ? countries.find((c) => c.name === value || c.code === value) : undefined;

  return (
    <Select value={value || ''} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger id={id}>
        <SelectValue placeholder={label}>
          {selected
            ? `${selected.flag} ${shownName(selected.code, selected.name)}`
            : value || label}
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="max-h-[300px]">
        {countries.map((c) => (
          <SelectItem key={c.code} value={c.name}>
            {c.flag} {shownName(c.code, c.name)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
