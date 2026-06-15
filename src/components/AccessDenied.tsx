import type { FC } from 'react';

interface AccessDeniedProps {
  message?: string;
}

export const AccessDenied: FC<AccessDeniedProps> = ({
  message = "You don't have permission to access this resource.",
}) => {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] p-8">
      <div className="text-6xl mb-4">🔒</div>
      <h2 className="text-xl font-semibold text-gray-800 mb-2">Access Denied</h2>
      <p className="text-gray-600 text-center max-w-md">{message}</p>
    </div>
  );
};
