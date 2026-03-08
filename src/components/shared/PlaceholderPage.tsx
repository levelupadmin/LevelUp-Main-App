import { LucideIcon } from "lucide-react";

interface PlaceholderPageProps {
  title: string;
  subtitle?: string;
  icon: LucideIcon;
  badge?: string;
}

const PlaceholderPage = ({ title, subtitle, icon: Icon, badge }: PlaceholderPageProps) => {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-24 text-center">
      <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-lg bg-secondary">
        <Icon className="h-6 w-6 text-primary" />
      </div>
      {badge && (
        <span className="mb-3 inline-block rounded-md bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
          {badge}
        </span>
      )}
      <h2 className="text-xl font-bold text-foreground">{title}</h2>
      {subtitle && (
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">{subtitle}</p>
      )}
    </div>
  );
};

export default PlaceholderPage;
