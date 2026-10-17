import { NextResponse } from "next/server";
import { v4 as uuid } from "uuid";
import { z } from "zod";
import { ProctorEventSchema, nowIso } from "@/lib/domain";
import { audit, mutateDb } from "@/lib/store";

const ProctorInput = z.object({
  type: z.string().min(1).max(80),
  note: z.string().max(500).optional(),
  severity: z.enum(["info", "warning", "review"]).default("warning"),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  durationMs: z.number().nonnegative().optional(),
  measuredValue: z.number().optional(),
  measurementLabel: z.string().optional(),
  direction: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
  threshold: z.number().optional(),
  status: z.enum(["informational", "needs_review", "dismissed", "reviewed", "technical"]).default("needs_review"),
  metadata: z.record(z.unknown()).default({})
});

export async function POST(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await context.params;
  const input = ProctorInput.parse(await request.json());
  const result = await mutateDb(async (db) => {
    const session = db.sessions.find((item) => item.id === sessionId);
    if (!session) return undefined;
    const event = ProctorEventSchema.parse({
      id: uuid(),
      sessionId,
      type: input.type,
      severity: input.severity,
      note: input.note ?? input.type,
      startTime: input.startTime,
      endTime: input.endTime,
      durationMs: input.durationMs,
      measuredValue: input.measuredValue,
      measurementLabel: input.measurementLabel,
      direction: input.direction,
      confidence: input.confidence,
      threshold: input.threshold,
      status: input.status,
      metadata: input.metadata,
      createdAt: nowIso()
    });
    db.proctorEvents.push(event);
    await audit(db, "proctor.event", "session", sessionId, { type: event.type, severity: event.severity });
    return event;
  });
  if (!result) return NextResponse.json({ error: "Session not found." }, { status: 404 });
  return NextResponse.json({ event: result });
}
