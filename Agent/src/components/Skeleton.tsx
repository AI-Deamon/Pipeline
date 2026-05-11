interface SkeletonProps {
  className?: string;
}

export const Skeleton = ({ className }: SkeletonProps) => {
  return (
    <div className={`animate-pulse bg-slate-200 rounded ${className}`} />
  );
};

export const DashboardSkeleton = () => {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-10 w-32" />
      </div>
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="bg-slate-50 border-b border-slate-200 p-4">
          <Skeleton className="h-4 w-full" />
        </div>
        <div className="divide-y divide-slate-200">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="p-6 flex gap-4">
              <Skeleton className="h-12 w-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
