import { useEffect, useRef, useState } from "react";
import usePageTitle from "@/hooks/usePageTitle";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
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
import { ArrowRight, ChevronRight, X, Award, FileText, Heart } from "lucide-react";
import { toast } from "@/lib/toast";
import CertificateGallery from "@/components/certificates/CertificateGallery";
import NotificationPreferences from "@/components/notifications/NotificationPreferences";
import { invoiceNumber } from "@/lib/invoice";
import { useWishlist } from "@/hooks/useWishlist";
import { isNative } from "@/lib/platform";
import { Reveal } from "@/components/motion/Reveal";
import { hapticSelection } from "@/lib/haptics";
import AccountHub from "@/components/profile/AccountHub";
import InvoiceDetailSheet, { type InvoiceSheetData } from "@/components/profile/InvoiceDetailSheet";

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
      toast.error("Couldn't change your password. Use at least 8 characters with a letter and a number, then try again.");
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
        Change password
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
// signs the user out locally. Controlled by the parent so the hub's
// "Delete account" menu item can open the same confirmation dialog.
const DangerZoneSection = ({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const navigate = useNavigate();
  const { signOut } = useAuth();
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
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (deleting) return;
        onOpenChange(next);
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
  const [certCount, setCertCount] = useState(0);
  const [invoiceCount, setInvoiceCount] = useState(0);
  const [deleteOpen, setDeleteOpen] = useState(false);

  // Section anchors so the hub tiles/menu items can scroll to the matching block.
  const editRef = useRef<HTMLDivElement>(null);
  const certificatesRef = useRef<HTMLDivElement>(null);
  const invoicesRef = useRef<HTMLDivElement>(null);
  const notificationsRef = useRef<HTMLDivElement>(null);

  const scrollTo = (ref: React.RefObject<HTMLDivElement>) => {
    ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

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

  // Counts for the hub quick-tiles (cheap head-count queries).
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const [certs, orders] = await Promise.all([
        (supabase as any)
          .from("certificates")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id),
        supabase
          .from("payment_orders")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .eq("status", "captured"),
      ]);
      if (cancelled) return;
      setCertCount(certs.count ?? 0);
      setInvoiceCount(orders.count ?? 0);
    })();
    return () => { cancelled = true; };
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

  const openEdit = () => {
    setEditing(true);
    // Defer scroll until the edit block has rendered.
    requestAnimationFrame(() => scrollTo(editRef));
  };

  return (
    <div className="space-y-8 max-w-2xl">
      {/* ── Revolut-style account hub: identity, quick tiles, grouped menu ── */}
      <AccountHub
        name={displayProfile?.full_name ?? ""}
        email={displayProfile?.email ?? user?.email ?? ""}
        memberNumber={displayProfile?.member_number}
        avatarUrl={displayProfile?.avatar_url}
        certificateCount={certCount}
        invoiceCount={invoiceCount}
        onMyCertificates={() => scrollTo(certificatesRef)}
        onInvoices={() => scrollTo(invoicesRef)}
        onEditProfile={openEdit}
        onNotifications={() => scrollTo(notificationsRef)}
        onDeleteAccount={() => setDeleteOpen(true)}
      />

      {/* Edit profile (opened from the hub) */}
      <div ref={editRef}>
        {editing && (
          <Reveal>
            <section className="bg-surface border border-border rounded-2xl p-5">
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
            </section>
          </Reveal>
        )}
        {!editing && displayProfile?.bio && (
          <p className="text-sm text-muted-foreground">{displayProfile.bio}</p>
        )}
      </div>

      {/* Certificates */}
      {user && (
        <section ref={certificatesRef}>
          <div className="flex items-center gap-2 mb-4">
            <Award className="h-5 w-5 text-cream" />
            <h3 className="text-lg font-semibold">Certificates</h3>
          </div>
          <CertificateGallery userId={user.id} />
        </section>
      )}

      {/* Saved — wishlisted offerings; hides itself when empty */}
      {user && <SavedSection />}

      {/* Notification Preferences */}
      {user && (
        <div ref={notificationsRef}>
          <div className="border-t border-border mb-8" />
          <NotificationPreferences />
        </div>
      )}

      {/* Divider */}
      <div className="border-t border-border" />

      {/* Enrolments */}
      <section>
        <h3 className="text-lg font-semibold mb-4">Enrolments</h3>
        {enrolments.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No enrolments yet — your first course is just a click away.{" "}
            <Link to="/" className="text-cream hover:underline">
              Explore programs →
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
        <h3 className="text-lg font-semibold mb-2">Change password</h3>
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

      {/* Invoices section — past purchases, tap a row for the detail sheet */}
      <div ref={invoicesRef}>
        <InvoicesSection />
      </div>

      {/* Account-deletion confirmation (Google Play requirement).
          Triggered from the hub's "Delete account" menu item. */}
      <DangerZoneSection open={deleteOpen} onOpenChange={setDeleteOpen} />
    </div>
  );
};

// ── Saved section ───────────────────────────────────────────────────
// Compact rows for the user's wishlisted offerings, linking to /p/{slug}.
// Renders nothing (including its divider) when the wishlist is empty.
// Prices stay hidden on native builds (Google Reader Rule / Apple
// anti-steering) — native rows show the title only.
interface SavedOffering {
  id: string;
  slug: string | null;
  title: string;
  thumbnail_url: string | null;
  price_inr: number | null;
}

const SavedSection = () => {
  const { wishlistedIds, loading: wishlistLoading } = useWishlist();
  const [offerings, setOfferings] = useState<SavedOffering[]>([]);

  useEffect(() => {
    if (wishlistLoading) return;
    if (!wishlistedIds.size) {
      setOfferings([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("offerings")
        .select("id, slug, title, thumbnail_url, price_inr")
        .in("id", [...wishlistedIds])
        .eq("status", "active");
      if (cancelled) return;
      // Rows without a slug have no public page to link to — skip them.
      setOfferings(((data ?? []) as SavedOffering[]).filter((o) => o.slug));
    })();
    return () => {
      cancelled = true;
    };
  }, [wishlistedIds, wishlistLoading]);

  if (!offerings.length) return null;

  return (
    <>
      <div className="border-t border-border" />
      <section>
        <div className="flex items-center gap-2 mb-4">
          <Heart className="h-5 w-5 text-cream" />
          <h3 className="text-lg font-semibold">Saved</h3>
        </div>
        <div className="space-y-2">
          {offerings.map((o) => (
            <Link
              key={o.id}
              to={`/p/${o.slug}`}
              className="pressable flex items-center gap-4 bg-surface border border-border rounded-lg p-3 hover:border-border-hover"
            >
              <div className="w-14 h-14 rounded-lg bg-surface-2 overflow-hidden flex-shrink-0">
                {o.thumbnail_url && (
                  <img src={o.thumbnail_url} alt="" className="w-full h-full object-cover" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{o.title}</p>
                {!isNative() && o.price_inr != null && (
                  <p className="font-mono text-xs text-muted-foreground mt-0.5">
                    ₹{new Intl.NumberFormat("en-IN").format(o.price_inr)}
                  </p>
                )}
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            </Link>
          ))}
        </div>
      </section>
    </>
  );
};

// ── Invoices section ────────────────────────────────────────────────
// Lists the student's captured purchases. Tapping a row opens the
// InvoiceDetailSheet (big ₹ header, Paid status, info cards, Download/Email).
// The PDF is generated CLIENT-SIDE (src/lib/invoice.ts) and handed to the OS
// share sheet on native (the only reliable way to save a file from the
// iOS/Android Capacitor WebView) or downloaded directly on web.
interface OrderRow {
  id: string;
  total_inr: number;
  subtotal_inr: number | null;
  discount_inr: number | null;
  gst_inr: number | null;
  captured_at: string | null;
  created_at: string | null;
  razorpay_payment_id: string | null;
  razorpay_order_id: string | null;
  offering_title: string;
  instructor_name: string | null;
}

const InvoicesSection = () => {
  const { user } = useAuth();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [buyer, setBuyer] = useState<{ name: string; email: string; phone: string }>({ name: "", email: "", phone: "" });
  const [selected, setSelected] = useState<InvoiceSheetData | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const [{ data: ords }, { data: prof }] = await Promise.all([
        supabase
          .from("payment_orders")
          .select("id, total_inr, subtotal_inr, discount_inr, gst_inr, captured_at, created_at, razorpay_payment_id, razorpay_order_id, offerings(title, instructor_name)")
          .eq("user_id", user.id)
          .eq("status", "captured")
          .order("captured_at", { ascending: false }),
        supabase.from("users").select("full_name, email, phone").eq("id", user.id).maybeSingle(),
      ]);
      if (cancelled) return;
      setOrders((ords ?? []).map((o: any) => ({
        id: o.id,
        total_inr: Number(o.total_inr),
        subtotal_inr: o.subtotal_inr != null ? Number(o.subtotal_inr) : null,
        discount_inr: o.discount_inr != null ? Number(o.discount_inr) : null,
        gst_inr: o.gst_inr != null ? Number(o.gst_inr) : null,
        captured_at: o.captured_at,
        created_at: o.created_at,
        razorpay_payment_id: o.razorpay_payment_id,
        razorpay_order_id: o.razorpay_order_id,
        offering_title: o.offerings?.title ?? "LevelUp purchase",
        instructor_name: o.offerings?.instructor_name ?? null,
      })));
      setBuyer({ name: (prof as any)?.full_name ?? "", email: (prof as any)?.email ?? user.email ?? "", phone: (prof as any)?.phone ?? "" });
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user]);

  const openSheet = (o: OrderRow) => {
    void hapticSelection();
    setSelected({
      ...o,
      buyer_name: buyer.name,
      buyer_email: buyer.email,
      buyer_phone: buyer.phone,
    });
    setSheetOpen(true);
  };

  if (loading || !orders.length) return null;

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">Invoices &amp; receipts</h2>
        <p className="text-sm text-muted-foreground mt-1">
          A GST invoice for every purchase — tap to view, download or email.
        </p>
      </div>
      <div className="grid gap-3">
        {orders.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => openSheet(o)}
            className="pressable flex w-full items-center gap-4 rounded-2xl border border-border bg-card/40 p-4 text-left transition-colors hover:border-border-hover sm:p-5"
          >
            <div className="hidden sm:flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[hsl(var(--cream))]/10 text-[hsl(var(--cream))]">
              <FileText className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate">{o.offering_title}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                <span className="font-mono">{invoiceNumber(o.id)}</span>
                {(o.captured_at || o.created_at) && (
                  <> · {new Date(o.captured_at || o.created_at!).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</>
                )}
              </p>
              <div className="mt-1.5 flex items-center gap-2">
                <span className="text-sm font-bold">₹{o.total_inr.toLocaleString("en-IN")}</span>
                <Badge variant="secondary" className="border-0 bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/15 text-[10px] font-bold uppercase tracking-wider">
                  Paid
                </Badge>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </button>
        ))}
      </div>

      <InvoiceDetailSheet order={selected} open={sheetOpen} onOpenChange={setSheetOpen} />
    </section>
  );
};

export default ProfilePage;
