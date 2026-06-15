import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/lib/toast";

/**
 * Guest-checkout fields (name / email / phone) + their validation, for the
 * anonymous purchase path. On payment success the guest-create-order +
 * verify-razorpay-payment edge functions mint a real auth.users row from these
 * details, so the buyer becomes a logged-in user without ever seeing an OTP.
 *
 * The form is also rendered (and prefilled) for logged-in users who have no
 * full_name/email/phone on file yet, so they don't have to retype.
 */
export function useGuestCheckout(user: User | null) {
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [guestTouched, setGuestTouched] = useState<{ name?: boolean; email?: boolean; phone?: boolean }>({});

  // Prefill from the logged-in user's profile when available; never clobber a
  // value the user has already typed.
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("users")
        .select("full_name, email, phone")
        .eq("id", user.id)
        .maybeSingle();
      if (data) {
        if (data.full_name && !guestName) setGuestName(data.full_name);
        if (data.email && !guestEmail) setGuestEmail(data.email);
        if (data.phone && !guestPhone) setGuestPhone(data.phone);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  /**
   * Validate the guest fields. Marks every field touched (so inline errors
   * surface immediately) and shows a toast on the first failure. The edge
   * function does the canonical phone normalisation; here we only gate on a
   * 10-digit or +91-prefixed 12-digit form. Returns true when OK to proceed.
   */
  function validateGuest(): boolean {
    setGuestTouched({ name: true, email: true, phone: true });
    if (!guestName.trim() || !guestEmail.trim() || !guestPhone.trim()) {
      toast.error("Please fill in name, email and phone");
      return false;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail.trim())) {
      toast.error("Please enter a valid email");
      return false;
    }
    const digits = guestPhone.replace(/\D/g, "");
    if (!(digits.length === 10 || (digits.length === 12 && digits.startsWith("91")))) {
      toast.error("Please enter a valid 10-digit Indian phone number");
      return false;
    }
    return true;
  }

  return {
    guestName,
    setGuestName,
    guestEmail,
    setGuestEmail,
    guestPhone,
    setGuestPhone,
    guestTouched,
    setGuestTouched,
    validateGuest,
  };
}
