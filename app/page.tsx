"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Bot,
  BriefcaseBusiness,
  CheckCircle2,
  ClipboardList,
  FileText,
  Headphones,
  History,
  LayoutDashboard,
  Loader2,
  Mic,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  Square,
  Upload,
  UserRound,
  Volume2
} from "lucide-react";

type SessionSummary = {
  id: string;
  status: string;
  mode: "text" | "voice";
  createdAt: string;
  currentQuestionId?: string;
  candidate?: { name: string; source: string };
  job?: { title: string };
  evaluation?: { percentageScore: number; recommendation: string; needsHumanReview: boolean };
};

type Detail = {
  session: SessionSummary & { consentStatus: string; askedQuestionIds: string[] };
  plan: {
    id: string;
    status: string;
    questions: Array<{ id: string; text: string; competency: string; difficulty: number; mandatory: boolean; expectedAnswer: string[] }>;
  };
  candidate: { name: string; resumeClaims: Array<{ id: string; excerpt: string; category: string; materiality: string }> };
  job: { title: string; requiredSkills: string[]; responsibilities: string[] };
  answers: Array<{ id: string; questionId: string; text: string; source: string }>;
  evaluation?: {
    percentageScore: number;
    recommendation: string;
    needsHumanReview: boolean;
    humanReviewReasons: string[];
    competencyScores: Array<{ competency: string; score: number; evidenceQuote?: string; missingEvidence?: string; explanation: string }>;
    candidateFeedback: string;
  };
  consistencyFindings: Array<{ resumeExcerpt: string; classification: string; explanation: string; supportingAnswerExcerpts: string[] }>;
};

const sampleSetup = {
  candidateName: "Asha Rao",
  jobTitle: "Senior Platform Engineer",
  jobDescription: "This Senior Platform Engineer role requires Kubernetes, Node.js, production troubleshooting, incident communication, deployment ownership, and practical debugging ability across distributed services. The person should explain technical tradeoffs clearly and collaborate with product and operations teams.",
  resumeText: "Asha Rao\nSenior Platform Engineer\n6 years of experience building React and Node.js products.\nDeployed Kubernetes services in production and owned incident troubleshooting.\nImproved PostgreSQL query performance by 40% for customer reporting workflows.\nLed incident reviews and explained reliability tradeoffs to product stakeholders.",
  focusAreas: "Kubernetes, Node.js, production troubleshooting"
};

export default function Home() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploadingResume, setUploadingResume] = useState(false);
  const [setupError, setSetupError] = useState("");
  const [missingFields, setMissingFields] = useState<string[]>([]);
  const [statusMessage, setStatusMessage] = useState("");
  const [resumeExtract, setResumeExtract] = useState<{
    fileName: string;
    candidateName?: string;
    currentDesignation?: string;
    skills: string[];
    experience: string[];
    yearsMentioned: string[];
  } | null>(null);
  const [uploadError, setUploadError] = useState("");
  const [answer, setAnswer] = useState("");
  const [mode, setMode] = useState<"text" | "voice">("text");
  const [form, setForm] = useState({
    candidateName: "",
    jobTitle: "",
    jobDescription: "",
    resumeText: "",
    focusAreas: ""
  });

  async function loadSessions() {
    const response = await fetch("/api/interviews", { cache: "no-store" });
    const data = await response.json();
    setSessions(data.sessions ?? []);
    if (!detail && data.sessions?.[0]) await loadDetail(data.sessions[0].id);
  }

  async function loadDetail(id: string) {
    const response = await fetch(`/api/interviews/${id}`, { cache: "no-store" });
    if (response.ok) setDetail(await response.json());
  }

  useEffect(() => {
    void loadSessions();
    // Initial dashboard hydration only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const currentQuestion = useMemo(() => {
    if (!detail) return undefined;
    if (!detail.session.currentQuestionId) return undefined;
    return detail.plan.questions.find((question) => question.id === detail.session.currentQuestionId);
  }, [detail]);

  const progress = useMemo(() => {
    if (!detail) return 0;
    return Math.round((detail.session.askedQuestionIds.length / detail.plan.questions.length) * 100);
  }, [detail]);

  const dashboardStats = useMemo(() => {
    const completed = sessions.filter((session) => session.status === "completed").length;
    const pending = sessions.filter((session) => ["draft", "active", "paused"].includes(session.status)).length;
    const review = sessions.filter((session) => session.evaluation?.needsHumanReview).length;
    return {
      total: sessions.length,
      pending,
      completed,
      review
    };
  }, [sessions]);

  async function createInterview() {
    const missing = setupMissingFields(form);
    setMissingFields(missing);
    if (missing.length > 0) {
      setSetupError(`Complete these fields before generating a ${mode} interview plan: ${missing.join(", ")}.`);
      return;
    }
    setSetupError("");
    setStatusMessage(mode === "voice" ? "Generating a Murf Falcon voice interview plan..." : "Generating interview plan...");
    setBusy(true);
    let data: { session?: { id: string }; error?: string } = {};
    try {
      const response = await fetch("/api/interviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          mode,
          focusAreas: form.focusAreas.split(",").map((item) => item.trim()).filter(Boolean)
        })
      });
      data = await response.json();
      if (!response.ok) {
        setSetupError(data.error ?? "Interview plan generation failed.");
        return;
      }
      setStatusMessage("Interview plan generated.");
    } finally {
      setBusy(false);
    }
    await loadSessions();
    if (data.session?.id) await loadDetail(data.session.id);
  }

  function loadSampleSetup() {
    setForm(sampleSetup);
    setMissingFields([]);
    setSetupError("");
    setUploadError("");
    setResumeExtract({
      fileName: "Sample resume",
      candidateName: sampleSetup.candidateName,
      currentDesignation: sampleSetup.jobTitle,
      skills: ["React", "Node.js", "Kubernetes", "PostgreSQL"],
      experience: [
        "6 years of experience building React and Node.js products",
        "Deployed Kubernetes services in production and owned incident troubleshooting",
        "Improved PostgreSQL query performance by 40% for customer reporting workflows"
      ],
      yearsMentioned: ["6 years"]
    });
    setStatusMessage("Sample candidate loaded. Choose Text or Voice, then generate the plan.");
  }

  async function uploadResume(file?: File) {
    if (!file) return;
    setUploadingResume(true);
    setUploadError("");
    const payload = new FormData();
    payload.append("file", file);
    const response = await fetch("/api/documents/resume", {
      method: "POST",
      body: payload
    });
    const data = await response.json();
    setUploadingResume(false);
    if (!response.ok) {
      setUploadError(data.error ?? "Resume upload failed.");
      return;
    }
    setForm((current) => ({
      ...current,
      candidateName: current.candidateName || data.extracted.candidateName || "",
      jobTitle: current.jobTitle || data.extracted.currentDesignation || "",
      resumeText: data.text,
      focusAreas: mergeFocusAreas(current.focusAreas, data.extracted.skills)
    }));
    setResumeExtract({
      fileName: data.fileName,
      candidateName: data.extracted.candidateName,
      currentDesignation: data.extracted.currentDesignation,
      skills: data.extracted.skills,
      experience: data.extracted.experience,
      yearsMentioned: data.extracted.yearsMentioned
    });
    setStatusMessage("Resume extracted and setup fields updated.");
  }

  async function action(path: string, body: unknown = {}) {
    if (!detail) return;
    setStatusMessage("");
    setBusy(true);
    try {
      const response = await fetch(`/api/interviews/${detail.session.id}/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setStatusMessage(data.error ?? "Action failed. Please try again.");
        return;
      }
      setStatusMessage(messageForAction(path, body));
    } finally {
      setBusy(false);
    }
    await loadDetail(detail.session.id);
    await loadSessions();
  }

  async function submitAnswer() {
    if (!detail || !currentQuestion || !answer.trim()) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/interviews/${detail.session.id}/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId: currentQuestion.id, text: answer, source: detail.session.mode })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setStatusMessage(data.error ?? "Answer submission failed.");
        return;
      }
      setAnswer("");
      setStatusMessage("Answer saved. Next interview step is ready.");
    } finally {
      setBusy(false);
    }
    await loadDetail(detail.session.id);
    await loadSessions();
  }

  async function speak() {
    if (!currentQuestion) return;
    const response = await fetch("/api/voice/speak", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: currentQuestion.text })
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setStatusMessage(data.error ?? "Murf voice playback failed. Use text transcript fallback.");
      return;
    }
    const blob = await response.blob();
    const audio = new Audio(URL.createObjectURL(blob));
    await audio.play();
    setStatusMessage("Murf Falcon is speaking the current question.");
  }

  return (
    <main className="premium-shell min-h-screen">
      <header className="premium-header relative overflow-hidden border-b border-white/10 text-white">
        <div className="header-scan" />
        <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl">
            <div className="mb-2 inline-flex items-center gap-2 rounded border border-white/15 bg-white/10 px-2.5 py-1 text-xs font-medium text-white/85">
              <Bot className="h-3.5 w-3.5" />
              Powered by Axomir
            </div>
            <h1 className="text-3xl font-semibold tracking-normal">AI Interviewer UC2</h1>
            <p className="mt-1 text-sm text-white/65">Premium first-round screening with resume-aware planning, Murf Falcon voice, evidence scoring, and human review.</p>
          </div>
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 rounded border border-white/15 bg-white/10 px-3 py-2 text-sm text-white/75">
              <ShieldCheck className="h-4 w-4 text-[#9fd7cf]" />
              Advisory decisions only
            </div>
            <nav className="flex flex-wrap gap-2" aria-label="Workspace navigation">
              <NavLink href="#setup" icon={<ClipboardList className="h-4 w-4" />} label="Setup" />
              <NavLink href="#workspace" icon={<LayoutDashboard className="h-4 w-4" />} label="Workspace" />
              <NavLink href="#scorecard" icon={<Sparkles className="h-4 w-4" />} label="Scorecard" />
              <NavLink href="#history" icon={<History className="h-4 w-4" />} label="History" />
            </nav>
          </div>
        </div>
      </header>

      <section className="mx-auto grid max-w-7xl gap-3 px-4 pt-5 md:grid-cols-4">
        <StatCard label="Total sessions" value={dashboardStats.total} icon={<LayoutDashboard className="h-4 w-4" />} />
        <StatCard label="Pending" value={dashboardStats.pending} icon={<ClipboardList className="h-4 w-4" />} />
        <StatCard label="Completed" value={dashboardStats.completed} icon={<CheckCircle2 className="h-4 w-4" />} />
        <StatCard label="Human review" value={dashboardStats.review} icon={<ShieldCheck className="h-4 w-4" />} />
      </section>
      {statusMessage && (
        <div className="mx-auto max-w-7xl px-4 pt-3">
          <div className="animate-rise rounded-md border border-teal/25 bg-white/90 px-4 py-3 text-sm text-ink shadow-sm backdrop-blur">
            {statusMessage}
          </div>
        </div>
      )}

      <div className="mx-auto grid max-w-7xl gap-5 px-4 py-5 lg:grid-cols-[400px_1fr]">
        <aside className="space-y-5">
          <section id="setup" className="premium-panel animate-rise rounded-lg p-4">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-medium uppercase text-teal">Step 1</p>
                <h2 className="font-semibold">Create Interview</h2>
              </div>
              <button className="focus-ring micro-button inline-flex items-center gap-1 rounded-md border border-ink/10 px-2 py-1 text-xs text-ink/70 hover:border-teal" onClick={loadSampleSetup} disabled={busy || uploadingResume}>
                <Plus className="h-3.5 w-3.5 text-teal" />
                Load sample
              </button>
            </div>
            <div className="space-y-3">
              <LabeledInput label="Candidate name" missing={missingFields.includes("candidate name")}>
                <input className={fieldClass(missingFields.includes("candidate name"))} placeholder="Candidate name, or upload resume to extract" value={form.candidateName} onChange={(event) => setForm({ ...form, candidateName: event.target.value })} aria-label="Candidate name" />
              </LabeledInput>
              <LabeledInput label="Target role" missing={missingFields.includes("target role")}>
                <input className={fieldClass(missingFields.includes("target role"))} placeholder="Target role or extracted designation" value={form.jobTitle} onChange={(event) => setForm({ ...form, jobTitle: event.target.value })} aria-label="Job title" />
              </LabeledInput>
              <LabeledInput label="Job description" missing={missingFields.includes("job description")}>
                <textarea className={`${fieldClass(missingFields.includes("job description"))} min-h-28`} placeholder="Paste the job description. The plan will map resume evidence against these requirements." value={form.jobDescription} onChange={(event) => setForm({ ...form, jobDescription: event.target.value })} aria-label="Job description" />
              </LabeledInput>
              <label className="focus-ring upload-zone flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-teal/40 px-3 py-3 text-sm font-medium text-ink hover:border-teal">
                <Upload className="h-4 w-4" />
                {uploadingResume ? "Extracting resume..." : "Upload resume PDF, DOCX, TXT"}
                <input
                  className="sr-only"
                  type="file"
                  accept=".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown"
                  disabled={uploadingResume || busy}
                  onChange={(event) => void uploadResume(event.target.files?.[0])}
                />
              </label>
              {uploadError && <p className="rounded-md border border-ember/30 bg-ember/10 px-3 py-2 text-sm text-ember">{uploadError}</p>}
              {resumeExtract && (
                <div className="rounded-md border border-ink/10 bg-paper p-3 text-sm">
                  <p className="font-medium">{resumeExtract.fileName}</p>
                  <div className="mt-2 grid gap-2 rounded-md bg-white p-2">
                    <p className="text-ink/75">Name: {resumeExtract.candidateName ?? "Not confidently detected"}</p>
                    <p className="text-ink/75">Designation: {resumeExtract.currentDesignation ?? "Not confidently detected"}</p>
                  </div>
                  <p className="mt-2 text-ink/65">Skills: {resumeExtract.skills.length ? resumeExtract.skills.join(", ") : "No known skills detected yet"}</p>
                  {resumeExtract.yearsMentioned.length > 0 && <p className="mt-1 text-ink/65">Experience mentions: {resumeExtract.yearsMentioned.join(", ")}</p>}
                  {resumeExtract.experience.length > 0 && (
                    <details className="mt-2">
                      <summary className="cursor-pointer font-medium">Extracted experience</summary>
                      <div className="mt-2 space-y-1">
                        {resumeExtract.experience.slice(0, 4).map((item) => (
                          <p key={item} className="text-ink/70">{item}</p>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              )}
              <LabeledInput label="Resume text" missing={missingFields.includes("resume text")}>
                <textarea className={`${fieldClass(missingFields.includes("resume text"))} min-h-32`} placeholder="Extracted resume text appears here. You can also paste the resume manually." value={form.resumeText} onChange={(event) => setForm({ ...form, resumeText: event.target.value })} aria-label="Resume text" />
              </LabeledInput>
              <input className="focus-ring w-full rounded-md border border-ink/15 px-3 py-2" placeholder="Optional focus areas, comma separated" value={form.focusAreas} onChange={(event) => setForm({ ...form, focusAreas: event.target.value })} aria-label="Focus areas" />
              <div className="grid grid-cols-2 rounded-md border border-ink/15 p-1">
                {(["text", "voice"] as const).map((item) => (
                  <button key={item} onClick={() => setMode(item)} className={`focus-ring rounded px-3 py-2 text-sm ${mode === item ? "bg-ink text-white" : "text-ink/70"}`}>
                    {item === "text" ? "Text" : "Voice"}
                  </button>
                ))}
              </div>
              {mode === "voice" && (
                <div className="voice-panel rounded-md border border-teal/25 p-3 text-sm">
                  <div className="flex items-center gap-2 font-medium text-ink">
                    <Headphones className="h-4 w-4 text-teal" />
                    Murf Falcon interviewer voice
                  </div>
                  <VoiceWave />
                  <p className="mt-1 text-ink/65">Voice ID Pearl, Conversational style. Candidate answers can still be typed as transcript fallback.</p>
                </div>
              )}
              {setupError && <p className="rounded-md border border-ember/30 bg-ember/10 px-3 py-2 text-sm text-ember">{setupError}</p>}
              <button disabled={busy} onClick={createInterview} className="focus-ring premium-button flex w-full items-center justify-center gap-2 rounded-md px-4 py-2.5 font-medium text-white disabled:opacity-60">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                {busy ? "Generating..." : `Generate ${mode === "voice" ? "Voice" : "Text"} Plan`}
              </button>
            </div>
          </section>

          <section id="history" className="premium-panel rounded-lg p-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="text-xs font-medium uppercase text-teal">Recent</p>
                <h2 className="font-semibold">Interview History</h2>
              </div>
              <button className="focus-ring rounded p-1" onClick={loadSessions} aria-label="Refresh sessions"><RefreshCw className="h-4 w-4" /></button>
            </div>
            <div className="space-y-2">
              {sessions.length === 0 && <p className="text-sm text-ink/60">No interviews yet.</p>}
              {sessions.map((session) => (
                <button key={session.id} onClick={() => loadDetail(session.id)} className="focus-ring premium-list-item w-full rounded-md border border-ink/10 p-3 text-left hover:border-teal">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{session.candidate?.name ?? "Candidate"}</span>
                    <span className="rounded bg-paper px-2 py-1 text-xs">{session.status}</span>
                  </div>
                  <p className="mt-1 text-sm text-ink/60">{session.job?.title ?? "Role"}</p>
                  {session.evaluation && <p className="mt-2 text-sm">{session.evaluation.percentageScore}% / {session.evaluation.recommendation}</p>}
                </button>
              ))}
            </div>
          </section>
        </aside>

        <section id="workspace" className="space-y-5">
          {!detail && <EmptyState />}
          {detail && (
            <>
              <div className="premium-panel rounded-lg p-5">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-md bg-[#111820] text-white">
                      <UserRound className="h-5 w-5" />
                    </div>
                    <div>
                    <h2 className="text-xl font-semibold">{detail.candidate.name}</h2>
                    <p className="text-sm text-ink/60">{detail.job.title} / {detail.session.mode} interview / {detail.plan.status} plan</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button className="focus-ring micro-button rounded-md border border-ink/15 px-3 py-2 text-sm transition hover:border-teal disabled:opacity-50" onClick={() => action("approve-plan")} disabled={busy || detail.plan.status === "frozen"}><Play className="mr-1 inline h-4 w-4" />Approve</button>
                    <button className="focus-ring micro-button rounded-md border border-ink/15 px-3 py-2 text-sm transition hover:border-teal disabled:opacity-50" onClick={() => action("control", { action: "pause" })} disabled={busy || detail.session.status === "paused" || detail.session.status === "completed" || detail.session.status === "ended"}><Pause className="mr-1 inline h-4 w-4" />Pause</button>
                    <button className="focus-ring micro-button rounded-md border border-ink/15 px-3 py-2 text-sm transition hover:border-teal disabled:opacity-50" onClick={() => action("control", { action: "resume" })} disabled={busy || detail.session.status === "active" || detail.session.status === "completed" || detail.session.status === "ended"}><Play className="mr-1 inline h-4 w-4" />Resume</button>
                    <button className="focus-ring rounded-md border border-ember px-3 py-2 text-sm text-ember transition hover:bg-ember/10 disabled:opacity-50" onClick={() => action("control", { action: "end", reason: "Recruiter ended interview" })} disabled={busy || detail.session.status === "completed" || detail.session.status === "ended"}><Square className="mr-1 inline h-4 w-4" />End</button>
                  </div>
                </div>
                <div className="mt-4 h-2 rounded-full bg-paper">
                  <div className="h-2 rounded-full bg-teal" style={{ width: `${progress}%` }} />
                </div>
              </div>

              <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
                <section className="premium-panel rounded-lg p-5">
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium uppercase text-teal">Live room</p>
                      <h3 className="font-semibold">{detail.session.mode === "voice" ? "Voice Interview Room" : "Text Interview Room"}</h3>
                    </div>
                    {detail.session.mode === "voice" && (
                      <button className="focus-ring premium-button rounded-md border border-ink/15 px-3 py-2 text-sm text-white disabled:opacity-50" onClick={speak} disabled={busy || !currentQuestion}>
                        <Volume2 className="mr-1 inline h-4 w-4" />Speak
                      </button>
                    )}
                  </div>
                  {detail.session.mode === "voice" && (
                    <div className="voice-panel mb-4 grid gap-2 rounded-md p-3 text-sm md:grid-cols-3">
                      <span><Volume2 className="mr-1 inline h-4 w-4 text-teal" />Murf Falcon interviewer</span>
                      <span><Mic className="mr-1 inline h-4 w-4 text-teal" />Transcript fallback</span>
                      <span>Consent: {detail.session.consentStatus}</span>
                    </div>
                  )}
                  {currentQuestion ? (
                    <div className="space-y-4">
                      <div className="question-card rounded-md border border-ink/10 p-5">
                        <p className="text-xs uppercase tracking-wide text-ink/50">{currentQuestion.competency} / difficulty {currentQuestion.difficulty}</p>
                        <p className="mt-2 text-lg font-medium leading-7">{currentQuestion.text}</p>
                      </div>
                      <textarea className="focus-ring min-h-36 w-full rounded-md border border-ink/15 px-3 py-2" placeholder="Candidate answer or finalized transcript" value={answer} onChange={(event) => setAnswer(event.target.value)} />
                      <div className="flex flex-wrap gap-2">
                        <button className="focus-ring premium-button rounded-md px-4 py-2 text-white disabled:opacity-60" onClick={submitAnswer} disabled={busy || !answer.trim()}>{busy ? <Loader2 className="mr-1 inline h-4 w-4 animate-spin" /> : <Send className="mr-1 inline h-4 w-4" />}Submit Answer</button>
                        <button className="focus-ring rounded-md border border-ink/15 px-4 py-2 disabled:opacity-50" onClick={() => action("control", { action: "skip", reason: "Recruiter skipped question" })} disabled={busy}>Skip</button>
                        <button className="focus-ring rounded-md border border-ink/15 px-4 py-2" onClick={() => setAnswer("")}>Clear</button>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-md bg-paper p-5">
                      <CheckCircle2 className="mb-2 h-6 w-6 text-teal" />
                      <p className="font-medium">The planned interview is complete.</p>
                      <button className="focus-ring mt-3 rounded-md bg-teal px-4 py-2 text-white" onClick={() => action("evaluate")}>Generate Scorecard</button>
                    </div>
                  )}
                </section>

                <aside className="space-y-5">
                  <Panel title="Plan Editor">
                    <div className="space-y-2">
                      {detail.plan.questions.map((question, index) => (
                        <div key={question.id} className="rounded-md border border-ink/10 p-3">
                          <p className="text-xs text-ink/50">Q{index + 1} / {question.competency}</p>
                          <p className="mt-1 text-sm">{question.text}</p>
                        </div>
                      ))}
                    </div>
                  </Panel>
                  <Panel title="Resume Claims">
                    <div className="space-y-2">
                      {detail.candidate.resumeClaims.map((claim) => (
                        <div key={claim.id} className="rounded-md bg-paper p-3 text-sm">
                          <p className="font-medium">{claim.category} / {claim.materiality}</p>
                          <p className="mt-1 text-ink/70">{claim.excerpt}</p>
                        </div>
                      ))}
                    </div>
                  </Panel>
                </aside>
              </div>

              <div id="scorecard">
                <Scorecard detail={detail} onEvaluate={() => action("evaluate")} />
              </div>
            </>
          )}
        </section>
      </div>
      <footer className="border-t border-ink/10 bg-white px-4 py-4 text-center text-sm text-ink/55">
        Powered by Axomir / copyright@2026
      </footer>
    </main>
  );
}

function EmptyState() {
  return (
    <div className="premium-panel animate-rise rounded-lg p-8">
      <div className="max-w-2xl">
        <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-md bg-[#111820] text-white">
          <BriefcaseBusiness className="h-5 w-5" />
        </div>
        <h2 className="text-2xl font-semibold">Build a tailored first-round interview</h2>
        <p className="mt-2 text-sm leading-6 text-ink/65">Upload a resume, paste the job description, choose text or Murf Falcon voice mode, and generate an interview plan grounded in the candidate&apos;s actual experience.</p>
      </div>
      <div className="mt-6 grid gap-3 md:grid-cols-3">
        <WorkflowStep icon={<Upload className="h-4 w-4" />} title="Resume-aware" text="Extracts name, role, skills, claims, and experience." />
        <WorkflowStep icon={<ClipboardList className="h-4 w-4" />} title="Editable plan" text="Creates 8 evidence-led questions before the session starts." />
        <WorkflowStep icon={<Volume2 className="h-4 w-4" />} title="Voice-ready" text="Uses Murf Falcon for the interviewer voice with text fallback." />
      </div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="premium-panel rounded-lg p-4">
      <h3 className="mb-3 font-semibold">{title}</h3>
      {children}
    </section>
  );
}

function Scorecard({ detail, onEvaluate }: { detail: Detail; onEvaluate: () => void }) {
  return (
    <section className="premium-panel rounded-lg p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-semibold">Scorecard and Human Review</h3>
        <button className="focus-ring rounded-md bg-teal px-4 py-2 text-white" onClick={onEvaluate}>Generate Scorecard</button>
      </div>
      {!detail.evaluation && <p className="text-sm text-ink/60">No scorecard generated yet.</p>}
      {detail.evaluation && (
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <Metric label="Overall" value={`${detail.evaluation.percentageScore}%`} />
            <Metric label="Recommendation" value={detail.evaluation.recommendation} />
            <Metric label="Human Review" value={detail.evaluation.needsHumanReview ? "Required" : "Not flagged"} />
          </div>
          {detail.evaluation.needsHumanReview && (
            <div className="rounded-md border border-ember/30 bg-ember/10 p-3 text-sm">
              <AlertTriangle className="mr-1 inline h-4 w-4 text-ember" />
              {detail.evaluation.humanReviewReasons.join(" ")}
            </div>
          )}
          <div className="grid gap-3 md:grid-cols-2">
            {detail.evaluation.competencyScores.map((score) => (
              <details key={score.competency} className="rounded-md border border-ink/10 p-3">
                <summary className="cursor-pointer font-medium">{score.competency}: {score.score}/5</summary>
                <p className="mt-2 text-sm text-ink/70">{score.explanation}</p>
                <p className="mt-2 text-sm">{score.evidenceQuote ?? score.missingEvidence}</p>
              </details>
            ))}
          </div>
          <Panel title="Consistency Findings">
            <div className="space-y-2">
              {detail.consistencyFindings.map((finding, index) => (
                <details key={`${finding.resumeExcerpt}-${index}`} className="rounded-md border border-ink/10 p-3">
                  <summary className="cursor-pointer font-medium">{finding.classification}</summary>
                  <p className="mt-2 text-sm text-ink/70">{finding.resumeExcerpt}</p>
                  <p className="mt-2 text-sm">{finding.explanation}</p>
                </details>
              ))}
            </div>
          </Panel>
          <Panel title="Candidate Feedback Preview">
            <p className="text-sm text-ink/70">{detail.evaluation.candidateFeedback}</p>
          </Panel>
        </div>
      )}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric-tile rounded-md p-4">
      <p className="text-xs uppercase tracking-wide text-ink/50">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
    </div>
  );
}

function NavLink({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <a className="focus-ring inline-flex items-center gap-2 rounded border border-white/15 bg-white/10 px-3 py-2 text-sm text-white/80 transition hover:bg-white/15 hover:text-white" href={href}>
      {icon}
      {label}
    </a>
  );
}

function StatCard({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <div className="premium-stat animate-rise rounded-lg p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-ink/60">{label}</p>
        <span className="flex h-8 w-8 items-center justify-center rounded-md bg-[#edf7f6] text-teal">{icon}</span>
      </div>
      <p className="mt-3 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function WorkflowStep({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="workflow-card rounded-md border border-ink/10 p-4">
      <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-md bg-white text-teal shadow-sm">{icon}</div>
      <h3 className="font-medium">{title}</h3>
      <p className="mt-1 text-sm leading-5 text-ink/60">{text}</p>
    </div>
  );
}

function VoiceWave() {
  return (
    <div className="voice-wave mt-3" aria-hidden="true">
      {Array.from({ length: 18 }).map((_, index) => (
        <span key={index} style={{ animationDelay: `${index * 70}ms` }} />
      ))}
    </div>
  );
}

function LabeledInput({ label, missing, children }: { label: string; missing: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className={`mb-1 block text-xs font-medium ${missing ? "text-ember" : "text-ink/55"}`}>{label}</span>
      {children}
    </label>
  );
}

function fieldClass(missing: boolean) {
  return `focus-ring w-full rounded-md border px-3 py-2 transition ${missing ? "border-ember bg-ember/5" : "border-ink/15 bg-white"}`;
}

function setupMissingFields(current: typeof sampleSetup) {
  const missing: string[] = [];
  if (!current.candidateName.trim()) missing.push("candidate name");
  if (!current.jobTitle.trim()) missing.push("target role");
  if (current.jobDescription.trim().length < 50) missing.push("job description");
  if (current.resumeText.trim().length < 50) missing.push("resume text");
  return missing;
}

function messageForAction(path: string, body: unknown) {
  if (path === "approve-plan") return "Plan approved. The interview is active.";
  if (path === "evaluate") return "Scorecard generated with human-review guidance.";
  if (path === "control" && typeof body === "object" && body && "action" in body) {
    const controlAction = String((body as { action: unknown }).action);
    if (controlAction === "pause") return "Interview paused.";
    if (controlAction === "resume") return "Interview resumed.";
    if (controlAction === "end") return "Interview ended. You can generate a scorecard for review.";
    if (controlAction === "skip") return "Question skipped.";
  }
  return "Action completed.";
}

function mergeFocusAreas(current: string, skills: string[]) {
  const existing = current.split(",").map((item) => item.trim()).filter(Boolean);
  const merged = [...existing];
  for (const skill of skills.slice(0, 6)) {
    if (!merged.some((item) => item.toLowerCase() === skill.toLowerCase())) merged.push(skill);
  }
  return merged.join(", ");
}
