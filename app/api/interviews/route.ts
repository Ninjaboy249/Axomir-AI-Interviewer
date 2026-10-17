import { NextResponse } from "next/server";
import { v4 as uuid } from "uuid";
import { z } from "zod";
import { generateMockPlan } from "@/lib/agents";
import { JobSchema, CandidateSchema, InterviewSessionSchema, nowIso } from "@/lib/domain";
import { extractJobFacts, extractResumeClaims, sanitizeDocumentText } from "@/lib/ingestion";
import { audit, mutateDb } from "@/lib/store";

const CreateInterviewSchema = z.object({
  candidateName: z.string().min(1),
  jobTitle: z.string().min(1),
  jobDescription: z.string().min(50),
  resumeText: z.string().min(50),
  focusAreas: z.array(z.string()).default([]),
  mode: z.enum(["text", "voice"]).default("text"),
  source: z.enum(["manual", "uc1-mock", "uc1"]).default("manual")
});

export async function GET() {
  const { readDb } = await import("@/lib/store");
  const db = await readDb();
  const sessions = db.sessions.map((session) => ({
    ...session,
    candidate: db.candidates.find((candidate) => candidate.id === session.candidateId),
    job: db.jobs.find((job) => job.id === session.jobId),
    evaluation: db.evaluations.find((evaluation) => evaluation.sessionId === session.id)
  })).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return NextResponse.json({ sessions });
}

export async function POST(request: Request) {
  const input = CreateInterviewSchema.parse(await request.json());
  const jobText = sanitizeDocumentText(input.jobDescription);
  const resumeText = sanitizeDocumentText(input.resumeText);
  const facts = extractJobFacts(jobText);

  try {
    const result = await mutateDb(async (db) => {
      const job = JobSchema.parse({
        id: uuid(),
        title: input.jobTitle,
        description: jobText,
        ...facts,
        createdAt: nowIso()
      });
      const candidate = CandidateSchema.parse({
        id: uuid(),
        name: input.candidateName,
        resumeText,
        source: input.source,
        resumeClaims: extractResumeClaims(resumeText),
        createdAt: nowIso()
      });
      const plan = generateMockPlan(job, candidate, input.focusAreas);
      plan.status = "frozen";
      plan.approvedAt = nowIso();
      const session = InterviewSessionSchema.parse({
        id: uuid(),
        candidateId: candidate.id,
        jobId: job.id,
        planId: plan.id,
        mode: input.mode,
        status: "active",
        consentStatus: "granted",
        currentQuestionId: plan.questions[0]?.id,
        askedQuestionIds: [],
        followUpHistory: [],
        currentDifficulty: plan.questions[0]?.difficulty ?? 2,
        startedAt: nowIso(),
        createdAt: nowIso()
      });
      db.jobs.push(job);
      db.candidates.push(candidate);
      db.plans.push(plan);
      db.sessions.push(session);
      await audit(db, "interview.created", "session", session.id, { source: input.source, planner: "fast-starter" });
      return { job, candidate, plan, session };
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Interview creation failed.";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
