'use client';

import { useEffect, useCallback, useState } from 'react';
import { useLogger } from '@/lib/hooks/use-logger';
import { LogLevel, LogSource, LogCategory, LogStatus } from '@mizano/shared-types';

/**
 * Global error boundary hook that captures unhandled errors and
 * unhandled promise rejections on the frontend.
 */
export function useGlobalErrorCapture() {
  const { captureError, captureWarning } = useLogger();

  useEffect(() => {
    // Capture unhandled errors
    const handleError = (event: ErrorEvent) => {
      captureError(
        event.error instanceof Error
          ? event.error
          : new Error(event.message || 'Unknown error'),
        {
          category: LogCategory.UNHANDLED_EXCEPTION,
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
        },
      );
    };

    // Capture unhandled promise rejections
    const handleRejection = (event: PromiseRejectionEvent) => {
      const error =
        event.reason instanceof Error
          ? event.reason
          : new Error(String(event.reason || 'Unhandled promise rejection'));
      captureError(error, {
        category: LogCategory.UNHANDLED_EXCEPTION,
        type: 'unhandledrejection',
      });
    };

    // Capture console.error calls
    const originalError = console.error;
    console.error = (...args: any[]) => {
      originalError.apply(console, args);
      const message = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
      // Skip React internals and our own logs
      if (
        !message.includes('[Mizano Logger]') &&
        !message.includes('Warning: ') &&
        !message.includes('in ConsoleError')
      ) {
        captureError(new Error(message), {
          category: LogCategory.RENDER_ERROR,
          source: 'console.error',
        });
      }
    };

    // Capture console.warn calls  
    const originalWarn = console.warn;
    console.warn = (...args: any[]) => {
      originalWarn.apply(console, args);
      const message = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
      if (!message.includes('[Mizano Logger]')) {
        captureWarning(message, {
          source: 'console.warn',
        });
      }
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleRejection);

    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleRejection);
      console.error = originalError;
      console.warn = originalWarn;
    };
  }, [captureError, captureWarning]);
}
