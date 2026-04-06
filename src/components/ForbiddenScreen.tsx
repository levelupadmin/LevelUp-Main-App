import { Link } from "react-router-dom";

const ForbiddenScreen = () => (
  <div className="min-h-screen bg-canvas flex items-center justify-center p-8 grain">
    <div className="text-center max-w-md relative z-10">
      <p className="font-mono text-sm text-muted-foreground tracking-widest mb-4">403</p>
      <h1 className="text-3xl font-serif-italic text-cream mb-3">
        Access denied
      </h1>
      <p className="text-muted-foreground mb-8">
        You don't have permission to view this page.
      </p>
      <Link
        to="/home"
        className="inline-flex px-6 py-3 bg-cream text-cream-text rounded-lg font-semibold hover:opacity-90 transition-opacity"
      >
        Back to Home
      </Link>
    </div>
  </div>
);

export default ForbiddenScreen;
