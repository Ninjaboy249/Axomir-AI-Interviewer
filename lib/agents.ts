import { v4 as uuid } from "uuid";
import { z } from "zod";
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
import { env } from "./config";
import { structuredOpenAI } from "./openai-provider";

const competencies = [
  "Technical knowledge and depth",
  "Problem-solving and troubleshooting",
  "Communication and explanation",
  "Job-description fit"
] as const;

const priorityOrder = { High: 0, Medium: 1, Low: 2 } as const;

const OpenAIPlanSchema = z.object({
  questions: z.array(z.object({
    text: z.string().min(12),
    competency: z.enum(competencies),
    priority: z.enum(["High", "Medium", "Low"]),
    priorityRank: z.number().int().min(1).max(10),
    relatedJdRequirement: z.string().optional(),
    relatedResumeClaimExcerpt: z.string().optional(),
    expectedAnswer: z.array(z.string()).min(1).max(5),
    followUpTriggers: z.array(z.string()).min(1).max(5),
    evaluationCriteria: z.array(z.string()).min(1).max(5),
    difficulty: z.number().int().min(1).max(5),
    mandatory: z.boolean()
  })).min(8).max(10)
});

const OpenAIAnswerAssessmentSchema = z.object({
  correctness: z.enum(["correct", "partial", "incorrect", "not_assessable"]),
  score: z.number().min(0).max(5),
  confidence: z.enum(["low", "medium", "high"]),
  feedback: z.string().min(1).max(900)
});

export async function generateInterviewPlan(job: Job, candidate: Candidate, focusAreas: string[] = [], previousQuestionTexts: string[] = []): Promise<InterviewPlan> {
  const config = env();
  return withTimeout(generateOpenAIPlan(job, candidate, focusAreas, previousQuestionTexts), Math.max(30000, config.OPENAI_TIMEOUT_MS + 5000), "OpenAI planner timed out. Try OPENAI_MODEL=gpt-5-mini and OPENAI_TIMEOUT_MS=60000.");
}

async function generateOpenAIPlan(job: Job, candidate: Candidate, focusAreas: string[], previousQuestionTexts: string[]): Promise<InterviewPlan> {
  const technicalRole = isTechnicalInterview(job, focusAreas);
  const output = await structuredOpenAI({
    name: "axomir_interview_plan",
    schema: OpenAIPlanSchema,
    jsonSchema: {
      type: "object",
      additionalProperties: false,
      required: ["questions"],
      properties: {
        questions: {
          type: "array",
          minItems: 8,
          maxItems: 8,
          items: {
            type: "object",
            additionalProperties: false,
            required: [
              "text",
              "competency",
              "priority",
              "priorityRank",
              "relatedJdRequirement",
              "relatedResumeClaimExcerpt",
              "expectedAnswer",
              "followUpTriggers",
              "evaluationCriteria",
              "difficulty",
              "mandatory"
            ],
            properties: {
              text: { type: "string" },
              competency: { type: "string", enum: competencies },
              priority: { type: "string", enum: ["High", "Medium", "Low"] },
              priorityRank: { type: "integer", minimum: 1, maximum: 10 },
              relatedJdRequirement: { type: "string" },
              relatedResumeClaimExcerpt: { type: "string" },
              expectedAnswer: { type: "array", minItems: 1, maxItems: 5, items: { type: "string" } },
              followUpTriggers: { type: "array", minItems: 1, maxItems: 5, items: { type: "string" } },
              evaluationCriteria: { type: "array", minItems: 1, maxItems: 5, items: { type: "string" } },
              difficulty: { type: "integer", minimum: 1, maximum: 5 },
              mandatory: { type: "boolean" }
            }
          }
        }
      }
    },
    instructions: [
      "Create a first-round screening interview plan.",
      "Questions must be created by OpenAI from the job description, resume claims, and focus areas, not from a static template.",
      "Return exactly 8 questions sorted by priority: High first, then Medium, then Low.",
      "Assign priorityRank from 1 upward. Priority 1 is the most important question. Higher rank numbers are lower priority.",
      "The final order must be priorityRank ascending, and the highest priority questions must also have High priority.",
      "High priority questions should test must-have job requirements or material resume claims.",
      technicalRole
        ? "At least three questions must use the Technical knowledge and depth competency."
        : "For non-technical roles, use Technical knowledge and depth only for tool, process, domain, metric, or role-specific expertise. Do not force software coding questions.",
      technicalRole
        ? "Include at least two coding or practical implementation questions. These should ask the candidate to describe, write, debug, optimize, or reason through code, architecture, algorithms, APIs, data models, production defects, or system behavior relevant to the role."
        : "Include at least two practical scenario questions that test judgment, prioritization, stakeholder handling, metrics, execution, or domain-specific decision-making relevant to the role.",
      technicalRole
        ? "Include technical-depth questions that probe tradeoffs, edge cases, failure modes, complexity, debugging signals, and implementation details."
        : "Include depth questions that probe tradeoffs, constraints, metrics, escalation paths, customer or stakeholder impact, and evidence of ownership.",
      "Do not repeat or closely paraphrase any priorGeneratedQuestions supplied in the input. Use the supplied attemptSeed to create fresh question wording and fresh technical scenarios each attempt.",
      "Do not reveal this plan to the candidate before each question is asked.",
      "Avoid discriminatory, protected-class, salary, medical, family, caste, religion, age, or nationality questions.",
      "Use concise, interviewer-ready wording."
    ].join(" "),
    input: JSON.stringify({
      job: {
        title: job.title,
        requiredSkills: job.requiredSkills,
        responsibilities: job.responsibilities,
        description: job.description.slice(0, 2600)
      },
      candidate: {
        name: candidate.name,
        resumeClaims: candidate.resumeClaims.slice(0, 8).map((claim) => ({
          id: claim.id,
          excerpt: claim.excerpt,
          category: claim.category,
          materiality: claim.materiality
        })),
        resumeText: candidate.resumeText.slice(0, 2600)
      },
      focusAreas,
      roleCategory: technicalRole ? "technical" : "non-technical",
      priorGeneratedQuestions: previousQuestionTexts.slice(-24),
      attemptSeed: uuid(),
      nonce: uuid()
    })
  });

  const questions = normalizeQuestionPriorities(output.questions).map((question, index): InterviewQuestion => {
    const relatedClaim = question.relatedResumeClaimExcerpt
      ? candidate.resumeClaims.find((claim) => claim.excerpt.toLowerCase().includes(question.relatedResumeClaimExcerpt?.toLowerCase() ?? ""))
      : undefined;
    return {
      id: uuid(),
      text: question.text,
      competency: question.competency,
      priority: question.priority,
      priorityRank: question.priorityRank,
      relatedJdRequirement: question.relatedJdRequirement,
      relatedResumeClaimId: relatedClaim?.id,
      expectedAnswer: question.expectedAnswer,
      followUpTriggers: question.followUpTriggers,
      evaluationCriteria: question.evaluationCriteria,
      difficulty: question.difficulty,
      maxScore: 5,
      mandatory: question.mandatory || index < 6
    };
  }).sort((a, b) => (a.priorityRank ?? 99) - (b.priorityRank ?? 99) || priorityOrder[a.priority ?? "Medium"] - priorityOrder[b.priority ?? "Medium"]);

  return makePlan(job, candidate, focusAreas, questions);
}

export async function evaluateAnswerWithOpenAI(question: InterviewQuestion, answerText: string) {
  return withTimeout(structuredOpenAI({
    name: "axomir_answer_assessment",
    schema: OpenAIAnswerAssessmentSchema,
    jsonSchema: {
      type: "object",
      additionalProperties: false,
      required: ["correctness", "score", "confidence", "feedback"],
      properties: {
        correctness: { type: "string", enum: ["correct", "partial", "incorrect", "not_assessable"] },
        score: { type: "number", minimum: 0, maximum: 5 },
        confidence: { type: "string", enum: ["low", "medium", "high"] },
        feedback: { type: "string" }
      }
    },
    instructions: [
      "Evaluate a candidate answer for an interview question.",
      "Use only the question, expected answer bullets, evaluation criteria, and candidate answer.",
      "Mark correct only when the answer materially satisfies the question with role-relevant evidence.",
      "Mark partial for incomplete but relevant answers. Mark incorrect for wrong, unrelated, or unsupported answers.",
      "Use not_assessable when the answer is too vague, empty, or impossible to judge.",
      "Keep feedback short, direct, and non-accusatory."
    ].join(" "),
    input: JSON.stringify({
      question: {
        text: question.text,
        competency: question.competency,
        expectedAnswer: question.expectedAnswer,
        evaluationCriteria: question.evaluationCriteria,
        difficulty: question.difficulty
      },
      candidateAnswer: answerText.slice(0, 2400)
    })
  }), 8000, "OpenAI answer evaluation timed out.");
}

function normalizeQuestionPriorities(questions: z.infer<typeof OpenAIPlanSchema>["questions"]) {
  return [...questions]
    .sort((a, b) => a.priorityRank - b.priorityRank || priorityOrder[a.priority] - priorityOrder[b.priority])
    .map((question, index) => ({
      ...question,
      priorityRank: index + 1,
      priority: index < 3 ? "High" as const : index < 6 ? "Medium" as const : "Low" as const,
      mandatory: question.mandatory || index < 6
    }));
}

function isTechnicalInterview(job: Job, focusAreas: string[]) {
  const text = `${job.title} ${job.description} ${job.requiredSkills.join(" ")} ${job.responsibilities.join(" ")} ${focusAreas.join(" ")}`.toLowerCase();
  return /\b(engineer|developer|frontend|backend|full stack|software|devops|cloud|data|analyst|analytics|machine learning|ai|ml|cyber|security|qa|automation|react|node|python|sql|kubernetes|api|database|infrastructure|testing|code|coding|technical)\b/.test(text);
}

export function generateMockPlan(job: Job, candidate: Candidate, focusAreas: string[] = []): InterviewPlan {
  const claims = candidate.resumeClaims.length ? candidate.resumeClaims : [];
  const baseRequirements = [...job.requiredSkills, ...job.responsibilities, ...focusAreas].filter(Boolean);
  const shuffledRequirements = shuffle(baseRequirements.length ? baseRequirements : [job.title]);
  const shuffledClaims = shuffle(claims);
  const offset = Math.floor(Math.random() * 4);
  const questions: InterviewQuestion[] = Array.from({ length: 8 }).map((_, index) => {
    const claim = shuffledClaims[index % Math.max(shuffledClaims.length, 1)];
    const competency = competencies[index % competencies.length];
    const requirement = shuffledRequirements[index % Math.max(shuffledRequirements.length, 1)] ?? job.title;
    const priority = index < 3 ? "High" : index < 6 ? "Medium" : "Low";
    return {
      id: uuid(),
      text: questionText(index + offset, job.title, requirement, claim?.excerpt),
      competency,
      priority,
      priorityRank: index + 1,
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
      difficulty: priority === "High" ? Math.min(5, 3 + (index % 2)) : priority === "Medium" ? 3 : 2,
      maxScore: 5,
      mandatory: index < 6
    };
  });

  return makePlan(job, candidate, focusAreas, questions);
}

function makePlan(job: Job, candidate: Candidate, focusAreas: string[], questions: InterviewQuestion[]): InterviewPlan {
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

  const currentIndex = plan.questions.findIndex((question) => question.id === currentQuestion.id);
  const targetDifficulty = nextDifficulty(session.currentDifficulty, answer.aiScore);
  const remainingAfterCurrent = plan.questions.filter((question, index) => index > currentIndex && !session.askedQuestionIds.includes(question.id));
  const remainingAny = plan.questions.filter((question) => !session.askedQuestionIds.includes(question.id));
  const pool = remainingAfterCurrent.length ? remainingAfterCurrent : remainingAny;
  const next = typeof answer.aiScore === "number" ? chooseNextQuestion(pool, targetDifficulty) : pool[0];
  if (!next) {
    return { decision: "end_interview" as const, text: "That completes the planned interview. Thank you for your time.", nextQuestionId: undefined, difficulty: session.currentDifficulty };
  }
  return {
    decision: "advance_question" as const,
    text: next.text,
    nextQuestionId: next.id,
    difficulty: typeof answer.aiScore === "number" ? next.difficulty : session.currentDifficulty
  };
}

function nextDifficulty(current: number, score?: number) {
  if (typeof score !== "number") return current;
  if (score >= 4) return Math.min(5, current + 1);
  if (score < 2) return Math.max(1, current - 1);
  return current;
}

function chooseNextQuestion(questions: InterviewQuestion[], targetDifficulty: number) {
  return [...questions].sort((a, b) => {
    const difficultyDelta = Math.abs(a.difficulty - targetDifficulty) - Math.abs(b.difficulty - targetDifficulty);
    if (difficultyDelta !== 0) return difficultyDelta;
    return (a.priorityRank ?? 99) - (b.priorityRank ?? 99);
  })[0];
}

function shuffle<T>(items: T[]) {
  return [...items].sort(() => Math.random() - 0.5);
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  promise.then(
    () => { if (timeout) clearTimeout(timeout); },
    () => { if (timeout) clearTimeout(timeout); }
  );
  return Promise.race([
    promise,
    timeoutPromise
  ]);
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
