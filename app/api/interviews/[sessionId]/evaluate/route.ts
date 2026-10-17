import { NextResponse } from "next/server";
import { buildConsistencyFindings, evaluateSession } from "@/lib/agents";
import { audit, mutateDb } from "@/lib/store";

export async function POST(_request: Request, context: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await context.params;
  const result = await mutateDb(async (db) => {
    const session = db.sessions.find((item) => item.id === sessionId);
    if (!session) return undefined;
    const plan = db.plans.find((item) => item.id === session.planId);
    const candidate = db.candidates.find((item) => item.id === session.candidateId);
    if (!plan || !candidate) return undefined;
    const answers = db.answers.filter((item) => item.sessionId === session.id);
    const findings = buildConsistencyFindings(session, plan, candidate, answers);
    const evaluation = evaluateSession(session, plan, answers, findings);
    db.consistencyFindings = db.consistencyFindings.filter((item) => item.sessionId !== session.id).concat(findings);
    db.evaluations = db.evaluations.filter((item) => item.sessionId !== session.id).concat(evaluation);
    await audit(db, "evaluation.generated", "session", session.id, { recommendation: evaluation.recommendation, advisoryOnly: true });
    return { evaluation, consistencyFindings: findings };
  });
  if (!result) return NextResponse.json({ error: "Session not found or incomplete data." }, { status: 404 });
  return NextResponse.json(result);
}
