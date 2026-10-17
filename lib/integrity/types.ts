export type HeadAngles = {
  yaw: number;
  pitch: number;
  roll: number;
};

export type GazeDirection = "screen" | "left" | "right" | "up" | "down" | "unknown";

export type IntegritySeverity = "info" | "warning" | "review";
export type IntegrityStatus = "informational" | "needs_review" | "dismissed" | "reviewed" | "technical";

export type IntegrityEventType =
  | "head_turn_left"
  | "head_turn_right"
  | "head_tilt_up"
  | "head_tilt_down"
  | "head_roll_left"
  | "head_roll_right"
  | "rapid_head_movement"
  | "repeated_head_pattern"
  | "gaze_away"
  | "face_missing"
  | "multiple_faces"
  | "face_off_center"
  | "camera_started"
  | "camera_denied"
  | "camera_interrupted"
  | "camera_frozen"
  | "camera_too_dark"
  | "model_unavailable"
  | "possible_phone"
  | "hand_near_face"
  | "mouth_movement";

export type IntegrityEvent = {
  id: string;
  type: IntegrityEventType;
  label: string;
  startTimeMs: number;
  endTimeMs: number;
  durationMs: number;
  measuredValue?: number;
  measurementLabel?: string;
  direction?: string;
  confidence?: number;
  threshold?: number;
  severity: IntegritySeverity;
  status: IntegrityStatus;
  note: string;
};

export type IntegrityConfig = {
  yawLeftThreshold: number;
  yawRightThreshold: number;
  pitchUpThreshold: number;
  pitchDownThreshold: number;
  rollLeftThreshold: number;
  rollRightThreshold: number;
  exitHysteresisDegrees: number;
  sustainedDurationMs: number;
  repeatedWindowMs: number;
  repeatedThreshold: number;
  cooldownMs: number;
  faceMissingGraceMs: number;
  multipleFaceDurationMs: number;
  gazeDeviationDurationMs: number;
  rapidDeltaDegrees: number;
  rapidSpeedDegPerSec: number;
  minimumConfidence: number;
  objectConfidence: number;
  frameIntervalMs: number;
  darknessThreshold: number;
  frozenFrameMs: number;
};

export type IntegrityFrame = {
  timestampMs: number;
  angles?: HeadAngles;
  confidence: number;
  faceCount: number;
  brightness?: number;
  frozen?: boolean;
  gazeDirection?: GazeDirection;
  gazeConfidence?: number;
  phoneConfidence?: number;
};

export type IntegritySummary = {
  currentAngles?: HeadAngles;
  maxDeviation: HeadAngles;
  faceVisible: boolean;
  faceCount: number;
  gazeDirection: GazeDirection;
  measurementValid: boolean;
  quality: number;
  activeLabels: string[];
};
