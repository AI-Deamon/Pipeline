import { Terminal } from 'lucide-react';

interface PageSkeletonProps {
  type?: 'dashboard' | 'project' | 'scan' | 'history' | 'form';
}

export function PageSkeleton({ type = 'dashboard' }: PageSkeletonProps) {
  const renderDashboardSkeleton = () => (
    <div className="space-y-8 animate-pulse">
      <div className="flex justify-between items-end">
        <div className="space-y-2">
          <div className="h-8 w-64 bg-white/10 rounded-lg"></div>
          <div className="h-4 w-48 bg-white/5 rounded-md"></div>
        </div>
        <div className="h-12 w-40 bg-white/10 rounded-xl"></div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-64 bg-surface border border-white/10 rounded-3xl p-8 space-y-4">
            <div className="flex justify-between">
              <div className="h-10 w-10 bg-white/5 rounded-xl"></div>
              <div className="h-6 w-20 bg-white/5 rounded-full"></div>
            </div>
            <div className="h-6 w-3/4 bg-white/5 rounded-lg"></div>
            <div className="space-y-2">
              <div className="h-4 w-full bg-white/5 rounded"></div>
              <div className="h-4 w-5/6 bg-white/5 rounded"></div>
            </div>
            <div className="pt-4 flex gap-2">
              <div className="h-10 flex-1 bg-white/5 rounded-xl"></div>
              <div className="h-10 flex-1 bg-white/5 rounded-xl"></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderScanSkeleton = () => (
    <div className="max-w-7xl mx-auto space-y-8 animate-pulse">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 bg-white/10 rounded-2xl"></div>
          <div className="space-y-2">
            <div className="h-8 w-48 bg-white/10 rounded-lg"></div>
            <div className="h-4 w-32 bg-white/5 rounded-md"></div>
          </div>
        </div>
        <div className="flex gap-3">
          <div className="h-12 w-32 bg-white/10 rounded-2xl"></div>
          <div className="h-12 w-12 bg-white/10 rounded-2xl"></div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <div className="h-48 bg-surface border border-white/10 rounded-3xl"></div>
          <div className="bg-surface border border-white/10 rounded-3xl overflow-hidden">
            <div className="h-16 bg-white/5 border-b border-white/10"></div>
            <div className="p-8 space-y-6">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 bg-white/5 rounded-xl"></div>
                    <div className="space-y-1">
                      <div className="h-4 w-32 bg-white/5 rounded"></div>
                      <div className="h-3 w-20 bg-white/5 rounded"></div>
                    </div>
                  </div>
                  <div className="h-4 w-4 bg-white/5 rounded"></div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="h-96 bg-surface border border-white/10 rounded-3xl"></div>
      </div>
    </div>
  );

  return (
    <div className="p-8">
      {type === 'dashboard' ? renderDashboardSkeleton() : renderScanSkeleton()}
      
      {/* Centered Loading Logo */}
      <div className="fixed inset-0 pointer-events-none flex flex-col items-center justify-center z-50 bg-black/50 backdrop-blur-sm">
        <div className="relative">
          <div className="absolute inset-0 bg-primary/20 blur-3xl rounded-full scale-150 animate-pulse"></div>
          <div className="bg-surface p-6 rounded-3xl shadow-[0_0_50px_rgba(0,255,65,0.2)] border border-primary/20 relative flex flex-col items-center">
            <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4"></div>
            <Terminal className="w-8 h-8 text-primary absolute top-10" />
            <div className="flex flex-col items-center gap-1">
              <span className="text-white font-mono font-bold tracking-tighter text-lg leading-none uppercase">PIPELINE</span>
              <span className="text-primary font-bold text-[10px] uppercase tracking-[0.2em] leading-none animate-pulse">Synchronizing</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
