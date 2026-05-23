import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * ErrorBoundary catches render errors and chunk-loading failures.
 * Wraps the Suspense boundary in App.tsx to prevent white-screen crashes.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 p-8">
          <div className="max-w-md rounded-lg border border-red-200 bg-white p-6 shadow-lg">
            <h2 className="mb-2 text-xl font-bold text-red-700">Something went wrong</h2>
            <p className="mb-4 text-sm text-slate-600">
              The application encountered an unexpected error. Please try refreshing the page.
            </p>
            {this.state.error && (
              <pre className="mb-4 max-h-40 overflow-auto rounded bg-slate-100 p-3 text-xs font-mono text-slate-800">
                {this.state.error.message}
              </pre>
            )}
            <button
              type="button"
              className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 transition-colors"
              onClick={() => window.location.reload()}
            >
              Refresh Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
