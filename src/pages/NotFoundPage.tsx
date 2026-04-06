import { Link } from "react-router-dom";
import { useEffect } from "react";

const NotFoundPage = () => {
  useEffect(() => {
    document.title = "Page Not Found — LevelUp Learning";
  }, []);

  return (
    <div className="min-h-screen bg-canvas flex items-center justify-center p-8 grain">
      <div className="text-center max-w-md relative z-10">
        <p className="font-mono text-sm text-muted-foreground tracking-widest mb-4">404</p>
        <h1 className="text-3xl font-serif-italic text-cream mb-3">
          Page not found
        </h1>
        <p className="text-muted-foreground mb-8">
          The page you're looking for doesn't exist or has been moved.
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
};

export default NotFoundPage;
