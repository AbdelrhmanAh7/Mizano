'use client';

import { useEffect, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Check, ChevronDown, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

export interface ComboboxOption<T = unknown> {
  id: string;
  label: string;
  sublabel?: string;
  data?: T;
}

export interface ComboboxPage<T = unknown> {
  options: ComboboxOption<T>[];
  totalPages: number;
}

export interface AsyncComboboxProps<T> {
  /** Stable React Query key prefix for this lookup, e.g. ['customers', 'combobox']. */
  queryKey: readonly unknown[];
  /** Server-side search and paging; called only while the list is open. */
  search: (query: string, page: number) => Promise<ComboboxPage<T>>;
  value?: string;
  /** Label of the selected record when it is not on the loaded page (editing, deep links). */
  selectedLabel?: string;
  onValueChange: (id: string, option: ComboboxOption<T> | undefined) => void;
  placeholder: string;
  /** Optional first entry that clears the value (e.g. "Custom item"); picks id ''. */
  noneLabel?: string;
  /** Second line computed at render (so cached pages never carry a stale currency). */
  describe?: (option: ComboboxOption<T>) => string | undefined;
  id?: string;
  ariaLabel?: string;
  disabled?: boolean;
  isInvalid?: boolean;
  className?: string;
}

const SEARCH_DELAY_MS = process.env.NODE_ENV === 'test' ? 0 : 250;
const NONE_VALUE = '__none__';

/**
 * A searchable, paged picker for lists too long to load at once (customers, vendors, items).
 * Search and paging run on the server, so record 101 is as reachable as record 1 (audit B11).
 * Keyboard: type to search, arrows move, Enter picks, Escape closes (cmdk + Radix popover,
 * which follow the app's DirectionProvider). Loading, failure (with retry) and "no results"
 * stay distinct (review-lessons §11).
 */
export function AsyncCombobox<T>({
  queryKey,
  search,
  value,
  selectedLabel,
  onValueChange,
  placeholder,
  noneLabel,
  describe,
  id,
  ariaLabel,
  disabled,
  isInvalid,
  className,
}: AsyncComboboxProps<T>) {
  const t = useTranslations('common.combobox');
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [picked, setPicked] = useState<ComboboxOption<T> | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(text.trim());
      setPage(1);
    }, SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [text]);

  const results = useQuery({
    queryKey: [...queryKey, query, page],
    queryFn: () => search(query, page),
    enabled: open,
    placeholderData: keepPreviousData,
  });

  const options = results.data?.options ?? [];
  const showNone = !!noneLabel && page === 1 && !query;
  // The highlighted row (arrows move it): the first row of every new result page, so typing
  // a name and pressing Enter picks the first match.
  const [active, setActive] = useState('');
  const firstId = showNone ? NONE_VALUE : (options[0]?.id ?? '');
  useEffect(() => setActive(firstId), [results.data, firstId]);
  const totalPages = Math.max(1, results.data?.totalPages ?? 1);
  const label = value
    ? ((picked?.id === value ? picked.label : undefined) ??
      options.find((o) => o.id === value)?.label ??
      selectedLabel)
    : undefined;

  const choose = (option: ComboboxOption<T> | undefined) => {
    setPicked(option ?? null);
    onValueChange(option?.id ?? '', option);
    setOpen(false);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setText('');
          setQuery('');
          setPage(1);
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={ariaLabel}
          aria-invalid={isInvalid || undefined}
          disabled={disabled}
          className={cn(
            'w-full justify-between font-normal',
            !label && 'text-muted-foreground',
            isInvalid && 'border-destructive',
            className,
          )}
        >
          <span className="truncate" dir="auto">
            {label ?? (value ? t('loading') : (noneLabel ?? placeholder))}
          </span>
          <ChevronDown className="ms-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] min-w-64 p-0" align="start">
        <Command
          shouldFilter={false}
          loop
          label={t('search')}
          value={active}
          onValueChange={setActive}
        >
          <div className="relative">
            <CommandInput value={text} onValueChange={setText} placeholder={t('search')} />
            {results.isFetching && (
              <Loader2 className="absolute end-3 top-3.5 h-4 w-4 animate-spin text-muted-foreground" />
            )}
          </div>
          <CommandList label={ariaLabel ?? placeholder}>
            {results.isError ? (
              <div className="space-y-2 py-4 text-center text-sm" role="alert">
                <p className="text-destructive">{t('error')}</p>
                <Button type="button" variant="outline" size="sm" onClick={() => results.refetch()}>
                  {t('retry')}
                </Button>
              </div>
            ) : results.isPending ? (
              <p className="py-4 text-center text-sm text-muted-foreground">{t('loading')}</p>
            ) : (
              <CommandGroup>
                {showNone && (
                  <CommandItem value={NONE_VALUE} onSelect={() => choose(undefined)}>
                    <span className="flex-1 truncate">{noneLabel}</span>
                    {!value && <Check className="h-4 w-4" />}
                  </CommandItem>
                )}
                {options.length === 0 ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">{t('empty')}</p>
                ) : (
                  options.map((option) => {
                    const sublabel = describe ? describe(option) : option.sublabel;
                    return (
                      <CommandItem
                        key={option.id}
                        value={option.id}
                        onSelect={() => choose(option)}
                        data-checked={option.id === value || undefined}
                      >
                        <span className="min-w-0 flex-1 text-start">
                          <span className="block truncate" dir="auto">
                            {option.label}
                          </span>
                          {sublabel && (
                            <span
                              className="block truncate text-xs text-muted-foreground"
                              dir="auto"
                            >
                              {sublabel}
                            </span>
                          )}
                        </span>
                        {option.id === value && <Check className="h-4 w-4" />}
                      </CommandItem>
                    );
                  })
                )}
              </CommandGroup>
            )}
          </CommandList>
          {totalPages > 1 && !results.isError && (
            <div className="flex items-center justify-between border-t px-2 py-1.5 text-xs text-muted-foreground">
              <span>{t('page', { current: page, total: totalPages })}</span>
              <div className="flex gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={page <= 1 || results.isFetching}
                  onClick={() => setPage((p) => p - 1)}
                >
                  {t('previous')}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={page >= totalPages || results.isFetching}
                  onClick={() => setPage((p) => p + 1)}
                >
                  {t('next')}
                </Button>
              </div>
            </div>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  );
}
