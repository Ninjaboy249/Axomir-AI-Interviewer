import { v4 as uuid } from "uuid";
import {
  Answer,
  Candidate,
  CompetencyScore,
  ConsistencyFinding,
  Evaluation,
  InterviewPlan,
  InterviewQuestion,
  InterviewSession,
  Job,
  calculateWeightedScore,
  nowIso,
  recommendationForScore
} from "./domain";

const competencies = [
  "Technical knowledge and depth",
  "Problem-solving and troubleshooting",
  "Communication and explanation",
  "Job-description fit"
] as const;

export function generateMockPlan(job: Job, candidate: Candidate, focusAreas: string[] = []): InterviewPlan {
  const claims = candidate.resumeClaims.length ? candidate.resumeClaims : [];
  const baseRequirements = [...job.requiredSkills, ...job.responsibilities, ...focusAreas].filter(Boolean);
  const questions: InterviewQuestion[] = Array.from({ length: 8 }).map((_, index) => {
    const claim = claims[index % Math.max(claims.length, 1)];
    const competency = competencies[index % competencies.length];
    const requirement = baseRequirements[index % Math.max(baseRequirements.length, 1)] ?? job.title;
    return {
      id: uuid(),
      text: questionText(index, job.title, requirement, claim?.excerpt),
      competency,
      relatedJdRequirement: requirement,
      relatedResumeClaimId: claim?.id,
      expectedAnswer: [
        "Specific personal contribution and context",
        "Concrete technical or behavioral evidence",
        "Tradeoffs, troubleshooting, or measurable outcome"
      ],
      followUpTriggers: [
        "Answer is generic or lacks first-person evidence",
        "Candidate does not address the related resume claim",
        "No implementation detail, failure mode, or outcome is provided"
      ],
      evaluationCriteria: [
        "Accuracy against the job requirement",
        "Depth and specificity of evidence",
        "Clarity of explanation and ownership"
      ],
      difficulty: Math.min(5, 2 + (index % 4)),
      maxScore: 5,
      mandatory: index < 6
    };
  });

  return {
    id: uuid(),
    version: 1,
    status: "draft",
    jobId: job.id,
    candidateId: candidate.id,
    questions,
    focusAreas,
    rubricVersion: "uc2-default-2026-10",
    createdAt: nowIso()
  };
}

function questionText(index: number, role: string, requirement: string, claim?: string) {
  const claimClause = claim ? ` Your resume says: "${claim.slice(0, 180)}".` : "";
  const stems = [
    `For the ${role} role, walk me through a real example where you handled ${requirement}.${claimClause} What did you personally do?`,
    `Describe a production problem or edge case related to ${requirement}. How did you diagnose it and what signals did you inspect?`,
    `If you joined this team and had to improve ${requirement}, what would you assess in the first week and why?`,
    `Explain ${requirement} to a cross-functional teammate. What tradeoffs would you call out?`
  ];
  return stems[index % stems.length];
}

export function decideNext(session: InterviewSession, plan: InterviewPlan, answers: Answer[]) {
  const currentQuestion = plan.questions.find((question) => question.id === session.currentQuestionId) ?? plan.questions[0];
  const answer = answers.filter((item) => item.questionId === currentQuestion.id).at(-1);
  if (!answer) {
    return { decision: "clarify_answer" as const, text: currentQuestion.text, nextQuestionId: currentQuestion.id, difficulty: session.currentDifficulty };
  }

  const shallow = answer.text.trim().split(/\s+/).length < 35 || !/\b(I|we|my|our|because|measured|debugged|implemented|deployed|designed)\b/i.test(answer.text);
  const followUpsForQuestion = session.followUpHistory.filter((item) => item.questionId === currentQuestion.id).length;
  if (shallow && followUpsForQuestion < 1) {
    return {
      decision: "ask_follow_up" as const,
      text: `Could you make that more concrete? Please include the specific steps you took, the tools or signals you used, and the outcome.`,
      nextQuestionId: currentQuestion.id,
      difficulty: Math.max(1, session.currentDifficulty - 1)
    };
  }

  const currentIndex = plan.questions.findIndex((question) => question.id === currentQuestion.id);
  const next = plan.questions.slice(currentIndex + 1).find((question) => !session.askedQuestionIds.includes(question.id));
  if (!next) {
    return { decision: "end_interview" as const, text: "That completes the planned interview. Thank you for your time.", nextQuestionId: undefined, difficulty: session.currentDifficulty };
  }
  const detailed = answer.text.trim().split(/\s+/).length > 90;
  return {
    decision: "advance_question" as const,
    text: next.text,
    nextQuestionId: next.id,
    difficulty: detailed ? Math.min(5, session.currentDifficulty + 1) : session.currentDifficulty
  };
}

export function buildConsistencyFindings(session: InterviewSession, plan: InterviewPlan, candidate: Candidate, answers: Answer[]): ConsistencyFinding[] {
  return candidate.resumeClaims.filter((claim) => claim.materiality !== "low").slice(0, 8).map((claim) => {
    const questions = plan.questions.filter((question) => question.relatedResumeClaimId === claim.id);
    const relevantAnswers = answers.filter((answer) => questions.some((question) => question.id === answer.questionId));
    const evidence = relevantAnswers.map((answer) => answer.text.slice(0, 220)).filter(Boolean);
    const hasConcreteEvidence = evidence.some((text) => /\b(I|we|implemented|deployed|debugged|measured|reduced|scaled|owned)\b/i.test(text));
    return {
      id: uuid(),
      sessionId: session.id,
      resumeClaimId: claim.id,
      resumeExcerpt: claim.excerpt,
      claimCategory: claim.category,
      questionIds: questions.map((question) => question.id),
      supportingAnswerExcerpts: evidence,
      classification: evidence.length === 0 ? "Unable to assess" : hasConcreteEvidence ? "Partially supported" : "Not demonstrated",
      explanation: evidence.length === 0
        ? "The interview did not capture enough evidence to assess this claim."
        : hasConcreteEvidence
          ? "The answer includes some relevant first-person evidence, but should still be reviewed by a recruiter."
          : "The answer did not sufficiently demonstrate the claim during the interview.",
      confidence: evidence.length === 0 ? "low" : "medium",
      recommendedHumanVerificationStep: "Review the cited answer excerpts and ask for work samples or references if this claim is material."
    };
  });
}

export function evaluateSession(session: InterviewSession, plan: InterviewPlan, answers: Answer[], findings: ConsistencyFinding[]): Evaluation {
  const answeredByQuestion = new Map(answers.map((answer) => [answer.questionId, answer]));
  const scores: CompetencyScore[] = competencies.map((competency) => {
    const question = plan.questions.find((item) => item.competency === competency);
    const answer = question ? answeredByQuestion.get(question.id) : undefined;
    const words = answer?.text.trim().split(/\s+/).filter(Boolean).length ?? 0;
    const score = words >= 100 ? 4 : words >= 55 ? 3 : words >= 20 ? 2 : 1;
    return {
      competency,
      score,
      weight: competency === "Technical knowledge and depth" ? 35 : competency === "Problem-solving and troubleshooting" ? 25 : competency === "Communication and explanation" ? 15 : 25,
      evidenceQuote: answer?.text.slice(0, 240),
      sourceQuestionId: question?.id,
      explanation: answer ? "Score is based on specificity, relevance, and evidence captured in the stored answer." : "No answer was captured for this competency.",
      missingEvidence: answer ? undefined : "No stored answer assessed this competency.",
      confidence: answer && words >= 55 ? "medium" : "low",
      rubricVersion: plan.rubricVersion
    };
  });

  const weightedScore = calculateWeightedScore(scores);
  const lowConfidence = scores.some((score) => score.confidence === "low");
  const incomplete = session.status !== "completed";
  const missingMaterial = findings.some((finding) => ["Unable to assess", "Potential inconsistency", "Not demonstrated"].includes(finding.classification));
  const recommendation = recommendationForScore(weightedScore);
  const humanReviewReasons = [
    lowConfidence ? "One or more competency scores have low confidence." : undefined,
    incomplete ? "The interview is incomplete or was ended early." : undefined,
    missingMaterial ? "Material resume claims need recruiter verification." : undefined,
    recommendation === "Reject" ? "Reject is advisory only and requires human review before any final decision." : undefined
  ].filter(Boolean) as string[];

  return {
    id: uuid(),
    sessionId: session.id,
    weightedScore,
    percentageScore: Math.round(weightedScore * 100),
    competencyScores: scores,
    strengths: scores.filter((score) => score.score >= 4).map((score) => `${score.competency}: ${score.explanation}`),
    gaps: scores.filter((score) => score.score <= 2).map((score) => `${score.competency}: ${score.missingEvidence ?? "Needs stronger evidence."}`),
    recommendation,
    advisoryOnly: true,
    needsHumanReview: humanReviewReasons.length > 0,
    humanReviewReasons,
    confidence: lowConfidence ? "low" : "medium",
    candidateFeedback: "Thank you for taking the time to interview. The team will review the discussion against the role requirements and follow up through the recruiter.",
    createdAt: nowIso()
  };
}
