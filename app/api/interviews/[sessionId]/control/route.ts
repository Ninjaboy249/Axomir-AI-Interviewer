import { NextResponse } from "next/server";
import { z } from "zod";
import { nowIso } from "@/lib/domain";
import { audit, mutateDb } from "@/lib/store";

const ControlInput = z.object({
  action: z.enum(["pause", "resume", "end", "grant_consent", "deny_consent", "skip"]),
  reason: z.string().optional()
});

export async function POST(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await context.params;
  const input = ControlInput.parse(await request.json());
  const result = await mutateDb(async (db) => {
    const session = db.sessions.find((item) => item.id === sessionId);
    if (!session) return undefined;
    if (input.action === "pause") {
      session.status = "paused";
      session.pausedAt = nowIso();
    }
    if (input.action === "resume") {
      session.status = "active";
      session.pausedAt = undefined;
      session.startedAt = session.startedAt ?? nowIso();
    }
    if (input.action === "end") {
      session.status = "ended";
      session.completedAt = nowIso();
      session.currentQuestionId = undefined;
    }
    if (input.action === "grant_consent") session.consentStatus = "granted";
    if (input.action === "deny_consent") session.consentStatus = "denied";
    if (input.action === "skip") {
      const plan = db.plans.find((item) => item.id === session.planId);
      if (!plan) return undefined;
      const skippedQuestionId = session.currentQuestionId;
      if (skippedQuestionId && !session.askedQuestionIds.includes(skippedQuestionId)) session.askedQuestionIds.push(skippedQuestionId);
      const currentIndex = plan.questions.findIndex((item) => item.id === skippedQuestionId);
      const next = plan.questions.find((item, index) => index > currentIndex && !session.askedQuestionIds.includes(item.id));
      session.currentQuestionId = next?.id;
      session.currentDifficulty = next?.difficulty ?? session.currentDifficulty;
      session.status = next ? "active" : "completed";
      session.startedAt = session.startedAt ?? nowIso();
      session.followUpHistory.push({
        questionId: skippedQuestionId ?? "unknown",
        text: next?.text ?? "That completes the planned interview. Thank you for your time.",
        decision: next ? "advance_question" : "end_interview",
        createdAt: nowIso()
      });
      if (!next) {
        session.completedAt = nowIso();
      }
    }
    await audit(db, `session.${input.action}`, "session", session.id, { reason: input.reason });
    return session;
  });
  if (!result) return NextResponse.json({ error: "Session not found." }, { status: 404 });
  return NextResponse.json({ session: result });
}
