import { describe, expect, it } from "vitest";
import { calculateWeightedScore, recommendationForScore } from "@/lib/domain";

describe("deterministic scoring", () => {
  it("calculates weighted score in application code", () => {
    const score = calculateWeightedScore([
      { competency: "Technical knowledge and depth", score: 4, weight: 35, explanation: "", confidence: "medium", rubricVersion: "test" },
      { competency: "Problem-solving and troubleshooting", score: 3, weight: 25, explanation: "", confidence: "medium", rubricVersion: "test" },
      { competency: "Communication and explanation", score: 5, weight: 15, explanation: "", confidence: "medium", rubricVersion: "test" },
      { competency: "Job-description fit", score: 2, weight: 25, explanation: "", confidence: "medium", rubricVersion: "test" }
    ]);
    expect(score).toBeCloseTo(0.68, 3);
  });

  it("keeps reject as an advisory recommendation label", () => {
    expect(recommendationForScore(0.25)).toBe("Reject");
  });
});
