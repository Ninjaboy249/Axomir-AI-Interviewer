"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ClipboardList, Loader2, RefreshCw, ShieldCheck, XCircle } from "lucide-react";

type AdminSession = {
  id: string;
  status: string;
  mode: "text" | "voice";
  createdAt: string;
  completedAt?: string;
  reviewDecision?: "pending" | "approved" | "rejected";
  reviewNotes?: string;
  candidate?: { name: string };
  job?: { title: string };
  evaluation?: { percentageScore: number; recommendation: string; needsHumanReview: boolean; humanReviewReasons: string[] };
};

type AdminDetail = {
  session: AdminSession & { askedQuestionIds: string[] };
  candidate: { name: string };
  job: { title: string };
  plan: { questions: Array<{ id: string; text: string; competency: string; priorityRank?: number }> };
  answers: Array<{ id: string; questionId: string; text: string; createdAt: string }>;
  evaluation?: AdminSession["evaluation"] & { candidateFeedback: string };
  proctorEvents: Array<{ id: string; type: string; note: string; status?: string; severity: string; createdAt: string; durationMs?: number }>;
};

export default function AdminPage() {
  const [sessions, setSessions] = useState<AdminSession[]>([]);
  const [detail, setDetail] = useState<AdminDetail | null>(null);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function loadSessions() {
    const response = await fetch("/api/interviews", { cache: "no-store" });
    const data = await response.json();
    setSessions(data.sessions ?? []);
    if (!detail && data.sessions?.[0]) await loadDetail(data.sessions[0].id);
  }

  async function loadDetail(id: string) {
    const response = await fetch(`/api/interviews/${id}`, { cache: "no-store" });
    if (!response.ok) return;
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
      await loadSessions();
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

      <div className="mx-auto grid max-w-7xl gap-5 px-4 py-5 lg:grid-cols-[360px_1fr]">
        <aside className="premium-panel rounded-lg p-4">
          <h2 className="mb-3 font-semibold">Interview Queue</h2>
          <div className="space-y-2">
            {sessions.map((session) => (
              <button key={session.id} type="button" className="premium-list-item focus-ring w-full rounded-md border border-ink/10 p-3 text-left hover:border-teal" onClick={() => void loadDetail(session.id)}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{session.candidate?.name ?? "Candidate"}</span>
                  <span className="rounded bg-paper px-2 py-1 text-xs">{session.reviewDecision ?? "pending"}</span>
                </div>
                <p className="mt-1 text-sm text-ink/60">{session.job?.title ?? "Role"} / {session.status}</p>
                {session.evaluation ? <p className="mt-2 text-sm">{session.evaluation.percentageScore}% / {session.evaluation.recommendation}</p> : null}
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
                  </div>
                  <div className="grid min-w-60 grid-cols-2 gap-2">
                    <button type="button" className="focus-ring rounded-md bg-teal px-4 py-2 text-white disabled:opacity-50" disabled={busy} onClick={() => void review("approved")}>
                      {busy ? <Loader2 className="mr-1 inline h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-1 inline h-4 w-4" />}Approve
                    </button>
                    <button type="button" className="focus-ring rounded-md border border-ember px-4 py-2 text-ember disabled:opacity-50" disabled={busy} onClick={() => void review("rejected")}>
                      <XCircle className="mr-1 inline h-4 w-4" />Reject
                    </button>
                  </div>
                </div>
                <textarea className="focus-ring mt-4 min-h-24 w-full rounded-md border border-ink/15 px-3 py-2" placeholder="Reviewer notes" value={notes} onChange={(event) => setNotes(event.target.value)} />
                <p className="mt-2 text-xs leading-5 text-ink/50">Integrity signals and scores are review aids only. Final approval or rejection must be decided by the reviewer.</p>
              </div>

              <div className="grid gap-5 xl:grid-cols-2">
                <ReviewPanel title="Scorecard">
                  {detail.evaluation ? (
                    <div className="space-y-3 text-sm">
                      <AdminMetric label="Overall" value={`${detail.evaluation.percentageScore}%`} />
                      <AdminMetric label="Recommendation" value={detail.evaluation.recommendation} />
                      <AdminMetric label="Human Review" value={detail.evaluation.needsHumanReview ? "Required" : "Not flagged"} />
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
                          <p className="mt-1 text-ink/60">{new Date(event.createdAt).toLocaleString()} / {event.durationMs ? `${(event.durationMs / 1000).toFixed(1)} sec` : "instant"}</p>
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
