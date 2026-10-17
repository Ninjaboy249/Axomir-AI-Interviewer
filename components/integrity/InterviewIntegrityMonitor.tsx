"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Camera, Download, Eye, Minimize2, Pause, Play, RotateCcw, ShieldCheck, Square } from "lucide-react";
import { IntegrityEventEngine, defaultIntegrityConfig } from "@/lib/integrity/event-engine";
import { averageAngles, estimateBrightness, estimateFrameDifference, estimateGazeDirection, eulerFromMatrix, relativeAngles, smoothAngles } from "@/lib/integrity/head-pose";
import { HeadAngles, IntegrityConfig, IntegrityEvent, IntegrityFrame, IntegritySummary } from "@/lib/integrity/types";

type MonitorStatus = "idle" | "loading" | "calibrating" | "active" | "paused" | "stopped" | "error";

type Props = {
  sessionId: string;
  sessionStatus: string;
  onEventLogged: () => Promise<void>;
  onReject?: (reason: string) => Promise<void> | void;
};

type FaceResult = {
  faceLandmarks?: unknown[];
  facialTransformationMatrixes?: Array<{ data?: ArrayLike<number> } | ArrayLike<number>>;
  faceBlendshapes?: Array<{ categories?: Array<{ categoryName?: string; score?: number }> }>;
};

type FaceLandmarkerInstance = {
  detectForVideo: (video: HTMLVideoElement, timestampMs: number) => FaceResult;
};

const wasmRoot = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm";
const faceModel = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
const config: IntegrityConfig = defaultIntegrityConfig;

export function InterviewIntegrityMonitor({ sessionId, sessionStatus, onEventLogged, onReject }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const faceLandmarkerRef = useRef<FaceLandmarkerInstance | null>(null);
  const engineRef = useRef(new IntegrityEventEngine(config));
  const timerRef = useRef<number | undefined>(undefined);
  const baselineSamplesRef = useRef<HeadAngles[]>([]);
  const previousPixelsRef = useRef<Uint8ClampedArray | undefined>(undefined);
  const previousChangedAtRef = useRef(Date.now());
  const smoothedAnglesRef = useRef<HeadAngles | undefined>(undefined);
  const statusRef = useRef<MonitorStatus>("idle");
  const warningCountRef = useRef(0);
  const rejectedRef = useRef(false);

  const [status, setStatus] = useState<MonitorStatus>("idle");
  const [message, setMessage] = useState("Camera monitoring is off. Start it when the candidate is ready.");
  const [baseline, setBaseline] = useState<HeadAngles | undefined>();
  const [summary, setSummary] = useState<IntegritySummary>({
    maxDeviation: { yaw: 0, pitch: 0, roll: 0 },
    faceVisible: false,
    faceCount: 0,
    gazeDirection: "unknown",
    measurementValid: false,
    quality: 0,
    activeLabels: []
  });
  const [events, setEvents] = useState<IntegrityEvent[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [warningCount, setWarningCount] = useState(0);
  const [warning, setWarning] = useState<{ title: string; detail: string } | null>(null);
  const [modelStatus, setModelStatus] = useState({
    face: "MediaPipe Face Landmarker ready on start",
    eye: "Estimated from face blendshapes when available",
    hand: "Hand/object models not loaded in this build",
    phone: "Unavailable until an object detector model is configured",
    mouth: "Mouth-motion review not enabled"
  });

  const isTerminal = sessionStatus === "completed" || sessionStatus === "ended";
  const coverage = useMemo(() => {
    const started = events.find((event) => event.type === "camera_started")?.startTimeMs;
    if (!started) return "Not started";
    return formatDuration(Date.now() - started);
  }, [events]);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    if (videoRef.current && streamRef.current && videoRef.current.srcObject !== streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      void videoRef.current.play().catch(() => undefined);
    }
  }, [expanded]);

  useEffect(() => {
    if (isTerminal && ["active", "calibrating", "paused", "loading"].includes(status)) stopMonitoring("Monitoring stopped because the interview ended.");
  }, [isTerminal, status]);

  useEffect(() => () => stopMonitoring(), []);

  async function startMonitoring() {
    if (isTerminal) {
      setMessage("Monitoring cannot start after the interview has ended.");
      return;
    }
    setExpanded(true);
    setStatus("loading");
    setMessage("Requesting camera permission and loading face landmark model...");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: "user" }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      stream.getVideoTracks()[0]?.addEventListener("ended", () => {
        void logEvent(simpleEvent("camera_interrupted", "Camera interrupted", "The camera stream stopped unexpectedly.", "warning", "technical"));
        stopMonitoring("Camera stream was interrupted.");
      });
      await loadFaceLandmarker();
      engineRef.current.reset();
      baselineSamplesRef.current = [];
      previousPixelsRef.current = undefined;
      previousChangedAtRef.current = Date.now();
      warningCountRef.current = 0;
      rejectedRef.current = false;
      setWarningCount(0);
      setWarning(null);
      setBaseline(undefined);
      setEvents([]);
      statusRef.current = "calibrating";
      setStatus("calibrating");
      setMessage("Sit comfortably and face the screen. Calibrating neutral head position...");
      await logEvent(simpleEvent("camera_started", "Camera monitoring started", "Candidate enabled real-time integrity monitoring.", "info", "informational"));
      scheduleTick(Date.now(), Date.now() + 2800);
    } catch (error) {
      setStatus("error");
      const denied = error instanceof DOMException && ["NotAllowedError", "PermissionDeniedError"].includes(error.name);
      setMessage(denied ? "Camera permission was denied. Monitoring cannot run without permission." : "Camera could not be started. Check device availability and browser permissions.");
      await logEvent(simpleEvent(denied ? "camera_denied" : "camera_interrupted", denied ? "Camera permission denied" : "Camera unavailable", denied ? "Candidate denied camera permission." : "Camera was unavailable or blocked.", "warning", "technical"));
    }
  }

  function pauseMonitoring() {
    if (status !== "active") return;
    if (timerRef.current) window.clearTimeout(timerRef.current);
    statusRef.current = "paused";
    setStatus("paused");
    setMessage("Monitoring paused. Camera preview remains available until stopped.");
  }

  function resumeMonitoring() {
    if (status !== "paused") return;
    statusRef.current = "active";
    setStatus("active");
    setMessage("Monitoring resumed.");
    scheduleTick(Date.now());
  }

  function retryCalibration() {
    baselineSamplesRef.current = [];
    setBaseline(undefined);
    engineRef.current.reset();
    statusRef.current = "calibrating";
    setStatus("calibrating");
    setMessage("Recalibrating. Sit forward-facing and keep your head naturally still.");
    scheduleTick(Date.now(), Date.now() + 2800);
  }

  function stopMonitoring(nextMessage = "Monitoring stopped. Camera resources released.") {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = undefined;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    statusRef.current = statusRef.current === "idle" ? "idle" : "stopped";
    setStatus((current) => current === "idle" ? current : "stopped");
    setMessage(nextMessage);
  }

  async function loadFaceLandmarker() {
    if (faceLandmarkerRef.current) return;
    const vision = await import("@mediapipe/tasks-vision");
    const fileset = await vision.FilesetResolver.forVisionTasks(wasmRoot);
    faceLandmarkerRef.current = await vision.FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: faceModel },
      runningMode: "VIDEO",
      numFaces: 2,
      outputFaceBlendshapes: true,
      outputFacialTransformationMatrixes: true
    }) as FaceLandmarkerInstance;
    setModelStatus((current) => ({ ...current, face: "MediaPipe Face Landmarker active" }));
  }

  function scheduleTick(now: number, calibrationUntil?: number) {
    timerRef.current = window.setTimeout(() => void tick(calibrationUntil), Math.max(120, config.frameIntervalMs - (Date.now() - now)));
  }

  async function tick(calibrationUntil?: number) {
    const started = Date.now();
    const frame = readFrame(started);
    if (frame) {
      if (statusRef.current === "calibrating") handleCalibration(frame, calibrationUntil ?? started);
      if (statusRef.current === "active") {
        const result = engineRef.current.process(frame);
        setSummary(result.summary);
        for (const event of result.events) await logEvent(event);
      }
    } else if (statusRef.current === "active" || statusRef.current === "calibrating") {
      setMessage("Camera is not providing readable frames yet.");
    }
    if (["active", "calibrating"].includes(statusRef.current)) scheduleTick(started, calibrationUntil);
  }

  function handleCalibration(frame: IntegrityFrame, calibrationUntil: number) {
    if (frame.angles && frame.faceCount === 1) {
      baselineSamplesRef.current.push(frame.angles);
      setSummary((current) => ({ ...current, currentAngles: frame.angles, faceVisible: true, faceCount: 1, quality: frame.confidence }));
    }
    if (Date.now() < calibrationUntil) return;
    const nextBaseline = averageAngles(baselineSamplesRef.current);
    if (!nextBaseline || baselineSamplesRef.current.length < 4) {
      statusRef.current = "error";
      setStatus("error");
      setMessage("Calibration needs a clear face in the frame. Adjust lighting and retry.");
      return;
    }
    setBaseline(nextBaseline);
    statusRef.current = "active";
    setStatus("active");
    setMessage("Calibration complete. Monitoring is active. Signals are review indicators, not proof of malpractice.");
  }

  function readFrame(timestampMs: number): IntegrityFrame | undefined {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const landmarker = faceLandmarkerRef.current;
    if (!video || !canvas || !landmarker || video.readyState < 2) return undefined;
    canvas.width = 96;
    canvas.height = 72;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return undefined;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const diff = estimateFrameDifference(pixels, previousPixelsRef.current);
    if (diff > 1.6) previousChangedAtRef.current = timestampMs;
    previousPixelsRef.current = new Uint8ClampedArray(pixels);
    const brightness = estimateBrightness(context, canvas.width, canvas.height);
    const result = landmarker.detectForVideo(video, timestampMs);
    const faceCount = result.faceLandmarks?.length ?? 0;
    const rawAngles = matrixAngles(result);
    const smooth = rawAngles ? smoothAngles(smoothedAnglesRef.current, rawAngles) : undefined;
    smoothedAnglesRef.current = smooth;
    const relative = smooth && baseline ? relativeAngles(smooth, baseline) : smooth;
    const categories = result.faceBlendshapes?.[0]?.categories ?? [];
    const gaze = estimateGazeDirection(categories);
    return {
      timestampMs,
      angles: relative,
      confidence: faceCount > 0 ? 0.82 : 0,
      faceCount,
      brightness,
      frozen: timestampMs - previousChangedAtRef.current > config.frozenFrameMs,
      gazeDirection: gaze.direction,
      gazeConfidence: gaze.confidence
    };
  }

  function matrixAngles(result: FaceResult) {
    const transform = result.facialTransformationMatrixes?.[0];
    const matrix = matrixData(transform);
    if (!matrix) return undefined;
    return eulerFromMatrix(matrix);
  }

  async function logEvent(event: IntegrityEvent) {
    setEvents((current) => [event, ...current].slice(0, 40));
    const shouldWarn = shouldWarnCandidate(event);
    let shouldReject = false;
    if (shouldWarn) {
      warningCountRef.current += 1;
      const nextWarningCount = warningCountRef.current;
      setWarningCount(nextWarningCount);
      setWarning({
        title: nextWarningCount >= 2 ? "Integrity warning limit reached" : `Potential malpractice signal detected - last warning ${nextWarningCount}/2`,
        detail: `${event.label}. Keep your attention on the interview screen. Gaze down is treated as an exception; other sustained review signals can end this interview for admin review.`
      });
      if (nextWarningCount >= 2 && !rejectedRef.current) {
        rejectedRef.current = true;
        shouldReject = true;
      }
    }
    await fetch(`/api/interviews/${sessionId}/proctor`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: event.type,
        note: event.note,
        severity: event.severity === "review" ? "review" : event.severity,
        startTime: new Date(event.startTimeMs).toISOString(),
        endTime: new Date(event.endTimeMs).toISOString(),
        durationMs: event.durationMs,
        measuredValue: event.measuredValue,
        measurementLabel: event.measurementLabel,
        direction: event.direction,
        confidence: event.confidence,
        threshold: event.threshold,
        status: event.status,
        metadata: { label: event.label }
      })
    }).catch(() => undefined);
    await onEventLogged();
    if (shouldReject) {
      stopMonitoring("Interview monitoring stopped after two final warnings. The session was sent for admin review.");
      await onReject?.("Integrity monitor recorded two final warnings for sustained review signals.");
    }
  }

  function exportCsv() {
    const rows = [
      ["Time", "Event", "Measurement", "Duration", "Status", "Confidence", "Note"],
      ...events.slice().reverse().map((event) => [
        new Date(event.startTimeMs).toLocaleString(),
        event.label,
        event.measuredValue === undefined ? "" : `${event.measurementLabel ?? "value"}: ${event.measuredValue}`,
        `${(event.durationMs / 1000).toFixed(1)} sec`,
        event.status,
        event.confidence?.toString() ?? "",
        event.note
      ])
    ];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll("\"", "\"\"")}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `axomir-integrity-${sessionId}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  if (!expanded) {
    return (
      <>
        <button
          type="button"
          className="focus-ring integrity-launcher"
          onClick={() => setExpanded(true)}
          aria-label="Open camera integrity monitor"
        >
          <Camera className="h-5 w-5" />
          <span className="font-medium">Camera</span>
          <span className={`launcher-status ${status === "active" ? "is-active" : ""}`}>{status}</span>
          {warningCount > 0 ? <span className="launcher-badge">{warningCount}/2</span> : null}
        </button>
        <video ref={videoRef} className="integrity-hidden-video" autoPlay muted playsInline />
        <canvas ref={canvasRef} className="hidden" />
      </>
    );
  }

  return (
    <section className="integrity-panel integrity-floating mb-4 rounded-lg p-4 text-sm">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex gap-3">
          <div className="integrity-icon flex h-11 w-11 shrink-0 items-center justify-center rounded-md">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold text-ink">Real-Time Interview Integrity Monitoring</p>
              <span className={`rounded px-2 py-1 text-xs font-medium ${status === "active" ? "bg-teal/15 text-teal" : "bg-white/70 text-ink/65"}`}>{status}</span>
            </div>
            <p className="mt-1 leading-5 text-ink/68">{message}</p>
            <p className="mt-2 text-xs leading-5 text-ink/55">Camera analysis records observable signals for human review only. It never confirms malpractice and does not store raw video.</p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2 lg:justify-end">
          {status === "idle" || status === "stopped" || status === "error" ? (
            <button type="button" className="focus-ring micro-button rounded-md border border-white/50 bg-white/75 px-3 py-2 text-sm disabled:opacity-50" onClick={() => void startMonitoring()} disabled={isTerminal}>
              <Camera className="mr-1 inline h-4 w-4" />Start
            </button>
          ) : null}
          {status === "active" ? <button type="button" className="focus-ring micro-button rounded-md border border-white/50 bg-white/75 px-3 py-2 text-sm" onClick={pauseMonitoring}><Pause className="mr-1 inline h-4 w-4" />Pause</button> : null}
          {status === "paused" ? <button type="button" className="focus-ring micro-button rounded-md border border-white/50 bg-white/75 px-3 py-2 text-sm" onClick={resumeMonitoring}><Play className="mr-1 inline h-4 w-4" />Resume</button> : null}
          {status === "error" || status === "active" || status === "paused" ? <button type="button" className="focus-ring micro-button rounded-md border border-white/50 bg-white/75 px-3 py-2 text-sm" onClick={retryCalibration}><RotateCcw className="mr-1 inline h-4 w-4" />Calibrate</button> : null}
          {status !== "idle" && status !== "stopped" ? <button type="button" className="focus-ring micro-button rounded-md border border-white/50 bg-white/75 px-3 py-2 text-sm" onClick={() => stopMonitoring()}><Square className="mr-1 inline h-4 w-4" />Stop</button> : null}
          <button type="button" className="focus-ring micro-button rounded-md border border-white/50 bg-white/75 px-3 py-2 text-sm" onClick={exportCsv} disabled={events.length === 0}><Download className="mr-1 inline h-4 w-4" />CSV</button>
          <button type="button" className="focus-ring micro-button rounded-md border border-white/50 bg-white/75 px-3 py-2 text-sm" onClick={() => setExpanded(false)}>
            <Minimize2 className="mr-1 inline h-4 w-4" />Hide
          </button>
        </div>
      </div>

      {warning ? (
        <div className="mb-4 rounded-md border border-ember/35 bg-ember/10 p-3 text-sm text-ink" role="alert" aria-live="assertive">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-semibold text-ember"><AlertTriangle className="mr-1 inline h-4 w-4" />{warning.title}</p>
              <p className="mt-1 text-xs leading-5 text-ink/70">{warning.detail}</p>
            </div>
            <button type="button" className="focus-ring rounded border border-ember/20 bg-white/70 px-2 py-1 text-xs text-ember" onClick={() => setWarning(null)}>Dismiss</button>
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[220px_1fr]">
        <div>
          <video ref={videoRef} className="aspect-video w-full rounded-md border border-white/60 bg-ink object-cover shadow-sm" autoPlay muted playsInline />
          <canvas ref={canvasRef} className="hidden" />
          <p className="mt-2 text-xs text-ink/55">Coverage: {coverage}</p>
        </div>
        <div className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-4">
            <MetricMini label="Face" value={summary.faceVisible ? `${summary.faceCount} visible` : "Not detected"} />
            <MetricMini label="Yaw" value={formatAngle(summary.currentAngles?.yaw)} />
            <MetricMini label="Pitch" value={formatAngle(summary.currentAngles?.pitch)} />
            <MetricMini label="Roll" value={formatAngle(summary.currentAngles?.roll)} />
          </div>
          <div className="grid gap-2 sm:grid-cols-4">
            <MetricMini label="Gaze" value={summary.gazeDirection} />
            <MetricMini label="Quality" value={`${Math.round(summary.quality * 100)}%`} />
            <MetricMini label="Baseline" value={baseline ? `${formatAngle(baseline.yaw)} / ${formatAngle(baseline.pitch)} / ${formatAngle(baseline.roll)}` : "Not set"} />
            <MetricMini label="Thresholds" value={`Yaw ${config.yawLeftThreshold}/${config.yawRightThreshold}, Pitch ${config.pitchDownThreshold}/${config.pitchUpThreshold}`} />
          </div>
          <div className="rounded-md border border-white/55 bg-white/55 p-3">
            <div className="mb-2 flex items-center gap-2 font-medium text-ink"><Eye className="h-4 w-4 text-teal" />Detector status</div>
            <div className="grid gap-2 md:grid-cols-2">
              {Object.entries(modelStatus).map(([key, value]) => <p key={key} className="text-xs text-ink/62"><span className="font-medium uppercase text-ink/45">{key}</span>: {value}</p>)}
            </div>
          </div>
          <div className="rounded-md border border-white/55 bg-white/55 p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="font-medium text-ink">Recent event timeline</p>
              <span className="text-xs text-ink/55">{events.length} local events</span>
            </div>
            {events.length === 0 ? <p className="text-xs text-ink/55">No monitoring events recorded in this browser session.</p> : (
              <div className="max-h-44 space-y-2 overflow-auto pr-1">
                {events.map((event) => (
                  <div key={event.id} className="rounded border border-white/60 bg-white/70 p-2 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium">{event.label}</span>
                      <span className={event.status === "needs_review" ? "text-ember" : "text-ink/50"}>{event.status.replaceAll("_", " ")}</span>
                    </div>
                    <p className="mt-1 text-ink/60">{new Date(event.startTimeMs).toLocaleTimeString()} / {formatDuration(event.durationMs)} / {event.measurementLabel ? `${event.measurementLabel}: ${event.measuredValue}` : event.direction ?? "signal"}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
          {summary.activeLabels.length > 0 ? (
            <div className="rounded-md border border-ember/20 bg-white/65 p-3 text-xs text-ink/65">
              <AlertTriangle className="mr-1 inline h-4 w-4 text-ember" />
              Active signal: {summary.activeLabels.join(", ")}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function MetricMini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-white/55 bg-white/62 p-3">
      <p className="text-[11px] uppercase text-ink/45">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-ink">{value}</p>
    </div>
  );
}

function simpleEvent(type: IntegrityEvent["type"], label: string, note: string, severity: IntegrityEvent["severity"], status: IntegrityEvent["status"]): IntegrityEvent {
  const now = Date.now();
  return { id: `${type}-${now}`, type, label, note, severity, status, startTimeMs: now, endTimeMs: now, durationMs: 0 };
}

export function shouldWarnCandidate(event: IntegrityEvent) {
  if (event.status !== "needs_review") return false;
  if (event.type === "head_tilt_down") return false;
  if (event.type === "gaze_away" && event.direction === "down") return false;
  return true;
}

function matrixData(transform?: { data?: ArrayLike<number> } | ArrayLike<number>) {
  if (!transform) return undefined;
  if (typeof transform === "object" && "data" in transform && transform.data) return transform.data;
  return "length" in transform ? transform : undefined;
}

function formatAngle(value?: number) {
  return typeof value === "number" ? `${Math.round(value)} deg` : "--";
}

function formatDuration(valueMs: number) {
  if (valueMs < 1000) return `${Math.round(valueMs)} ms`;
  return `${(valueMs / 1000).toFixed(1)} sec`;
}

