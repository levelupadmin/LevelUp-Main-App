import { useEffect, useState } from "react";
import usePageTitle from "@/hooks/usePageTitle";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import StudentLayout from "@/components/layout/StudentLayout";
import InitialsAvatar from "@/components/InitialsAvatar";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Pencil, X } from "lucide-react";
import { toast } from "sonner";

interface Enrolment {
  id: string;
  status: string;
  created_at: string;
  title: string;
  thumbnail_url: string | null;
  type: string;
  offering_id: string;
}

const SetPasswordForm = () => {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSetPassword = async () => {
    if (newPassword.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setSaving(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Password set! You can now sign in with your password.");
      setNewPassword("");
      setConfirmPassword("");
    }
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div>
        <label className="text-xs text-muted-foreground mb-1 block">New Password</label>
        <Input
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder="Minimum 6 characters"
          className="bg-surface border-border"
        />
      </div>
      <div>
        <label className="text-xs text-muted-foreground mb-1 block">Confirm Password</label>
        <Input
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="Re-enter password"
          className="bg-surface border-border"
        />
      </div>
      <div className="sm:col-span-2">
        <Button size="sm" onClick={handleSetPassword} disabled={saving || !newPassword}>
          {saving ? "Setting…" : "Set Password"}
        </Button>
      </div>
    </div>
  );
};

const ProfilePage = () => {
  usePageTitle("Profile");
  const { profile, user, signOut } = useAuth();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [enrolments, setEnrolments] = useState<Enrolment[]>([]);
  const [courseMap, setCourseMap] = useState<Record<string, string>>({});

  // Local display overrides so we can update the UI after save without a full reload
  const [localProfile, setLocalProfile] = useState<{
    full_name: string;
    bio: string;
    city: string;
    occupation: string;
  } | null>(null);

  const displayProfile = localProfile
    ? { ...profile, full_name: localProfile.full_name, bio: localProfile.bio, city: localProfile.city, occupation: localProfile.occupation }
    : profile;

  const [form, setForm] = useState({
    full_name: "",
    bio: "",
    city: "",
    occupation: "",
  });

  useEffect(() => {
    if (localProfile) {
      setForm({ ...localProfile });
    } else if (profile) {
      setForm({
        full_name: profile.full_name ?? "",
        bio: (profile as any).bio ?? "",
        city: (profile as any).city ?? "",
        occupation: (profile as any).occupation ?? "",
      });
    }
  }, [profile, localProfile]);

  useEffect(() => {
    if (!user) return;
    const fetchEnrolments = async () => {
      const { data: enrs } = await supabase
        .from("enrolments")
        .select("id, status, created_at, offering_id")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (!enrs?.length) return;

      const { data: offs } = await supabase
        .from("offerings")
        .select("id, title, thumbnail_url, type")
        .in("id", enrs.map((e) => e.offering_id));

      const offMap = Object.fromEntries((offs ?? []).map((o) => [o.id, o]));

      // Get the first course for each offering to build direct links
      const offeringIds = enrs.map(e => e.offering_id).filter(Boolean);
      const { data: offeringCourses } = await supabase
        .from("offering_courses")
        .select("offering_id, course_id")
        .in("offering_id", offeringIds);

      const cMap: Record<string, string> = {};
      if (offeringCourses) {
        for (const oc of offeringCourses) {
          if (!cMap[oc.offering_id]) {
            cMap[oc.offering_id] = oc.course_id;
          }
        }
      }
      setCourseMap(cMap);

      setEnrolments(
        enrs.map((e) => ({
          ...e,
          title: offMap[e.offering_id]?.title ?? "Unknown",
          thumbnail_url: offMap[e.offering_id]?.thumbnail_url ?? null,
          type: offMap[e.offering_id]?.type ?? "",
        }))
      );
    };
    fetchEnrolments();
  }, [user]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from("users")
      .update({
        full_name: form.full_name,
        bio: form.bio,
        city: form.city,
        occupation: form.occupation,
      })
      .eq("id", user.id);

    setSaving(false);
    if (error) {
      toast.error("Failed to update profile");
    } else {
      toast.success("Profile updated");
      setEditing(false);
      // Update local display state instead of reloading the page
      setLocalProfile({ ...form });
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
  };

  return (
    <StudentLayout title="Profile">
      <div className="space-y-8 max-w-2xl">
        {/* Hero card */}
        <div className="bg-surface border border-border rounded-xl p-6">
          <div className="flex items-start gap-5">
            <InitialsAvatar
              name={(displayProfile as any)?.full_name ?? "U"}
              photoUrl={displayProfile?.avatar_url}
              size={96}
            />
            <div className="flex-1 min-w-0">
              {editing ? (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Name</label>
                    <Input
                      value={form.full_name}
                      onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Bio</label>
                    <Textarea
                      value={form.bio}
                      onChange={(e) => setForm({ ...form, bio: e.target.value })}
                      rows={2}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">City</label>
                      <Input
                        value={form.city}
                        onChange={(e) => setForm({ ...form, city: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Occupation</label>
                      <Input
                        value={form.occupation}
                        onChange={(e) => setForm({ ...form, occupation: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <Button size="sm" onClick={handleSave} disabled={saving}>
                      {saving ? "Saving…" : "Save"}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                      <X className="h-3 w-3 mr-1" /> Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <h2 className="text-[28px] font-semibold leading-tight">
                    {(displayProfile as any)?.full_name ?? "—"}
                  </h2>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {displayProfile?.email}
                  </p>
                  <p className="font-mono text-xs text-muted-foreground mt-1">
                    Member #{displayProfile?.member_number ?? "—"}
                  </p>
                  {(displayProfile as any)?.bio && (
                    <p className="text-sm text-muted-foreground mt-3">
                      {(displayProfile as any).bio}
                    </p>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-4"
                    onClick={() => setEditing(true)}
                  >
                    <Pencil className="h-3 w-3 mr-1" /> Edit Profile
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-border" />

        {/* Enrolments */}
        <section>
          <h3 className="text-lg font-semibold mb-4">My Enrolments</h3>
          {enrolments.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No enrolments yet — your first course is just a click away.{" "}
              <Link to="/browse" className="text-cream hover:underline">
                Browse programs →
              </Link>
            </p>
          ) : (
            <div className="space-y-3">
              {enrolments.map((e) => (
                <div
                  key={e.id}
                  className="flex items-center gap-4 bg-surface border border-border rounded-lg p-4"
                >
                  <div className="w-16 h-10 rounded bg-surface-2 overflow-hidden flex-shrink-0">
                    {e.thumbnail_url && (
                      <img src={e.thumbnail_url} alt="" className="w-full h-full object-cover" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{e.title}</p>
                    <p className="font-mono text-xs text-muted-foreground">
                      Enrolled {new Date(e.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <Badge
                    variant={e.status === "active" ? "default" : "secondary"}
                    className="flex-shrink-0"
                  >
                    {e.status}
                  </Badge>
                  <Link
                    to={courseMap[e.offering_id] ? `/courses/${courseMap[e.offering_id]}` : "/my-courses"}
                    className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 flex-shrink-0"
                  >
                    Go to course <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Divider */}
        <div className="border-t border-border" />

        {/* Set Password */}
        <section>
          <h3 className="text-lg font-semibold mb-2">Set Password</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Set a password if you'd like to sign in with email and password instead of email links.
          </p>
          <SetPasswordForm />
        </section>

        {/* Divider */}
        <div className="border-t border-border" />

        {/* Account */}
        <section>
          <h3 className="text-lg font-semibold mb-4">Account</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Email</p>
                <p className="text-sm text-muted-foreground">{profile?.email}</p>
              </div>
            </div>
            <Button
              variant="outline"
              className="border-destructive text-destructive hover:bg-destructive/10"
              onClick={handleSignOut}
            >
              Sign out
            </Button>
          </div>
        </section>
      </div>
    </StudentLayout>
  );
};

export default ProfilePage;
