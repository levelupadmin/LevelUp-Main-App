import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import AlumniBanner from "@/components/room/AlumniBanner";
import DemoEntryCard from "@/components/room/DemoEntryCard";
import CertificateMoment from "@/components/room/CertificateMoment";
import WeekRail from "@/components/room/WeekRail";

const { celebrate, claim } = vi.hoisted(() => ({
  celebrate: vi.fn(() => Promise.resolve()),
  claim: vi.fn(),
}));

vi.mock("@/lib/haptics", () => ({
  celebrate,
  hapticImpact: vi.fn(),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "user-1", user_metadata: {} },
    profile: { full_name: "Asha Rao", member_number: "0042" },
  }),
}));

vi.mock("@/hooks/useCohortRooms", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/hooks/useCohortRooms")>();
  return {
    ...original,
    useRoomOutlet: () => ({
      room: { offering_id: "offering-1", phase: "wrap" },
    }),
  };
});

vi.mock("@/hooks/useRoomCertificate", () => ({
  useRoomCertificateData: () => ({
    isPending: false,
    isError: false,
    data: {
      courses: [],
      certificates: [{
        id: "certificate-1",
        course_id: "course-1",
        image_url: "https://example.invalid/cert.png",
        certificate_number: "LU-0001",
        created_at: "2026-08-01T00:00:00.000Z",
        course_name: "Creator Academy",
      }],
    },
  }),
  useClaimRoomCertificates: () => ({ mutate: claim, isPending: false, isError: false }),
}));

vi.mock("@/components/certificates/CertificateCard", () => ({
  default: ({ certificate }: { certificate: { certificate_number: string } }) => (
    <p>Certificate {certificate.certificate_number}</p>
  ),
}));

describe("R4 produced moments", () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    const storage: Storage = {
      get length() { return values.size; },
      clear: () => values.clear(),
      getItem: (key) => values.get(key) ?? null,
      key: (index) => [...values.keys()][index] ?? null,
      removeItem: (key) => { values.delete(key); },
      setItem: (key, value) => { values.set(key, String(value)); },
    };
    Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true });
    Object.defineProperty(window, "localStorage", { value: storage, configurable: true });
    celebrate.mockClear();
    claim.mockClear();
  });

  it("keeps the alumni promise exact and names the surfaces that remain", () => {
    render(<AlumniBanner />);
    expect(screen.getByText("This room stays open. You keep it.")).toBeInTheDocument();
    expect(screen.getByText(/feed, people, recordings, resources and Demo Day/i)).toBeInTheDocument();
  });

  it("renders safe Demo Day actions and refuses a non-http work URL", () => {
    render(
      <DemoEntryCard
        memberName="Asha Rao"
        city="Pune"
        entry={{
          id: "demo-1",
          offering_id: "offering-1",
          batch_id: "batch-1",
          user_id: "user-1",
          title: "The Last Frame",
          description: "A finished short.",
          work_url: "javascript:alert(1)",
          file_urls: ["user-1/demo/film.pdf"],
          files: [{ path: "user-1/demo/film.pdf", name: "film.pdf", signedUrl: "https://example.invalid/signed" }],
          created_at: "2026-08-01T00:00:00.000Z",
          updated_at: "2026-08-01T00:00:00.000Z",
        }}
      />,
    );
    expect(screen.getByText("The Last Frame")).toBeInTheDocument();
    expect(screen.getByText("Asha Rao · Pune")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /view work/i })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /film.pdf/i })).toHaveAttribute("href", "https://example.invalid/signed");
  });

  it("renders the single completion moment and celebrates it once per user", () => {
    const { unmount } = render(<CertificateMoment />);
    expect(screen.getByText("You finished.")).toBeInTheDocument();
    expect(screen.getByText("Certificate LU-0001")).toBeInTheDocument();
    expect(celebrate).toHaveBeenCalledTimes(1);
    unmount();

    render(<CertificateMoment />);
    expect(celebrate).toHaveBeenCalledTimes(1);
  });

  it("keeps the finale as anticipation before wrap and makes it a link once open", () => {
    const week = {
      week_id: "week-1",
      week_number: 1,
      theme: "Beginnings",
      starts_on: "2026-08-01",
      ends_on: "2026-08-07",
      week_status: "active",
      attended: false,
    } as Parameters<typeof WeekRail>[0]["weeks"][number];

    const { rerender } = render(
      <MemoryRouter>
        <WeekRail weeks={[week]} activeWeekId="week-1" onSelect={vi.fn()} finaleAt="2026-08-22T14:30:00Z" />
      </MemoryRouter>,
    );
    expect(screen.getByText("The finale").closest("a")).toBeNull();

    rerender(
      <MemoryRouter>
        <WeekRail weeks={[week]} activeWeekId="week-1" onSelect={vi.fn()} finaleAt="2026-08-22T14:30:00Z" finaleHref="../demo-day" />
      </MemoryRouter>,
    );
    expect(screen.getByRole("link", { name: /the finale/i })).toHaveAttribute("href", "/demo-day");
  });
});
