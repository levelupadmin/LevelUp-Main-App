export const ROLE_ROUTE_MAP: Record<string, string[]> = {
  admin: ["*"],
  author: ["/admin", "/admin/courses", "/admin/offerings", "/admin/hero-slides"],
  support: ["/admin", "/admin/users", "/admin/enrolments", "/admin/applications", "/admin/certificates"],
  instructor: ["/admin", "/admin/schedule", "/admin/cohorts"],
};

export const ADMIN_ROLES = ["admin", "author", "support", "instructor"];

export function canAccessRoute(role: string, path: string): boolean {
  const routes = ROLE_ROUTE_MAP[role];
  if (!routes) return false;
  if (routes.includes("*")) return true;
  return routes.some((r) => path === r || path.startsWith(r + "/"));
}
