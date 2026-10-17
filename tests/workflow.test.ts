import { describe, expect, it } from "vitest";
import { generateMockPlan, decideNext, evaluateSession, buildConsistencyFindings } from "@/lib/agents";
import { Answer, Candidate, InterviewSession, Job } from "@/lib/domain";

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
    expect(plan.questions.map((question) => question.priority)).toEqual(["High", "High", "High", "Medium", "Medium", "Medium", "Low", "Low"]);
    expect(plan.questions.map((question) => question.priorityRank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("accepts a short answer and advances to the next question", () => {
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
    expect(decision.decision).toBe("advance_question");
    expect(decision.nextQuestionId).toBe(plan.questions[1].id);
    expect(decision.difficulty).toBe(3);
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

  it("scores from OpenAI answer assessment instead of answer length", () => {
    const plan = generateMockPlan(job, candidate);
    const technicalQuestion = plan.questions.find((question) => question.competency === "Technical knowledge and depth")!;
    const communicationQuestion = plan.questions.find((question) => question.competency === "Communication and explanation")!;
    const session: InterviewSession = {
      id: "session",
      candidateId: candidate.id,
      jobId: job.id,
      planId: plan.id,
      mode: "text",
      status: "completed",
      consentStatus: "granted",
      currentQuestionId: undefined,
      askedQuestionIds: [technicalQuestion.id, communicationQuestion.id],
      followUpHistory: [],
      currentDifficulty: 3,
      createdAt: new Date().toISOString()
    };
    const answers: Answer[] = [{
      id: "technical-answer",
      sessionId: session.id,
      questionId: technicalQuestion.id,
      text: "Yes.",
      source: "text",
      aiScore: 5,
      aiCorrectness: "correct",
      aiConfidence: "high",
      aiFeedback: "Short but correct and specific enough for the asked technical question.",
      createdAt: new Date().toISOString()
    }, {
      id: "communication-answer",
      sessionId: session.id,
      questionId: communicationQuestion.id,
      text: "I would keep talking at length without answering the actual stakeholder question clearly.",
      source: "text",
      aiScore: 0,
      aiCorrectness: "incorrect",
      aiConfidence: "high",
      aiFeedback: "Does not answer the communication prompt.",
      createdAt: new Date().toISOString()
    }];
    const evaluation = evaluateSession(session, plan, answers, []);
    const technical = evaluation.competencyScores.find((score) => score.competency === "Technical knowledge and depth")!;
    const communication = evaluation.competencyScores.find((score) => score.competency === "Communication and explanation")!;
    expect(technical.score).toBe(5);
    expect(technical.confidence).toBe("medium");
    expect(communication.score).toBe(0);
    expect(communication.missingEvidence).toContain("Does not answer");
  });
});
