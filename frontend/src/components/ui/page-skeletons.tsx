import { Skeleton } from "./skeleton";

export function PageSkeleton() {
  return (
    <div className="space-y-6" aria-busy>
      <Skeleton className="h-9 w-56" />
      <Skeleton className="h-40 w-full rounded-2xl" />
      <div className="grid gap-4 sm:grid-cols-2">
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-24 rounded-xl" />
      </div>
    </div>
  );
}

export function SongListSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-busy>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex items-center gap-4 rounded-xl border border-stone-200 bg-white p-4">
          <Skeleton className="h-8 w-24" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function LibrarySkeleton() {
  return (
    <div aria-busy>
      <Skeleton className="h-9 w-64" />
      <Skeleton className="mt-3 h-5 w-full max-w-xl" />
      <div className="mt-6 flex gap-2 overflow-hidden">
        {Array.from({ length: 8 }, (_, index) => (
          <Skeleton key={index} className="h-10 w-28 shrink-0 rounded-full" />
        ))}
      </div>
      <Skeleton className="mt-6 h-5 w-40" />
      <div className="mt-3">
        <SongListSkeleton />
      </div>
    </div>
  );
}

export function SongSkeleton() {
  return (
    <div aria-busy>
      <Skeleton className="h-6 w-36" />
      <div className="mt-3 rounded-2xl border border-stone-200 bg-white p-5 sm:p-7">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="mt-3 h-12 w-48 rounded-xl" />
        <Skeleton className="mt-4 h-5 w-72" />
        <Skeleton className="mt-6 h-8 w-3/4" />
        <Skeleton className="mt-2 h-6 w-1/3" />
      </div>
      <Skeleton className="mt-6 h-64 w-full rounded-xl" />
    </div>
  );
}
