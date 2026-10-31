'use client';

import { useState, useEffect } from 'react';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useTranslations } from 'next-intl';

interface DataTableSearchProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function DataTableSearch({ value, onChange, placeholder }: DataTableSearchProps) {
  const t = useTranslations('common');
  const [localValue, setLocalValue] = useState(value);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const handleChange = (newValue: string) => {
    setLocalValue(newValue);
    onChange(newValue);
  };

  return (
    <div className="relative flex-1 max-w-sm">
      <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        placeholder={placeholder ?? t('table.searchPlaceholder')}
        value={localValue}
        onChange={(e) => handleChange(e.target.value)}
        className="ps-10 pe-8"
      />
      {localValue && (
        <Button
          variant="ghost"
          size="icon"
          className="absolute end-1 top-1/2 h-6 w-6 -translate-y-1/2"
          onClick={() => handleChange('')}
          aria-label={t('table.clearSearch')}
        >
          <X className="h-3 w-3" />
        </Button>
      )}
    </div>
  );
}
