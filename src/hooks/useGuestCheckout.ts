import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/lib/toast";
import { isValidPhoneNumber } from "react-phone-number-input";

/**
 * A phone the guest checkout accepts. India: the 10-digit number (with or
 * without +91). Elsewhere (2026-11-04): any valid international number, and
 * that buyer's account is keyed on their email (_shared/buyerIdentity.ts).
 */
export function isValidGuestPhone(raw: string): boolean {
  const v = (raw ?? "").trim();
  const digits = v.replace(/\D/g, "");
  if (!v.startsWith("+") || v.startsWith("+91")) {
    const national = digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : digits;
    // An Indian mobile number starts 6 to 9. Razorpay refuses anything else,
    // and its contact field is locked once we prefill it.
    return /^[6-9]\d{9}$/.test(national);
  }
  try {
    return isValidPhoneNumber(v);
  } catch {
    return false;
  }
}

/**
 * Guest-checkout fields (name / email / phone) + their validation, for the
 * anonymous purchase path. No OTP before paying: on payment success the
 * verify-razorpay-payment / razorpay-webhook functions attach the order to the
 * account that owns the phone (creating it if needed), and the buyer confirms
 * that phone with one code on /login, which opens the course.
 *
 * The form is also rendered (and prefilled) for logged-in users who have no
 * full_name/email/phone on file yet, so they don't have to retype.
 */
/**
 * Bring the first field that needs the buyer into view and focus it. The sticky
 * Pay bar can be tapped while the form is off screen; a toast alone left them
 * hunting for what was wrong.
 */
function focusField(id: string) {
  try {
    const el = document.getElementById(id) as HTMLInputElement | null;
    if (!el) return;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    el.focus({ preventScroll: true });
  } catch {
    /* focus is a convenience, never a blocker */
  }
}

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
   * function does the canonical phone normalisation; here we only gate on
   * isValidGuestPhone. Returns true when OK to proceed.
   */
  function validateGuest(): boolean {
    setGuestTouched({ name: true, email: true, phone: true });
    if (!guestName.trim()) {
      toast.error("Please enter your name");
      focusField("guest-name");
      return false;
    }
    if (!guestEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail.trim())) {
      toast.error(guestEmail.trim() ? "Please enter a valid email" : "Please enter your email");
      focusField("guest-email");
      return false;
    }
    if (!isValidGuestPhone(guestPhone)) {
      toast.error("Please enter a valid phone number");
      focusField("guest-phone");
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
