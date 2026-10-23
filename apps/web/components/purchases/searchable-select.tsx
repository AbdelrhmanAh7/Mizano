'use client';

import * as React from 'react';
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ChevronDown, Check, Loader2, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SearchableOption {
  id: string;
  label: string;
  sublabel?: string;
  data?: unknown;
}

export interface SearchResult {
  options: SearchableOption[];
  totalPages?: number;
  total?: number;
}

export interface SearchableSelectProps {
  value?: string;
  onValueChange: (value: string, option?: SearchableOption) => void;
  options?: SearchableOption[];
  onSearch?: (query: string, page: number) => Promise<SearchResult>;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  ariaLabel?: string;
  dataTestId?: string;
  disabled?: boolean;
  className?: string;
  isInvalid?: boolean;
  previousPageText?: string;
  nextPageText?: string;
  pageOfText?: (page: number, totalPages: number) => string;
}

export function SearchableSelect({
  value,
  onValueChange,
  options = [],
  onSearch,
  placeholder = 'Select...',
  searchPlaceholder = 'Search...',
  emptyText = 'No results found',
  ariaLabel,
  dataTestId,
  disabled = false,
  className,
  isInvalid = false,
  previousPageText = 'Previous',
  nextPageText = 'Next',
  pageOfText = (p, tp) => `Page ${p} of ${tp}`,
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [_total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [loadedOptions, setLoadedOptions] = useState<SearchableOption[]>(options);

  // Persistent cache of all known options to ensure selected options are never lost
  const cacheRef = useRef<Map<string, SearchableOption>>(new Map());
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Seed cache with any passed options
  useEffect(() => {
    if (options && options.length > 0) {
      options.forEach((o) => cacheRef.current.set(o.id, o));
      setLoadedOptions((prev) => {
        const map = new Map<string, SearchableOption>();
        prev.forEach((o) => map.set(o.id, o));
        options.forEach((o) => map.set(o.id, o));
        return Array.from(map.values());
      });
    }
  }, [options]);

  // Seed cache with selected value when matching option exists
  useEffect(() => {
    if (value) {
      const found =
        options?.find((o) => o.id === value) || loadedOptions.find((o) => o.id === value);
      if (found) {
        cacheRef.current.set(value, found);
      }
    }
  }, [value, options, loadedOptions]);

  const onSearchRef = useRef(onSearch);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, []);

  useEffect(() => {
    onSearchRef.current = onSearch;
  });

  const executeSearch = useCallback(async (query: string, targetPage: number) => {
    if (!onSearchRef.current) return;
    setIsLoading(true);
    try {
      const res = await onSearchRef.current(query, targetPage);
      if (!isMountedRef.current) return;
      setLoadedOptions(res.options);
      setTotalPages(res.totalPages && res.totalPages > 0 ? res.totalPages : 1);
      setTotal(res.total ?? res.options.length);
      res.options.forEach((o) => cacheRef.current.set(o.id, o));
    } catch {
      // Keep existing options on failure
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  // Initial fetch if onSearch is provided
  useEffect(() => {
    if (onSearch) {
      void executeSearch('', 1);
    }
  }, [onSearch, executeSearch]);

  const handleOpenChange = (newOpen: boolean) => {
    setIsOpen(newOpen);
    if (newOpen) {
      setSearchQuery('');
      setPage(1);
      if (onSearch) {
        void executeSearch('', 1);
      }
    }
  };

  const handleSearchChange = (query: string) => {
    setSearchQuery(query);
    setPage(1);
    if (onSearch) {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      if (process.env.NODE_ENV === 'test') {
        void executeSearch(query, 1);
      } else {
        debounceTimerRef.current = setTimeout(() => {
          void executeSearch(query, 1);
        }, 250);
      }
    }
  };

  const handlePageChange = (newPage: number) => {
    if (newPage < 1 || newPage > totalPages) return;
    setPage(newPage);
    if (onSearch) {
      void executeSearch(searchQuery, newPage);
    }
  };

  const handleSelect = (option: SearchableOption) => {
    cacheRef.current.set(option.id, option);
    onValueChange(option.id, option);
    setIsOpen(false);
  };

  // Build the list of options to display, guaranteeing selected option is preserved
  const displayOptions = useMemo(() => {
    let list = loadedOptions;
    if (!onSearch && searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (o) => o.label.toLowerCase().includes(q) || o.sublabel?.toLowerCase().includes(q),
      );
    }

    // Preserve selected option if not in the current page/search results
    if (value && value !== 'none' && !list.some((o) => o.id === value)) {
      const cached = cacheRef.current.get(value);
      if (cached) {
        return [cached, ...list];
      }
    }
    return list;
  }, [loadedOptions, onSearch, searchQuery, value]);

  // Label to display on the trigger button
  const selectedOption = value ? cacheRef.current.get(value) : undefined;
  const triggerLabel = selectedOption?.label || (value === 'none' ? placeholder : undefined);

  return (
    <Popover open={isOpen} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={isOpen}
          aria-label={ariaLabel}
          aria-invalid={isInvalid}
          data-testid={dataTestId}
          disabled={disabled}
          className={cn(
            'h-8 w-full justify-between text-left font-normal text-xs px-2 truncate',
            isInvalid && 'border-destructive',
            className,
          )}
        >
          <span className="truncate">{triggerLabel || placeholder}</span>
          <ChevronDown className="ml-1 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-2" align="start">
        {/* Search Input */}
        <div className="relative mb-2">
          <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            data-testid={dataTestId ? `${dataTestId}-search` : 'searchable-select-search'}
            placeholder={searchPlaceholder}
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="h-8 pl-8 text-xs"
          />
          {isLoading && (
            <Loader2 className="absolute right-2 top-2.5 h-3.5 w-3.5 animate-spin text-muted-foreground" />
          )}
        </div>

        {/* Options List */}
        <div className="max-h-48 overflow-y-auto space-y-0.5" role="listbox">
          {displayOptions.length === 0 ? (
            <div className="py-4 text-center text-xs text-muted-foreground">
              {isLoading ? (
                <div className="flex items-center justify-center gap-1.5">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Loading...</span>
                </div>
              ) : (
                emptyText
              )}
            </div>
          ) : (
            displayOptions.map((opt) => {
              const isSelected = opt.id === value;
              return (
                <button
                  key={opt.id}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  data-value={opt.id}
                  onClick={() => handleSelect(opt)}
                  className={cn(
                    'flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent hover:text-accent-foreground',
                    isSelected && 'bg-accent/50 font-medium',
                  )}
                >
                  <div className="truncate flex-1 pr-2">
                    <span className="truncate block">{opt.label}</span>
                    {opt.sublabel && (
                      <span className="text-[10px] text-muted-foreground block truncate">
                        {opt.sublabel}
                      </span>
                    )}
                  </div>
                  {isSelected && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
                </button>
              );
            })
          )}
        </div>

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-2 mt-1 border-t text-[11px] text-muted-foreground">
            <span>{pageOfText(page, totalPages)}</span>
            <div className="flex gap-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 px-1.5 text-xs"
                disabled={page <= 1 || isLoading}
                onClick={() => handlePageChange(page - 1)}
              >
                {previousPageText}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 px-1.5 text-xs"
                disabled={page >= totalPages || isLoading}
                onClick={() => handlePageChange(page + 1)}
              >
                {nextPageText}
              </Button>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
