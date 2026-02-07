'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  placeholder = 'Select country',
  disabled,
  id,
}: CountrySelectProps) {
  return (
    <Select value={value || ''} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger id={id}>
        <SelectValue placeholder={placeholder}>
          {value
            ? countries.find((c) => c.name === value || c.code === value)
              ? `${countries.find((c) => c.name === value || c.code === value)!.flag} ${value}`
              : value
            : placeholder}
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="max-h-[300px]">
        {countries.map((c) => (
          <SelectItem key={c.code} value={c.name}>
            {c.flag} {c.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
