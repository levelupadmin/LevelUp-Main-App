import * as React from "react";
import { Drawer as DrawerPrimitive } from "vaul";

import { cn } from "@/lib/utils";

/**
 * vaul bottom-sheet primitives (P4-T1). Thin, tokenized wrappers over vaul's
 * Radix-Dialog-based drawer — the low-level layer that `motion/MorphSheet.tsx`
 * builds the app's sheet grammar on.
 *
 * BODY-LOCK INVARIANT (phase-4, wording corrected by council): vaul never
 * writes `document.body.style.overflow` INLINE. Its effective lock is Radix
 * react-remove-scroll's counter-managed injected stylesheet —
 * `body[data-scroll-locked]{overflow:hidden !important}` — on ALL platforms
 * (the same mechanism every shadcn Dialog on main already uses), plus an
 * additional `position: fixed` technique on iOS Safari. It is transient and
 * refcounted, so it cannot clobber CompletionTakeover's inline writer; a
 * June-14-class audit must check `body[data-scroll-locked]` residue, not
 * inline styles. The background-scale writers
 * (`body.style.background`, wrapper `overflow`) are gated entirely behind
 * `shouldScaleBackground`. We ship with `shouldScaleBackground = false`, so those
 * paths never run and `CompletionTakeover` remains the sole `body.style.overflow`
 * writer in `src/`. Do NOT flip the default on: background scale-down needs a
 * `[vaul-drawer-wrapper]` on the app root, which is P4-T4's go/no-go call.
 *
 * REDUCED MOTION: vaul animates via CSS keyframes (slideFromBottom / fadeIn),
 * which the global `@media (prefers-reduced-motion: reduce)` block in index.css
 * flattens to ~instant for every element — so dismissal is instant under reduced
 * motion with no per-component override needed.
 */

const Drawer = ({
  shouldScaleBackground = false,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Root>) => (
  <DrawerPrimitive.Root shouldScaleBackground={shouldScaleBackground} {...props} />
);
Drawer.displayName = "Drawer";

const DrawerTrigger = DrawerPrimitive.Trigger;

const DrawerPortal = DrawerPrimitive.Portal;

const DrawerClose = DrawerPrimitive.Close;

const DrawerOverlay = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DrawerPrimitive.Overlay ref={ref} className={cn("fixed inset-0 z-50 bg-black/60", className)} {...props} />
));
DrawerOverlay.displayName = DrawerPrimitive.Overlay.displayName;

interface DrawerContentProps
  extends React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Content> {
  /** Hide the drag handle (rare — most sheets want the affordance). */
  hideHandle?: boolean;
}

const DrawerContent = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitive.Content>,
  DrawerContentProps
>(({ className, children, hideHandle = false, ...props }, ref) => (
  <DrawerPortal>
    <DrawerOverlay />
    <DrawerPrimitive.Content
      ref={ref}
      className={cn(
        "fixed inset-x-0 bottom-0 z-50 mt-24 flex h-auto flex-col rounded-t-3xl border border-border bg-canvas",
        className,
      )}
      {...props}
    >
      {/* Drag handle: 36×5px rounded-full bg-border, centered, 12px top margin. */}
      {!hideHandle && (
        <div aria-hidden="true" className="mx-auto mt-3 h-[5px] w-9 shrink-0 rounded-full bg-border" />
      )}
      {children}
    </DrawerPrimitive.Content>
  </DrawerPortal>
));
DrawerContent.displayName = "DrawerContent";

const DrawerHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("grid gap-1.5 p-4 text-center sm:text-left", className)} {...props} />
);
DrawerHeader.displayName = "DrawerHeader";

const DrawerFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("mt-auto flex flex-col gap-2 p-4", className)} {...props} />
);
DrawerFooter.displayName = "DrawerFooter";

const DrawerTitle = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DrawerPrimitive.Title
    ref={ref}
    className={cn("text-lg font-semibold leading-none tracking-tight", className)}
    {...props}
  />
));
DrawerTitle.displayName = DrawerPrimitive.Title.displayName;

const DrawerDescription = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DrawerPrimitive.Description ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
));
DrawerDescription.displayName = DrawerPrimitive.Description.displayName;

export {
  Drawer,
  DrawerPortal,
  DrawerOverlay,
  DrawerTrigger,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerFooter,
  DrawerTitle,
  DrawerDescription,
};
