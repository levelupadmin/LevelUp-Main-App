import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

// App-wide Sonner toaster (mounted once in App.tsx). Colours come from Sonner's
// built-in `theme` palette — this app has no next-themes provider and forces
// `theme="dark"` at the mount site, and its page background is pure black, so
// re-skinning toasts onto `bg-background` would render them near-invisible.
// What we DO tokenize is motion: the `lu-sonner-toast` hook class re-points
// Sonner's hard-coded lifecycle transitions at the design-system --motion-*/
// --ease-* tokens (see the tokenized block in src/index.css) so exits move on
// the same clock as the Radix toaster (src/components/ui/toast.tsx). Configured
// entirely through toastOptions — Sonner's internals are left untouched. Caller
// props (position, theme, …) pass straight through.
const Toaster = ({ toastOptions, ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      toastOptions={{
        ...toastOptions,
        classNames: {
          toast: "lu-sonner-toast",
          ...toastOptions?.classNames,
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
