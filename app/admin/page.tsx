"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ClipboardList, FileText, Loader2, Mail, RefreshCw, Search, Send, ShieldCheck, Upload, XCircle } from "lucide-react";

type AdminSession = {
  id: string;
  status: string;
  mode: "text" | "voice";
  createdAt: string;
  completedAt?: string;
  reviewDecision?: "pending" | "approved" | "rejected";
  reviewNotes?: string;
  reviewedAt?: string;
  candidate?: { name: string };
  job?: { title: string };
  evaluation?: { percentageScore: number; recommendation: string; needsHumanReview: boolean; humanReviewReasons: string[]; confidence?: "low" | "medium" | "high" };
};

type AdminDetail = {
  session: AdminSession & { askedQuestionIds: string[] };
  candidate: { name: string; resumeText?: string };
  job: { title: string };
  plan: { questions: Array<{ id: string; text: string; competency: string; priorityRank?: number }> };
  answers: Array<{ id: string; questionId: string; text: string; createdAt: string }>;
  evaluation?: AdminSession["evaluation"] & { candidateFeedback: string };
  proctorEvents: Array<{ id: string; type: string; note: string; status?: string; severity: string; createdAt: string; durationMs?: number; confidence?: number; measuredValue?: number; measurementLabel?: string }>;
};

type Uc1Candidate = {
  id: string;
  name: string;
  resumeText: string;
  fileName?: string;
  fitScore: number;
  matchedSkills: string[];
  missingSkills: string[];
  recommendation: "Shortlist" | "Review" | "Reject";
  status: "screened" | "shortlisted" | "sent" | "rejected";
  sentSessionId?: string;
  createdAt: string;
};

export default function AdminPage() {
  const [sessions, setSessions] = useState<AdminSession[]>([]);
  const [detail, setDetail] = useState<AdminDetail | null>(null);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [filter, setFilter] = useState<"all" | "pending" | "approved" | "rejected">("all");
  const [search, setSearch] = useState("");

  async function loadSessions(preferredId = selectedId || detail?.session.id || "") {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/interviews", { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error ?? "Admin history could not be loaded.");
        setSessions([]);
        setDetail(null);
        return;
      }
      const nextSessions: AdminSession[] = data.sessions ?? [];
      setSessions(nextSessions);
      const nextId = nextSessions.some((session) => session.id === preferredId) ? preferredId : nextSessions[0]?.id ?? "";
      if (nextId) {
        await loadDetail(nextId);
      } else {
        setDetail(null);
        setNotes("");
        setSelectedId("");
      }
    } finally {
      setLoading(false);
    }
  }

  async function loadDetail(id: string) {
    setSelectedId(id);
    setError("");
    const response = await fetch(`/api/interviews/${id}`, { cache: "no-store" });
    if (!response.ok) {
      setError("Selected candidate details could not be loaded.");
      return;
    }
    const next = await response.json();
    setDetail(next);
    setNotes(next.session.reviewNotes ?? "");
  }

  useEffect(() => {
    void loadSessions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const counts = useMemo(() => ({
    pending: sessions.filter((session) => (session.reviewDecision ?? "pending") === "pending").length,
    approved: sessions.filter((session) => session.reviewDecision === "approved").length,
    rejected: sessions.filter((session) => session.reviewDecision === "rejected").length
  }), [sessions]);

  const selectedMailHref = detail ? buildInPersonInterviewMail(detail) : "";

  const filteredSessions = useMemo(() => {
    const query = search.trim().toLowerCase();
    return sessions.filter((session) => {
      const decision = session.reviewDecision ?? "pending";
      if (filter !== "all" && decision !== filter) return false;
      if (!query) return true;
      return [
        session.candidate?.name,
        session.job?.title,
        session.status,
        decision,
        session.evaluation?.recommendation
      ].filter(Boolean).some((value) => String(value).toLowerCase().includes(query));
    });
  }, [filter, search, sessions]);

  async function review(decision: "approved" | "rejected" | "pending") {
    if (!detail) return;
    setBusy(true);
    setMessage("Saving admin decision...");
    try {
      const response = await fetch(`/api/interviews/${detail.session.id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, notes })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(data.error ?? "Review decision failed.");
        return;
      }
      await loadDetail(detail.session.id);
      await loadSessions(detail.session.id);
      setMessage(`Candidate marked ${decision}.`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="premium-shell min-h-screen">
      <header className="premium-header relative overflow-hidden border-b border-white/10 text-white">
        <div className="header-scan" />
        <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="logo-frame">
              <Image src="/axomir-logo.jpeg" alt="Axomir logo" width={72} height={72} className="h-full w-full object-contain" priority />
            </div>
            <div>
              <div className="inline-flex items-center rounded border border-white/15 bg-white/10 px-2.5 py-1 text-xs font-medium text-white/85">Powered by Axomir</div>
              <h1 className="mt-2 text-3xl font-semibold tracking-normal">Admin Review</h1>
              <p className="mt-1 text-sm text-white/60">Approve or reject real interview participants after human review.</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link className="focus-ring rounded border border-white/15 bg-white/10 px-3 py-2 text-sm text-white/80 hover:bg-white/15" href="/">Interview</Link>
            <button type="button" className="focus-ring rounded border border-white/15 bg-white/10 px-3 py-2 text-sm text-white/80 hover:bg-white/15" onClick={() => void loadSessions()}>
              <RefreshCw className="mr-1 inline h-4 w-4" />Refresh
            </button>
          </div>
        </div>
      </header>

      <section className="mx-auto grid max-w-7xl gap-3 px-4 pt-5 md:grid-cols-3">
        <AdminStat label="Pending" value={counts.pending} icon={<ClipboardList className="h-4 w-4" />} />
        <AdminStat label="Approved" value={counts.approved} icon={<CheckCircle2 className="h-4 w-4" />} />
        <AdminStat label="Rejected" value={counts.rejected} icon={<XCircle className="h-4 w-4" />} />
      </section>

      {message && <div className="mx-auto max-w-7xl px-4 pt-3"><div className="rounded-md border border-teal/25 bg-white/90 px-4 py-3 text-sm text-ink shadow-sm">{message}</div></div>}
      {error && <div className="mx-auto max-w-7xl px-4 pt-3"><div className="rounded-md border border-ember/30 bg-ember/10 px-4 py-3 text-sm text-ember shadow-sm">{error}</div></div>}

      <section className="mx-auto max-w-7xl px-4 pt-5">
        <Uc1ShortlistPanel onInterviewCreated={async (sessionId) => {
          await loadSessions(sessionId);
          setMessage("UC1 shortlisted candidate sent to Axomir UC2 interview.");
        }} />
      </section>

      <div className="mx-auto grid max-w-7xl gap-5 px-4 py-5 lg:grid-cols-[360px_1fr]">
        <aside className="premium-panel rounded-lg p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase text-teal">Admin History</p>
              <h2 className="font-semibold">Candidate Review Queue</h2>
            </div>
            {loading ? <Loader2 className="h-4 w-4 animate-spin text-teal" /> : null}
          </div>
          <div className="mb-3 rounded-md border border-ink/10 bg-white px-3 py-2">
            <label className="flex items-center gap-2 text-sm text-ink/55">
              <Search className="h-4 w-4 text-teal" />
              <input className="focus-ring min-w-0 flex-1 border-0 bg-transparent outline-none" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search candidate or role" />
            </label>
          </div>
          <div className="mb-3 grid grid-cols-4 gap-1 rounded-md bg-paper p-1 text-xs">
            {(["all", "pending", "approved", "rejected"] as const).map((item) => (
              <button key={item} type="button" className={`focus-ring rounded px-2 py-1.5 capitalize transition ${filter === item ? "bg-white font-semibold text-teal shadow-sm" : "text-ink/55 hover:text-ink"}`} onClick={() => setFilter(item)}>
                {item}
              </button>
            ))}
          </div>
          <div className="space-y-2">
            {!loading && sessions.length === 0 ? <p className="rounded-md border border-ink/10 bg-white/70 p-3 text-sm text-ink/60">No interview history yet. Completed interviews will appear here for admin review.</p> : null}
            {!loading && sessions.length > 0 && filteredSessions.length === 0 ? <p className="rounded-md border border-ink/10 bg-white/70 p-3 text-sm text-ink/60">No candidates match this search or filter.</p> : null}
            {filteredSessions.map((session) => (
              <button key={session.id} type="button" className={`premium-list-item focus-ring w-full rounded-md border p-3 text-left hover:border-teal ${selectedId === session.id ? "border-teal bg-teal/10" : "border-ink/10"}`} onClick={() => void loadDetail(session.id)}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{session.candidate?.name ?? "Candidate"}</span>
                  <DecisionBadge decision={session.reviewDecision ?? "pending"} />
                </div>
                <p className="mt-1 text-sm text-ink/60">{session.job?.title ?? "Role"} / {session.status}</p>
                {session.evaluation ? <p className="mt-2 text-sm">{session.evaluation.percentageScore}% / {session.evaluation.recommendation}</p> : null}
                <p className="mt-2 text-xs text-ink/40">{new Date(session.createdAt).toLocaleString()}</p>
              </button>
            ))}
          </div>
        </aside>

        <section className="space-y-5">
          {!detail ? (
            <div className="premium-panel rounded-lg p-8 text-sm text-ink/65">Select an interview to review.</div>
          ) : (
            <>
              <div className="premium-panel rounded-lg p-5">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="text-xs font-medium uppercase text-teal">Candidate</p>
                    <h2 className="text-2xl font-semibold">{detail.candidate.name}</h2>
                    <p className="mt-1 text-sm text-ink/60">{detail.job.title} / {detail.session.status} / {detail.session.mode}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-ink/50">
                      <DecisionBadge decision={detail.session.reviewDecision ?? "pending"} />
                      {detail.session.reviewedAt ? <span>Reviewed {new Date(detail.session.reviewedAt).toLocaleString()}</span> : <span>Awaiting admin decision</span>}
                    </div>
                  </div>
                  <div className="grid min-w-60 grid-cols-3 gap-2">
                    <button type="button" className="focus-ring rounded-md bg-teal px-4 py-2 text-white disabled:opacity-50" disabled={busy} onClick={() => void review("approved")}>
                      {busy ? <Loader2 className="mr-1 inline h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-1 inline h-4 w-4" />}Approve
                    </button>
                    <button type="button" className="focus-ring rounded-md border border-ember px-4 py-2 text-ember disabled:opacity-50" disabled={busy} onClick={() => void review("rejected")}>
                      <XCircle className="mr-1 inline h-4 w-4" />Reject
                    </button>
                    <button type="button" className="focus-ring rounded-md border border-ink/15 px-4 py-2 text-ink/70 disabled:opacity-50" disabled={busy} onClick={() => void review("pending")}>
                      Pending
                    </button>
                  </div>
                </div>
                <textarea className="focus-ring mt-4 min-h-24 w-full rounded-md border border-ink/15 px-3 py-2" placeholder="Reviewer notes" value={notes} onChange={(event) => setNotes(event.target.value)} />
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs leading-5 text-ink/50">Integrity signals and scores are review aids only. Final approval or rejection must be decided by the reviewer.</p>
                  <a className="focus-ring inline-flex items-center gap-2 rounded-md border border-teal/25 px-3 py-2 text-sm font-medium text-teal transition hover:bg-teal/10" href={selectedMailHref}>
                    <Mail className="h-4 w-4" />
                    Mail in-person interview
                  </a>
                </div>
              </div>

              <div className="grid gap-5 xl:grid-cols-2">
                <ReviewPanel title="Scorecard">
                  {detail.evaluation ? (
                    <div className="space-y-3 text-sm">
                      <AdminMetric label="Overall" value={`${detail.evaluation.percentageScore}%`} />
                      <AdminMetric label="Recommendation" value={detail.evaluation.recommendation} />
                      <AdminMetric label="Human Review" value={detail.evaluation.needsHumanReview ? "Required" : "Not flagged"} />
                      <AdminMetric label="Confidence" value={detail.evaluation.confidence ?? "medium"} />
                      {(detail.evaluation.confidence === "low" || detail.evaluation.needsHumanReview) ? (
                        <div className="rounded-md border border-amber-300/70 bg-amber-50 p-3 text-sm text-ink/72">
                          <p className="font-semibold text-amber-800">Admin review detail</p>
                          <p className="mt-1 leading-6">{detail.evaluation.humanReviewReasons?.join(" ") || "This scorecard should be reviewed by an admin before any decision."}</p>
                          {detail.evaluation.confidence === "low" ? <p className="mt-1 leading-6">Confidence is low. Consider using the mail button above to schedule an in-person interview.</p> : null}
                        </div>
                      ) : null}
                      <p className="leading-6 text-ink/70">{detail.evaluation.candidateFeedback}</p>
                    </div>
                  ) : <p className="text-sm text-ink/60">No scorecard generated yet.</p>}
                </ReviewPanel>
                <ReviewPanel title="Integrity Timeline">
                  {detail.proctorEvents.length === 0 ? <p className="text-sm text-ink/60">No integrity events recorded.</p> : (
                    <div className="max-h-80 space-y-2 overflow-auto pr-1">
                      {detail.proctorEvents.slice().reverse().map((event) => (
                        <div key={event.id} className="rounded-md border border-ink/10 bg-white/70 p-3 text-xs">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium">{event.type.replaceAll("_", " ")}</span>
                            <span className={event.status === "needs_review" ? "text-ember" : "text-ink/45"}>{event.status ?? event.severity}</span>
                          </div>
                          <p className="mt-1 text-ink/60">{new Date(event.createdAt).toLocaleString()} / {event.durationMs ? `${(event.durationMs / 1000).toFixed(1)} sec` : "instant"} / {typeof event.confidence === "number" ? `${Math.round(event.confidence * 100)}% confidence` : "confidence n/a"}</p>
                          {typeof event.measuredValue === "number" ? <p className="mt-1 text-ink/55">{event.measurementLabel ?? "Measurement"}: {event.measuredValue}</p> : null}
                          <p className="mt-1 text-ink/70">{event.note}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </ReviewPanel>
              </div>

              <ReviewPanel title="Answers">
                {detail.answers.length === 0 ? <p className="text-sm text-ink/60">No answers submitted.</p> : (
                  <div className="space-y-3">
                    {detail.answers.map((answer) => {
                      const question = detail.plan.questions.find((item) => item.id === answer.questionId);
                      return (
                        <details key={answer.id} className="rounded-md border border-ink/10 bg-white/70 p-3">
                          <summary className="cursor-pointer text-sm font-medium">{question?.priorityRank ? `P${question.priorityRank} / ` : ""}{question?.competency ?? "Question"}</summary>
                          <p className="mt-2 text-sm text-ink/60">{question?.text}</p>
                          <p className="mt-2 text-sm leading-6 text-ink/75">{answer.text}</p>
                        </details>
                      );
                    })}
                  </div>
                )}
              </ReviewPanel>
            </>
          )}
        </section>
      </div>
    </main>
  );
}

function Uc1ShortlistPanel({ onInterviewCreated }: { onInterviewCreated: (sessionId: string) => Promise<void> | void }) {
  const [jobTitle, setJobTitle] = useState("Python Developer");
  const [jobDescription, setJobDescription] = useState("Python Developer role requiring Python programming, SQL databases, REST APIs, debugging, testing, Git, teamwork, and clear communication for production software projects.");
  const [requiredSkills, setRequiredSkills] = useState("Python, SQL, REST APIs, Git, Debugging, Testing");
  const [candidateName, setCandidateName] = useState("");
  const [resumeText, setResumeText] = useState("");
  const [resumeFileName, setResumeFileName] = useState("");
  const [candidates, setCandidates] = useState<Uc1Candidate[]>([]);
  const [uc1Busy, setUc1Busy] = useState(false);
  const [uc1Message, setUc1Message] = useState("");

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("axomirUc1Shortlist");
      if (saved) setCandidates(JSON.parse(saved));
    } catch {
      setCandidates([]);
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem("axomirUc1Shortlist", JSON.stringify(candidates));
    } catch {
      // Local storage is a convenience for demo history only.
    }
  }, [candidates]);

  async function uploadResume(file?: File | null) {
    if (!file) return;
    setUc1Busy(true);
    setUc1Message("Extracting resume for UC1 screening...");
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch("/api/documents/resume", { method: "POST", body: form });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setUc1Message(data.error ?? "Resume extraction failed.");
        return;
      }
      setResumeFileName(data.fileName ?? file.name);
      setResumeText(data.text ?? "");
      if (data.extracted?.candidateName) setCandidateName(data.extracted.candidateName);
      setUc1Message("Resume extracted. Review the name and screen the candidate.");
    } finally {
      setUc1Busy(false);
    }
  }

  function screenCandidate() {
    const name = candidateName.trim();
    const resume = resumeText.trim();
    if (!name || resume.length < 40) {
      setUc1Message("Add a candidate name and resume text before screening.");
      return;
    }
    const fit = scoreCandidateFit(jobDescription, requiredSkills, resume);
    const candidate: Uc1Candidate = {
      id: newId("uc1-candidate"),
      name,
      resumeText: resume,
      fileName: resumeFileName || undefined,
      fitScore: fit.fitScore,
      matchedSkills: fit.matchedSkills,
      missingSkills: fit.missingSkills,
      recommendation: fit.recommendation,
      status: fit.recommendation === "Shortlist" ? "shortlisted" : "screened",
      createdAt: new Date().toISOString()
    };
    setCandidates((current) => [candidate, ...current]);
    setUc1Message(`${name} screened with ${fit.fitScore}% fit. ${fit.recommendation === "Shortlist" ? "Ready to send to Axomir UC2." : "Review before sending."}`);
    setCandidateName("");
    setResumeText("");
    setResumeFileName("");
  }

  async function sendToInterview(candidate: Uc1Candidate) {
    if (jobDescription.trim().length < 50) {
      setUc1Message("Add a fuller job description before sending to UC2.");
      return;
    }
    setUc1Busy(true);
    setUc1Message(`Sending ${candidate.name} to Axomir UC2 interview...`);
    try {
      const response = await fetch("/api/uc1/handoff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidateId: candidate.id,
          candidateName: candidate.name,
          jobId: newId("uc1-job"),
          jobTitle: jobTitle.trim() || "Open Role",
          jobDescription: jobDescription.trim(),
          resumeText: candidate.resumeText,
          shortlistMetadata: {
            fitScore: candidate.fitScore,
            matchedSkills: candidate.matchedSkills,
            missingSkills: candidate.missingSkills,
            recommendation: candidate.recommendation,
            source: "admin-uc1"
          }
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setUc1Message(data.error ?? "UC1 handoff failed.");
        return;
      }
      const sessionId = data.session?.id;
      setCandidates((current) => current.map((item) => item.id === candidate.id ? { ...item, status: "sent", sentSessionId: sessionId } : item));
      setUc1Message(`${candidate.name} is now in the UC2 interview queue.`);
      if (sessionId) await onInterviewCreated(sessionId);
    } finally {
      setUc1Busy(false);
    }
  }

  return (
    <section className="premium-panel rounded-lg p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs font-medium uppercase text-teal">UC1 Intake</p>
          <h2 className="text-xl font-semibold">Candidate Shortlist to Axomir Interview</h2>
          <p className="mt-1 text-sm leading-6 text-ink/60">Use UC1 to screen resumes against a JD, shortlist candidates, and send them into UC2 for the real interview.</p>
        </div>
        <span className="inline-flex w-fit items-center gap-1 rounded-full bg-teal/10 px-3 py-1 text-xs font-semibold text-teal">
          <ShieldCheck className="h-3.5 w-3.5" />
          UC1 local workflow
        </span>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="block text-sm font-medium">
              Job title
              <input className="focus-ring mt-1 w-full rounded-md border border-ink/15 bg-white px-3 py-2 font-normal" value={jobTitle} onChange={(event) => setJobTitle(event.target.value)} />
            </label>
            <label className="block text-sm font-medium">
              Required skills
              <input className="focus-ring mt-1 w-full rounded-md border border-ink/15 bg-white px-3 py-2 font-normal" value={requiredSkills} onChange={(event) => setRequiredSkills(event.target.value)} placeholder="Python, SQL, REST APIs" />
            </label>
          </div>
          <label className="block text-sm font-medium">
            Job description
            <textarea className="focus-ring mt-1 min-h-24 w-full rounded-md border border-ink/15 bg-white px-3 py-2 font-normal" value={jobDescription} onChange={(event) => setJobDescription(event.target.value)} />
          </label>
          <div className="grid gap-3 md:grid-cols-[0.9fr_1.1fr]">
            <div className="space-y-3">
              <label className="block text-sm font-medium">
                Candidate name
                <input className="focus-ring mt-1 w-full rounded-md border border-ink/15 bg-white px-3 py-2 font-normal" value={candidateName} onChange={(event) => setCandidateName(event.target.value)} placeholder="Extracted or typed name" />
              </label>
              <label className="focus-ring flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-teal/40 bg-white/70 px-3 py-3 text-sm font-medium text-ink hover:border-teal">
                <Upload className="h-4 w-4 text-teal" />
                {resumeFileName || "Upload resume"}
                <input className="sr-only" type="file" accept=".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown" disabled={uc1Busy} onChange={(event) => void uploadResume(event.target.files?.[0])} />
              </label>
              <button type="button" className="focus-ring flex w-full items-center justify-center gap-2 rounded-md bg-teal px-4 py-2 text-sm font-medium text-white disabled:opacity-50" disabled={uc1Busy} onClick={screenCandidate}>
                {uc1Busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                Screen Candidate
              </button>
            </div>
            <label className="block text-sm font-medium">
              Resume text
              <textarea className="focus-ring mt-1 min-h-44 w-full rounded-md border border-ink/15 bg-white px-3 py-2 font-normal" value={resumeText} onChange={(event) => setResumeText(event.target.value)} placeholder="Upload a resume or paste resume text here" />
            </label>
          </div>
          {uc1Message ? <p className="rounded-md border border-teal/20 bg-white/80 px-3 py-2 text-sm text-ink/70">{uc1Message}</p> : null}
        </div>

        <div>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase text-teal">Shortlist</p>
              <h3 className="font-semibold">Screened Candidates</h3>
            </div>
            <span className="rounded bg-paper px-2 py-1 text-xs text-ink/55">{candidates.length} candidate{candidates.length === 1 ? "" : "s"}</span>
          </div>
          <div className="max-h-[520px] space-y-2 overflow-auto pr-1">
            {candidates.length === 0 ? (
              <div className="rounded-md border border-ink/10 bg-white/70 p-4 text-sm text-ink/60">No UC1 candidates yet. Upload or paste a resume, then screen the candidate.</div>
            ) : candidates.map((candidate) => (
              <article key={candidate.id} className="rounded-md border border-ink/10 bg-white/80 p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h4 className="font-semibold">{candidate.name}</h4>
                    <p className="mt-1 text-xs text-ink/45">{candidate.fileName ?? "Manual resume"} / {new Date(candidate.createdAt).toLocaleString()}</p>
                  </div>
                  <span className={`rounded px-2 py-1 text-xs font-semibold ${candidate.recommendation === "Shortlist" ? "bg-teal/10 text-teal" : candidate.recommendation === "Review" ? "bg-[#fff6df] text-[#8a6400]" : "bg-ember/10 text-ember"}`}>{candidate.fitScore}% / {candidate.recommendation}</span>
                </div>
                <div className="mt-3 grid gap-2 text-xs md:grid-cols-2">
                  <div className="rounded bg-[#f7fbfa] p-2">
                    <p className="font-medium text-teal">Matched skills</p>
                    <p className="mt-1 text-ink/62">{candidate.matchedSkills.length ? candidate.matchedSkills.join(", ") : "No direct matches"}</p>
                  </div>
                  <div className="rounded bg-paper p-2">
                    <p className="font-medium text-ink/60">Missing skills</p>
                    <p className="mt-1 text-ink/62">{candidate.missingSkills.length ? candidate.missingSkills.join(", ") : "No major gaps"}</p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" className="focus-ring rounded-md border border-teal/30 px-3 py-2 text-sm font-medium text-teal transition hover:bg-teal/10 disabled:opacity-50" disabled={uc1Busy || candidate.status === "sent"} onClick={() => void sendToInterview(candidate)}>
                    <Send className="mr-1 inline h-4 w-4" />
                    {candidate.status === "sent" ? "Sent to UC2" : "Send to Axomir Interview"}
                  </button>
                  <button type="button" className="focus-ring rounded-md border border-ink/15 px-3 py-2 text-sm text-ink/65 transition hover:border-teal" onClick={() => setCandidates((current) => current.map((item) => item.id === candidate.id ? { ...item, status: "shortlisted" } : item))}>Shortlist</button>
                  <button type="button" className="focus-ring rounded-md border border-ember/30 px-3 py-2 text-sm text-ember transition hover:bg-ember/10" onClick={() => setCandidates((current) => current.map((item) => item.id === candidate.id ? { ...item, status: "rejected" } : item))}>Reject</button>
                </div>
                {candidate.sentSessionId ? <p className="mt-2 text-xs text-ink/45">UC2 session: {candidate.sentSessionId}</p> : null}
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function AdminStat({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <div className="premium-stat rounded-lg p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-ink/60">{label}</p>
        <span className="flex h-8 w-8 items-center justify-center rounded-md bg-[#edf7f6] text-teal">{icon}</span>
      </div>
      <p className="mt-3 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function DecisionBadge({ decision }: { decision: "pending" | "approved" | "rejected" }) {
  const className = decision === "approved"
    ? "bg-teal/10 text-teal"
    : decision === "rejected"
      ? "bg-ember/10 text-ember"
      : "bg-paper text-ink/60";

  return <span className={`rounded px-2 py-1 text-xs capitalize ${className}`}>{decision}</span>;
}

function ReviewPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="premium-panel rounded-lg p-4">
      <h3 className="mb-3 flex items-center gap-2 font-semibold"><ShieldCheck className="h-4 w-4 text-teal" />{title}</h3>
      {children}
    </section>
  );
}

function AdminMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric-tile rounded-md p-3">
      <p className="text-xs uppercase tracking-wide text-ink/50">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  );
}

function buildInPersonInterviewMail(detail: AdminDetail) {
  const subject = `In-person interview request - ${detail.candidate.name} for ${detail.job.title}`;
  const confidence = detail.evaluation?.confidence ?? "not generated";
  const reviewReasons = detail.evaluation?.humanReviewReasons?.length ? detail.evaluation.humanReviewReasons.join(" ") : "Admin review requested.";
  const body = [
    `Hello ${detail.candidate.name},`,
    "",
    `Thank you for completing the Axomir interview for ${detail.job.title}.`,
    "We would like to schedule an in-person interview to continue the process and clarify the review notes.",
    "",
    `Admin review confidence: ${confidence}`,
    `Review detail: ${reviewReasons}`,
    "",
    "Please reply with your available time slots.",
    "",
    "Regards,",
    "Recruitment Team"
  ].join("\n");
  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function scoreCandidateFit(jobDescription: string, requiredSkills: string, resumeText: string) {
  const resumeLower = resumeText.toLowerCase();
  const skills = normalizeSkillList(requiredSkills || inferSkillsFromJob(jobDescription).join(", "));
  const matchedSkills = skills.filter((skill) => resumeLower.includes(skill.toLowerCase()));
  const missingSkills = skills.filter((skill) => !resumeLower.includes(skill.toLowerCase()));
  const skillScore = skills.length ? (matchedSkills.length / skills.length) * 72 : 35;
  const experienceScore = /\b(experience|worked|built|developed|designed|managed|led|deployed|implemented|project|internship)\b/i.test(resumeText) ? 18 : 6;
  const evidenceScore = Math.min(10, Math.floor(resumeText.length / 180));
  const fitScore = Math.max(0, Math.min(100, Math.round(skillScore + experienceScore + evidenceScore)));
  const recommendation = fitScore >= 65 ? "Shortlist" : fitScore >= 45 ? "Review" : "Reject";
  return { fitScore, matchedSkills, missingSkills, recommendation } as const;
}

function normalizeSkillList(value: string) {
  return Array.from(new Set(value
    .split(/[,;\n]/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2)
    .slice(0, 14)));
}

function inferSkillsFromJob(jobDescription: string) {
  const knownSkills = [
    "Python",
    "JavaScript",
    "TypeScript",
    "React",
    "Next.js",
    "Node.js",
    "SQL",
    "PostgreSQL",
    "MongoDB",
    "REST APIs",
    "Git",
    "Testing",
    "Debugging",
    "Docker",
    "Kubernetes",
    "AWS",
    "Communication"
  ];
  const lower = jobDescription.toLowerCase();
  return knownSkills.filter((skill) => lower.includes(skill.toLowerCase())).slice(0, 10);
}

function newId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
