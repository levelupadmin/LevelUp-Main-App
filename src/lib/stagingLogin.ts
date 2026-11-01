import { supabaseUrl } from "@/integrations/supabase/client";

const PRODUCTION_REF = "ivkvluezuiojovpotlyb";

/**
 * Staging-only test login for the redesign. On a build that is NOT on the
 * production database and has VITE_STAGING_TEST_LOGIN=true, any +91 number
 * skips the MSG91 SMS and goes straight to the code boxes; verify-msg91-otp
 * on staging accepts its STAGING_TEST_LOGIN_CODE secret instead of an OTP.
 * Always false on a production build, whatever the env says.
 */
export const isStagingTestLogin = (phone: string): boolean =>
  import.meta.env.VITE_STAGING_TEST_LOGIN === "true" &&
  !supabaseUrl.includes(PRODUCTION_REF) &&
  phone.startsWith("+91");
