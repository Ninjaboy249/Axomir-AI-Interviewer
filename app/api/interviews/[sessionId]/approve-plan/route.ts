import { NextResponse } from "next/server";
import { nowIso } from "@/lib/domain";
import { audit, mutateDb } from "@/lib/store";

export async function POST(_request: Request, context: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await context.params;
  const updated = await mutateDb(async (db) => {
    const session = db.sessions.find((item) => item.id === sessionId);
    if (!session) return undefined;
    const plan = db.plans.find((item) => item.id === session.planId);
    if (!plan) return undefined;
    plan.status = "frozen";
    plan.approvedAt = nowIso();
    session.status = "active";
    session.startedAt = session.startedAt ?? nowIso();
    await audit(db, "plan.approved", "plan", plan.id, { sessionId });
    return { session, plan };
  });
  if (!updated) return NextResponse.json({ error: "Session or plan not found." }, { status: 404 });
  return NextResponse.json(updated);
}
