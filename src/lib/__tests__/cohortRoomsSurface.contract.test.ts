import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (...parts: string[]) => readFileSync(resolve(process.cwd(), ...parts), "utf8");

describe("cohort room surface wiring contract", () => {
  const app = source("src/App.tsx");
  const studentLayout = source("src/components/layout/StudentLayout.tsx");
  const hook = source("src/hooks/useCohortRoomsSurface.ts");
  const reader = source("src/lib/runtimeFlags.ts");

  it("feeds routes and navigation from the same context value", () => {
    expect(app).toContain("useCohortRoomsSurfaceValue()");
    expect(studentLayout).toContain("useCohortRoomsSurfaceValue()");
    expect(studentLayout).not.toMatch(/flag\s*\(\s*COHORT_ROOMS\s*\)/);
    expect(studentLayout).not.toContain('from "@/lib/flags"');
  });

  it("renders the bounded initial read through RouteFallback", () => {
    expect(app).toMatch(/if \(roomsPending\) return <RouteFallback \/>/);
  });

  it("does not persist or query-cache a positive server answer", () => {
    expect(hook).not.toMatch(/\buseQuery\b/);
    expect(reader).not.toContain("localStorage");
    expect(reader).not.toContain("@tanstack/react-query");
    expect(hook).toContain('queryKey: ["cohort-rooms"]');
  });
});
