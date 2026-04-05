import { cn } from "@/lib/utils";

const LevelUpWordmark = ({ className }: { className?: string }) => (
  <span className={cn("font-display font-semibold text-xl tracking-tight text-foreground", className)}>
    Level<span className="text-cream mx-[1px]">.</span>Up
  </span>
);

export default LevelUpWordmark;
