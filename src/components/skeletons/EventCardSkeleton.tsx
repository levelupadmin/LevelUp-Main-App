const EventCardSkeleton = () => (
  <div className="bg-surface border border-border rounded-xl overflow-hidden animate-pulse">
    <div className="aspect-[4/3] bg-surface-2" />
    <div className="p-4 flex items-center justify-between">
      <div className="flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-full bg-surface-2 flex-shrink-0" />
        <div className="space-y-1.5">
          <div className="h-3 bg-surface-2 rounded w-24" />
          <div className="h-2 bg-surface-2 rounded w-16" />
        </div>
      </div>
      <div className="space-y-1.5">
        <div className="h-2 bg-surface-2 rounded w-20" />
        <div className="h-2 bg-surface-2 rounded w-14 ml-auto" />
      </div>
    </div>
    <div className="px-4 pb-4">
      <div className="pt-3 border-t border-border">
        <div className="h-3 bg-surface-2 rounded w-24" />
      </div>
    </div>
  </div>
);

export default EventCardSkeleton;
