import { LucideIcon } from "lucide-react";

interface PlaceholderPageProps {
  title: string;
  subtitle?: string;
  icon: LucideIcon;
  badge?: string;
}

const PlaceholderPage = ({ title, subtitle, icon: Icon, badge }: PlaceholderPageProps) => {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
      <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-secondary">
        <Icon className="h-8 w-8 text-primary" />
      </div>
      {badge && (
        <span className="mb-3 inline-block rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
          {badge}
        </span>
      )}
      <h2 className="font-display text-xl font-bold text-foreground">{title}</h2>
      {subtitle && (
        <p className="mt-2 max-w-xs text-sm text-muted-foreground">{subtitle}</p>
      )}
    </div>
  );
};

export default PlaceholderPage;
