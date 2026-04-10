import React from "react";

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-canvas flex items-center justify-center p-8">
          <div className="text-center max-w-md">
            <h1 className="text-2xl font-bold text-cream font-serif-italic mb-4">
              Something went wrong
            </h1>
            <p className="text-muted-foreground mb-6">
              We're working on fixing this. Please try refreshing the page.
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={() => window.location.reload()}
                className="px-6 py-3 bg-cream text-cream-text rounded-lg font-medium hover:opacity-90 transition-opacity"
              >
                Refresh Page
              </button>
              <a
                href="/home"
                className="px-6 py-3 border border-cream text-cream rounded-lg font-medium hover:opacity-90 transition-opacity"
              >
                Back to Home
              </a>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
