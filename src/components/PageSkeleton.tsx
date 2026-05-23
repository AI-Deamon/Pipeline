import { Zap } from 'lucide-react';

interface PageSkeletonProps {
  type?: 'dashboard' | 'project' | 'scan' | 'history' | 'form';
}

export function PageSkeleton({ type = 'dashboard' }: PageSkeletonProps) {
  const renderFormSkeleton = () => (
    <div className="max-w-md mx-auto space-y-6 animate-pulse">
      <div className="space-y-2">
        <div className="h-4 w-32 bg-slate-200 rounded-md"></div>
        <div className="h-12 w-full bg-white border border-slate-200 rounded-xl"></div>
      </div>
      <div className="space-y-2">
        <div className="h-4 w-32 bg-slate-200 rounded-md"></div>
        <div className="h-12 w-full bg-white border border-slate-200 rounded-xl"></div>
      </div>
      <div className="space-y-2">
        <div className="h-4 w-32 bg-slate-200 rounded-md"></div>
        <div className="h-12 w-full bg-white border border-slate-200 rounded-xl"></div>
      </div>
      <div className="pt-4">
        <div className="h-12 w-full bg-slate-200 rounded-xl"></div>
      </div>
    </div>
  );

  const renderDashboardSkeleton = () => (
    <div className="space-y-8 animate-pulse">
      <div className="flex justify-between items-end">
        <div className="space-y-2">
          <div className="h-8 w-64 bg-slate-200 rounded-lg"></div>
          <div className="h-4 w-48 bg-slate-100 rounded-md"></div>
        </div>
        <div className="h-12 w-40 bg-slate-200 rounded-xl"></div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-64 bg-white border border-slate-200 rounded-[2rem] p-8 space-y-4">
            <div className="flex justify-between">
              <div className="h-10 w-10 bg-slate-100 rounded-xl"></div>
              <div className="h-6 w-20 bg-slate-100 rounded-full"></div>
            </div>
            <div className="h-6 w-3/4 bg-slate-100 rounded-lg"></div>
            <div className="space-y-2">
              <div className="h-4 w-full bg-slate-50 rounded"></div>
              <div className="h-4 w-5/6 bg-slate-50 rounded"></div>
            </div>
            <div className="pt-4 flex gap-2">
              <div className="h-10 flex-1 bg-slate-100 rounded-xl"></div>
              <div className="h-10 flex-1 bg-slate-100 rounded-xl"></div>
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
          <div className="h-12 w-12 bg-slate-200 rounded-2xl"></div>
          <div className="space-y-2">
            <div className="h-8 w-48 bg-slate-200 rounded-lg"></div>
            <div className="h-4 w-32 bg-slate-100 rounded-md"></div>
          </div>
        </div>
        <div className="flex gap-3">
          <div className="h-12 w-32 bg-slate-200 rounded-2xl"></div>
          <div className="h-12 w-12 bg-slate-200 rounded-2xl"></div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <div className="h-48 bg-white border border-slate-200 rounded-[2rem]"></div>
          <div className="bg-white border border-slate-200 rounded-[2rem] overflow-hidden">
            <div className="h-16 bg-slate-50 border-b border-slate-100"></div>
            <div className="p-8 space-y-6">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 bg-slate-100 rounded-xl"></div>
                    <div className="space-y-1">
                      <div className="h-4 w-32 bg-slate-100 rounded"></div>
                      <div className="h-3 w-20 bg-slate-50 rounded"></div>
                    </div>
                  </div>
                  <div className="h-4 w-4 bg-slate-100 rounded"></div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="h-96 bg-white border border-slate-200 rounded-[2rem]"></div>
      </div>
    </div>
  );

  return (
    <div className="p-8">
      {type === 'form' ? renderFormSkeleton() : type === 'dashboard' ? renderDashboardSkeleton() : renderScanSkeleton()}

      {/* Centered Loading Logo */}
      <div className="fixed inset-0 pointer-events-none flex flex-col items-center justify-center z-50">
        <div className="relative">
          <div className="absolute inset-0 bg-blue-600/20 blur-3xl rounded-full scale-150 animate-pulse"></div>
          <div className="bg-white p-6 rounded-[2.5rem] shadow-2xl shadow-blue-200/50 border border-blue-50 relative flex flex-col items-center">
            <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
            <Zap className="w-8 h-8 text-blue-600 absolute top-10" />
            <div className="flex flex-col items-center gap-1">
              <span className="text-slate-900 font-black tracking-tighter text-lg leading-none">PIPELINE</span>
              <span className="text-blue-600 font-bold text-[10px] uppercase tracking-[0.2em] leading-none">Synchronizing</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
