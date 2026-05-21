const CourseCardSkeleton = () => (
  <div className="bg-surface border border-border rounded-xl overflow-hidden animate-pulse">
    <div className="aspect-video bg-surface-2" />
    <div className="p-4 space-y-2">
      <div className="h-4 bg-surface-2 rounded w-3/4" />
      <div className="h-3 bg-surface-2 rounded w-1/2" />
      <div className="h-3 bg-surface-2 rounded w-full" />
      <div className="h-3 bg-surface-2 rounded w-2/3" />
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
        <div className="h-4 bg-surface-2 rounded w-20" />
        <div className="h-3 bg-surface-2 rounded w-14" />
      </div>
    </div>
  </div>
);

export default CourseCardSkeleton;
