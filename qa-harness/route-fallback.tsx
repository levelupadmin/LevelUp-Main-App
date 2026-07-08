// QA HARNESS — NOT shipped. Mounts the REAL RouteFallback (the Suspense
// fallback for every top-level lazy route) in isolation so the reduced-motion
// evidence sweep can capture it deterministically without having to race a
// lazy-chunk load. RouteFallback is self-contained (only depends on index.css
// tokens + the shared Skeleton* primitives), so this render is byte-identical
// to what the router paints while a route chunk streams in.
//
// The five NEW loading surfaces this phase are captured under emulated
// prefers-reduced-motion by scripts/qa/capture-reduced-motion-loading.mjs; the
// other four (CourseDetail / MyCourses / Community / Profile skeletons) render
// on their real routes with the data layer held pending. This harness only
// exists because RouteFallback has no addressable route of its own.
import { createRoot } from "react-dom/client";
import RouteFallback from "@/components/RouteFallback";
import "@/index.css";

createRoot(document.getElementById("root")!).render(<RouteFallback />);
