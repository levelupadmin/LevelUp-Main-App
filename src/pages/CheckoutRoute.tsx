import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import CheckoutPage from "@/pages/CheckoutPage";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * /checkout/<id> or /checkout/<slug>. An offering IS its checkout page, so it
 * gets a readable address (/checkout/film-direction-101-live-workshop). A slug
 * is looked up once and the page then runs exactly as it does for an id.
 */
export default function CheckoutRoute() {
  const { offeringId: param = "" } = useParams<{ offeringId: string }>();
  const isId = UUID.test(param);
  const [resolved, setResolved] = useState<string | null | undefined>(isId ? param : undefined);

  useEffect(() => {
    if (isId) { setResolved(param); return; }
    let live = true;
    setResolved(undefined);
    supabase.from("offerings").select("id").eq("slug", param).in("status", ["active", "archived"]).maybeSingle()
      .then(({ data }) => { if (live) setResolved(data?.id ?? null); });
    return () => { live = false; };
  }, [param, isId]);

  if (isId) return <CheckoutPage />;
  if (resolved === undefined) return <div className="min-h-[60vh]" aria-busy="true" />;
  // An unknown address falls through to the checkout's own "Offering not found".
  return <CheckoutPage key={resolved ?? param} offeringIdOverride={resolved ?? param} />;
}
