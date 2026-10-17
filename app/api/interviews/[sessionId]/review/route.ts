import { NextResponse } from "next/server";
import { z } from "zod";
import { nowIso } from "@/lib/domain";
import { audit, mutateDb } from "@/lib/store";

const ReviewInput = z.object({
  decision: z.enum(["pending", "approved", "rejected"]),
  notes: z.string().max(1200).optional()
});

export async function POST(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await context.params;
  const input = ReviewInput.parse(await request.json());
  const result = await mutateDb(async (db) => {
    const session = db.sessions.find((item) => item.id === sessionId);
    if (!session) return undefined;
    session.reviewDecision = input.decision;
    session.reviewNotes = input.notes?.trim() || undefined;
    session.reviewedAt = input.decision === "pending" ? undefined : nowIso();
    await audit(db, "session.reviewed", "session", session.id, { decision: input.decision, notes: session.reviewNotes });
    return session;
  });
  if (!result) return NextResponse.json({ error: "Session not found." }, { status: 404 });
  return NextResponse.json({ session: result });
}
