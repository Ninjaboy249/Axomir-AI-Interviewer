"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import type { KeyboardEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { InterviewIntegrityMonitor } from "@/components/integrity/InterviewIntegrityMonitor";
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  FileText,
  Loader2,
  Send,
  Sparkles,
  Square,
  Volume2
} from "lucide-react";

type Detail = {
  session: {
    id: string;
    status: string;
    mode: "text" | "voice";
    currentQuestionId?: string;
    currentDifficulty: number;
    askedQuestionIds: string[];
    createdAt: string;
    startedAt?: string;
    completedAt?: string;
  };
  plan: {
    id: string;
    status: string;
    questions: Array<{
      id: string;
      text: string;
      competency: string;
      priority?: "High" | "Medium" | "Low";
      priorityRank?: number;
      difficulty: number;
      expectedAnswer: string[];
    }>;
  };
  candidate: { name: string; resumeText?: string };
  job: { title: string; requiredSkills: string[]; responsibilities: string[] };
  answers: Array<{
    id: string;
    questionId: string;
    text: string;
    source: string;
    aiCorrectness?: string;
    aiScore?: number;
    aiFeedback?: string;
  }>;
  evaluation?: {
    percentageScore: number;
    recommendation: "Advance" | "Hold" | "Reject";
    needsHumanReview: boolean;
    strengths: string[];
    gaps: string[];
    humanReviewReasons: string[];
    candidateFeedback: string;
    competencyScores: Array<{
      competency: string;
      score: number;
      weight: number;
      evidenceQuote?: string;
      explanation: string;
      missingEvidence?: string;
      confidence: "low" | "medium" | "high";
    }>;
  };
  consistencyFindings: Array<{ classification: string; resumeExcerpt: string; explanation: string }>;
  proctorEvents: Array<{ type: string; severity: string; note: string; createdAt: string; durationMs?: number }>;
};

type BotState = "intro" | "asking" | "listening" | "reviewing" | "complete";

const expressionByState: Record<BotState, string> = {
  intro: "/level2/Hi.jpg",
  asking: "/level2/QuestionAsk.jpeg",
  listening: "/level2/AnswerListen.jpg",
  reviewing: "/level2/Listen2.jpg",
  complete: "/level2/EndSession.jpg"
};

export default function LevelTwoPage() {
  const params = useParams<{ sessionId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = params.sessionId;
  const levelOneId = searchParams.get("level1");
  const roomStarted = searchParams.get("room") === "1";
  const [detail, setDetail] = useState<Detail | null>(null);
  const [levelOneDetail, setLevelOneDetail] = useState<Detail | null>(null);
  const [answer, setAnswer] = useState("");
  const [statusMessage, setStatusMessage] = useState("Loading Level 2 interview room...");
  const [botState, setBotState] = useState<BotState>("intro");
  const [speaking, setSpeaking] = useState(false);
  const [answerReady, setAnswerReady] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const spokenQuestionRef = useRef<string | null>(null);
  const voiceRunRef = useRef(0);

  const currentQuestion = useMemo(() => {
    if (!detail?.session.currentQuestionId) return undefined;
    return detail.plan.questions.find((question) => question.id === detail.session.currentQuestionId);
  }, [detail]);

  const chatTurns = useMemo(() => {
    if (!detail) return [];
    const answersByQuestion = new Map(detail.answers.map((item) => [item.questionId, item]));
    const askedIds = new Set([...detail.session.askedQuestionIds, detail.session.currentQuestionId].filter(Boolean) as string[]);
    return detail.plan.questions
      .filter((question) => askedIds.has(question.id))
      .map((question) => ({
        question,
        answer: answersByQuestion.get(question.id),
        current: question.id === detail.session.currentQuestionId
      }));
  }, [detail]);

  useEffect(() => {
    void loadDetail();
    if (levelOneId) void loadLevelOneDetail(levelOneId);
    return () => stopVoicePlayback();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, levelOneId]);

  useEffect(() => {
    if (!roomStarted) {
      setBotState("intro");
      return;
    }
    if (!currentQuestion || detail?.session.status !== "active") {
      setBotState(detail?.session.status === "completed" ? "complete" : "intro");
      return;
    }
    if (spokenQuestionRef.current === currentQuestion.id) return;
    spokenQuestionRef.current = currentQuestion.id;
    setAnswerReady(false);
    setBotState("asking");
    void speakQuestion(currentQuestion.text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomStarted, currentQuestion?.id, detail?.session.status]);

  async function loadDetail() {
    try {
      const response = await fetch(`/api/interviews/${sessionId}`);
      const data = await response.json();
      if (!response.ok) {
        setStatusMessage(data.error ?? "Level 2 interview could not be loaded.");
        return;
      }
      setDetail(data);
      setStatusMessage("Level 2 room is ready. Axomir will speak each question before the answer box opens.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Level 2 interview could not be loaded.");
    }
  }

  async function loadLevelOneDetail(id: string) {
    const response = await fetch(`/api/interviews/${id}`);
    const data = await response.json().catch(() => null);
    if (response.ok && data) setLevelOneDetail(data);
  }

  function stopVoicePlayback(message?: string) {
    voiceRunRef.current += 1;
    audioRef.current?.pause();
    audioRef.current = null;
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
    setSpeaking(false);
    if (message) setStatusMessage(message);
  }

  async function speakQuestion(text: string) {
    stopVoicePlayback();
    const runId = voiceRunRef.current + 1;
    voiceRunRef.current = runId;
    setSpeaking(true);
    setBotState("asking");
    setStatusMessage("Murf Falcon is asking the Level 2 question.");
    try {
      const response = await fetch("/api/voice/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text })
      });
      if (!response.ok) {
        setAnswerReady(true);
        setBotState("listening");
        setStatusMessage("Voice could not play, but the question is ready in text.");
        return;
      }
      const blob = await response.blob();
      if (runId !== voiceRunRef.current) return;
      const url = URL.createObjectURL(blob);
      audioUrlRef.current = url;
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => {
        if (runId !== voiceRunRef.current) return;
        setSpeaking(false);
        setAnswerReady(true);
        setBotState("listening");
        setStatusMessage("Question complete. Submit your answer in the chat box.");
      };
      audio.onerror = () => {
        setSpeaking(false);
        setAnswerReady(true);
        setBotState("listening");
        setStatusMessage("Voice playback failed, but the question is ready in text.");
      };
      await audio.play();
    } catch (error) {
      setSpeaking(false);
      setAnswerReady(true);
      setBotState("listening");
      setStatusMessage(error instanceof Error ? error.message : "Voice playback failed, but the question is ready in text.");
    }
  }

  async function submitAnswer() {
    if (submitting) return;
    if (!detail || !currentQuestion) {
      setStatusMessage("No active Level 2 question is available.");
      return;
    }
    const answerText = answer.trim();
    if (!answerText) {
      setStatusMessage("Type your answer before submitting.");
      return;
    }
    setSubmitting(true);
    setBotState("reviewing");
    setStatusMessage("Submitting answer for OpenAI review...");
    try {
      const response = await fetch(`/api/interviews/${detail.session.id}/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId: currentQuestion.id, text: answerText, source: "text" })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setStatusMessage(data.error ?? "Answer submission failed.");
        setBotState("listening");
        return;
      }
      setAnswer("");
      await loadDetail();
      const aiFeedback = data.answer?.aiFeedback ? ` OpenAI review: ${data.answer.aiFeedback}` : "";
      setStatusMessage(`Answer saved.${aiFeedback}`);
      setAnswerReady(false);
    } finally {
      setSubmitting(false);
    }
  }

  async function endAndEvaluate() {
    if (!detail) return;
    setEvaluating(true);
    setStatusMessage("Generating updated Level 2 scorecard...");
    try {
      if (detail.session.status === "active" || detail.session.status === "paused") {
        await fetch(`/api/interviews/${detail.session.id}/control`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "end", reason: "Level 2 interviewer ended session for scoring" })
        });
      }
      const response = await fetch(`/api/interviews/${detail.session.id}/evaluate`, { method: "POST" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setStatusMessage(data.error ?? "Scorecard generation failed.");
        return;
      }
      await loadDetail();
      setBotState("complete");
      setStatusMessage("Level 2 scorecard updated. Download the combined PDF report below.");
    } finally {
      setEvaluating(false);
    }
  }

  function handleAnswerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    if (answerReady && answer.trim()) void submitAnswer();
  }

  function downloadPdf() {
    if (!detail) return;
    setDownloading(true);
    const lines = buildReportLines(levelOneDetail, detail);
    const blob = createPdfBlob(lines);
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `axomir-level2-report-${detail.candidate.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "candidate"}.pdf`;
    link.click();
    URL.revokeObjectURL(url);
    setDownloading(false);
  }

  function enterMeetingRoom() {
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set("room", "1");
    router.replace(`/level2/${sessionId}?${nextParams.toString()}`);
  }

  const expression = expressionByState[botState];

  if (!roomStarted) {
    return (
      <main className="level2-intro-screen">
        <video className="level2-intro-video" src="/level2/level2.mp4" autoPlay muted controls playsInline preload="auto" onEnded={enterMeetingRoom} />
        <div className="level2-intro-overlay">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/65">Level 2 briefing</p>
            <h1 className="mt-3 text-4xl font-semibold text-white md:text-6xl">Live bot-agent interview starts next</h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-white/72">Watch the Level 2 intro, then Axomir will open the meeting room with the interviewer image, spoken questions, monitoring and answer chat.</p>
            <button type="button" className="focus-ring mt-6 rounded-md border border-white/20 bg-white px-5 py-3 text-sm font-semibold text-[#101820] shadow-xl transition hover:bg-white/90" onClick={enterMeetingRoom}>
              Enter meeting room
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="premium-shell min-h-screen">
      <header className="premium-header relative overflow-hidden px-6 py-8 text-white">
        <div className="header-scan" />
        <div className="relative mx-auto flex max-w-7xl flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <Link href="/" className="focus-ring inline-flex items-center gap-2 rounded-md border border-white/18 bg-white/10 px-3 py-2 text-sm transition hover:bg-white/16">
              <ArrowLeft className="h-4 w-4" />
              Back to Level 1
            </Link>
            <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-white/58">Level 2 live bot-agent interview</p>
            <h1 className="mt-1 max-w-4xl text-3xl font-semibold md:text-4xl">Axomir live interview room</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-white/70">Murf Falcon asks each question, the answer box opens after the question completes, and OpenAI reviews every submitted answer.</p>
          </div>
          <div className="rounded-lg border border-white/14 bg-white/10 px-4 py-3 text-sm">
            <p className="text-white/60">Candidate</p>
            <p className="font-semibold">{detail?.candidate.name ?? "Loading..."}</p>
            <p className="mt-2 text-white/60">Role</p>
            <p className="font-semibold">{detail?.job.title ?? "Level 2"}</p>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-5 px-6 py-6 xl:grid-cols-[1fr_420px]">
        <section className="space-y-5">
          <section className="premium-panel level2-meeting-panel rounded-lg p-5">
            <div className="grid gap-5 xl:grid-cols-[minmax(360px,0.95fr)_1fr]">
              <div className="level2-agent-card level2-meeting-card rounded-lg border border-ink/10 bg-white/75 p-4 text-center">
                <Image className="level2-expression level2-meeting-expression mx-auto" src={expression} alt="Axomir bot interviewer expression" width={720} height={720} priority />
                <div className="mt-4 flex items-center justify-center gap-2 text-sm font-medium text-ink/70">
                  {speaking ? <Volume2 className="h-4 w-4 text-teal" /> : botState === "reviewing" ? <Loader2 className="h-4 w-4 animate-spin text-teal" /> : <Sparkles className="h-4 w-4 text-teal" />}
                  {speaking ? "Asking question" : botState === "reviewing" ? "Reviewing answer" : botState === "complete" ? "Session complete" : "Listening"}
                </div>
              </div>

              <div>
                <div className="mb-4 rounded-lg border border-ink/10 bg-paper/70 p-3">
                  <p className="text-xs font-semibold uppercase text-teal">Status</p>
                  <p className="mt-1 text-sm leading-6 text-ink/70">{statusMessage}</p>
                </div>
                <div className="level2-chat rounded-lg border border-ink/10 bg-paper/70 p-3">
                  <div className="max-h-[520px] space-y-3 overflow-y-auto pr-1">
                    {chatTurns.map((turn, index) => (
                      <div key={`${turn.question.id}-${turn.answer?.id ?? "current"}`} className="space-y-2">
                        <div className="flex items-start gap-2">
                          <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#111820] text-xs font-semibold text-white">AI</div>
                          <div className={`question-bubble max-w-[92%] rounded-lg border p-3 ${turn.current ? "border-teal/35 bg-white" : "border-ink/10 bg-white/80"}`}>
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="text-[11px] uppercase tracking-wide text-ink/45">Question {index + 1} / Priority {turn.question.priorityRank ?? "-"} / Difficulty {turn.question.difficulty}</p>
                              {turn.current ? (
                                <button type="button" className="focus-ring rounded-md border border-teal/25 bg-teal/10 px-3 py-1.5 text-xs font-semibold text-teal transition hover:bg-teal/15 disabled:opacity-50" onClick={() => speaking ? stopVoicePlayback("Voice playback stopped.") : void speakQuestion(turn.question.text)} disabled={submitting}>
                                  {speaking ? <Square className="mr-1 inline h-3.5 w-3.5" /> : <Volume2 className="mr-1 inline h-3.5 w-3.5" />}
                                  {speaking ? "Stop voice" : "Start speak"}
                                </button>
                              ) : null}
                            </div>
                            <p className="mt-1 text-sm font-medium leading-6 text-ink">{turn.question.text}</p>
                          </div>
                        </div>
                        {turn.answer ? (
                          <div className="flex items-start justify-end gap-2">
                            <div className="max-w-[92%] rounded-lg border border-teal/20 bg-teal/10 p-3">
                              <p className="text-[11px] uppercase tracking-wide text-teal">Your answer</p>
                              <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-ink/78">{turn.answer.text}</p>
                              {turn.answer.aiFeedback ? (
                                <p className="mt-2 rounded-md bg-white/70 px-2 py-1 text-xs leading-5 text-ink/58">OpenAI: {turn.answer.aiCorrectness?.replace("_", " ") ?? "reviewed"}{typeof turn.answer.aiScore === "number" ? ` (${turn.answer.aiScore}/5)` : ""} - {turn.answer.aiFeedback}</p>
                              ) : null}
                            </div>
                            <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal text-xs font-semibold text-white">You</div>
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>

                  {currentQuestion ? (
                    <div className="mt-4 rounded-lg border border-ink/10 bg-white p-2 shadow-sm">
                      <textarea
                        className="focus-ring min-h-[118px] w-full resize-none rounded-md border-0 bg-transparent px-3 py-2 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-50"
                        placeholder={answerReady ? "Type your Level 2 answer..." : "Answer box opens after the question finishes."}
                        value={answer}
                        onChange={(event) => setAnswer(event.target.value)}
                        onKeyDown={handleAnswerKeyDown}
                        disabled={!answerReady || submitting}
                      />
                      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-ink/10 px-2 pt-2">
                        <p className="text-xs text-ink/45">Press Enter to submit. Shift+Enter adds a new line.</p>
                        <button type="button" className="focus-ring premium-button rounded-md px-4 py-2 text-sm text-white disabled:opacity-60" onClick={() => void submitAnswer()} disabled={!answerReady || submitting || !answer.trim()}>
                          {submitting ? <Loader2 className="mr-1 inline h-4 w-4 animate-spin" /> : <Send className="mr-1 inline h-4 w-4" />}
                          Submit answer
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-4 rounded-lg border border-teal/20 bg-teal/10 p-4">
                      <CheckCircle2 className="mr-1 inline h-5 w-5 text-teal" />
                      Level 2 questions are complete. Generate the updated scorecard.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>
        </section>

        <aside className="space-y-5">
          <InterviewIntegrityMonitor sessionId={sessionId} sessionStatus={detail?.session.status ?? "active"} onEventLogged={loadDetail} />
          <section className="premium-panel rounded-lg p-5">
            <h2 className="font-semibold">Scorecard actions</h2>
            <p className="mt-2 text-sm leading-6 text-ink/65">Generate the Level 2 scorecard after the live bot-agent round, then download the combined Level 1 and Level 2 report as a PDF.</p>
            <div className="mt-4 flex flex-col gap-2">
              <button type="button" className="focus-ring rounded-md bg-teal px-4 py-2 text-sm font-medium text-white disabled:opacity-50" onClick={() => void endAndEvaluate()} disabled={evaluating || !detail}>
                {evaluating ? <Loader2 className="mr-1 inline h-4 w-4 animate-spin" /> : <FileText className="mr-1 inline h-4 w-4" />}
                Generate Level 2 Scorecard
              </button>
              <button type="button" className="focus-ring rounded-md border border-ink/15 bg-white px-4 py-2 text-sm font-medium disabled:opacity-50" onClick={downloadPdf} disabled={downloading || !detail}>
                {downloading ? <Loader2 className="mr-1 inline h-4 w-4 animate-spin" /> : <Download className="mr-1 inline h-4 w-4" />}
                Download PDF Report
              </button>
            </div>
          </section>
        </aside>
      </div>

      <section className="mx-auto grid max-w-7xl gap-5 px-6 pb-8 xl:grid-cols-2">
        <ScorecardSummary title="Level 1 Scorecard" detail={levelOneDetail} empty="Level 1 scorecard will appear when this room is opened from the level-up button." />
        <ScorecardSummary title="Level 2 Updated Scorecard" detail={detail} empty="Generate the Level 2 scorecard after answers are submitted." />
      </section>
    </main>
  );
}

function ScorecardSummary({ title, detail, empty }: { title: string; detail: Detail | null; empty: string }) {
  return (
    <section className="premium-panel rounded-lg p-5">
      <h2 className="font-semibold">{title}</h2>
      {!detail?.evaluation ? (
        <p className="mt-3 text-sm leading-6 text-ink/60">{empty}</p>
      ) : (
        <div className="mt-4 space-y-4">
          <div className="grid grid-cols-3 gap-2">
            <Metric label="Score" value={`${detail.evaluation.percentageScore}%`} />
            <Metric label="Decision" value={detail.evaluation.recommendation} />
            <Metric label="Review" value={detail.evaluation.needsHumanReview ? "Required" : "Clear"} />
          </div>
          <div className="space-y-2">
            {detail.evaluation.competencyScores.map((score) => (
              <div key={score.competency} className="rounded-md border border-ink/10 bg-white/70 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">{score.competency}</p>
                  <span className="rounded-full bg-paper px-2 py-1 text-xs font-semibold">{score.score}/5</span>
                </div>
                <p className="mt-2 text-xs leading-5 text-ink/60">{score.explanation}</p>
                {(score.evidenceQuote || score.missingEvidence) && <p className="mt-2 text-xs leading-5 text-ink/78">{score.evidenceQuote ?? score.missingEvidence}</p>}
              </div>
            ))}
          </div>
          <ReportList title="Gaps" items={detail.evaluation.gaps} />
          <ReportList title="Strengths" items={detail.evaluation.strengths} />
        </div>
      )}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-ink/10 bg-white/70 p-3">
      <p className="text-[11px] uppercase text-ink/45">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  );
}

function ReportList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <p className="text-sm font-semibold">{title}</p>
      {items.length === 0 ? (
        <p className="mt-1 text-xs text-ink/55">No items generated yet.</p>
      ) : (
        <ul className="mt-2 space-y-1 text-xs leading-5 text-ink/68">
          {items.map((item) => <li key={item}>- {item}</li>)}
        </ul>
      )}
    </div>
  );
}

function buildReportLines(levelOne: Detail | null, levelTwo: Detail) {
  const lines = [
    "Axomir Level 2 Interview Report",
    `Candidate: ${levelTwo.candidate.name}`,
    `Role: ${levelTwo.job.title}`,
    `Generated: ${new Date().toLocaleString()}`,
    "",
    "Important: Scorecards and integrity signals are advisory review evidence, not automatic hiring decisions.",
    ""
  ];
  appendScorecard(lines, "Level 1 Scorecard", levelOne);
  appendScorecard(lines, "Level 2 Updated Scorecard", levelTwo);
  lines.push("Level 2 Answers");
  const questionById = new Map(levelTwo.plan.questions.map((question) => [question.id, question]));
  for (const candidateAnswer of levelTwo.answers) {
    const question = questionById.get(candidateAnswer.questionId);
    lines.push(`Q: ${question?.text ?? candidateAnswer.questionId}`);
    lines.push(`A: ${candidateAnswer.text}`);
    lines.push(`OpenAI: ${candidateAnswer.aiCorrectness ?? "not reviewed"} ${typeof candidateAnswer.aiScore === "number" ? `${candidateAnswer.aiScore}/5` : ""} ${candidateAnswer.aiFeedback ?? ""}`);
    lines.push("");
  }
  if (levelTwo.proctorEvents.length > 0) {
    lines.push("Integrity Monitoring Events");
    for (const event of levelTwo.proctorEvents.slice(0, 20)) {
      lines.push(`${new Date(event.createdAt).toLocaleTimeString()} - ${event.type} - ${event.note}`);
    }
  }
  return lines;
}

function appendScorecard(lines: string[], title: string, detail: Detail | null) {
  lines.push(title);
  if (!detail?.evaluation) {
    lines.push("No scorecard generated.");
    lines.push("");
    return;
  }
  lines.push(`Overall: ${detail.evaluation.percentageScore}%`);
  lines.push(`Recommendation: ${detail.evaluation.recommendation}`);
  lines.push(`Human review: ${detail.evaluation.needsHumanReview ? "Required" : "Not flagged"}`);
  for (const score of detail.evaluation.competencyScores) {
    lines.push(`${score.competency}: ${score.score}/5 - ${score.explanation}`);
    if (score.evidenceQuote) lines.push(`Evidence: ${score.evidenceQuote}`);
    if (score.missingEvidence) lines.push(`Gap: ${score.missingEvidence}`);
  }
  if (detail.evaluation.gaps.length > 0) {
    lines.push("Gaps:");
    detail.evaluation.gaps.forEach((gap) => lines.push(`- ${gap}`));
  }
  if (detail.evaluation.strengths.length > 0) {
    lines.push("Strengths:");
    detail.evaluation.strengths.forEach((strength) => lines.push(`- ${strength}`));
  }
  lines.push("");
}

function createPdfBlob(rawLines: string[]) {
  const lines = rawLines.flatMap((line) => wrapLine(line, 92));
  const pageLineLimit = 46;
  const pageChunks: string[][] = [];
  for (let index = 0; index < lines.length; index += pageLineLimit) pageChunks.push(lines.slice(index, index + pageLineLimit));

  const objects: string[] = [];
  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  const pageObjectNumbers = pageChunks.map((_, index) => 3 + index * 2);
  objects.push(`<< /Type /Pages /Kids [${pageObjectNumbers.map((item) => `${item} 0 R`).join(" ")}] /Count ${pageChunks.length} >>`);
  pageChunks.forEach((chunk, index) => {
    const pageObjectNumber = 3 + index * 2;
    const contentObjectNumber = pageObjectNumber + 1;
    const content = [
      "BT",
      "/F1 10 Tf",
      "14 TL",
      "40 760 Td",
      ...chunk.map((line) => `(${escapePdfText(line)}) Tj T*`),
      "ET"
    ].join("\n");
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >> /Contents ${contentObjectNumber} 0 R >>`);
    objects.push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  });

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return new Blob([pdf], { type: "application/pdf" });
}

function wrapLine(line: string, maxLength: number) {
  if (!line) return [""];
  const words = line.replace(/\s+/g, " ").trim().split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (`${current} ${word}`.trim().length > maxLength) {
      if (current) lines.push(current);
      current = word;
    } else {
      current = `${current} ${word}`.trim();
    }
  }
  if (current) lines.push(current);
  return lines;
}

function escapePdfText(text: string) {
  return text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}
