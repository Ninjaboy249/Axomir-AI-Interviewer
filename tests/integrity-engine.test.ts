import { describe, expect, it } from "vitest";
import { shouldWarnCandidate } from "@/components/integrity/InterviewIntegrityMonitor";
import { IntegrityEventEngine, defaultIntegrityConfig } from "@/lib/integrity/event-engine";
import { IntegrityEvent, IntegrityFrame } from "@/lib/integrity/types";

const base: IntegrityFrame = {
  timestampMs: 0,
  angles: { yaw: 0, pitch: 0, roll: 0 },
  confidence: 0.9,
  faceCount: 1,
  brightness: 120,
  frozen: false,
  gazeDirection: "screen",
  gazeConfidence: 0.8
};

describe("integrity event engine", () => {
  it("keeps forward-facing baseline frames informational", () => {
    const engine = new IntegrityEventEngine(defaultIntegrityConfig);
    const result = engine.process({ ...base, timestampMs: 1000 });
    expect(result.events).toHaveLength(0);
    expect(result.summary.measurementValid).toBe(true);
  });

  it("detects sustained yaw, pitch, and roll threshold events", () => {
    expect(eventsFor({ yaw: -34, pitch: 0, roll: 0 }, 3100)[0]?.type).toBe("head_turn_left");
    expect(eventsFor({ yaw: 36, pitch: 0, roll: 0 }, 3100)[0]?.type).toBe("head_turn_right");
    expect(eventsFor({ yaw: 0, pitch: 24, roll: 0 }, 3100)[0]?.type).toBe("head_tilt_up");
    expect(eventsFor({ yaw: 0, pitch: -24, roll: 0 }, 3100)[0]?.type).toBe("head_tilt_down");
    expect(eventsFor({ yaw: 0, pitch: 0, roll: -24 }, 3100)[0]?.type).toBe("head_roll_left");
    expect(eventsFor({ yaw: 0, pitch: 0, roll: 24 }, 3100)[0]?.type).toBe("head_roll_right");
  });

  it("ignores brief movements below sustained duration", () => {
    expect(eventsFor({ yaw: -35, pitch: 0, roll: 0 }, 1200)).toHaveLength(0);
  });

  it("does not create high-priority alerts from low-confidence head estimates", () => {
    const engine = new IntegrityEventEngine(defaultIntegrityConfig);
    engine.process({ ...base, timestampMs: 0, confidence: 0.2, angles: { yaw: -40, pitch: 0, roll: 0 } });
    const result = engine.process({ ...base, timestampMs: 4000, confidence: 0.2, angles: { yaw: -40, pitch: 0, roll: 0 } });
    expect(result.events.some((event) => event.type === "head_turn_left")).toBe(false);
  });

  it("uses grace periods for face missing and multiple faces", () => {
    const missing = new IntegrityEventEngine(defaultIntegrityConfig);
    missing.process({ ...base, timestampMs: 0, faceCount: 0, angles: undefined, confidence: 0 });
    expect(missing.process({ ...base, timestampMs: 2600, faceCount: 0, angles: undefined, confidence: 0 }).events[0]?.type).toBe("face_missing");

    const multiple = new IntegrityEventEngine(defaultIntegrityConfig);
    multiple.process({ ...base, timestampMs: 0, faceCount: 2 });
    expect(multiple.process({ ...base, timestampMs: 2600, faceCount: 2 }).events[0]?.type).toBe("multiple_faces");
  });

  it("detects repeated movement patterns and deduplicates frame spam", () => {
    const engine = new IntegrityEventEngine({ ...defaultIntegrityConfig, cooldownMs: 100, repeatedThreshold: 3 });
    const emitted = [
      ...crossLeft(engine, 0),
      ...crossLeft(engine, 5000),
      ...crossLeft(engine, 10000)
    ];
    expect(emitted.some((event) => event.type === "repeated_head_pattern")).toBe(true);
    const duplicate = engine.process({ ...base, timestampMs: 10100, angles: { yaw: -40, pitch: 0, roll: 0 } });
    expect(duplicate.events.filter((event) => event.type === "head_turn_left")).toHaveLength(0);
  });

  it("logs technical and object signals with confidence thresholds", () => {
    const engine = new IntegrityEventEngine(defaultIntegrityConfig);
    engine.process({ ...base, timestampMs: 0, brightness: 10 });
    expect(engine.process({ ...base, timestampMs: 3500, brightness: 10 }).events[0]?.type).toBe("camera_too_dark");

    const phone = new IntegrityEventEngine(defaultIntegrityConfig);
    phone.process({ ...base, timestampMs: 0, phoneConfidence: 0.8 });
    expect(phone.process({ ...base, timestampMs: 3500, phoneConfidence: 0.8 }).events[0]?.type).toBe("possible_phone");
  });

  it("warns for review signals but exempts downward gaze/head tilt", () => {
    expect(shouldWarnCandidate(event("head_turn_left", "left"))).toBe(true);
    expect(shouldWarnCandidate(event("head_tilt_down", "down"))).toBe(false);
    expect(shouldWarnCandidate(event("gaze_away", "down"))).toBe(false);
  });
});

function eventsFor(angles: NonNullable<IntegrityFrame["angles"]>, durationMs: number) {
  const engine = new IntegrityEventEngine(defaultIntegrityConfig);
  engine.process({ ...base, timestampMs: 0, angles });
  return engine.process({ ...base, timestampMs: durationMs, angles }).events;
}

function crossLeft(engine: IntegrityEventEngine, startMs: number) {
  engine.process({ ...base, timestampMs: startMs, angles: { yaw: -40, pitch: 0, roll: 0 } });
  const result = engine.process({ ...base, timestampMs: startMs + 3100, angles: { yaw: -40, pitch: 0, roll: 0 } });
  engine.process({ ...base, timestampMs: startMs + 3300, angles: { yaw: 0, pitch: 0, roll: 0 } });
  return result.events;
}

function event(type: IntegrityEvent["type"], direction?: string): IntegrityEvent {
  return {
    id: type,
    type,
    label: type,
    startTimeMs: 0,
    endTimeMs: 3000,
    durationMs: 3000,
    direction,
    severity: "warning",
    status: "needs_review",
    note: type
  };
}
