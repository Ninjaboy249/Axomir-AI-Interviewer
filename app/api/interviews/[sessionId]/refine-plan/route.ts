import { NextResponse } from "next/server";
import { generateInterviewPlan } from "@/lib/agents";
import { nowIso } from "@/lib/domain";
import { ProviderUnavailableError } from "@/lib/openai-provider";
import { audit, mutateDb, readDb } from "@/lib/store";

export async function POST(_request: Request, context: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await context.params;
  const snapshot = await readDb();
  const session = snapshot.sessions.find((item) => item.id === sessionId);
  if (!session) return NextResponse.json({ error: "Session not found." }, { status: 404 });
  const plan = snapshot.plans.find((item) => item.id === session.planId);
  const job = snapshot.jobs.find((item) => item.id === session.jobId);
  const candidate = snapshot.candidates.find((item) => item.id === session.candidateId);
  if (!plan || !job || !candidate) return NextResponse.json({ error: "Interview data not found." }, { status: 404 });

  try {
    const previousQuestionTexts = snapshot.plans
      .filter((item) => item.id !== plan.id)
      .slice(-6)
      .flatMap((item) => item.questions.map((question) => question.text));
    const refined = await generateInterviewPlan(job, candidate, plan.focusAreas, previousQuestionTexts);

    const result = await mutateDb(async (db) => {
      const liveSession = db.sessions.find((item) => item.id === sessionId);
      if (!liveSession) return undefined;
      const livePlan = db.plans.find((item) => item.id === liveSession.planId);
      if (!livePlan) return undefined;

      const lockedIds = new Set([liveSession.currentQuestionId, ...liveSession.askedQuestionIds].filter(Boolean) as string[]);
      const lockedQuestions = livePlan.questions.filter((question) => lockedIds.has(question.id));
      const freshQuestions = refined.questions
        .filter((question) => !lockedQuestions.some((locked) => sameQuestion(locked.text, question.text)))
        .slice(0, Math.max(0, 8 - lockedQuestions.length));
      const fallbackQuestions = livePlan.questions
        .filter((question) => !lockedIds.has(question.id))
        .filter((question) => !freshQuestions.some((fresh) => sameQuestion(fresh.text, question.text)))
        .slice(0, Math.max(0, 8 - lockedQuestions.length - freshQuestions.length));

      livePlan.questions = [...lockedQuestions, ...freshQuestions, ...fallbackQuestions].slice(0, 8);
      livePlan.focusAreas = refined.focusAreas;
      livePlan.rubricVersion = refined.rubricVersion;
      livePlan.status = "frozen";
      livePlan.approvedAt = nowIso();

      if (!liveSession.currentQuestionId && livePlan.questions[0]) {
        liveSession.currentQuestionId = livePlan.questions[0].id;
        liveSession.currentDifficulty = livePlan.questions[0].difficulty;
      }

      await audit(db, "plan.refined_with_openai", "session", liveSession.id, { replacedFollowUps: freshQuestions.length });
      return { session: liveSession, plan: livePlan };
    });

    if (!result) return NextResponse.json({ error: "Session or plan not found." }, { status: 404 });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof ProviderUnavailableError
      ? "OpenAI API key is required to refine interview questions."
      : error instanceof Error
        ? error.message
        : "OpenAI question refinement failed.";
    return NextResponse.json({ error: message, provider: "openai" }, { status: 503 });
  }
}

function sameQuestion(left: string, right: string) {
  return normalize(left).slice(0, 90) === normalize(right).slice(0, 90);
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
