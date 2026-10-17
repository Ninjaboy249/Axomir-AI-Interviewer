import { NextResponse } from "next/server";
import { readDb } from "@/lib/store";

export async function GET(_request: Request, context: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await context.params;
  const db = await readDb();
  const session = db.sessions.find((item) => item.id === sessionId);
  if (!session) return NextResponse.json({ error: "Session not found." }, { status: 404 });
  const plan = db.plans.find((item) => item.id === session.planId);
  const candidate = db.candidates.find((item) => item.id === session.candidateId);
  const job = db.jobs.find((item) => item.id === session.jobId);
  const answers = db.answers.filter((answer) => answer.sessionId === session.id);
  const evaluation = db.evaluations.find((item) => item.sessionId === session.id);
  const consistencyFindings = db.consistencyFindings.filter((item) => item.sessionId === session.id);
  const proctorEvents = db.proctorEvents.filter((item) => item.sessionId === session.id);
  return NextResponse.json({ session, plan, candidate, job, answers, evaluation, consistencyFindings, proctorEvents });
}
