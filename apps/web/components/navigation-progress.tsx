'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

/**
 * A slim top-of-page progress bar that shows during Next.js page navigations.
 * Automatically detects route changes via pathname/searchParams.
 * Also intercepts <a> clicks for internal links to start the bar early.
 */
export function NavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startLoading = useCallback(() => {
    setIsLoading(true);
    setProgress(0);

    // Clear any existing interval
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    // Simulate progress: fast at start, slows down as it approaches 90%
    let currentProgress = 0;
    intervalRef.current = setInterval(() => {
      currentProgress += Math.max(1, (90 - currentProgress) * 0.1);
      if (currentProgress >= 90) {
        currentProgress = 90;
        if (intervalRef.current) clearInterval(intervalRef.current);
      }
      setProgress(currentProgress);
    }, 100);
  }, []);

  const completeLoading = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setProgress(100);

    // Fade out after reaching 100%
    timeoutRef.current = setTimeout(() => {
      setIsLoading(false);
      setProgress(0);
    }, 300);
  }, []);

  // Complete loading when route changes
  useEffect(() => {
    completeLoading();
  }, [pathname, searchParams, completeLoading]);

  // Intercept clicks on internal links to start the progress bar early
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest('a');
      if (!target) return;

      const href = target.getAttribute('href');
      if (!href) return;

      // Skip external links, anchors, and links with modifiers
      if (
        href.startsWith('http') ||
        href.startsWith('#') ||
        href.startsWith('mailto:') ||
        target.target === '_blank' ||
        e.ctrlKey ||
        e.metaKey ||
        e.shiftKey
      ) {
        return;
      }

      // Don't start if clicking the same page
      const currentPath =
        pathname + (searchParams?.toString() ? `?${searchParams.toString()}` : '');
      if (href === currentPath || href === pathname) return;

      startLoading();
    };

    document.addEventListener('click', handleClick, { capture: true });
    return () => document.removeEventListener('click', handleClick, { capture: true });
  }, [pathname, searchParams, startLoading]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  if (!isLoading && progress === 0) return null;

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[9999] h-[3px] pointer-events-none"
      role="progressbar"
      aria-valuenow={Math.round(progress)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full transition-all duration-200 ease-out"
        style={{
          width: `${progress}%`,
          background: 'hsl(var(--primary))',
          boxShadow: '0 0 8px hsl(var(--primary) / 0.4), 0 0 4px hsl(var(--primary) / 0.2)',
          opacity: progress === 100 ? 0 : 1,
          transition:
            progress === 100
              ? 'width 200ms ease-out, opacity 300ms ease-out 100ms'
              : 'width 200ms ease-out',
        }}
      />
    </div>
  );
}
