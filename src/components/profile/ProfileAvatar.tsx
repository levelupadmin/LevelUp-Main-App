import { userProfile } from "@/data/mockData";
import instructor1 from "@/assets/instructor-1.jpg";

interface ProfileAvatarProps {
  avatarUrl?: string | null;
  name?: string;
  level?: number;
}

const ProfileAvatar = ({ avatarUrl, name, level }: ProfileAvatarProps) => (
  <div className="relative flex flex-col items-center">
    {/* Gold ring wrapper */}
    <div className="relative h-24 w-24 lg:h-28 lg:w-28">
      <div className="absolute inset-0 rounded-full bg-gradient-to-br from-highlight via-highlight/60 to-highlight/30 p-[3px] shadow-[0_0_20px_hsl(var(--highlight)/0.3)]">
        <div className="h-full w-full rounded-full bg-background p-[3px]">
          <img
            src={avatarUrl || instructor1}
            alt={name || "Profile"}
            className="h-full w-full rounded-full object-cover"
          />
        </div>
      </div>
      {/* Level badge overlapping bottom */}
      <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-highlight to-highlight/80 px-3 py-0.5 text-[11px] font-bold text-highlight-foreground shadow-[0_2px_8px_hsl(var(--highlight)/0.4)]">
        Lv.{level ?? userProfile.creatorLevel}
      </span>
    </div>
  </div>
);

export default ProfileAvatar;
