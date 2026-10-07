import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { isNative } from "@/lib/platform";
import { RAZORPAY_THEME_COLOR } from "@/lib/brand";
import { buildVerifyBody, type RazorpaySuccess } from "@/lib/checkoutVerify";
import { useUI } from "../components/overlays";
import { Icon } from "../components/Icon";
import { AsyncBtn } from "../components/ui";
import { inr } from "./format";
import { rpc } from "./api";
import { sound } from "./sound";
import type { Room } from "./types";

export type Stage = "app_fee" | "confirmation" | "balance";
const DEMO_STEP: Record<Stage, string> = { app_fee: "pay_app_fee", confirmation: "pay_deposit", balance: "pay_balance" };
const WEB_ORIGIN = "https://app.leveluplearning.in";

type RazorpayCtor = new (opts: Record<string, unknown>) => { open: () => void; on: (ev: string, cb: () => void) => void };
const rzpCtor = (): RazorpayCtor | undefined => (window as unknown as { Razorpay?: RazorpayCtor }).Razorpay;

let scriptP: Promise<boolean> | null = null;
function loadRazorpay(): Promise<boolean> {
  if (rzpCtor()) return Promise.resolve(true);
  if (scriptP) return scriptP;
  scriptP = new Promise((resolve) => {
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.async = true;
    s.onload = () => resolve(true);
    s.onerror = () => { scriptP = null; resolve(false); };
    document.body.appendChild(s);
  });
  return scriptP;
}

const isIOSNative = () => {
  try { return isNative() && /iPhone|iPad|iPod/i.test(navigator.userAgent); } catch { return false; }
};

/**
 * Pay one stage of the staged fee (application fee → seat deposit → balance)
 * through the SAME edge functions the checkout page uses, so the application
 * status advances exactly as it does today. Demo programs simulate it; the
 * native shells hand off to the web (store payment rules).
 */
export function usePay(room: Room) {
  const ui = useUI();
  const { user, profile } = useAuth();

  return useCallback((stage: Stage, o: { title: string; sub?: string; amount: number; onPaid: () => void; applicationId?: string }) => {
    const p = room.program;

    if (p.is_demo) {
      ui.sheet({
        label: "Pay", cls: "sheet--pay",
        render: (close) => (
          <div className="sheet-pad">
            <div className="pay-top"><span className="eyebrow">LevelUp Learning · {o.title}</span><b className="pay-amt">{inr(o.amount)}</b><p className="muted">{o.sub}</p></div>
            <div className="seg pay-seg" role="radiogroup" aria-label="Pay with"><button type="button" className="is-on">UPI</button><button type="button">Card</button><button type="button">Netbanking</button>{stage !== "app_fee" ? <button type="button">EMI</button> : null}</div>
            <AsyncBtn cls="btn-lg btn-block mt-4" busyLabel="Waiting for UPI" onClick={async () => {
              await new Promise((r) => setTimeout(r, 900));
              await rpc("luca_demo_advance", { p_slug: p.slug, p_step: DEMO_STEP[stage] });
              sound.play("success"); sound.buzz([10, 40, 16]);
              close();
              setTimeout(o.onPaid, 300);
            }}>Pay {inr(o.amount)}</AsyncBtn>
            <p className="fine center mt-3">Demo cohort. No money moves.</p>
          </div>
        ),
      });
      return;
    }

    // create-razorpay-order charges the staged amounts only on a 'staged' offering;
    // on any other mode the fee step would bill the full price. Never open it then.
    if (p.pricing.payment_mode !== "staged") {
      ui.toast("Payments for this cohort aren't switched on yet. Message the cohort team and they'll sort it out.", "warning-circle");
      return;
    }

    if (isNative()) {
      const path = `/luca/${p.slug}/${stage === "app_fee" ? "apply/3" : stage === "confirmation" ? "offer" : "balance"}`;
      ui.sheet({
        label: "Continue on the web",
        render: () => (
          <div className="sheet-pad">
            <h3 className="h2">{isIOSNative() ? "Finish this on the LevelUp website" : "Continue on the web"}</h3>
            <p className="muted mt-2">Payments for {p.cohort_label || p.name} happen on the LevelUp website. Your seat and everything you do there shows up here right after.</p>
            {isIOSNative()
              ? <p className="lu-native mt-4"><b>app.leveluplearning.in</b>, then sign in with the same account.</p>
              : <a className="btn btn-lg btn-block mt-4" href={`${WEB_ORIGIN}${path}`} target="_blank" rel="noopener noreferrer"><Icon name="arrow-square-out" />Open the website</a>}
          </div>
        ),
      });
      return;
    }

    void (async () => {
      const ok = await loadRazorpay();
      const Rzp = rzpCtor();
      if (!ok || !Rzp) { ui.toast("Couldn't reach the payment page. Check your connection and try again.", "warning-circle"); return; }
      const { data, error } = await supabase.functions.invoke("create-razorpay-order", {
        body: { offering_id: p.offering_id, payment_type: stage, application_id: o.applicationId ?? room.application?.id },
      });
      if (error || !data?.razorpay_order_id) {
        let msg = "That didn't go through. Try once more?";
        try {
          const ctx = (error as { context?: Response } | null)?.context;
          const body = ctx ? await ctx.json() : data;
          if (body?.error) msg = String(body.error);
        } catch { /* keep the generic message */ }
        ui.toast(msg, "warning-circle");
        return;
      }
      const rzp = new Rzp({
        key: data.key_id, amount: data.amount, currency: data.currency, name: "LevelUp",
        description: `${p.cohort_label || p.name} · ${o.title}`, order_id: data.razorpay_order_id,
        prefill: { name: profile?.full_name ?? "", email: profile?.email ?? user?.email ?? "", contact: (profile as { phone?: string | null } | null)?.phone ?? user?.phone ?? "" },
        theme: { color: RAZORPAY_THEME_COLOR, backdrop_color: "rgba(0,0,0,0.8)" },
        handler: async (resp: RazorpaySuccess) => {
          const { data: v, error: vErr } = await supabase.functions.invoke("verify-razorpay-payment", {
            body: buildVerifyBody(resp, data.payment_order_id, false),
          });
          if (vErr || !v?.success) {
            ui.toast(v?.needs_review ? "Payment received. We're confirming it and will update you shortly." : "Payment verification failed. If money left your account, contact support.", "warning-circle");
            return;
          }
          sound.play("success"); sound.buzz([10, 40, 16]);
          o.onPaid();
        },
        modal: { ondismiss: () => {} },
      });
      rzp.on("payment.failed", () => ui.toast("The payment didn't complete. If any amount was debited, it comes back to you automatically.", "warning-circle"));
      rzp.open();
    })();
  }, [room, ui, user, profile]);
}
