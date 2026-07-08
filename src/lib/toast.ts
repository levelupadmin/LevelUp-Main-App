import { createElement } from "react";
import { CheckCircle2, AlertCircle } from "lucide-react";
import { toast as sonnerToast } from "sonner";

// The single toast entry point. Every toast in the app renders through Sonner
// (mounted once via src/components/ui/sonner.tsx); the legacy Radix toaster is
// retired. The compatibility shim in src/hooks/use-toast.ts maps the historic
// `toast({ title, description, variant })` shape onto these calls, so the ~34
// existing call sites keep working untouched.

// Error toasts stay on screen longer than sonner's 4s default so users can
// read the message; success toasts keep sonner's default cadence.
const ERROR_DURATION_MS = 8000;

type ToastArgs = Parameters<typeof sonnerToast.error>;

// The toast surface itself stays neutral (bg-surface-2 per the visual spec set
// in ui/sonner.tsx), so — for the semantic variants — the icon colour is what
// signals success vs. error. Success renders a check tinted with --success;
// error renders an alert glyph tinted with --destructive (both base tokens: an
// 18px glyph is a non-text graphical object, so the token's large/non-text
// value applies). Without an explicit error icon Sonner falls back to its
// built-in error glyph rendered in `currentColor` — i.e. the near-white
// foreground — leaving error toasts with no danger tint and visually
// indistinguishable from a neutral toast.
const successIcon = () =>
  createElement(CheckCircle2, {
    size: 18,
    style: { color: "hsl(var(--success))" },
    "aria-hidden": true,
  });

const errorIcon = () =>
  createElement(AlertCircle, {
    size: 18,
    style: { color: "hsl(var(--destructive))" },
    "aria-hidden": true,
  });

export const toast = Object.assign(
  (message: ToastArgs[0], data?: ToastArgs[1]) => sonnerToast(message, data),
  {
    success: (message: ToastArgs[0], data?: ToastArgs[1]) =>
      sonnerToast.success(message, { icon: successIcon(), ...(data ?? {}) }),
    info: sonnerToast.info,
    warning: sonnerToast.warning,
    loading: sonnerToast.loading,
    message: sonnerToast.message,
    promise: sonnerToast.promise,
    dismiss: sonnerToast.dismiss,
    error: (message: ToastArgs[0], data?: ToastArgs[1]) =>
      sonnerToast.error(message, { duration: ERROR_DURATION_MS, icon: errorIcon(), ...(data ?? {}) }),
  }
);
