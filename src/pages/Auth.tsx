import { LogIn } from "lucide-react";
import logo from "@/assets/logo.png";

const Auth = () => (
  <div className="flex min-h-screen items-center justify-center bg-background px-6">
    <div className="w-full max-w-sm">
      <div className="mb-10 text-center">
        <img src={logo} alt="Level Up" className="mx-auto mb-6 h-12 w-12" />
        <h1 className="text-2xl font-bold text-gradient mb-1">Level Up Learning</h1>
        <p className="text-sm text-muted-foreground">
          India's creative learning platform
        </p>
      </div>
      <div className="space-y-3">
        <button className="w-full rounded-md bg-primary py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90">
          Sign Up
        </button>
        <button className="w-full rounded-md border border-border bg-card py-3 text-sm font-semibold text-foreground transition-colors hover:bg-secondary">
          Log In
        </button>
      </div>
      <p className="mt-8 text-center text-xs text-muted-foreground">
        By continuing, you agree to our Terms & Privacy Policy
      </p>
    </div>
  </div>
);

export default Auth;
