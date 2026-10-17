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
      "Use concise, interviewer-ready wording.",
      "Return only the fields in the schema. Do not create rubric bullets, scoring notes, answer keys, or explanations."
    ].join(" "),
    input: JSON.stringify({
      job: {
        title: job.title,
        requiredSkills: job.requiredSkills,
        responsibilities: job.responsibilities,
        description: job.description.slice(0, 1600)
      },
      candidate: {
        name: candidate.name,
        resumeClaims: candidate.resumeClaims.slice(0, 5).map((claim) => ({
          id: claim.id,
          excerpt: claim.excerpt,
          category: claim.category,
          materiality: claim.materiality
        })),
        resumeText: candidate.resumeText.slice(0, 1600)
      },
      focusAreas,
      roleCategory: technicalRole ? "technical" : "non-technical",
      priorGeneratedQuestions: previousQuestionTexts.slice(-12),
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
      expectedAnswer: expectedAnswerFor(question.competency, technicalRole),
      followUpTriggers: followUpTriggersFor(question.competency),
      evaluationCriteria: evaluationCriteriaFor(question.competency),
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

function expectedAnswerFor(competency: typeof competencies[number], technicalRole: boolean) {
  if (competency === "Technical knowledge and depth") {
    return technicalRole
      ? ["Correct technical approach", "Concrete implementation detail", "Tradeoffs, edge cases, or failure modes"]
      : ["Relevant role-specific knowledge", "Correct process or tool usage", "Practical example with outcome"];
  }
  if (competency === "Problem-solving and troubleshooting") {
    return ["Clear problem framing", "Diagnostic steps or decision logic", "Measurable result or learning"];
  }
  if (competency === "Communication and explanation") {
    return ["Structured explanation", "Audience-aware language", "Clear ownership and collaboration details"];
  }
  return ["Direct connection to job requirement", "Evidence from resume or experience", "Impact, scale, or outcome"];
}

function followUpTriggersFor(competency: typeof competencies[number]) {
  if (competency === "Technical knowledge and depth") {
    return ["Answer lacks implementation detail", "Answer misses tradeoffs or edge cases", "Answer does not connect to the stated technology or requirement"];
  }
  if (competency === "Problem-solving and troubleshooting") {
    return ["Answer skips diagnosis steps", "Answer is generic", "No outcome or validation signal is provided"];
  }
  if (competency === "Communication and explanation") {
    return ["Answer is hard to follow", "Stakeholder context is missing", "Candidate does not clarify personal contribution"];
  }
  return ["Answer does not map to the job description", "Resume claim is not supported", "Evidence is too vague"];
}

function evaluationCriteriaFor(competency: typeof competencies[number]) {
  if (competency === "Technical knowledge and depth") {
    return ["Technical accuracy", "Depth of implementation evidence", "Understanding of constraints and tradeoffs"];
  }
  if (competency === "Problem-solving and troubleshooting") {
    return ["Quality of reasoning", "Diagnostic completeness", "Outcome validation"];
  }
  if (competency === "Communication and explanation") {
    return ["Clarity", "Structure", "Audience fit"];
  }
  return ["Requirement fit", "Specific evidence", "Ownership and impact"];
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
    const questions = plan.questions.filter((item) => item.competency === competency);
    const competencyAnswers = questions
      .map((question) => answeredByQuestion.get(question.id))
      .filter((answer): answer is Answer => Boolean(answer));
    const reviewedAnswers = competencyAnswers.filter((answer) => typeof answer.aiScore === "number");
    const strongestAnswer = [...competencyAnswers].sort((a, b) => (b.aiScore ?? wordEvidenceScore(b.text)) - (a.aiScore ?? wordEvidenceScore(a.text)))[0];
    const score = reviewedAnswers.length
      ? round1(reviewedAnswers.reduce((sum, answer) => sum + (answer.aiScore ?? 0), 0) / reviewedAnswers.length)
      : strongestAnswer
        ? wordEvidenceScore(strongestAnswer.text)
        : 0;
    const confidence = confidenceForAnswers(competencyAnswers, reviewedAnswers);
    const aiFeedback = strongestAnswer?.aiFeedback;
    return {
      competency,
      score,
      weight: competency === "Technical knowledge and depth" ? 35 : competency === "Problem-solving and troubleshooting" ? 25 : competency === "Communication and explanation" ? 15 : 25,
      evidenceQuote: strongestAnswer?.text.slice(0, 240),
      sourceQuestionId: strongestAnswer?.questionId ?? questions[0]?.id,
      explanation: strongestAnswer
        ? reviewedAnswers.length
          ? `Score uses OpenAI answer review across ${reviewedAnswers.length} answer${reviewedAnswers.length === 1 ? "" : "s"}.${aiFeedback ? ` Latest evidence: ${aiFeedback}` : ""}`
          : "Score uses fallback evidence length because OpenAI answer review was unavailable."
        : "No answer was captured for this competency.",
      missingEvidence: !strongestAnswer
        ? "No stored answer assessed this competency."
        : score < 3
          ? strongestAnswer.aiFeedback ?? "OpenAI review or answer evidence indicates this competency needs stronger support."
          : undefined,
      confidence,
      rubricVersion: plan.rubricVersion
    };
  });

  const weightedScore = calculateWeightedScore(scores);
  const lowConfidence = scores.some((score) => score.confidence === "low");
  const answeredMandatory = plan.questions.filter((question) => question.mandatory && answeredByQuestion.has(question.id)).length;
  const expectedMandatory = Math.min(plan.questions.filter((question) => question.mandatory).length, 6);
  const incomplete = ["draft", "active", "paused"].includes(session.status) || answers.length === 0 || answeredMandatory < Math.min(expectedMandatory, 2);
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
    strengths: scores.filter((score) => score.score >= 4).map((score) => `${score.competency}: ${score.evidenceQuote ? `Strong evidence captured: "${score.evidenceQuote}"` : score.explanation}`),
    gaps: scores.filter((score) => score.score < 3).map((score) => `${score.competency}: ${score.missingEvidence ?? "Needs stronger evidence."}`),
    recommendation,
    advisoryOnly: true,
    needsHumanReview: humanReviewReasons.length > 0,
    humanReviewReasons,
    confidence: lowConfidence ? "low" : "medium",
    candidateFeedback: "Thank you for taking the time to interview. The team will review the discussion against the role requirements and follow up through the recruiter.",
    createdAt: nowIso()
  };
}

function wordEvidenceScore(text: string) {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  if (words >= 100) return 4;
  if (words >= 55) return 3;
  if (words >= 20) return 2;
  if (words > 0) return 1;
  return 0;
}

function confidenceForAnswers(answers: Answer[], reviewedAnswers: Answer[]): "low" | "medium" | "high" {
  if (reviewedAnswers.length === 0) return answers.length > 0 ? "low" : "low";
  const confidenceRank = { low: 0, medium: 1, high: 2 } as const;
  const average = reviewedAnswers.reduce((sum, answer) => sum + confidenceRank[answer.aiConfidence ?? "low"], 0) / reviewedAnswers.length;
  if (reviewedAnswers.length >= 2 && average >= 1.5) return "high";
  if (average >= 0.75) return "medium";
  return "low";
}

function round1(value: number) {
  return Math.round(Math.max(0, Math.min(5, value)) * 10) / 10;
}
