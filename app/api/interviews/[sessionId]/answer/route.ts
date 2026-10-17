import { NextResponse } from "next/server";
import { v4 as uuid } from "uuid";
import { z } from "zod";
import { decideNext, evaluateAnswerWithOpenAI } from "@/lib/agents";
import { AnswerSchema, nowIso } from "@/lib/domain";
import { audit, mutateDb } from "@/lib/store";

const AnswerInput = z.object({
  questionId: z.string(),
  text: z.string().min(1),
  source: z.enum(["text", "voice"]).default("text"),
  transcriptConfidence: z.number().min(0).max(1).optional()
});

export async function POST(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await context.params;
  const input = AnswerInput.parse(await request.json());
  const result = await mutateDb(async (db) => {
    const session = db.sessions.find((item) => item.id === sessionId);
    if (!session) return undefined;
    const plan = db.plans.find((item) => item.id === session.planId);
    if (!plan) return undefined;
    const question = plan.questions.find((item) => item.id === input.questionId);
    if (!question) return undefined;
    const aiAssessment = await assessAnswer(question, input.text);
    const answer = AnswerSchema.parse({
      id: uuid(),
      sessionId,
      questionId: input.questionId,
      text: input.text,
      transcriptConfidence: input.transcriptConfidence,
      aiCorrectness: aiAssessment.correctness,
      aiScore: aiAssessment.score,
      aiFeedback: aiAssessment.feedback,
      aiConfidence: aiAssessment.confidence,
      source: input.source,
      createdAt: nowIso()
    });
    db.answers.push(answer);
    if (!session.askedQuestionIds.includes(input.questionId)) session.askedQuestionIds.push(input.questionId);
    const decision = decideNext(session, plan, db.answers.filter((item) => item.sessionId === sessionId));
    if (decision.decision === "end_interview") {
      session.status = "completed";
      session.completedAt = nowIso();
      session.currentQuestionId = undefined;
    } else {
      session.currentQuestionId = decision.nextQuestionId;
      session.currentDifficulty = decision.difficulty;
    }
    session.followUpHistory.push({
      questionId: input.questionId,
      text: decision.text,
      decision: decision.decision,
      createdAt: nowIso()
    });
    await audit(db, "answer.submitted", "session", session.id, { questionId: input.questionId, decision: decision.decision, aiAssessment });
    return { answer, session, decision };
  });
  if (!result) return NextResponse.json({ error: "Session or plan not found." }, { status: 404 });
  return NextResponse.json(result);
}

async function assessAnswer(question: Parameters<typeof evaluateAnswerWithOpenAI>[0], text: string) {
  try {
    return normalizeAssessment(await evaluateAnswerWithOpenAI(question, text));
  } catch (error) {
    return {
      correctness: "not_assessable" as const,
      score: 0,
      confidence: "low" as const,
      feedback: error instanceof Error ? `OpenAI answer check unavailable: ${error.message}` : "OpenAI answer check unavailable."
    };
  }
}

function normalizeAssessment(assessment: Awaited<ReturnType<typeof evaluateAnswerWithOpenAI>>) {
  const score = Math.max(0, Math.min(5, assessment.score));
  if (assessment.correctness === "not_assessable") return { ...assessment, score };
  const correctness = score >= 4 ? "correct" : score >= 2 ? "partial" : "incorrect";
  return {
    ...assessment,
    score,
    correctness,
    feedback: assessment.feedback.slice(0, 900)
  };
}
