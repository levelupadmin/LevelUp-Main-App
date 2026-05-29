import { useEffect, useState } from "react";
import usePageTitle from "@/hooks/usePageTitle";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import InitialsAvatar from "@/components/InitialsAvatar";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Pencil, X, Award, AlertTriangle } from "lucide-react";
import { toast } from "@/lib/toast";
import CertificateGallery from "@/components/certificates/CertificateGallery";
import NotificationPreferences from "@/components/notifications/NotificationPreferences";

interface Enrolment {
  id: string;
  status: string;
  created_at: string;
  title: string;
  thumbnail_url: string | null;
  type: string;
  offering_id: string;
}

// NOTE: In DEV_BYPASS mode (VITE_DEV_ADMIN_BYPASS === "true"), the supabase client
// is a mock, so signInWithPassword verification will not work. The form still renders
// and validates locally; only the Supabase calls will fail silently in dev mode.
const ChangePasswordSection = ({ email }: { email: string }) => {
  const [open, setOpen] = useState(false);
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<{
    oldPassword?: string;
    newPassword?: string;
    confirmPassword?: string;
  }>({});

  const resetForm = () => {
    setOldPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setErrors({});
  };

  const handleCancel = () => {
    resetForm();
    setOpen(false);
  };

  const validate = (): boolean => {
    const next: typeof errors = {};
    if (!oldPassword) {
      next.oldPassword = "Current password is required";
    }
    if (newPassword.length < 8) {
      next.newPassword = "Password must be at least 8 characters";
    } else if (!/[a-zA-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      next.newPassword = "Password must contain at least one letter and one number";
    }
    if (confirmPassword !== newPassword) {
      next.confirmPassword = "Passwords do not match";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleChangePassword = async () => {
    if (!validate()) return;

    setSaving(true);

    // Verify old password by attempting a sign-in
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password: oldPassword,
    });

    if (signInError) {
      setSaving(false);
      setErrors((prev) => ({ ...prev, oldPassword: "Current password is incorrect" }));
      return;
    }

    // Update to new password
    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword,
    });

    setSaving(false);

    if (updateError) {
      toast.error("Couldn't change your password. Make sure it's at least 6 characters and try again.");
    } else {
      toast.success("Password changed successfully");
      resetForm();
      setOpen(false);
    }
  };

  const handleForgotPassword = async () => {
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    if (error) {
      toast.error("Couldn't send the reset email. Please try again.");
    } else {
      toast.success("Password reset email sent");
    }
  };

  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Change Password
      </Button>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs text-muted-foreground mb-1 block">Current Password</label>
        <Input
          type="password"
          value={oldPassword}
          onChange={(e) => {
            setOldPassword(e.target.value);
            setErrors((prev) => ({ ...prev, oldPassword: undefined }));
          }}
          placeholder="Enter current password"
          className="bg-surface border-border"
        />
        {errors.oldPassword && (
          <p className="text-xs text-destructive mt-1">{errors.oldPassword}</p>
        )}
      </div>
      <div>
        <label className="text-xs text-muted-foreground mb-1 block">New Password</label>
        <Input
          type="password"
          value={newPassword}
          onChange={(e) => {
            setNewPassword(e.target.value);
            setErrors((prev) => ({ ...prev, newPassword: undefined }));
          }}
          placeholder="Min 8 chars, letter + number"
          className="bg-surface border-border"
        />
        {errors.newPassword && (
          <p className="text-xs text-destructive mt-1">{errors.newPassword}</p>
        )}
      </div>
      <div>
        <label className="text-xs text-muted-foreground mb-1 block">Confirm New Password</label>
        <Input
          type="password"
          value={confirmPassword}
          onChange={(e) => {
            setConfirmPassword(e.target.value);
            setErrors((prev) => ({ ...prev, confirmPassword: undefined }));
          }}
          placeholder="Re-enter new password"
          className="bg-surface border-border"
        />
        {errors.confirmPassword && (
          <p className="text-xs text-destructive mt-1">{errors.confirmPassword}</p>
        )}
      </div>
      <div className="flex gap-2 pt-1">
        <Button size="sm" onClick={handleChangePassword} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
        <Button size="sm" variant="ghost" onClick={handleCancel}>
          Cancel
        </Button>
      </div>
      <button
        type="button"
        onClick={handleForgotPassword}
        className="text-xs text-muted-foreground hover:text-cream underline cursor-pointer bg-transparent border-none p-0"
      >
        Forgot your password?
      </button>
    </div>
  );
};

// Required by Google Play's mandatory in-app account-deletion policy.
// Soft-deletes via the `delete-account` edge function (7-day grace) and
// signs the user out locally.
const DangerZoneSection = () => {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  const canConfirm = confirmText.trim().toUpperCase() === "DELETE" && !deleting;

  const handleDelete = async () => {
    if (!canConfirm) return;
    setDeleting(true);

    const { data, error } = await supabase.functions.invoke("delete-account", {
      method: "POST",
    });

    if (error || (data as { error?: string })?.error) {
      setDeleting(false);
      const msg =
        (data as { error?: string })?.error ||
        error?.message ||
        "Could not delete your account. Please try again or contact support.";
      toast.error(msg);
      return;
    }

    toast.success("Account scheduled for deletion. You'll be signed out.");

    // Sign out locally then bounce to the marketing root.
    await signOut();
    navigate("/", { replace: true });
  };

  return (
    <section>
      <div className="border border-destructive/40 bg-destructive/5 rounded-xl p-6">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-destructive">
              Danger zone
            </h3>
            <p className="text-sm text-muted-foreground mt-1 mb-4">
              Deleting your account is permanent after a 7-day grace period.
              Your enrolments, course progress, reviews, and profile data will
              be removed.
            </p>
            <Button
              variant="outline"
              className="border-destructive text-destructive hover:bg-destructive/10"
              onClick={() => setOpen(true)}
            >
              Delete account
            </Button>
          </div>
        </div>
      </div>

      <AlertDialog
        open={open}
        onOpenChange={(next) => {
          if (deleting) return;
          setOpen(next);
          if (!next) setConfirmText("");
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete your LevelUp account?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove your enrolments, course progress,
              reviews, certificates, community posts, and account profile after
              a 7-day grace period. Payment records are retained for tax and
              refund compliance.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-2">
            <label
              htmlFor="delete-confirm"
              className="text-xs text-muted-foreground"
            >
              Type <span className="font-mono text-foreground">DELETE</span> to
              confirm
            </label>
            <Input
              id="delete-confirm"
              autoComplete="off"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="DELETE"
              disabled={deleting}
            />
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                // Prevent Radix from auto-closing before the async work
                // resolves; we close manually after sign-out / nav.
                e.preventDefault();
                void handleDelete();
              }}
              disabled={!canConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Deleting…" : "Delete forever"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
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
        bio: profile.bio ?? "",
        city: profile.city ?? "",
        occupation: profile.occupation ?? "",
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
    if (form.full_name.length > 100) { toast.error("Name must be 100 characters or less"); return; }
    if (form.bio.length > 500) { toast.error("Bio must be 500 characters or less"); return; }
    if (form.city.length > 100) { toast.error("City must be 100 characters or less"); return; }
    if (form.occupation.length > 100) { toast.error("Occupation must be 100 characters or less"); return; }
    setSaving(true);
    const { error } = await supabase
      .from("users")
      .update({
        full_name: form.full_name.trim(),
        bio: form.bio.trim(),
        city: form.city.trim(),
        occupation: form.occupation.trim(),
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
    <>
      <div className="space-y-8 max-w-2xl">
        {/* Hero card */}
        <div className="bg-surface border border-border rounded-xl p-6">
          <div className="flex items-start gap-5">
            <InitialsAvatar
              name={displayProfile?.full_name ?? "U"}
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
                    {displayProfile?.full_name ?? "—"}
                  </h2>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {displayProfile?.email}
                  </p>
                  <p className="font-mono text-xs text-muted-foreground mt-1">
                    Member #{displayProfile?.member_number ?? "—"}
                  </p>
                  {displayProfile?.bio && (
                    <p className="text-sm text-muted-foreground mt-3">
                      {displayProfile.bio}
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

        {/* Certificates */}
        {user && (
          <>
            <div className="border-t border-border" />
            <section>
              <div className="flex items-center gap-2 mb-4">
                <Award className="h-5 w-5 text-cream" />
                <h3 className="text-lg font-semibold">My Certificates</h3>
              </div>
              <CertificateGallery userId={user.id} />
            </section>
          </>
        )}

        {/* Notification Preferences */}
        {user && (
          <>
            <div className="border-t border-border" />
            <NotificationPreferences />
          </>
        )}

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

        {/* Change Password */}
        <section>
          <h3 className="text-lg font-semibold mb-2">Change Password</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Update your account password.
          </p>
          <ChangePasswordSection email={displayProfile?.email ?? user?.email ?? ""} />
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

        {/* Divider */}
        <div className="border-t border-border" />

        {/* Invoices section — past purchases, downloadable PDFs */}
        <InvoicesSection />

        {/* Divider */}
        <div className="border-t border-border" />

        {/* Danger zone — account deletion (Google Play requirement) */}
        <DangerZoneSection />
      </div>
    </>
  );
};

// ── Invoices section ────────────────────────────────────────────────
// Lists the user's captured orders with a "Download invoice (PDF)" button
// for each. Clicking the button mints a fresh signed URL via the
// generate-invoice-pdf edge function and opens the PDF in a new tab.
//
// Why not pre-generate signed URLs on load: they expire (we use 90-day
// TTL but defensive). On-demand minting also lets us lazily generate
// the PDF for any order that doesn't have one yet (e.g. orders captured
// before this feature shipped).
const InvoicesSection = () => {
  const { user } = useAuth();
  const [orders, setOrders] = useState<Array<{
    id: string;
    total_inr: number;
    captured_at: string | null;
    razorpay_payment_id: string | null;
    offering_title: string;
  }>>([]);
  const [loading, setLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("payment_orders")
        .select("id, total_inr, captured_at, razorpay_payment_id, offerings(title)")
        .eq("user_id", user.id)
        .eq("status", "captured")
        .order("captured_at", { ascending: false });
      setOrders(
        (data ?? []).map((o: any) => ({
          id: o.id,
          total_inr: Number(o.total_inr),
          captured_at: o.captured_at,
          razorpay_payment_id: o.razorpay_payment_id,
          offering_title: o.offerings?.title ?? "Order",
        }))
      );
      setLoading(false);
    })();
  }, [user]);

  const downloadInvoice = async (orderId: string) => {
    setDownloadingId(orderId);
    try {
      // Ensure the PDF exists in Storage (regenerates if missing - cheap)
      const { data: genData, error: genErr } = await supabase.functions.invoke<{
        path?: string;
        bucket?: string;
        error?: string;
      }>("generate-invoice-pdf", { body: { payment_order_id: orderId } });
      if (genErr || !genData?.path) {
        toast.error(genData?.error || "Couldn't generate invoice");
        return;
      }
      // Mint a fresh signed URL (5 min TTL is plenty - user opens
      // immediately and the browser keeps the PDF after).
      const { data: signed, error: signedErr } = await supabase.storage
        .from(genData.bucket || "invoices")
        .createSignedUrl(genData.path, 60 * 5);
      if (signedErr || !signed?.signedUrl) {
        toast.error("Couldn't get invoice link");
        return;
      }
      window.open(signed.signedUrl, "_blank", "noopener");
    } finally {
      setDownloadingId(null);
    }
  };

  if (loading) return null;
  if (!orders.length) return null;

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">Invoices</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Receipts + tax invoices for every masterclass you've enrolled in.
        </p>
      </div>
      <div className="rounded-2xl border border-border overflow-hidden">
        {orders.map((o, i) => (
          <div
            key={o.id}
            className={`flex items-center gap-4 px-4 py-3 sm:px-5 sm:py-4 ${i > 0 ? "border-t border-border" : ""}`}
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate">{o.offering_title}</p>
              <p className="text-xs text-muted-foreground mt-0.5 font-mono">
                ₹{o.total_inr.toLocaleString("en-IN")}
                {o.captured_at ? ` · ${new Date(o.captured_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}` : ""}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => downloadInvoice(o.id)}
              disabled={downloadingId === o.id}
              className="shrink-0"
            >
              {downloadingId === o.id ? "Preparing…" : "PDF"}
            </Button>
          </div>
        ))}
      </div>
    </section>
  );
};

export default ProfilePage;
