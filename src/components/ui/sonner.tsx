import { useEffect, useState } from "react";
import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

// App-wide Sonner toaster (mounted once in App.tsx) — the ONLY toast renderer.
// Visual spec (P5-T1): the surface is tokenized onto `bg-surface-2` (an elevated
// grey that reads clearly on the pure-black canvas — bg-background would vanish)
// with `border-border`, `text-foreground`, `rounded-xl` and `shadow-design-md`.
// A single class beats Sonner's zero-specificity :where() base rules, so the
// utilities win without patching Sonner internals. Motion is tokenized in
// src/index.css via the `.lu-sonner-toast` hook class so exits move on the
// design-system --motion-*/--ease-* clock. Default duration is 4000ms; error
// toasts extend to 8000ms per-call (src/lib/toast.ts). Max 3 stacked toasts.
// Position is bottom-center on mobile and bottom-right from the sm breakpoint —
// Sonner takes a single position value, so we track the breakpoint and swap.
// Caller props (theme, an explicit position, …) pass straight through.
const Toaster = ({ toastOptions, position, ...props }: ToasterProps) => {
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(min-width: 640px)").matches,
  );

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 640px)");
    const onChange = () => setIsDesktop(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return (
    <Sonner
      className="toaster group"
      position={position ?? (isDesktop ? "bottom-right" : "bottom-center")}
      duration={4000}
      visibleToasts={3}
      toastOptions={{
        ...toastOptions,
        classNames: {
          toast:
            "lu-sonner-toast bg-surface-2 border-border text-foreground rounded-xl shadow-design-md",
          ...toastOptions?.classNames,
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
