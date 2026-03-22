'use client';

import * as React from 'react';
import { Upload, File, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// ============ Types ============

interface FileDropZoneProps {
  onFileSelect: (file: File) => void;
  accept?: string[];
  maxSize?: number;
}

// ============ Helpers ============

const DEFAULT_ACCEPT = ['.csv', '.xlsx', '.xls'];
const DEFAULT_MAX_SIZE = 10 * 1024 * 1024; // 10MB

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isAcceptedFile(file: File, accept: string[]): boolean {
  const extension = `.${file.name.split('.').pop()?.toLowerCase()}`;
  return accept.some((ext) => ext.toLowerCase() === extension);
}

// ============ Component ============

export function FileDropZone({
  onFileSelect,
  accept = DEFAULT_ACCEPT,
  maxSize = DEFAULT_MAX_SIZE,
}: FileDropZoneProps): React.JSX.Element {
  const [isDragOver, setIsDragOver] = React.useState(false);
  const [selectedFile, setSelectedFile] = React.useState<File | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const handleFile = React.useCallback(
    (file: File) => {
      setError(null);

      if (!isAcceptedFile(file, accept)) {
        setError(`Unsupported file type. Accepted formats: ${accept.join(', ')}`);
        return;
      }

      if (file.size > maxSize) {
        setError(`File is too large. Maximum size: ${formatFileSize(maxSize)}`);
        return;
      }

      setSelectedFile(file);
      onFileSelect(file);
    },
    [accept, maxSize, onFileSelect],
  );

  const handleDragOver = React.useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = React.useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = React.useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);

      const file = e.dataTransfer.files[0];
      if (file) {
        handleFile(file);
      }
    },
    [handleFile],
  );

  const handleInputChange = React.useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        handleFile(file);
      }
    },
    [handleFile],
  );

  const handleClick = React.useCallback(() => {
    inputRef.current?.click();
  }, []);

  const handleClear = React.useCallback(() => {
    setSelectedFile(null);
    setError(null);
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  }, []);

  if (selectedFile) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10">
          <File className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{selectedFile.name}</p>
          <p className="text-xs text-muted-foreground">{formatFileSize(selectedFile.size)}</p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={handleClear}
          aria-label="Remove file"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div
        role="button"
        tabIndex={0}
        onClick={handleClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleClick();
          }
        }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-8 transition-colors',
          isDragOver
            ? 'border-primary bg-primary/5'
            : 'border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50',
          error && 'border-destructive/50',
        )}
      >
        <div
          className={cn(
            'flex h-12 w-12 items-center justify-center rounded-full',
            isDragOver ? 'bg-primary/10' : 'bg-muted',
          )}
        >
          <Upload
            className={cn('h-6 w-6', isDragOver ? 'text-primary' : 'text-muted-foreground')}
          />
        </div>
        <div className="text-center">
          <p className="text-sm font-medium">Drag and drop your file here, or click to browse</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Supported formats: {accept.join(', ')} (max {formatFileSize(maxSize)})
          </p>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <input
        ref={inputRef}
        type="file"
        accept={accept.join(',')}
        onChange={handleInputChange}
        className="hidden"
        aria-label="File upload"
      />
    </div>
  );
}
