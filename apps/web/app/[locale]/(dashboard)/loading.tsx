import { Skeleton } from '@/components/ui/skeleton';

export default function PageLoading() {
  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <Skeleton className="h-9 w-48" />
          <Skeleton className="h-4 w-72 mt-2" />
        </div>
        <Skeleton className="h-9 w-32" />
      </div>

      {/* AI Panel Placeholder */}
      <Skeleton className="h-20 w-full rounded-xl" />

      {/* Filter Bar */}
      <div className="rounded-xl border bg-card p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <Skeleton className="h-9 flex-1 max-w-sm" />
          <Skeleton className="h-9 w-32" />
          <Skeleton className="h-9 w-9" />
        </div>
      </div>

      {/* Data Table */}
      <div className="rounded-xl border bg-card">
        {/* Table Header */}
        <div className="border-b px-4 py-3">
          <div className="flex gap-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-4 flex-1" />
            ))}
          </div>
        </div>
        {/* Table Rows */}
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="border-b px-4 py-3 last:border-b-0">
            <div className="flex gap-4">
              {Array.from({ length: 5 }).map((_, j) => (
                <Skeleton key={j} className="h-4 flex-1" />
              ))}
            </div>
          </div>
        ))}
        {/* Pagination */}
        <div className="px-4 py-3 flex items-center justify-between">
          <Skeleton className="h-4 w-32" />
          <div className="flex gap-1">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-8" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
