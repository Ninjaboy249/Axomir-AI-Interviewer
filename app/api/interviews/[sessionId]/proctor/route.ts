import { NextResponse } from "next/server";
import { v4 as uuid } from "uuid";
import { z } from "zod";
import { ProctorEventSchema, nowIso } from "@/lib/domain";
import { audit, mutateDb } from "@/lib/store";

const ProctorInput = z.object({
  type: z.enum(["tab_hidden", "window_blur", "camera_motion", "camera_started", "camera_denied"]),
  note: z.string().max(500).optional(),
  severity: z.enum(["info", "warning"]).default("warning")
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
      createdAt: nowIso()
    });
    db.proctorEvents.push(event);
    await audit(db, "proctor.event", "session", sessionId, { type: event.type, severity: event.severity });
    return event;
  });
  if (!result) return NextResponse.json({ error: "Session not found." }, { status: 404 });
  return NextResponse.json({ event: result });
}
