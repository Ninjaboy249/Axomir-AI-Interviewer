import { NextResponse } from "next/server";
import { v4 as uuid } from "uuid";
import { z } from "zod";
import { decideNext } from "@/lib/agents";
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
    const answer = AnswerSchema.parse({
      id: uuid(),
      sessionId,
      questionId: input.questionId,
      text: input.text,
      transcriptConfidence: input.transcriptConfidence,
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
    await audit(db, "answer.submitted", "session", session.id, { questionId: input.questionId, decision: decision.decision });
    return { answer, session, decision };
  });
  if (!result) return NextResponse.json({ error: "Session or plan not found." }, { status: 404 });
  return NextResponse.json(result);
}
