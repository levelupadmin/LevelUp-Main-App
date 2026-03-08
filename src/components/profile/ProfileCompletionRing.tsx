interface ProfileCompletionRingProps {
  percentage: number;
}

const ProfileCompletionRing = ({ percentage }: ProfileCompletionRingProps) => {
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percentage / 100) * circumference;

  if (percentage >= 100) return null;

  return (
    <div className="flex items-center gap-4 rounded-xl border border-border bg-card p-4">
      <div className="relative h-20 w-20 shrink-0">
        <svg className="h-20 w-20 -rotate-90" viewBox="0 0 80 80">
          <circle
            cx="40" cy="40" r={radius}
            fill="none"
            stroke="hsl(var(--secondary))"
            strokeWidth="5"
          />
          <circle
            cx="40" cy="40" r={radius}
            fill="none"
            stroke="hsl(var(--highlight))"
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className="transition-all duration-700"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-lg font-bold text-foreground">{percentage}%</span>
        </div>
      </div>
      <div>
        <p className="text-sm font-semibold text-foreground">Complete your profile</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Add more details to stand out in the community
        </p>
      </div>
    </div>
  );
};

export default ProfileCompletionRing;
