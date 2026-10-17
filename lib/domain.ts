import { z } from "zod";

export const competencyWeights = {
  technicalDepth: 35,
  problemSolving: 25,
  communication: 15,
  jdFit: 25
} as const;

export const CompetencySchema = z.enum([
  "Technical knowledge and depth",
  "Problem-solving and troubleshooting",
  "Communication and explanation",
  "Job-description fit"
]);

export const ResumeClaimSchema = z.object({
  id: z.string(),
  excerpt: z.string(),
  category: z.string(),
  explicit: z.boolean(),
  materiality: z.enum(["low", "medium", "high"])
});

export const InterviewQuestionSchema = z.object({
  id: z.string(),
  text: z.string(),
  competency: CompetencySchema,
  priority: z.enum(["High", "Medium", "Low"]).optional(),
  priorityRank: z.number().int().min(1).max(10).optional(),
  relatedJdRequirement: z.string().optional(),
  relatedResumeClaimId: z.string().optional(),
  expectedAnswer: z.array(z.string()).min(1),
  followUpTriggers: z.array(z.string()),
  evaluationCriteria: z.array(z.string()).min(1),
  difficulty: z.number().int().min(1).max(5),
  maxScore: z.number().positive().default(5),
  mandatory: z.boolean()
});

export const InterviewPlanSchema = z.object({
  id: z.string(),
  version: z.number().int().positive(),
  status: z.enum(["draft", "approved", "frozen"]),
  jobId: z.string(),
  candidateId: z.string(),
  questions: z.array(InterviewQuestionSchema).min(8).max(10),
  focusAreas: z.array(z.string()).default([]),
  rubricVersion: z.string(),
  createdAt: z.string(),
  approvedAt: z.string().optional()
});

export const AnswerSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  questionId: z.string(),
  text: z.string(),
  transcriptConfidence: z.number().min(0).max(1).optional(),
  createdAt: z.string(),
  source: z.enum(["text", "voice"])
});

export const InterviewSessionSchema = z.object({
  id: z.string(),
  candidateId: z.string(),
  jobId: z.string(),
  planId: z.string(),
  mode: z.enum(["text", "voice"]),
  status: z.enum(["draft", "active", "paused", "completed", "ended"]),
  consentStatus: z.enum(["not_requested", "granted", "denied"]),
  currentQuestionId: z.string().optional(),
  askedQuestionIds: z.array(z.string()).default([]),
  followUpHistory: z.array(z.object({
    questionId: z.string(),
    text: z.string(),
    decision: z.enum(["ask_follow_up", "clarify_answer", "advance_question", "end_interview"]),
    createdAt: z.string()
  })).default([]),
  currentDifficulty: z.number().int().min(1).max(5),
  startedAt: z.string().optional(),
  pausedAt: z.string().optional(),
  completedAt: z.string().optional(),
  reviewDecision: z.enum(["pending", "approved", "rejected"]).optional(),
  reviewNotes: z.string().optional(),
  reviewedAt: z.string().optional(),
  createdAt: z.string()
});

export const ScoreSchema = z.object({
  competency: CompetencySchema,
  score: z.number().min(1).max(5),
  weight: z.number().min(0).max(100),
  evidenceQuote: z.string().optional(),
  sourceQuestionId: z.string().optional(),
  explanation: z.string(),
  missingEvidence: z.string().optional(),
  confidence: z.enum(["low", "medium", "high"]),
  rubricVersion: z.string()
});

export const EvaluationSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  weightedScore: z.number().min(0).max(1),
  percentageScore: z.number().min(0).max(100),
  competencyScores: z.array(ScoreSchema),
  strengths: z.array(z.string()),
  gaps: z.array(z.string()),
  recommendation: z.enum(["Advance", "Hold", "Reject"]),
  advisoryOnly: z.literal(true),
  needsHumanReview: z.boolean(),
  humanReviewReasons: z.array(z.string()),
  confidence: z.enum(["low", "medium", "high"]),
  candidateFeedback: z.string(),
  createdAt: z.string()
});

export const ConsistencyFindingSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  resumeClaimId: z.string(),
  resumeExcerpt: z.string(),
  claimCategory: z.string(),
  questionIds: z.array(z.string()),
  supportingAnswerExcerpts: z.array(z.string()),
  classification: z.enum([
    "Supported by interview evidence",
    "Partially supported",
    "Not demonstrated",
    "Potential inconsistency",
    "Unable to assess"
  ]),
  explanation: z.string(),
  confidence: z.enum(["low", "medium", "high"]),
  recommendedHumanVerificationStep: z.string()
});

export const JobSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  requiredSkills: z.array(z.string()),
  preferredSkills: z.array(z.string()),
  responsibilities: z.array(z.string()),
  createdAt: z.string()
});

export const CandidateSchema = z.object({
  id: z.string(),
  name: z.string(),
  resumeText: z.string(),
  source: z.enum(["manual", "uc1-mock", "uc1"]),
  resumeClaims: z.array(ResumeClaimSchema),
  createdAt: z.string()
});

export const AuditEventSchema = z.object({
  id: z.string(),
  actor: z.string(),
  action: z.string(),
  entityType: z.string(),
  entityId: z.string(),
  details: z.record(z.unknown()).default({}),
  createdAt: z.string()
});

export const ProctorEventSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  type: z.string(),
  severity: z.enum(["info", "warning", "review"]).default("warning"),
  note: z.string(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  durationMs: z.number().nonnegative().optional(),
  measuredValue: z.number().optional(),
  measurementLabel: z.string().optional(),
  direction: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
  threshold: z.number().optional(),
  status: z.enum(["informational", "needs_review", "dismissed", "reviewed", "technical"]).default("needs_review"),
  reviewerNotes: z.string().optional(),
  metadata: z.record(z.unknown()).default({}),
  createdAt: z.string()
});

export const DbSchema = z.object({
  jobs: z.array(JobSchema),
  candidates: z.array(CandidateSchema),
  plans: z.array(InterviewPlanSchema),
  sessions: z.array(InterviewSessionSchema),
  answers: z.array(AnswerSchema),
  evaluations: z.array(EvaluationSchema),
  consistencyFindings: z.array(ConsistencyFindingSchema),
  proctorEvents: z.array(ProctorEventSchema).default([]),
  auditEvents: z.array(AuditEventSchema)
});

export type Db = z.infer<typeof DbSchema>;
export type Job = z.infer<typeof JobSchema>;
export type Candidate = z.infer<typeof CandidateSchema>;
export type ResumeClaim = z.infer<typeof ResumeClaimSchema>;
export type InterviewQuestion = z.infer<typeof InterviewQuestionSchema>;
export type InterviewPlan = z.infer<typeof InterviewPlanSchema>;
export type InterviewSession = z.infer<typeof InterviewSessionSchema>;
export type Answer = z.infer<typeof AnswerSchema>;
export type Evaluation = z.infer<typeof EvaluationSchema>;
export type CompetencyScore = z.infer<typeof ScoreSchema>;
export type ConsistencyFinding = z.infer<typeof ConsistencyFindingSchema>;
export type ProctorEvent = z.infer<typeof ProctorEventSchema>;

export const emptyDb = (): Db => ({
  jobs: [],
  candidates: [],
  plans: [],
  sessions: [],
  answers: [],
  evaluations: [],
  consistencyFindings: [],
  proctorEvents: [],
  auditEvents: []
});

export function nowIso() {
  return new Date().toISOString();
}

export function normalizeWeights(weights: Record<string, number>) {
  const total = Object.values(weights).reduce((sum, value) => sum + value, 0);
  if (total <= 0) throw new Error("Competency weights must sum to a positive value.");
  return Object.fromEntries(Object.entries(weights).map(([key, value]) => [key, value / total]));
}

export function calculateWeightedScore(scores: CompetencyScore[]) {
  const totalWeight = scores.reduce((sum, score) => sum + score.weight, 0);
  if (totalWeight <= 0) return 0;
  return scores.reduce((sum, score) => sum + (score.score / 5) * (score.weight / totalWeight), 0);
}

export function recommendationForScore(weightedScore: number) {
  if (weightedScore >= 0.72) return "Advance" as const;
  if (weightedScore >= 0.52) return "Hold" as const;
  return "Reject" as const;
}
