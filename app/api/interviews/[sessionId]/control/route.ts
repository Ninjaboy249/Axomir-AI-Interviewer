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
      const currentIndex = plan.questions.findIndex((item) => item.id === session.currentQuestionId);
      const next = plan.questions.slice(Math.max(0, currentIndex + 1)).find((item) => !session.askedQuestionIds.includes(item.id));
      if (session.currentQuestionId && !session.askedQuestionIds.includes(session.currentQuestionId)) session.askedQuestionIds.push(session.currentQuestionId);
      session.currentQuestionId = next?.id;
      session.status = next ? "active" : "completed";
      session.startedAt = session.startedAt ?? nowIso();
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
