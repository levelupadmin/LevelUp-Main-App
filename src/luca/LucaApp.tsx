import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import "@fontsource-variable/bricolage-grotesque/standard.css";
import "./styles/luca.css";

import { lazy, Suspense, useEffect, type ReactNode } from "react";
import { Navigate, Outlet, Route, Routes, useLocation, useParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { LucaUIProvider } from "./components/overlays";
import { Loader } from "./components/Logo";
import { RoomProvider, TabBar, useLuca, useProgramRoom } from "./components/shell";
import { useLook } from "./lib/theme";
import { sound } from "./lib/sound";
import { LucaError } from "./lib/api";

/* Screens are split so the program page (the public, marketing entry) stays light. */
const MyPrograms = lazy(() => import("./screens/MyPrograms"));
const ProgramPage = lazy(() => import("./screens/ProgramPage"));
const Trailer = lazy(() => import("./screens/Trailer"));
const SampleReview = lazy(() => import("./screens/SampleReview"));
const Apply = lazy(() => import("./screens/Apply"));
const Interview = lazy(() => import("./screens/Interview"));
const Status = lazy(() => import("./screens/Status"));
const Offer = lazy(() => import("./screens/Offer"));
const Balance = lazy(() => import("./screens/Balance"));
const Today = lazy(() => import("./screens/Today"));
const Calendar = lazy(() => import("./screens/Calendar"));
const Session = lazy(() => import("./screens/Session"));
const Recordings = lazy(() => import("./screens/Recordings"));
const Recording = lazy(() => import("./screens/Recording"));
const Work = lazy(() => import("./screens/Work"));
const Assignment = lazy(() => import("./screens/Assignment"));
const Prewatch = lazy(() => import("./screens/Prewatch"));
const Clan = lazy(() => import("./screens/Clan"));
const Sprint = lazy(() => import("./screens/Sprint"));
const Me = lazy(() => import("./screens/Me"));
const Certificate = lazy(() => import("./screens/Certificate"));
const Desk = lazy(() => import("./screens/Desk"));
const DemoSwitch = lazy(() => import("./screens/DemoSwitch"));

function Loading() {
  return <div className="lu-load" role="status" aria-label="Loading"><Loader /></div>;
}

/** The .luca root: theme, accent, overlays. Everything LUCA renders lives inside it. */
function LucaRoot() {
  const { accent, theme } = useLook();
  useEffect(() => {
    const unlock = () => sound.unlock();
    window.addEventListener("pointerdown", unlock, { once: true });
    // The page behind LUCA (overscroll, the bit under the iOS toolbar) takes LUCA's background.
    const prev = document.body.style.backgroundColor;
    document.body.style.backgroundColor = theme === "light" ? "#f3f4f6" : "#0c0d0f";
    return () => { window.removeEventListener("pointerdown", unlock); document.body.style.backgroundColor = prev; };
  }, [theme]);
  return (
    <div className="luca" data-brand="stage" data-theme={theme} data-accent={accent}>
      <LucaUIProvider>
        <div className="lu-shell">
          <Suspense fallback={<Loading />}><Outlet /></Suspense>
        </div>
      </LucaUIProvider>
    </div>
  );
}

/** Loads one program and provides it. Unknown or hidden programs are a plain 404. */
function ProgramScope() {
  const { slug, data: room, isLoading, error, refetch } = useProgramRoom();
  if (isLoading) return <Loading />;
  if (error || !room) {
    return (
      <div className="page"><div className="lu-err">
        <h1 className="h1">{error ? "We couldn't load this cohort." : "This cohort isn't here."}</h1>
        <p className="muted mt-3">{error ? (error instanceof LucaError ? error.message : "Check your connection and try again.") : "The link may be old, or the cohort isn't open yet."}</p>
        {error ? <button className="btn btn-lg btn-block mt-5" type="button" onClick={() => refetch()}>Try again</button> : null}
        <a className={`btn btn-lg btn-block ${error ? "btn-secondary mt-3" : "mt-5"}`} href="/home">Back to LevelUp</a>
      </div></div>
    );
  }
  return <RoomProvider slug={slug} room={room}><Outlet /></RoomProvider>;
}

/** Signed-in only; sends people to sign in and back. */
function SignedIn({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <Loading />;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} state={{ from: loc }} replace />;
  return <>{children}</>;
}

/** The room: learners only. Applicants go to their status; outsiders to the program page. */
function LearnerOnly() {
  const { slug, room } = useLuca();
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <Loading />;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname)}`} replace />;
  if (room.access === "locked") return <Navigate to={`/luca/${slug}/balance`} replace />;
  if (room.access === "applicant") return <Navigate to={`/luca/${slug}/status`} replace />;
  if (room.access !== "learner" || !room.me) return <Navigate to={`/luca/${slug}/program`} replace />;
  return <><Outlet /></>;
}

function WithTabs() {
  return <><Outlet /><TabBar /></>;
}

/** /luca/:slug — where a person belongs right now. */
function Entry() {
  const { slug, room } = useLuca();
  if (room.access === "learner" && room.me) return <Navigate to={`/luca/${slug}/today`} replace />;
  if (room.access === "locked") return <Navigate to={`/luca/${slug}/balance`} replace />;
  if (room.access === "applicant") return <Navigate to={`/luca/${slug}/status`} replace />;
  return <Navigate to={`/luca/${slug}/program`} replace />;
}

function StaffOnly() {
  const { room, slug } = useLuca();
  if (!room.is_staff) return <Navigate to={`/luca/${slug}`} replace />;
  return <Outlet />;
}

function OldSlugRedirect() {
  const { slug } = useParams();
  return <Navigate to={`/luca/${slug}`} replace />;
}

export default function LucaApp() {
  return (
    <Routes>
      <Route element={<LucaRoot />}>
        <Route index element={<SignedIn><MyPrograms /></SignedIn>} />
        <Route path=":slug" element={<ProgramScope />}>
          <Route index element={<Entry />} />
          <Route path="program" element={<ProgramPage />} />
          <Route path="trailer" element={<Trailer />} />
          <Route path="review" element={<SampleReview />} />
          <Route path="apply" element={<Navigate to="1" replace />} />
          <Route path="apply/:step" element={<SignedIn><Apply /></SignedIn>} />
          <Route path="interview" element={<SignedIn><Interview /></SignedIn>} />
          <Route path="status" element={<SignedIn><Status /></SignedIn>} />
          <Route path="offer" element={<SignedIn><Offer /></SignedIn>} />
          <Route path="balance" element={<SignedIn><Balance /></SignedIn>} />
          <Route element={<LearnerOnly />}>
            <Route element={<WithTabs />}>
              <Route path="today" element={<Today />} />
              <Route path="calendar" element={<Calendar />} />
              <Route path="work" element={<Work />} />
              <Route path="recordings" element={<Recordings />} />
              <Route path="clan" element={<Clan />} />
            </Route>
            <Route path="session/:id" element={<Session />} />
            <Route path="rec/:id" element={<Recording />} />
            <Route path="assign/:id" element={<Assignment />} />
            <Route path="prewatch/:week" element={<Prewatch />} />
            <Route path="sprint" element={<Sprint />} />
            <Route path="me" element={<Me />} />
            <Route path="certificate" element={<Certificate />} />
          </Route>
          <Route element={<StaffOnly />}>
            <Route path="desk" element={<Desk />} />
            <Route path="demo" element={<DemoSwitch />} />
          </Route>
          <Route path="*" element={<OldSlugRedirect />} />
        </Route>
      </Route>
    </Routes>
  );
}
