const PostSkeleton = () => (
  <div className="bg-surface border border-border rounded-xl p-4 space-y-3">
    <div className="flex items-center gap-3">
      <div className="w-9 h-9 rounded-full skeleton-shimmer flex-shrink-0" />
      <div className="space-y-1.5 flex-1">
        <div className="h-3 skeleton-shimmer rounded w-28" />
        <div className="h-2 skeleton-shimmer rounded w-16" />
      </div>
    </div>
    <div className="space-y-2">
      <div className="h-3 skeleton-shimmer rounded w-full" />
      <div className="h-3 skeleton-shimmer rounded w-5/6" />
      <div className="h-3 skeleton-shimmer rounded w-2/3" />
    </div>
    <div className="flex items-center gap-4 pt-1">
      <div className="h-3 skeleton-shimmer rounded w-10" />
      <div className="h-3 skeleton-shimmer rounded w-10" />
    </div>
  </div>
);

export default PostSkeleton;
