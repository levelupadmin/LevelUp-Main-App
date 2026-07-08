const EventCardSkeleton = () => (
  <div className="bg-surface border border-border rounded-xl overflow-hidden">
    <div className="aspect-[4/3] skeleton-shimmer" />
    <div className="p-4 flex items-center justify-between">
      <div className="flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-full skeleton-shimmer flex-shrink-0" />
        <div className="space-y-1.5">
          <div className="h-3 skeleton-shimmer rounded w-24" />
          <div className="h-2 skeleton-shimmer rounded w-16" />
        </div>
      </div>
      <div className="space-y-1.5">
        <div className="h-2 skeleton-shimmer rounded w-20" />
        <div className="h-2 skeleton-shimmer rounded w-14 ml-auto" />
      </div>
    </div>
    <div className="px-4 pb-4">
      <div className="pt-3 border-t border-border">
        <div className="h-3 skeleton-shimmer rounded w-24" />
      </div>
    </div>
  </div>
);

export default EventCardSkeleton;
