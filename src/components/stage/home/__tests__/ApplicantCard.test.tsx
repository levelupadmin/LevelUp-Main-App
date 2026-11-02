import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/lib/haptics", () => ({ tapTick: () => Promise.resolve() }));

import StageApplicantCard from "../ApplicantCard";
import ApplicantStageCard from "@/components/home/ApplicantStageCard";
import type { ApplicantStageView } from "@/hooks/useApplicantStage";

const draw = (el: JSX.Element) => render(<MemoryRouter>{el}</MemoryRouter>);

describe("Stage Home applicant card", () => {
  it.each<[ApplicantStageView, string, string | null]>([
    [{ kind: "stage", stage: "fee-pending", applicationId: "a1", offeringTitle: "The Program" }, "fee pending", "/my-application/a1"],
    [{ kind: "stage", stage: "in-review", applicationId: "a2", offeringTitle: "The Program" }, "in review", "/my-application/a2"],
    [{ kind: "stage", stage: "decision-ready", applicationId: "a3", offeringTitle: "The Program" }, "decision ready", "/my-application/a3"],
    [{ kind: "claim", applicationId: "a4", offeringTitle: null }, "", "/claim/a4"],
    [{ kind: "neutral", applicationId: "a5", offeringTitle: "The Program" }, "", null],
  ])("says what the classic card says, and links the same place (%#)", (view, chip, to) => {
    const stage = draw(<StageApplicantCard view={view} />);
    const stageText = stage.container.textContent;
    const stageHref = stage.container.querySelector("a")?.getAttribute("href") ?? null;
    stage.unmount();
    const classic = draw(<ApplicantStageCard view={view} />);
    expect(stageText).toBe(classic.container.textContent);
    expect(stageHref).toBe(classic.container.querySelector("a")?.getAttribute("href") ?? null);
    expect(stageHref).toBe(to);
    if (chip) expect(stageText).toContain(chip);
  });

  it("names the program, or says 'Your application' when it has no title", () => {
    draw(<StageApplicantCard view={{ kind: "claim", applicationId: "a4", offeringTitle: null }} />);
    expect(screen.getByRole("heading", { name: "Your application" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Confirm it is you/ })).toHaveAttribute("href", "/claim/a4");
  });
});
