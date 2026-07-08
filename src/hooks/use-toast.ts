import type { ReactNode } from "react";

import { toast as luToast } from "@/lib/toast";

// Compatibility shim. This used to host a hand-rolled Radix-toast reducer; the
// app now renders every toast through Sonner (src/lib/toast.ts + ui/sonner.tsx)
// and the Radix `<Toaster/>` is retired. To avoid touching the ~34 call sites
// that still call `toast({ title, description, variant })`, we translate that
// shape into Sonner calls here. `variant: "destructive"` maps to an error
// toast; anything else maps to a default toast. The title becomes the primary
// message and the description its secondary line — mirroring the old visuals.

export type ToastVariant = "default" | "destructive";

export interface ToastProps {
  title?: ReactNode;
  description?: ReactNode;
  variant?: ToastVariant;
  duration?: number;
}

function toast({ title, description, variant, duration }: ToastProps = {}) {
  // When only a description is supplied, promote it to the primary message so
  // the toast is never blank.
  const message = title ?? description ?? "";
  const data = {
    description: title ? description : undefined,
    ...(duration !== undefined ? { duration } : {}),
  };

  if (variant === "destructive") {
    return luToast.error(message, data);
  }
  return luToast(message, data);
}

function useToast() {
  return {
    toast,
    dismiss: (toastId?: string | number) => luToast.dismiss(toastId),
  };
}

export { useToast, toast };
