import { createElement } from "react";
import { CheckCircle2 } from "lucide-react";
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

// Success toasts render a check glyph tinted with the design-system --success
// token. The toast surface itself stays neutral (bg-surface-2 per the visual
// spec set in ui/sonner.tsx), so the icon colour is what signals success.
const successIcon = () =>
  createElement(CheckCircle2, {
    size: 18,
    style: { color: "hsl(var(--success))" },
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
      sonnerToast.error(message, { duration: ERROR_DURATION_MS, ...(data ?? {}) }),
  }
);
