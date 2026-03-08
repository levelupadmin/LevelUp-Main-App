import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import AppShell from "@/components/layout/AppShell";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, X } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const cities = ["Mumbai", "Delhi", "Bangalore", "Chennai", "Hyderabad", "Kolkata", "Pune", "Jaipur", "Kochi", "Ahmedabad"];
const roleTaxonomy = ["Director", "Cinematographer", "Editor", "Content Creator", "Sound Designer", "Writer", "Producer", "Colorist", "VFX Artist", "Music Composer"];
const availabilityOptions = [
  { value: "open-to-work" as const, label: "Open to work" },
  { value: "open-to-collaborate" as const, label: "Open to collaborate" },
  { value: "not-looking" as const, label: "Not looking" },
];

const ProfileEdit = () => {
  const navigate = useNavigate();
  const { user, updateProfile } = useAuth();

  const [name, setName] = useState(user?.name ?? "");
  const [bio, setBio] = useState(user?.bio ?? "");
  const [city, setCity] = useState(user?.city ?? "");
  const [roles, setRoles] = useState<string[]>(user?.roles ?? []);
  const [skills, setSkills] = useState<string[]>(user?.skills ?? []);
  const [skillInput, setSkillInput] = useState("");
  const [availability, setAvailability] = useState(user?.availability ?? "open-to-collaborate");
  const [instagram, setInstagram] = useState(user?.social_links?.instagram ?? "");
  const [youtube, setYoutube] = useState(user?.social_links?.youtube ?? "");
  const [linkedin, setLinkedin] = useState(user?.social_links?.linkedin ?? "");

  const toggleRole = (r: string) =>
    setRoles((prev) => (prev.includes(r) ? prev.filter((x) => x !== r) : prev.length < 3 ? [...prev, r] : prev));

  const addSkill = () => {
    const s = skillInput.trim();
    if (s && !skills.includes(s)) setSkills([...skills, s]);
    setSkillInput("");
  };

  const save = () => {
    updateProfile({
      name: name.trim(),
      bio: bio.trim(),
      city,
      roles,
      skills,
      availability,
      socialLinks: { instagram: instagram.trim(), youtube: youtube.trim(), linkedin: linkedin.trim() },
    });
    toast({ title: "Profile updated ✓" });
    navigate("/profile/me");
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-lg space-y-6 p-4 lg:p-6">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="rounded-md p-2 text-muted-foreground hover:bg-secondary">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-lg font-bold text-foreground">Edit Profile</h1>
        </div>

        {/* Name */}
        <div className="space-y-1.5">
          <Label>Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={50} className="bg-card" />
        </div>

        {/* Bio */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label>Bio</Label>
            <span className="text-xs text-muted-foreground">{bio.length}/280</span>
          </div>
          <Textarea value={bio} onChange={(e) => setBio(e.target.value.slice(0, 280))} rows={3} className="bg-card resize-none" />
        </div>

        {/* City */}
        <div className="space-y-1.5">
          <Label>City</Label>
          <Select value={city} onValueChange={setCity}>
            <SelectTrigger className="bg-card"><SelectValue placeholder="Select city" /></SelectTrigger>
            <SelectContent>
              {cities.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Roles */}
        <div className="space-y-1.5">
          <Label>Roles (max 3)</Label>
          <div className="flex flex-wrap gap-2">
            {roleTaxonomy.map((r) => (
              <button
                key={r}
                onClick={() => toggleRole(r)}
                className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-all ${
                  roles.includes(r) ? "border-highlight bg-highlight/10 text-foreground" : "border-border bg-card text-muted-foreground hover:border-highlight/40"
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        {/* Skills */}
        <div className="space-y-1.5">
          <Label>Skills</Label>
          <div className="flex gap-2">
            <Input
              value={skillInput}
              onChange={(e) => setSkillInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addSkill())}
              placeholder="Add a skill"
              className="bg-card"
            />
            <button onClick={addSkill} className="rounded-md bg-secondary px-3 text-sm font-medium text-foreground hover:bg-accent">Add</button>
          </div>
          <div className="flex flex-wrap gap-2 mt-2">
            {skills.map((s) => (
              <span key={s} className="inline-flex items-center gap-1 rounded-md border border-border bg-secondary px-2.5 py-1 text-xs font-medium text-foreground">
                {s}
                <button onClick={() => setSkills(skills.filter((x) => x !== s))}><X className="h-3 w-3 text-muted-foreground" /></button>
              </span>
            ))}
          </div>
        </div>

        {/* Availability */}
        <div className="space-y-1.5">
          <Label>Availability</Label>
          <div className="flex gap-2">
            {availabilityOptions.map((o) => (
              <button
                key={o.value}
                onClick={() => setAvailability(o.value)}
                className={`flex-1 rounded-md border py-2 text-xs font-medium transition-all ${
                  availability === o.value ? "border-highlight bg-highlight/10 text-foreground" : "border-border bg-card text-muted-foreground"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        {/* Social */}
        <div className="space-y-3">
          <Label>Social Links</Label>
          <Input value={instagram} onChange={(e) => setInstagram(e.target.value)} placeholder="Instagram URL" className="bg-card" />
          <Input value={youtube} onChange={(e) => setYoutube(e.target.value)} placeholder="YouTube URL" className="bg-card" />
          <Input value={linkedin} onChange={(e) => setLinkedin(e.target.value)} placeholder="LinkedIn URL" className="bg-card" />
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <button onClick={() => navigate(-1)} className="flex-1 rounded-md border border-border bg-card py-2.5 text-sm font-semibold text-foreground hover:bg-secondary">Cancel</button>
          <button onClick={save} className="flex-1 rounded-md bg-highlight py-2.5 text-sm font-bold text-highlight-foreground hover:opacity-90">Save</button>
        </div>
      </div>
    </AppShell>
  );
};

export default ProfileEdit;
