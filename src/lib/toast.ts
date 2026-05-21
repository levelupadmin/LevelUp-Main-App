import { toast as sonnerToast } from "sonner";

// Error toasts stay on screen longer than sonner's 4s default so users can
// read the message; success toasts keep sonner's default cadence.
const ERROR_DURATION_MS = 8000;

type ToastArgs = Parameters<typeof sonnerToast.error>;

export const toast = Object.assign(
  (message: ToastArgs[0], data?: ToastArgs[1]) => sonnerToast(message, data),
  {
    success: sonnerToast.success,
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
