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
      const errorMsg = this.state.error?.message || "Unknown error";
      // Generate a short error code from the message
      const errorCode = "ERR-" + Array.from(errorMsg)
        .reduce((hash, char) => ((hash << 5) - hash + char.charCodeAt(0)) | 0, 0)
        .toString(16)
        .replace("-", "")
        .slice(0, 8)
        .toUpperCase();
      const truncatedError = errorMsg.length > 80 ? errorMsg.slice(0, 80) + "..." : errorMsg;
      const mailtoHref = `mailto:support@leveluplearning.in?subject=${encodeURIComponent(`Error Report [${errorCode}]`)}&body=${encodeURIComponent(`Hi, I encountered an error on LevelUp.\n\nError code: ${errorCode}\nDetails: ${truncatedError}\nURL: ${window.location.href}\nTime: ${new Date().toISOString()}\n\nPlease help me resolve this.`)}`;

      return (
        <div className="min-h-screen bg-canvas flex items-center justify-center p-8">
          <div className="text-center max-w-md">
            <h1 className="text-2xl font-bold text-cream font-serif-italic mb-4">
              Something went wrong
            </h1>
            <p className="text-muted-foreground mb-2">
              We're working on fixing this. Please try refreshing the page.
            </p>
            <p className="text-xs text-muted-foreground font-mono mb-1">
              Error code: {errorCode}
            </p>
            <p className="text-xs text-muted-foreground mb-6 break-all">
              {truncatedError}
            </p>
            <div className="flex items-center justify-center gap-3 flex-wrap">
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
              <a
                href={mailtoHref}
                className="px-6 py-3 border border-border text-muted-foreground rounded-lg font-medium hover:text-foreground hover:border-cream transition-colors"
              >
                Contact Support
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
