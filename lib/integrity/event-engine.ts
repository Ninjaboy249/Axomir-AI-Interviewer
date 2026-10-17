import { IntegrityConfig, IntegrityEvent, IntegrityEventType, IntegrityFrame, IntegritySummary } from "./types";

type Condition = {
  type: IntegrityEventType;
  label: string;
  active: boolean;
  value?: number;
  threshold?: number;
  direction?: string;
  confidence: number;
  durationMs: number;
  sustainedMs: number;
  severity: IntegrityEvent["severity"];
  status: IntegrityEvent["status"];
  note: string;
  measurementLabel?: string;
};

type ActiveCondition = Condition & {
  startTimeMs: number;
  maxValue?: number;
  emitted: boolean;
};

export const defaultIntegrityConfig: IntegrityConfig = {
  yawLeftThreshold: -30,
  yawRightThreshold: 30,
  pitchUpThreshold: 20,
  pitchDownThreshold: -20,
  rollLeftThreshold: -20,
  rollRightThreshold: 20,
  exitHysteresisDegrees: 5,
  sustainedDurationMs: 3000,
  repeatedWindowMs: 120000,
  repeatedThreshold: 3,
  cooldownMs: 10000,
  faceMissingGraceMs: 2500,
  multipleFaceDurationMs: 2500,
  gazeDeviationDurationMs: 2500,
  rapidDeltaDegrees: 24,
  rapidSpeedDegPerSec: 130,
  minimumConfidence: 0.55,
  objectConfidence: 0.65,
  frameIntervalMs: 350,
  darknessThreshold: 32,
  frozenFrameMs: 2500
};

export class IntegrityEventEngine {
  private active = new Map<IntegrityEventType, ActiveCondition>();
  private recent = new Map<IntegrityEventType, number[]>();
  private cooldown = new Map<IntegrityEventType, number>();
  private lastFrame?: IntegrityFrame;
  private maxDeviation = { yaw: 0, pitch: 0, roll: 0 };
  private activeLabels: string[] = [];

  constructor(private config: IntegrityConfig = defaultIntegrityConfig) {}

  reset() {
    this.active.clear();
    this.recent.clear();
    this.cooldown.clear();
    this.lastFrame = undefined;
    this.maxDeviation = { yaw: 0, pitch: 0, roll: 0 };
    this.activeLabels = [];
  }

  process(frame: IntegrityFrame) {
    const conditions = this.conditionsForFrame(frame);
    const emitted: IntegrityEvent[] = [];
    this.activeLabels = conditions.filter((condition) => condition.active).map((condition) => condition.label);

    for (const condition of conditions) {
      const current = this.active.get(condition.type);
      const isActive = this.isConditionStillActive(condition, current);
      if (isActive && !current) {
        this.active.set(condition.type, {
          ...condition,
          startTimeMs: frame.timestampMs,
          maxValue: condition.value,
          emitted: false
        });
        continue;
      }
      if (isActive && current) {
        current.durationMs = frame.timestampMs - current.startTimeMs;
        current.value = condition.value;
        current.confidence = condition.confidence;
        current.maxValue = largerMagnitude(current.maxValue, condition.value);
        if (!current.emitted && current.durationMs >= current.sustainedMs && this.isPastCooldown(current.type, frame.timestampMs)) {
          current.emitted = true;
          const event = this.makeEvent(current, frame.timestampMs);
          emitted.push(event);
          emitted.push(...this.repeatedEventsFor(event));
        }
        continue;
      }
      if (!isActive && current) this.active.delete(condition.type);
    }

    if (frame.angles && this.lastFrame?.angles) {
      const delta = maxAngleDelta(frame.angles, this.lastFrame.angles);
      const elapsedSec = Math.max(0.001, (frame.timestampMs - this.lastFrame.timestampMs) / 1000);
      const speed = delta / elapsedSec;
      if (delta >= this.config.rapidDeltaDegrees && speed >= this.config.rapidSpeedDegPerSec && this.isPastCooldown("rapid_head_movement", frame.timestampMs)) {
        const event: IntegrityEvent = {
          id: eventId("rapid_head_movement", frame.timestampMs),
          type: "rapid_head_movement",
          label: "Rapid head movement",
          startTimeMs: this.lastFrame.timestampMs,
          endTimeMs: frame.timestampMs,
          durationMs: frame.timestampMs - this.lastFrame.timestampMs,
          measuredValue: Math.round(speed),
          measurementLabel: "degrees/sec",
          confidence: frame.confidence,
          threshold: this.config.rapidSpeedDegPerSec,
          severity: "info",
          status: "informational",
          note: `Rapid head movement observed at about ${Math.round(speed)} degrees/sec.`
        };
        emitted.push(event);
        this.cooldown.set(event.type, frame.timestampMs);
      }
    }

    if (frame.angles) {
      this.maxDeviation = {
        yaw: largerMagnitude(this.maxDeviation.yaw, frame.angles.yaw) ?? 0,
        pitch: largerMagnitude(this.maxDeviation.pitch, frame.angles.pitch) ?? 0,
        roll: largerMagnitude(this.maxDeviation.roll, frame.angles.roll) ?? 0
      };
    }
    this.lastFrame = frame;

    return {
      events: emitted,
      summary: this.summary(frame)
    };
  }

  private conditionsForFrame(frame: IntegrityFrame): Condition[] {
    const config = this.config;
    const confidence = frame.confidence;
    const angles = frame.angles;
    const conditions: Condition[] = [
      {
        type: "face_missing",
        label: "Face not detected",
        active: frame.faceCount === 0,
        confidence: frame.faceCount === 0 ? 1 : confidence,
        durationMs: 0,
        sustainedMs: config.faceMissingGraceMs,
        severity: "warning",
        status: "needs_review",
        note: "No reliable face was visible after the grace period."
      },
      {
        type: "multiple_faces",
        label: "Multiple faces detected",
        active: frame.faceCount > 1,
        value: frame.faceCount,
        measurementLabel: "faces",
        confidence,
        durationMs: 0,
        sustainedMs: config.multipleFaceDurationMs,
        severity: "warning",
        status: "needs_review",
        note: `${frame.faceCount} faces were visible in the camera frame.`
      },
      {
        type: "camera_too_dark",
        label: "Camera too dark or obstructed",
        active: typeof frame.brightness === "number" && frame.brightness < config.darknessThreshold,
        value: frame.brightness,
        threshold: config.darknessThreshold,
        measurementLabel: "brightness",
        confidence: 1,
        durationMs: 0,
        sustainedMs: config.sustainedDurationMs,
        severity: "warning",
        status: "technical",
        note: "The video feed was too dark or obstructed for reliable analysis."
      },
      {
        type: "camera_frozen",
        label: "Camera feed frozen",
        active: frame.frozen === true,
        confidence: 1,
        durationMs: 0,
        sustainedMs: config.frozenFrameMs,
        severity: "warning",
        status: "technical",
        note: "Video frames stopped changing for longer than the configured threshold."
      }
    ];

    if (angles && confidence >= config.minimumConfidence) {
      conditions.push(
        angleCondition("head_turn_left", "Head turned left", angles.yaw, config.yawLeftThreshold, "left", confidence, config.sustainedDurationMs, "Yaw"),
        angleCondition("head_turn_right", "Head turned right", angles.yaw, config.yawRightThreshold, "right", confidence, config.sustainedDurationMs, "Yaw"),
        angleCondition("head_tilt_up", "Head tilted up", angles.pitch, config.pitchUpThreshold, "up", confidence, config.sustainedDurationMs, "Pitch"),
        angleCondition("head_tilt_down", "Head tilted down", angles.pitch, config.pitchDownThreshold, "down", confidence, config.sustainedDurationMs, "Pitch"),
        angleCondition("head_roll_left", "Head roll left", angles.roll, config.rollLeftThreshold, "left", confidence, config.sustainedDurationMs, "Roll"),
        angleCondition("head_roll_right", "Head roll right", angles.roll, config.rollRightThreshold, "right", confidence, config.sustainedDurationMs, "Roll")
      );
    }

    if (frame.gazeDirection && frame.gazeDirection !== "screen" && frame.gazeDirection !== "unknown") {
      conditions.push({
        type: "gaze_away",
        label: `Gaze away ${frame.gazeDirection}`,
        active: true,
        direction: frame.gazeDirection,
        confidence: frame.gazeConfidence ?? 0.5,
        durationMs: 0,
        sustainedMs: config.gazeDeviationDurationMs,
        severity: "info",
        status: "informational",
        note: `Estimated gaze direction was ${frame.gazeDirection}.`
      });
    }

    if ((frame.phoneConfidence ?? 0) >= config.objectConfidence) {
      conditions.push({
        type: "possible_phone",
        label: "Possible phone detected",
        active: true,
        value: frame.phoneConfidence,
        threshold: config.objectConfidence,
        confidence: frame.phoneConfidence ?? 0,
        durationMs: 0,
        sustainedMs: config.sustainedDurationMs,
        severity: "warning",
        status: "needs_review",
        note: "A phone-like object was detected above the configured confidence threshold."
      });
    }

    return conditions;
  }

  private isConditionStillActive(condition: Condition, current?: ActiveCondition) {
    if (!condition.active) return false;
    if (!current?.threshold || typeof condition.value !== "number") return true;
    const exit = this.config.exitHysteresisDegrees;
    if (current.type === "camera_too_dark") return condition.value <= current.threshold + exit;
    return current.threshold < 0 ? condition.value <= current.threshold + exit : condition.value >= current.threshold - exit;
  }

  private isPastCooldown(type: IntegrityEventType, timestampMs: number) {
    return timestampMs - (this.cooldown.get(type) ?? -Infinity) >= this.config.cooldownMs;
  }

  private makeEvent(condition: ActiveCondition, endTimeMs: number): IntegrityEvent {
    this.cooldown.set(condition.type, endTimeMs);
    const rounded = typeof condition.maxValue === "number" ? Math.round(condition.maxValue) : undefined;
    return {
      id: eventId(condition.type, condition.startTimeMs),
      type: condition.type,
      label: condition.label,
      startTimeMs: condition.startTimeMs,
      endTimeMs,
      durationMs: endTimeMs - condition.startTimeMs,
      measuredValue: rounded,
      measurementLabel: condition.measurementLabel,
      direction: condition.direction,
      confidence: round2(condition.confidence),
      threshold: condition.threshold,
      severity: condition.severity,
      status: condition.status,
      note: condition.note
    };
  }

  private repeatedEventsFor(event: IntegrityEvent) {
    const history = this.recent.get(event.type)?.filter((time) => event.endTimeMs - time <= this.config.repeatedWindowMs) ?? [];
    history.push(event.endTimeMs);
    this.recent.set(event.type, history);
    if (history.length < this.config.repeatedThreshold || !this.isPastCooldown("repeated_head_pattern", event.endTimeMs)) return [];
    this.cooldown.set("repeated_head_pattern", event.endTimeMs);
    return [{
      id: eventId("repeated_head_pattern", event.endTimeMs),
      type: "repeated_head_pattern" as const,
      label: "Repeated movement pattern",
      startTimeMs: history[0],
      endTimeMs: event.endTimeMs,
      durationMs: event.endTimeMs - history[0],
      measuredValue: history.length,
      measurementLabel: "events",
      direction: event.direction,
      confidence: event.confidence,
      threshold: this.config.repeatedThreshold,
      severity: "warning" as const,
      status: "needs_review" as const,
      note: `${event.label} repeated ${history.length} times within the configured review window.`
    }];
  }

  private summary(frame: IntegrityFrame): IntegritySummary {
    return {
      currentAngles: frame.angles,
      maxDeviation: this.maxDeviation,
      faceVisible: frame.faceCount > 0,
      faceCount: frame.faceCount,
      gazeDirection: frame.gazeDirection ?? "unknown",
      measurementValid: Boolean(frame.angles && frame.confidence >= this.config.minimumConfidence),
      quality: round2(frame.confidence),
      activeLabels: this.activeLabels
    };
  }
}

function angleCondition(
  type: IntegrityEventType,
  label: string,
  value: number,
  threshold: number,
  direction: string,
  confidence: number,
  sustainedMs: number,
  measurementLabel: string
): Condition {
  const active = threshold < 0 ? value <= threshold : value >= threshold;
  return {
    type,
    label,
    active,
    value,
    threshold,
    direction,
    confidence,
    durationMs: 0,
    sustainedMs,
    severity: "warning",
    status: "needs_review",
    measurementLabel,
    note: `${label} - ${Math.round(value)} degrees.`
  };
}

function maxAngleDelta(current: NonNullable<IntegrityFrame["angles"]>, previous: NonNullable<IntegrityFrame["angles"]>) {
  return Math.max(
    Math.abs(current.yaw - previous.yaw),
    Math.abs(current.pitch - previous.pitch),
    Math.abs(current.roll - previous.roll)
  );
}

function largerMagnitude(current?: number, next?: number) {
  if (typeof current !== "number") return next;
  if (typeof next !== "number") return current;
  return Math.abs(next) > Math.abs(current) ? next : current;
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function eventId(type: IntegrityEventType, timestampMs: number) {
  return `${type}-${Math.round(timestampMs)}`;
}
