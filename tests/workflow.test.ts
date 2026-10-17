import { describe, expect, it } from "vitest";
import { generateMockPlan, decideNext, evaluateSession, buildConsistencyFindings } from "@/lib/agents";
import { Candidate, InterviewSession, Job } from "@/lib/domain";

const job: Job = {
  id: "job",
  title: "Platform Engineer",
  description: "Build Kubernetes production platforms with clear incident communication.",
  requiredSkills: ["Kubernetes"],
  preferredSkills: ["PostgreSQL"],
  responsibilities: ["Troubleshoot production incidents"],
  createdAt: new Date().toISOString()
};

const candidate: Candidate = {
  id: "candidate",
  name: "Asha",
  resumeText: "Deployed Kubernetes services in production.",
  source: "manual",
  resumeClaims: [{
    id: "claim",
    excerpt: "Deployed Kubernetes services in production.",
    category: "Kubernetes",
    explicit: true,
    materiality: "high"
  }],
  createdAt: new Date().toISOString()
};

describe("interview workflow", () => {
  it("generates 8 resume-aware questions", () => {
    const plan = generateMockPlan(job, candidate);
    expect(plan.questions).toHaveLength(8);
    expect(plan.questions.some((question) => question.relatedResumeClaimId === "claim")).toBe(true);
  });

  it("asks one targeted follow-up for shallow answers", () => {
    const plan = generateMockPlan(job, candidate);
    const session: InterviewSession = {
      id: "session",
      candidateId: candidate.id,
      jobId: job.id,
      planId: plan.id,
      mode: "text",
      status: "active",
      consentStatus: "granted",
      currentQuestionId: plan.questions[0].id,
      askedQuestionIds: [plan.questions[0].id],
      followUpHistory: [],
      currentDifficulty: 3,
      createdAt: new Date().toISOString()
    };
    const decision = decideNext(session, plan, [{
      id: "answer",
      sessionId: session.id,
      questionId: plan.questions[0].id,
      text: "Yes, I worked on that.",
      source: "text",
      createdAt: new Date().toISOString()
    }]);
    expect(decision.decision).toBe("ask_follow_up");
    expect(decision.difficulty).toBe(2);
  });

  it("forces human review for incomplete or low-evidence results", () => {
    const plan = generateMockPlan(job, candidate);
    const session: InterviewSession = {
      id: "session",
      candidateId: candidate.id,
      jobId: job.id,
      planId: plan.id,
      mode: "text",
      status: "ended",
      consentStatus: "granted",
      currentQuestionId: undefined,
      askedQuestionIds: [],
      followUpHistory: [],
      currentDifficulty: 3,
      createdAt: new Date().toISOString()
    };
    const findings = buildConsistencyFindings(session, plan, candidate, []);
    const evaluation = evaluateSession(session, plan, [], findings);
    expect(evaluation.advisoryOnly).toBe(true);
    expect(evaluation.needsHumanReview).toBe(true);
    expect(evaluation.humanReviewReasons.join(" ")).toContain("incomplete");
  });
});
