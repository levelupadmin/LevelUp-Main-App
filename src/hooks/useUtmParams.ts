import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";

export interface UtmParams {
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_term: string | null;
  utm_content: string | null;
  referrer: string;
  landing_page: string;
}

export const useUtmParams = (): UtmParams => {
  const [searchParams] = useSearchParams();

  return useMemo(() => ({
    utm_source: searchParams.get("utm_source"),
    utm_medium: searchParams.get("utm_medium"),
    utm_campaign: searchParams.get("utm_campaign"),
    utm_term: searchParams.get("utm_term"),
    utm_content: searchParams.get("utm_content"),
    referrer: document.referrer || "",
    landing_page: window.location.pathname + window.location.search,
  }), [searchParams]);
};
