"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CSSProperties, ClipboardEvent, DragEvent, KeyboardEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { InterviewIntegrityMonitor } from "@/components/integrity/InterviewIntegrityMonitor";
import {
  AlertTriangle,
  Bot,
  BriefcaseBusiness,
  Camera,
  CheckCircle2,
  ClipboardList,
  FileText,
  History,
  LayoutDashboard,
  Loader2,
  Mic,
  MicOff,
  Pause,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Send,
  Search,
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
  reviewDecision?: "pending" | "approved" | "rejected";
  reviewNotes?: string;
  reviewedAt?: string;
};

type Detail = {
  session: SessionSummary & { consentStatus: string; askedQuestionIds: string[]; currentDifficulty: number };
  plan: {
    id: string;
    status: string;
    questions: Array<{ id: string; text: string; competency: string; priority?: "High" | "Medium" | "Low"; priorityRank?: number; difficulty: number; mandatory: boolean; expectedAnswer: string[] }>;
  };
  candidate: { name: string; resumeText?: string; resumeClaims: Array<{ id: string; excerpt: string; category: string; materiality: string }> };
  job: { title: string; description?: string; requiredSkills: string[]; responsibilities: string[] };
  answers: Array<{ id: string; questionId: string; text: string; source: string; aiCorrectness?: string; aiScore?: number; aiFeedback?: string; aiConfidence?: string }>;
  evaluation?: {
    percentageScore: number;
    recommendation: string;
    needsHumanReview: boolean;
    humanReviewReasons: string[];
    competencyScores: Array<{ competency: string; score: number; evidenceQuote?: string; missingEvidence?: string; explanation: string; confidence: "low" | "medium" | "high" }>;
    candidateFeedback: string;
  };
  consistencyFindings: Array<{ resumeExcerpt: string; classification: string; explanation: string; supportingAnswerExcerpts: string[] }>;
  proctorEvents: Array<{
    id: string;
    type: string;
    severity: "info" | "warning" | "review";
    note: string;
    startTime?: string;
    endTime?: string;
    durationMs?: number;
    measuredValue?: number;
    measurementLabel?: string;
    direction?: string;
    confidence?: number;
    threshold?: number;
    status?: "informational" | "needs_review" | "dismissed" | "reviewed" | "technical";
    createdAt: string;
  }>;
};

const sampleSetup = {
  candidateName: "Asha Rao",
  jobTitle: "Senior Platform Engineer",
  jobDescription: "This Senior Platform Engineer role requires Kubernetes, Node.js, production troubleshooting, incident communication, deployment ownership, and practical debugging ability across distributed services. The person should explain technical tradeoffs clearly and collaborate with product and operations teams.",
  resumeText: "Asha Rao\nSenior Platform Engineer\n6 years of experience building React and Node.js products.\nDeployed Kubernetes services in production and owned incident troubleshooting.\nImproved PostgreSQL query performance by 40% for customer reporting workflows.\nLed incident reviews and explained reliability tradeoffs to product stakeholders.",
  focusAreas: "Kubernetes, Node.js, production troubleshooting"
};

type ResumeExtract = {
  fileName: string;
  candidateName?: string;
  currentDesignation?: string;
  skills: string[];
  experience: string[];
  yearsMentioned: string[];
};

type SpeechRecognitionResultEventLike = {
  resultIndex: number;
  results: ArrayLike<{ 0?: { transcript?: string }; isFinal: boolean }>;
};

type SpeechRecognitionErrorEventLike = {
  error?: string;
};

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionResultEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

const draftKey = "axomir-interview-draft-v1";
const historyScreenKey = "axomirScreen";
const returnLevelOneSessionKey = "axomirReturnLevel1Session";
const openInterviewSessionKey = "axomirOpenInterviewSession";
const emptySetup = {
  candidateName: "",
  jobTitle: "",
  jobDescription: "",
  resumeText: "",
  focusAreas: ""
};

type RoleTemplate = {
  title: string;
  category: "technical" | "nonTechnical";
  focusAreas: string;
  description: string;
  responsibilities: string[];
  skills: string[];
  subRoles: Array<{
    title: string;
    description: string;
    responsibilities: string[];
    skills: string[];
  }>;
};

type SelectedRole = {
  title: string;
  category: "technical" | "nonTechnical";
  focusAreas: string;
  description: string;
  responsibilities: string[];
  skills: string[];
  parentTitle?: string;
};

type InterviewLevel = "typing" | "bot";

const roleTemplates: RoleTemplate[] = [
  {
    title: "Frontend React Engineer",
    category: "technical",
    focusAreas: "React, TypeScript, performance, accessibility",
    description: "Build production React and TypeScript interfaces with accessible components, API integration, state management, performance optimization, testing, and collaboration with design and backend teams.",
    responsibilities: ["Ship reusable UI components", "Integrate APIs and manage state", "Improve accessibility and performance"],
    skills: ["React", "TypeScript", "CSS", "Testing", "Accessibility"],
    subRoles: [
      { title: "React UI Developer", description: "Own responsive interface delivery and component quality.", responsibilities: ["Build screens from design specs", "Create reusable components", "Fix browser and layout defects"], skills: ["React", "TypeScript", "Tailwind", "Storybook"] },
      { title: "Frontend Performance Engineer", description: "Optimize rendering, bundle size, and client-side responsiveness.", responsibilities: ["Profile slow interactions", "Reduce bundle weight", "Improve Core Web Vitals"], skills: ["React profiling", "Webpack", "Lighthouse", "Caching"] }
    ]
  },
  {
    title: "Backend Node.js Engineer",
    category: "technical",
    focusAreas: "Node.js, APIs, databases, system design",
    description: "Own reliable backend services using Node.js, REST APIs, database modeling, authentication, observability, performance tuning, and production incident debugging.",
    responsibilities: ["Design API contracts", "Model database entities", "Debug production failures"],
    skills: ["Node.js", "REST APIs", "SQL", "Auth", "Observability"],
    subRoles: [
      { title: "API Engineer", description: "Design and maintain secure, versioned backend APIs.", responsibilities: ["Create API endpoints", "Validate inputs", "Document integration behavior"], skills: ["Node.js", "Express", "OpenAPI", "JWT"] },
      { title: "Database Backend Engineer", description: "Build backend services with strong data modeling and query reliability.", responsibilities: ["Design schemas", "Optimize queries", "Handle migrations"], skills: ["PostgreSQL", "ORMs", "Indexes", "Transactions"] }
    ]
  },
  {
    title: "Full Stack Developer",
    category: "technical",
    focusAreas: "React, Node.js, SQL, deployment",
    description: "Deliver end-to-end product features across frontend, backend, database, testing, deployment, and customer-facing troubleshooting in a fast-moving product environment.",
    responsibilities: ["Build complete product workflows", "Own frontend and backend changes", "Test and deploy features"],
    skills: ["React", "Node.js", "SQL", "Git", "Deployment"],
    subRoles: [
      { title: "MERN Stack Developer", description: "Build product features across MongoDB, Express, React, and Node.", responsibilities: ["Create UI flows", "Develop APIs", "Connect data models"], skills: ["MongoDB", "Express", "React", "Node.js"] },
      { title: "SaaS Product Developer", description: "Deliver production SaaS features with strong user workflow ownership.", responsibilities: ["Implement product workflows", "Handle edge cases", "Support releases"], skills: ["React", "APIs", "Billing flows", "Testing"] }
    ]
  },
  {
    title: "AI/ML Engineer",
    category: "technical",
    focusAreas: "Python, ML systems, evaluation, deployment",
    description: "Develop machine-learning features using Python, model evaluation, data pipelines, prompt or model iteration, production deployment, monitoring, and responsible AI practices.",
    responsibilities: ["Build ML pipelines", "Evaluate model quality", "Deploy and monitor AI features"],
    skills: ["Python", "ML evaluation", "Data pipelines", "MLOps", "Prompting"],
    subRoles: [
      { title: "LLM Application Engineer", description: "Build reliable AI applications using prompts, tools, retrieval, and evaluation.", responsibilities: ["Design prompts", "Connect tools and APIs", "Measure answer quality"], skills: ["LLMs", "RAG", "Python", "Eval design"] },
      { title: "Machine Learning Engineer", description: "Train, evaluate, and deploy models for product use cases.", responsibilities: ["Prepare datasets", "Tune models", "Monitor drift"], skills: ["Python", "scikit-learn", "Model serving", "Metrics"] }
    ]
  },
  {
    title: "Data Analyst",
    category: "technical",
    focusAreas: "SQL, dashboards, metrics, stakeholder communication",
    description: "Analyze business data with SQL, dashboards, metric definitions, experimentation, data quality checks, and clear stakeholder communication for decision support.",
    responsibilities: ["Write SQL analysis", "Maintain dashboards", "Explain metric movement"],
    skills: ["SQL", "Excel", "BI tools", "Statistics", "Storytelling"],
    subRoles: [
      { title: "Business Intelligence Analyst", description: "Create dashboards and reporting systems for operational decisions.", responsibilities: ["Build dashboards", "Define KPIs", "Validate data"], skills: ["Power BI", "Tableau", "SQL", "Data quality"] },
      { title: "Product Data Analyst", description: "Analyze product funnels, experiments, and user behavior.", responsibilities: ["Analyze funnels", "Support experiments", "Report insights"], skills: ["SQL", "A/B testing", "Cohort analysis", "Analytics tools"] }
    ]
  },
  {
    title: "DevOps / Cloud Engineer",
    category: "technical",
    focusAreas: "AWS, CI/CD, Kubernetes, monitoring",
    description: "Operate cloud infrastructure with CI/CD pipelines, Kubernetes, observability, incident response, security basics, cost awareness, and reliable deployment practices.",
    responsibilities: ["Maintain cloud infrastructure", "Automate deployments", "Improve reliability and monitoring"],
    skills: ["AWS", "Docker", "Kubernetes", "CI/CD", "Monitoring"],
    subRoles: [
      { title: "Cloud Infrastructure Engineer", description: "Manage scalable cloud services and infrastructure automation.", responsibilities: ["Provision cloud resources", "Maintain IaC", "Control cost and security"], skills: ["AWS", "Terraform", "Networking", "IAM"] },
      { title: "Site Reliability Engineer", description: "Improve uptime, incident response, and operational maturity.", responsibilities: ["Define SLOs", "Improve alerts", "Lead incident reviews"], skills: ["Kubernetes", "Prometheus", "Incident response", "Linux"] }
    ]
  },
  {
    title: "QA Automation Engineer",
    category: "technical",
    focusAreas: "Playwright, API testing, test strategy, CI",
    description: "Design automated test coverage for web applications, API flows, regression suites, CI execution, bug triage, and quality risk communication.",
    responsibilities: ["Automate regression flows", "Test APIs and UI", "Report quality risks"],
    skills: ["Playwright", "API testing", "CI", "Bug triage", "Test strategy"],
    subRoles: [
      { title: "Web Automation Tester", description: "Automate critical browser workflows and regression suites.", responsibilities: ["Write E2E tests", "Stabilize flaky tests", "Run tests in CI"], skills: ["Playwright", "Cypress", "Selectors", "CI"] },
      { title: "API Test Engineer", description: "Validate backend contracts, negative cases, and integration behavior.", responsibilities: ["Create API suites", "Test auth and errors", "Verify contracts"], skills: ["Postman", "REST", "JSON schema", "CI"] }
    ]
  },
  {
    title: "Product Manager",
    category: "nonTechnical",
    focusAreas: "Roadmaps, discovery, analytics, execution",
    description: "Lead product discovery, requirements, prioritization, roadmap tradeoffs, analytics, cross-functional execution, and customer-informed product decisions.",
    responsibilities: ["Prioritize product work", "Write clear requirements", "Align stakeholders"],
    skills: ["Roadmapping", "Discovery", "Analytics", "Communication", "Execution"],
    subRoles: [
      { title: "Associate Product Manager", description: "Support product delivery, research, and requirement definition.", responsibilities: ["Collect user feedback", "Write tickets", "Track launches"], skills: ["User stories", "Analytics", "Stakeholder updates", "Prioritization"] },
      { title: "Growth Product Manager", description: "Improve acquisition, activation, conversion, and retention metrics.", responsibilities: ["Analyze funnels", "Run experiments", "Prioritize growth bets"], skills: ["Experimentation", "Metrics", "Lifecycle", "SQL basics"] }
    ]
  },
  {
    title: "UI/UX Designer",
    category: "nonTechnical",
    focusAreas: "User research, interaction design, prototypes, design systems",
    description: "Create user-centered product experiences with research, information architecture, interaction design, prototyping, design systems, usability testing, and developer handoff.",
    responsibilities: ["Design product workflows", "Prototype interactions", "Run usability reviews"],
    skills: ["Figma", "Research", "Prototyping", "Design systems", "Handoff"],
    subRoles: [
      { title: "Product Designer", description: "Design end-to-end product experiences from research to handoff.", responsibilities: ["Map journeys", "Design screens", "Validate usability"], skills: ["Figma", "Interaction design", "Usability testing", "Handoff"] },
      { title: "UX Researcher", description: "Plan research and turn user evidence into product recommendations.", responsibilities: ["Run interviews", "Synthesize findings", "Share insights"], skills: ["Research planning", "Interviewing", "Synthesis", "Personas"] }
    ]
  },
  {
    title: "Cybersecurity Analyst",
    category: "technical",
    focusAreas: "Threat detection, SIEM, incident response, risk",
    description: "Monitor and investigate security events, use SIEM tooling, assess vulnerabilities, document incident response, communicate risk, and recommend practical controls.",
    responsibilities: ["Monitor security events", "Investigate alerts", "Document risks and controls"],
    skills: ["SIEM", "Incident response", "Threat analysis", "Vulnerability management", "Risk reporting"],
    subRoles: [
      { title: "SOC Analyst", description: "Triage security alerts and escalate confirmed incidents.", responsibilities: ["Monitor SIEM alerts", "Investigate IOCs", "Escalate incidents"], skills: ["SIEM", "Log analysis", "MITRE ATT&CK", "Ticketing"] },
      { title: "Vulnerability Analyst", description: "Assess vulnerabilities and coordinate remediation with engineering teams.", responsibilities: ["Review scans", "Prioritize risk", "Track remediation"], skills: ["CVSS", "Scanning tools", "Risk scoring", "Reporting"] }
    ]
  },
  {
    title: "Sales Development Representative",
    category: "nonTechnical",
    focusAreas: "Prospecting, qualification, CRM, objection handling",
    description: "Generate qualified pipeline through prospecting, discovery, CRM discipline, objection handling, value communication, follow-up quality, and measurable activity execution.",
    responsibilities: ["Prospect target accounts", "Qualify leads", "Maintain CRM hygiene"],
    skills: ["Prospecting", "Discovery", "CRM", "Objection handling", "Follow-up"],
    subRoles: [
      { title: "Inbound SDR", description: "Qualify inbound interest and convert leads into sales opportunities.", responsibilities: ["Respond to leads", "Run discovery calls", "Book meetings"], skills: ["CRM", "Discovery", "Email follow-up", "Qualification"] },
      { title: "Outbound SDR", description: "Create pipeline through targeted account prospecting.", responsibilities: ["Build prospect lists", "Personalize outreach", "Handle objections"], skills: ["Prospecting", "Cold email", "LinkedIn", "Objection handling"] }
    ]
  },
  {
    title: "Customer Success Manager",
    category: "nonTechnical",
    focusAreas: "Onboarding, retention, account health, stakeholder management",
    description: "Own customer onboarding, adoption, account health, renewal risk, stakeholder communication, product feedback loops, and measurable retention outcomes.",
    responsibilities: ["Manage onboarding", "Monitor account health", "Reduce renewal risk"],
    skills: ["Account management", "Onboarding", "Retention", "Stakeholder communication", "Product feedback"],
    subRoles: [
      { title: "Implementation Specialist", description: "Guide customers through setup, launch, and adoption milestones.", responsibilities: ["Run onboarding plans", "Configure workflows", "Train users"], skills: ["Onboarding", "Training", "Configuration", "Project coordination"] },
      { title: "Renewals CSM", description: "Protect retention by managing risk, value reviews, and renewal readiness.", responsibilities: ["Track account health", "Run business reviews", "Resolve renewal blockers"], skills: ["Retention", "QBRs", "Risk management", "Negotiation basics"] }
    ]
  }
];

export default function Home() {
  const router = useRouter();
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploadingResume, setUploadingResume] = useState(false);
  const [setupError, setSetupError] = useState("");
  const [missingFields, setMissingFields] = useState<string[]>([]);
  const [statusMessage, setStatusMessage] = useState("");
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [answerBusy, setAnswerBusy] = useState(false);
  const [skipBusy, setSkipBusy] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [micListening, setMicListening] = useState(false);
  const [resumeExtract, setResumeExtract] = useState<ResumeExtract | null>(null);
  const [uploadError, setUploadError] = useState("");
  const [answer, setAnswer] = useState("");
  const [mode, setMode] = useState<"text" | "voice">("text");
  const [interviewLevel, setInterviewLevel] = useState<InterviewLevel>("typing");
  const [levelUpDismissed, setLevelUpDismissed] = useState(false);
  const [roleSelected, setRoleSelected] = useState(false);
  const roleSelectedRef = useRef(false);
  const detailRef = useRef<Detail | null>(null);
  const modeRef = useRef<"text" | "voice">("text");
  const refiningPlanRef = useRef<Set<string>>(new Set());
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const voiceRunRef = useRef(0);
  const answerInputRef = useRef<HTMLTextAreaElement | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const micBaseTextRef = useRef("");
  const micFinalTextRef = useRef("");
  const micInterimTextRef = useRef("");
  const micListeningRef = useRef(false);
  const [form, setForm] = useState(emptySetup);

  async function loadSessions() {
    const response = await fetch("/api/interviews", { cache: "no-store" });
    const data = await response.json();
    setSessions(data.sessions ?? []);
  }

  async function loadDetail(id: string, options: { preserveMode?: boolean } = {}) {
    const response = await fetch(`/api/interviews/${id}`, { cache: "no-store" });
    if (response.ok) {
      const nextDetail = await response.json() as Detail;
      setDetail(nextDetail);
      setMode((currentMode) => options.preserveMode || detailRef.current?.session.id === id ? currentMode : nextDetail.session.mode);
    }
  }

  useEffect(() => {
    async function boot() {
      await loadSessions();
      const openSessionId = sessionStorage.getItem(openInterviewSessionKey);
      if (openSessionId) {
        sessionStorage.removeItem(openInterviewSessionKey);
        setRoleSelected(true);
        setInterviewLevel("typing");
        await loadDetail(openSessionId);
        setStatusMessage("UC1 shortlisted candidate opened in the Axomir interview room.");
        return;
      }
      const returnSessionId = sessionStorage.getItem(returnLevelOneSessionKey);
      if (returnSessionId) {
        sessionStorage.removeItem(returnLevelOneSessionKey);
        setRoleSelected(true);
        setInterviewLevel("typing");
        await loadDetail(returnSessionId);
        setStatusMessage("Returned to Level 1 interview from the live bot-agent room.");
      }
    }
    void boot();
  }, []);

  useEffect(() => {
    roleSelectedRef.current = roleSelected;
  }, [roleSelected]);

  useEffect(() => {
    detailRef.current = detail;
  }, [detail]);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    const currentState = window.history.state && typeof window.history.state === "object" ? window.history.state : {};
    if (!currentState[historyScreenKey]) {
      window.history.replaceState({ ...currentState, [historyScreenKey]: "role-selection" }, "", window.location.href);
    }

    const handlePopState = (event: PopStateEvent) => {
      const screen = event.state?.[historyScreenKey];
      if (screen === "role-selection" && roleSelectedRef.current) {
        stopVoicePlayback();
        setDetail(null);
        setAnswer("");
        setMissingFields([]);
        setSetupError("");
        setUploadError("");
        if (detailRef.current) {
          setRoleSelected(true);
          setInterviewLevel("typing");
          window.history.replaceState({ ...(window.history.state ?? {}), [historyScreenKey]: "interview-setup" }, "", window.location.href);
          setStatusMessage("Returned to Level 1 setup. Your selected role is still loaded.");
          return;
        }
        setRoleSelected(false);
        setStatusMessage("Returned to job role selection.");
        return;
      }
      if (screen === "interview-setup" && !roleSelectedRef.current && formHasRole(form)) {
        setRoleSelected(true);
        setStatusMessage("Returned to the selected role setup.");
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.jobTitle, form.jobDescription]);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
      micListeningRef.current = false;
      const recognition = recognitionRef.current;
      recognitionRef.current = null;
      try {
        recognition?.stop();
      } catch {
        // Browsers can throw if speech recognition has already ended.
      }
    };
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

  const chatTurns = useMemo(() => {
    if (!detail) return [];
    const answeredTurns: Array<{
      question: Detail["plan"]["questions"][number];
      answer?: Detail["answers"][number];
      current: boolean;
    }> = detail.answers.map((item) => ({
      question: detail.plan.questions.find((question) => question.id === item.questionId),
      answer: item,
      current: false
    })).filter((turn): turn is { question: Detail["plan"]["questions"][number]; answer: Detail["answers"][number]; current: boolean } => Boolean(turn.question));
    if (currentQuestion && !detail.answers.some((item) => item.questionId === currentQuestion.id)) {
      answeredTurns.push({ question: currentQuestion, answer: undefined, current: true });
    }
    return answeredTurns;
  }, [currentQuestion, detail]);

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

  useEffect(() => {
    if (!detail || !["active", "paused"].includes(detail.session.status)) return;
    const reportTabHidden = () => {
      if (document.visibilityState === "hidden") {
        void recordProctorEvent("tab_hidden", "Candidate changed browser tab or minimized the interview window.");
      }
    };
    const reportBlur = () => {
      void recordProctorEvent("window_blur", "Interview window lost focus.");
    };
    document.addEventListener("visibilitychange", reportTabHidden);
    window.addEventListener("blur", reportBlur);
    return () => {
      document.removeEventListener("visibilitychange", reportTabHidden);
      window.removeEventListener("blur", reportBlur);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail?.session.id, detail?.session.status]);

  async function createInterview() {
    const missing = setupMissingFields(form);
    setMissingFields(missing);
    if (missing.length > 0) {
      setSetupError(`Complete these fields before starting the Level 1 typing interview: ${missing.join(", ")}.`);
      return;
    }
    const cameraReady = await ensureCameraPermissionForInterview();
    if (!cameraReady) return;
    setSetupError("");
    setStatusMessage(`Starting Level 1 ${mode === "voice" ? "voice-assisted" : "typing"} interview...`);
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
      setInterviewLevel("typing");
      setLevelUpDismissed(false);
      setStatusMessage(`Level 1 ${mode === "voice" ? "voice-assisted" : "typing"} interview started. Camera permission is confirmed; open the camera monitor to begin live integrity tracking.`);
    } finally {
      setBusy(false);
    }
    await loadSessions();
    if (data.session?.id) {
      await loadDetail(data.session.id);
      void refineOpenAIPlan(data.session.id);
    }
  }

  async function startLevelTwoInterview() {
    if (!detail) {
      setStatusMessage("Complete Level 1 before starting the live bot-agent interview.");
      return;
    }
    const cameraReady = await ensureCameraPermissionForInterview();
    if (!cameraReady) return;
    const levelTwoJobDescription = detail.job.description || [
      detail.job.title,
      `Required skills: ${detail.job.requiredSkills.join(", ") || form.focusAreas || "role-specific skills"}.`,
      `Responsibilities: ${detail.job.responsibilities.join("; ") || "Complete the role responsibilities described in Level 1."}.`
    ].join("\n");
    setBusy(true);
    setStatusMessage("Starting Level 2 live bot-agent typing interview...");
    let data: { session?: { id: string }; error?: string } = {};
    try {
      const response = await fetch("/api/interviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidateName: detail.candidate.name,
          jobTitle: detail.job.title,
          jobDescription: levelTwoJobDescription,
          resumeText: detail.candidate.resumeText || form.resumeText,
          focusAreas: form.focusAreas.split(",").map((item) => item.trim()).filter(Boolean),
          mode: "text"
        })
      });
      data = await response.json();
      if (!response.ok) {
        setStatusMessage(data.error ?? "Level 2 interview generation failed.");
        return;
      }
      setLevelUpDismissed(true);
      setMode("text");
      setAnswer("");
      setStatusMessage("Level 2 live bot-agent interview is opening in a dedicated room.");
    } finally {
      setBusy(false);
    }
    await loadSessions();
    if (data.session?.id) {
      void refineOpenAIPlan(data.session.id);
      sessionStorage.setItem(returnLevelOneSessionKey, detail.session.id);
      router.push(`/level2/${data.session.id}?level1=${detail.session.id}`);
    }
  }

  async function refineOpenAIPlan(sessionId: string) {
    if (refiningPlanRef.current.has(sessionId)) return;
    refiningPlanRef.current.add(sessionId);
    setStatusMessage("Interview started instantly. OpenAI is tailoring follow-up questions in the background.");
    try {
      const response = await fetch(`/api/interviews/${sessionId}/refine-plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setStatusMessage(data.error ?? "OpenAI follow-up question refinement is unavailable. Continue with the starter plan.");
        return;
      }
      await loadDetail(sessionId);
      await loadSessions();
      setStatusMessage("OpenAI-tailored follow-up questions are ready.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "OpenAI follow-up question refinement failed. Continue with the starter plan.");
    }
  }

  function loadSampleSetup() {
    setForm(sampleSetup);
    enterInterviewSetup();
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
    setStatusMessage("Sample candidate loaded. Start the Level 1 typing interview when ready.");
  }

  function selectRole(template: SelectedRole) {
    setForm((current) => ({
      ...current,
      jobTitle: template.title,
      jobDescription: roleDescription(template),
      focusAreas: mergeFocusAreas(current.focusAreas, template.skills.length ? template.skills : template.focusAreas.split(","))
    }));
    enterInterviewSetup();
    setStatusMessage(`${template.title} selected. Upload the resume and start the interview when ready.`);
  }

  function enterInterviewSetup() {
    setRoleSelected(true);
    if (window.history.state?.[historyScreenKey] !== "interview-setup") {
      const currentState = window.history.state && typeof window.history.state === "object" ? window.history.state : {};
      window.history.pushState({ ...currentState, [historyScreenKey]: "interview-setup" }, "", window.location.href);
    }
  }

  function saveDraft() {
    const draft = {
      form,
      mode,
      resumeExtract,
      answer,
      selectedSessionId: detail?.session.id,
      savedAt: new Date().toISOString()
    };
    localStorage.setItem(draftKey, JSON.stringify(draft));
    setSetupError("");
    setMissingFields([]);
    setStatusMessage("Draft saved on this browser.");
  }

  async function loadDraft() {
    const saved = localStorage.getItem(draftKey);
    if (!saved) {
      setStatusMessage("No saved draft found on this browser.");
      return;
    }
    try {
      const draft = JSON.parse(saved) as {
        form?: typeof emptySetup;
        mode?: "text" | "voice";
        resumeExtract?: ResumeExtract | null;
        answer?: string;
        selectedSessionId?: string;
      };
      setForm({ ...emptySetup, ...draft.form });
      enterInterviewSetup();
      setInterviewLevel("typing");
      setLevelUpDismissed(false);
      setMode(draft.mode ?? "text");
      setResumeExtract(draft.resumeExtract ?? null);
      setAnswer(draft.answer ?? "");
      setMissingFields([]);
      setSetupError("");
      setUploadError("");
      if (draft.selectedSessionId) await loadDetail(draft.selectedSessionId, { preserveMode: Boolean(draft.mode) });
      setStatusMessage("Draft restored.");
    } catch {
      setStatusMessage("Saved draft could not be restored. Save a fresh draft and try again.");
    }
  }

  function resetSetup() {
    const confirmed = window.confirm("Reset setup fields, resume extraction, and unsaved answer text?");
    if (!confirmed) return;
    localStorage.removeItem(draftKey);
    setForm(emptySetup);
    setRoleSelected(false);
    setMode("text");
    setInterviewLevel("typing");
    setLevelUpDismissed(false);
    setResumeExtract(null);
    setAnswer("");
    setMissingFields([]);
    setSetupError("");
    setUploadError("");
    setStatusMessage("Setup and draft data reset.");
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
    if (!detail) {
      setStatusMessage("Select an interview session before using controls.");
      return false;
    }
    const actionKey = actionKeyFor(path, body);
    setStatusMessage(messageForActionStart(path, body));
    setActiveAction(actionKey);
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
        return false;
      }
      await loadDetail(detail.session.id);
      await loadSessions();
      setStatusMessage(messageForAction(path, body));
      return true;
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Action failed. Please try again.");
      return false;
    } finally {
      setBusy(false);
      setActiveAction(null);
    }
  }

  async function submitAnswer() {
    if (answerBusy) return;
    if (!detail) {
      setStatusMessage("Create or select an interview before submitting an answer.");
      return;
    }
    if (!currentQuestion) {
      setStatusMessage("No active question is available. Generate the scorecard if the interview is complete.");
      return;
    }
    const answerText = (answerInputRef.current?.value ?? answer).trim();
    if (!answerText) {
      setStatusMessage("Type or paste the candidate answer before submitting.");
      return;
    }
    setAnswerBusy(true);
    let submitted = false;
    try {
      if (detail.plan.status !== "frozen") {
        const approvalResponse = await fetch(`/api/interviews/${detail.session.id}/approve-plan`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({})
        });
        const approvalData = await approvalResponse.json().catch(() => ({}));
        if (!approvalResponse.ok) {
          setStatusMessage(approvalData.error ?? "Plan approval failed before answer submission.");
          return;
        }
      }
      const response = await fetch(`/api/interviews/${detail.session.id}/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId: currentQuestion.id, text: answerText, source: modeRef.current })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setStatusMessage(data.error ?? "Answer submission failed.");
        return;
      }
      submitted = true;
      setAnswer("");
      const checkedAnswer = data.answer as Detail["answers"][number] | undefined;
      const openAiResult = checkedAnswer?.aiCorrectness
        ? ` OpenAI check: ${checkedAnswer.aiCorrectness.replace("_", " ")}${typeof checkedAnswer.aiScore === "number" ? ` (${checkedAnswer.aiScore}/5)` : ""}${checkedAnswer.aiFeedback ? ` - ${checkedAnswer.aiFeedback}` : ""}`
        : "";
      setStatusMessage(`Answer saved.${openAiResult} Next interview step is ready.`);
    } finally {
      setAnswerBusy(false);
    }
    if (!submitted) return;
    await loadDetail(detail.session.id);
    await loadSessions();
  }

  async function skipQuestion() {
    if (skipBusy) return;
    if (!detail) {
      setStatusMessage("Create or select an interview before skipping a question.");
      return;
    }
    if (!currentQuestion) {
      setStatusMessage("No active question is available to skip.");
      return;
    }
    setSkipBusy(true);
    setStatusMessage("Skipping current question...");
    try {
      const response = await fetch(`/api/interviews/${detail.session.id}/control`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "skip", reason: "Candidate skipped question" })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setStatusMessage(data.error ?? "Skip failed. Please try again.");
        return;
      }
      setAnswer("");
      await loadDetail(detail.session.id);
      await loadSessions();
      setStatusMessage(data.session?.currentQuestionId ? "Question skipped. Next question is ready." : "Question skipped. The planned interview is complete.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Skip failed. Please try again.");
    } finally {
      setSkipBusy(false);
    }
  }

  function blockAnswerTransfer(event: ClipboardEvent<HTMLTextAreaElement> | DragEvent<HTMLTextAreaElement>) {
    event.preventDefault();
    setStatusMessage("Copy/paste and drag/drop are disabled for candidate answers. Please type the answer or use the live transcript.");
  }

  function handleAnswerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    if (!answerBusy && !skipBusy && currentQuestion && answer.trim()) void submitAnswer();
  }

  function toggleMic() {
    if (micListening) {
      stopMic("Mic stopped. Review or edit your answer before submitting.");
      return;
    }
    void startMic();
  }

  async function startMic() {
    const SpeechRecognitionCtor = getSpeechRecognition();
    if (!SpeechRecognitionCtor) {
      setStatusMessage("Speech recognition is not available in this browser. Use Chrome or Edge on localhost/HTTPS, or type your answer.");
      return;
    }
    stopMic();
    try {
      if (navigator.mediaDevices?.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        stream.getTracks().forEach((track) => track.stop());
      }
    } catch {
      setStatusMessage("Microphone permission was blocked. Allow mic access, then use mic again.");
      return;
    }

    const recognition = new SpeechRecognitionCtor();
    recognitionRef.current = recognition;
    micBaseTextRef.current = (answerInputRef.current?.value ?? answer).trim();
    micFinalTextRef.current = "";
    micInterimTextRef.current = "";
    micListeningRef.current = true;
    setMicListening(true);
    setMode("voice");
    setStatusMessage("Mic is listening. Speak your answer and it will appear in the compose box.");
    answerInputRef.current?.focus();

    recognition.lang = "en-US";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onresult = (event) => {
      let interim = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const transcript = event.results[index][0]?.transcript?.trim() ?? "";
        if (!transcript) continue;
        if (event.results[index].isFinal) {
          micFinalTextRef.current = `${micFinalTextRef.current} ${transcript}`.trim();
        } else {
          interim = `${interim} ${transcript}`.trim();
        }
      }
      micInterimTextRef.current = interim;
      applyMicTranscript(interim);
    };
    recognition.onerror = (event) => {
      commitMicTranscript();
      micListeningRef.current = false;
      setMicListening(false);
      recognitionRef.current = null;
      setStatusMessage(`Mic input stopped: ${event.error || "speech recognition error"}. Review the compose box or try again.`);
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      commitMicTranscript();
      if (!micListeningRef.current) return;
      micListeningRef.current = false;
      setMicListening(false);
      const captured = (answerInputRef.current?.value ?? answer).trim();
      setStatusMessage(captured ? "Mic stopped. Review or edit your answer before submitting." : "Mic stopped, but no speech was captured. Try again or type your answer.");
    };
    try {
      recognition.start();
    } catch (error) {
      micListeningRef.current = false;
      setMicListening(false);
      recognitionRef.current = null;
      setStatusMessage(error instanceof Error ? error.message : "Mic could not start. Please type your answer.");
    }
  }

  function applyMicTranscript(interim = micInterimTextRef.current) {
    const text = [micBaseTextRef.current, micFinalTextRef.current, interim].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
    setAnswer(text);
    if (answerInputRef.current) answerInputRef.current.value = text;
  }

  function commitMicTranscript() {
    if (micInterimTextRef.current && !micFinalTextRef.current.includes(micInterimTextRef.current)) {
      micFinalTextRef.current = `${micFinalTextRef.current} ${micInterimTextRef.current}`.trim();
      micInterimTextRef.current = "";
    }
    applyMicTranscript("");
  }

  function stopMic(message?: string) {
    commitMicTranscript();
    micListeningRef.current = false;
    setMicListening(false);
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    try {
      recognition?.stop();
    } catch {
      // Browsers can throw if speech recognition has already ended.
    }
    if (message) setStatusMessage(message);
  }

  function getSpeechRecognition() {
    const browserWindow = window as typeof window & {
      SpeechRecognition?: SpeechRecognitionConstructor;
      webkitSpeechRecognition?: SpeechRecognitionConstructor;
    };
    return browserWindow.SpeechRecognition ?? browserWindow.webkitSpeechRecognition;
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

  async function speakQuestionText(questionText: string) {
    stopVoicePlayback();
    const runId = voiceRunRef.current + 1;
    voiceRunRef.current = runId;
    setSpeaking(true);
    setStatusMessage("Preparing Murf Falcon voice playback...");
    try {
      const response = await fetch("/api/voice/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: questionText })
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        stopVoicePlayback();
        setStatusMessage(data.error ?? "Murf voice playback failed. Use text transcript fallback.");
        return;
      }
      const blob = await response.blob();
      if (runId !== voiceRunRef.current) return;
      const objectUrl = URL.createObjectURL(blob);
      const audio = new Audio(objectUrl);
      audioRef.current = audio;
      audioUrlRef.current = objectUrl;
      audio.onended = () => stopVoicePlayback("Murf Falcon finished speaking.");
      audio.onerror = () => stopVoicePlayback("Voice playback stopped because the audio could not be played.");
      await audio.play();
      setStatusMessage("Murf Falcon is speaking the selected question.");
    } catch (error) {
      stopVoicePlayback();
      setStatusMessage(error instanceof Error ? error.message : "Murf voice playback failed. Use text transcript fallback.");
    }
  }

  async function recordProctorEvent(type: Detail["proctorEvents"][number]["type"], note: string, severity: "info" | "warning" | "review" = "warning") {
    if (!detail) return;
    await fetch(`/api/interviews/${detail.session.id}/proctor`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, note, severity })
    }).catch(() => undefined);
    await loadDetail(detail.session.id);
    await loadSessions();
  }

  async function ensureCameraPermissionForInterview() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setSetupError("This browser does not expose camera permissions. Use a modern browser with webcam access to start the interview.");
      return false;
    }
    setStatusMessage("Requesting camera permission before starting the real interview...");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
      stream.getTracks().forEach((track) => track.stop());
      return true;
    } catch {
      setSetupError("Camera permission is required before a real interview can start. Please allow camera access and try again.");
      setStatusMessage("Camera permission was not granted.");
      return false;
    }
  }

  if (!roleSelected) {
    return <RoleSelection onSelect={selectRole} onLoadDraft={() => void loadDraft()} onLoadSample={loadSampleSetup} />;
  }

  const levelOneCleared = interviewLevel === "typing" && detail?.evaluation?.recommendation === "Advance";
  const showLevelTwoTestBypass = detail && interviewLevel === "typing" && !levelOneCleared && !levelUpDismissed;

  return (
    <main className="premium-shell min-h-screen">
      <header className="premium-header relative overflow-hidden border-b border-white/10 text-white">
        <div className="header-scan" />
        <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl">
            <div className="mb-3 flex items-center gap-3">
              <div className="logo-frame">
                <Image src="/axomir-logo.jpeg" alt="Axomir logo" width={72} height={72} className="h-full w-full object-contain" priority />
              </div>
              <div>
                <div className="inline-flex items-center rounded border border-white/15 bg-white/10 px-2.5 py-1 text-xs font-medium text-white/85">
                  Powered by Axomir
                </div>
                <p className="mt-1 text-xs text-white/45">Practice / Prepare / Get Hired</p>
              </div>
            </div>
            <h1 className="text-3xl font-semibold tracking-normal">Axomir - Autonomous eXpert Oral Mock Interview Responder</h1>
            <p className="mt-1 text-sm text-white/65">Premium two-level screening with resume-aware planning, live bot-agent interviews, evidence scoring, and human review.</p>
          </div>
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 rounded border border-white/15 bg-white/10 px-3 py-2 text-sm text-white/75">
              <ShieldCheck className="h-4 w-4 text-[#9fd7cf]" />
              Advisory decisions only
            </div>
            <nav className="flex flex-wrap gap-2" aria-label="Primary navigation">
              <NavLink href="#setup" icon={<Upload className="h-4 w-4" />} label="Upload JD/Resume" />
              <NavLink href="#scorecard" icon={<Sparkles className="h-4 w-4" />} label="Scorecard" />
              <NavLink href="#history" icon={<History className="h-4 w-4" />} label="History" />
              <NavLink href="/admin" icon={<ShieldCheck className="h-4 w-4" />} label="Admin" />
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
              <button type="button" className="focus-ring micro-button inline-flex items-center gap-1 rounded-md border border-ink/10 px-2 py-1 text-xs text-ink/70 hover:border-teal" onClick={loadSampleSetup} disabled={busy || uploadingResume}>
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
              <div className="grid gap-2 sm:grid-cols-2" role="group" aria-label="Level 1 interview mode">
                <button type="button" className={`focus-ring micro-button rounded-md border px-3 py-3 text-left transition ${mode === "text" ? "border-teal bg-teal/10 shadow-sm" : "border-ink/15 hover:border-teal"}`} onClick={() => setMode("text")} disabled={busy || uploadingResume}>
                  <span className="flex items-center gap-2 font-medium"><FileText className="h-4 w-4 text-teal" />Text interview</span>
                  <span className="mt-1 block text-xs leading-5 text-ink/58">Candidate types every Level 1 answer.</span>
                </button>
                <button type="button" className={`focus-ring micro-button rounded-md border px-3 py-3 text-left transition ${mode === "voice" ? "border-teal bg-teal/10 shadow-sm" : "border-ink/15 hover:border-teal"}`} onClick={() => setMode("voice")} disabled={busy || uploadingResume}>
                  <span className="flex items-center gap-2 font-medium"><Volume2 className="h-4 w-4 text-teal" />Voice interviewer</span>
                  <span className="mt-1 block text-xs leading-5 text-ink/58">Murf Falcon speaks questions with transcript fallback.</span>
                </button>
              </div>
              <div className="rounded-md border border-teal/20 bg-teal/10 p-3 text-sm text-ink/70">
                <FileText className="mr-1 inline h-4 w-4 text-teal" />
                Level 1 supports text answers or Murf Falcon voice-assisted questions. Level 2 unlocks after the Level 1 scorecard recommends advancing.
              </div>
              <div className="grid grid-cols-3 gap-2">
                <button type="button" className="focus-ring micro-button inline-flex items-center justify-center gap-1 rounded-md border border-ink/15 px-2 py-2 text-sm hover:border-teal disabled:opacity-50" onClick={saveDraft} disabled={busy || uploadingResume}>
                  <Save className="h-4 w-4 text-teal" />
                  Save
                </button>
                <button type="button" className="focus-ring micro-button inline-flex items-center justify-center gap-1 rounded-md border border-ink/15 px-2 py-2 text-sm hover:border-teal disabled:opacity-50" onClick={() => void loadDraft()} disabled={busy || uploadingResume}>
                  <RefreshCw className="h-4 w-4 text-teal" />
                  Load
                </button>
                <button type="button" className="focus-ring micro-button inline-flex items-center justify-center gap-1 rounded-md border border-ink/15 px-2 py-2 text-sm hover:border-ember disabled:opacity-50" onClick={resetSetup} disabled={busy || uploadingResume}>
                  <RotateCcw className="h-4 w-4 text-ember" />
                  Reset
                </button>
              </div>
              {setupError && <p className="rounded-md border border-ember/30 bg-ember/10 px-3 py-2 text-sm text-ember">{setupError}</p>}
              <button type="button" disabled={busy} onClick={createInterview} className="focus-ring premium-button flex w-full items-center justify-center gap-2 rounded-md px-4 py-2.5 font-medium text-white disabled:opacity-60">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                {busy ? "Starting..." : "Start Interview"}
              </button>
            </div>
          </section>

          <section id="history" className="premium-panel rounded-lg p-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="text-xs font-medium uppercase text-teal">Recent</p>
                <h2 className="font-semibold">Interview History</h2>
              </div>
              <button type="button" className="focus-ring rounded p-1" onClick={loadSessions} aria-label="Refresh sessions"><RefreshCw className="h-4 w-4" /></button>
            </div>
            <div className="space-y-2">
              {sessions.length === 0 && <p className="text-sm text-ink/60">No interviews yet.</p>}
              {sessions.map((session) => (
                <button key={session.id} type="button" onClick={() => loadDetail(session.id)} className="focus-ring premium-list-item w-full rounded-md border border-ink/10 p-3 text-left hover:border-teal">
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
                    <p className="text-sm text-ink/60">{detail.job.title} / {interviewLevel === "bot" ? "Level 2 bot-agent typing" : "Level 1 typing"} / {detail.plan.status} plan</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className="focus-ring micro-button rounded-md border border-ink/15 px-3 py-2 text-sm transition hover:border-teal disabled:opacity-50" onClick={() => void action("approve-plan")} disabled={busy || activeAction !== null || detail.plan.status === "frozen"}>{activeAction === "approve-plan" ? <Loader2 className="mr-1 inline h-4 w-4 animate-spin" /> : <Play className="mr-1 inline h-4 w-4" />}Approve</button>
                    <button type="button" className="focus-ring micro-button rounded-md border border-ink/15 px-3 py-2 text-sm transition hover:border-teal disabled:opacity-50" onClick={() => void action("control", { action: "pause" })} disabled={busy || activeAction !== null || detail.session.status === "paused" || detail.session.status === "completed" || detail.session.status === "ended"}>{activeAction === "pause" ? <Loader2 className="mr-1 inline h-4 w-4 animate-spin" /> : <Pause className="mr-1 inline h-4 w-4" />}Pause</button>
                    <button type="button" className="focus-ring micro-button rounded-md border border-ink/15 px-3 py-2 text-sm transition hover:border-teal disabled:opacity-50" onClick={() => void action("control", { action: "resume" })} disabled={busy || activeAction !== null || detail.session.status === "active" || detail.session.status === "completed" || detail.session.status === "ended"}>{activeAction === "resume" ? <Loader2 className="mr-1 inline h-4 w-4 animate-spin" /> : <Play className="mr-1 inline h-4 w-4" />}Resume</button>
                    <button type="button" className="focus-ring rounded-md border border-ember px-3 py-2 text-sm text-ember transition hover:bg-ember/10 disabled:opacity-50" onClick={() => void action("control", { action: "end", reason: "Recruiter ended interview" })} disabled={busy || activeAction !== null || detail.session.status === "completed" || detail.session.status === "ended"}>{activeAction === "end" ? <Loader2 className="mr-1 inline h-4 w-4 animate-spin" /> : <Square className="mr-1 inline h-4 w-4" />}End</button>
                  </div>
                </div>
                <div className="mt-4 h-2 rounded-full bg-paper">
                  <div className="h-2 rounded-full bg-teal" style={{ width: `${progress}%` }} />
                </div>
              </div>

              {levelOneCleared && !levelUpDismissed ? (
                <LevelUpCard onStart={() => void startLevelTwoInterview()} busy={busy} />
              ) : null}
              {showLevelTwoTestBypass ? (
                <section className="premium-panel rounded-lg border border-amber-300/60 bg-amber-50/80 p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-xs font-bold uppercase text-amber-700">Temporary testing bypass</p>
                      <h3 className="mt-1 font-semibold">Open Level 2 without waiting for Level 1 clearance</h3>
                      <p className="mt-1 text-sm leading-6 text-ink/62">Use this only while testing the live bot-agent interview. Remove it before production screening.</p>
                    </div>
                    <button type="button" className="focus-ring rounded-md border border-amber-400 bg-white px-4 py-2 text-sm font-medium text-amber-800 transition hover:bg-amber-100 disabled:opacity-50" onClick={() => void startLevelTwoInterview()} disabled={busy}>
                      {busy ? <Loader2 className="mr-1 inline h-4 w-4 animate-spin" /> : <Bot className="mr-1 inline h-4 w-4" />}
                      Test Level 2
                    </button>
                  </div>
                </section>
              ) : null}

              <div className="space-y-5">
                <section className="premium-panel rounded-lg p-5">
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium uppercase text-teal">Live room</p>
                      <h3 className="font-semibold">{interviewLevel === "bot" ? "Level 2 Live Bot-Agent Interview" : "Level 1 Interview Room"}</h3>
                    </div>
                  </div>
                  <div className="mb-4 grid gap-2 rounded-md border border-ink/10 bg-white/75 p-2 sm:grid-cols-2" role="group" aria-label="Interview answer mode">
                    <button type="button" className={`focus-ring micro-button rounded-md border px-3 py-2 text-left text-sm transition ${mode === "text" ? "border-teal bg-teal/10 shadow-sm" : "border-ink/15 hover:border-teal"}`} onClick={() => {
                      stopVoicePlayback();
                      setMode("text");
                      setStatusMessage("Text answer mode selected.");
                    }} disabled={busy}>
                      <span className="flex items-center gap-2 font-medium"><FileText className="h-4 w-4 text-teal" />Text</span>
                      <span className="mt-1 block text-xs text-ink/55">Type the candidate answer.</span>
                    </button>
                    <button type="button" className={`focus-ring micro-button rounded-md border px-3 py-2 text-left text-sm transition ${mode === "voice" ? "border-teal bg-teal/10 shadow-sm" : "border-ink/15 hover:border-teal"}`} onClick={() => {
                      setMode("voice");
                      setStatusMessage("Voice interviewer mode selected. Use Speak to play the current question.");
                    }} disabled={busy}>
                      <span className="flex items-center gap-2 font-medium"><Volume2 className="h-4 w-4 text-teal" />Voice</span>
                      <span className="mt-1 block text-xs text-ink/55">Murf Falcon speaks the question.</span>
                    </button>
                  </div>
                  {mode === "voice" && (
                    <div className="voice-panel mb-4 grid gap-2 rounded-md p-3 text-sm md:grid-cols-3">
                      <span><Volume2 className="mr-1 inline h-4 w-4 text-teal" />Murf Falcon interviewer</span>
                      <span><Mic className="mr-1 inline h-4 w-4 text-teal" />Transcript fallback</span>
                      <span>Consent: {detail.session.consentStatus}</span>
                    </div>
                  )}
                  <InterviewIntegrityMonitor sessionId={detail.session.id} sessionStatus={detail.session.status} onEventLogged={async () => {
                    await loadDetail(detail.session.id);
                    await loadSessions();
                  }} />
                  {interviewLevel === "bot" ? <BotAgentPanel question={currentQuestion?.text} status={detail.session.status} /> : null}
                  {currentQuestion ? (
                    <div className="space-y-4">
                      <form className="chat-box rounded-lg border border-ink/10 bg-paper/70 p-3" onSubmit={(event) => {
                        event.preventDefault();
                        if (!answerBusy && !skipBusy) void submitAnswer();
                      }}>
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <div>
                            <p className="text-xs font-medium uppercase text-teal">Interview chat</p>
                            <p className="text-xs text-ink/50">Previous questions and answers stay visible like a chat thread.</p>
                          </div>
                          <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-ink/60">Adaptive difficulty {detail.session.currentDifficulty}/5</span>
                        </div>
                        <div className="chat-thread space-y-3 overflow-y-auto pr-1">
                          {chatTurns.map((turn, index) => {
                            const question = turn.question!;
                            return (
                              <div key={`${question.id}-${turn.answer?.id ?? "current"}`} className="space-y-2">
                                <div className="flex items-start gap-2">
                                  <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#111820] text-xs font-semibold text-white">AI</div>
                                  <div className={`max-w-[92%] rounded-lg border p-3 ${turn.current ? "border-teal/35 bg-white shadow-sm" : "border-ink/10 bg-white/80"}`}>
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                      <p className="text-[11px] uppercase tracking-wide text-ink/45">{turn.current ? "Current question" : `Question ${index + 1}`} / Priority {question.priorityRank ?? "-"} / {question.priority ?? "Medium"} / Difficulty {question.difficulty}</p>
                                      {mode === "voice" ? (
                                        <button type="button" className="focus-ring rounded-md border border-teal/25 bg-teal/10 px-3 py-1.5 text-xs font-semibold text-teal transition hover:bg-teal/15 disabled:opacity-50" onClick={() => speaking ? stopVoicePlayback("Voice playback stopped.") : void speakQuestionText(question.text)} disabled={busy}>
                                          {speaking ? <Square className="mr-1 inline h-3.5 w-3.5" /> : <Volume2 className="mr-1 inline h-3.5 w-3.5" />}
                                          {speaking ? "Stop voice" : "Speak"}
                                        </button>
                                      ) : null}
                                    </div>
                                    <p className="mt-1 text-sm font-medium leading-6 text-ink">{question.text}</p>
                                  </div>
                                </div>
                                {turn.answer ? (
                                  <div className="flex items-start justify-end gap-2">
                                    <div className="max-w-[92%] rounded-lg border border-teal/20 bg-teal/10 p-3">
                                      <p className="text-[11px] uppercase tracking-wide text-teal">Your answer</p>
                                      <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-ink/78">{turn.answer.text}</p>
                                      {turn.answer.aiCorrectness ? (
                                        <p className="mt-2 rounded-md bg-white/70 px-2 py-1 text-xs leading-5 text-ink/58">OpenAI: {turn.answer.aiCorrectness.replace("_", " ")}{typeof turn.answer.aiScore === "number" ? ` (${turn.answer.aiScore}/5)` : ""}{turn.answer.aiFeedback ? ` - ${turn.answer.aiFeedback}` : ""}</p>
                                      ) : null}
                                    </div>
                                    <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-teal text-xs font-semibold text-white">You</div>
                                  </div>
                                ) : null}
                              </div>
                            );
                          })}
                        </div>
                        <div className="chat-composer mt-4 rounded-lg border border-ink/10 bg-white p-2 shadow-sm">
                          <textarea
                            ref={answerInputRef}
                            className="focus-ring chat-input w-full resize-none rounded-md border-0 bg-transparent px-3 py-2 text-sm outline-none"
                            placeholder="Message Axomir with your answer..."
                            value={answer}
                            onChange={(event) => setAnswer(event.target.value)}
                            onKeyDown={handleAnswerKeyDown}
                            onPaste={blockAnswerTransfer}
                            onDrop={blockAnswerTransfer}
                            onCopy={blockAnswerTransfer}
                            onCut={blockAnswerTransfer}
                          />
                          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-ink/10 px-2 pt-2">
                            <p className="text-xs text-ink/45">Press Enter to submit. Shift+Enter adds a new line.</p>
                            <div className="flex flex-wrap gap-2">
                              <button type="button" className="focus-ring rounded-md border border-ink/15 px-3 py-2 text-sm disabled:opacity-50" onClick={() => void skipQuestion()} disabled={skipBusy || answerBusy || !currentQuestion}>
                                {skipBusy ? <Loader2 className="mr-1 inline h-4 w-4 animate-spin" /> : null}
                                Skip
                              </button>
                              <button type="button" className={`focus-ring rounded-md border px-3 py-2 text-sm disabled:opacity-50 ${micListening ? "border-ember/40 bg-ember/10 text-ember" : "border-ink/15 hover:border-teal"}`} onClick={toggleMic} disabled={answerBusy || skipBusy || !currentQuestion}>
                                {micListening ? <MicOff className="mr-1 inline h-4 w-4" /> : <Mic className="mr-1 inline h-4 w-4" />}
                                {micListening ? "Stop mic" : "Use mic"}
                              </button>
                              <button type="button" className="focus-ring rounded-md border border-ink/15 px-3 py-2 text-sm disabled:opacity-50" onClick={() => setAnswer("")} disabled={answerBusy || skipBusy || !answer}>Clear</button>
                              <button type="button" className="focus-ring premium-button rounded-md px-4 py-2 text-sm text-white disabled:opacity-60" onClick={() => void submitAnswer()} disabled={answerBusy || skipBusy || !currentQuestion || !answer.trim()}>
                                {answerBusy ? <Loader2 className="mr-1 inline h-4 w-4 animate-spin" /> : <Send className="mr-1 inline h-4 w-4" />}
                                Submit
                              </button>
                            </div>
                          </div>
                        </div>
                      </form>
                    </div>
                  ) : (
                    <div className="rounded-md bg-paper p-5">
                      <CheckCircle2 className="mb-2 h-6 w-6 text-teal" />
                      <p className="font-medium">The planned interview is complete.</p>
                      <button type="button" className="focus-ring mt-3 rounded-md bg-teal px-4 py-2 text-white disabled:opacity-50" onClick={() => void action("evaluate")} disabled={busy || activeAction !== null}>{activeAction === "evaluate" ? <Loader2 className="mr-1 inline h-4 w-4 animate-spin" /> : null}Generate Scorecard</button>
                    </div>
                  )}
                </section>

                <div className="grid gap-5 xl:grid-cols-2">
                  <Panel title="Interview Plan">
                    <div className="rounded-md border border-ink/10 bg-paper p-3 text-sm">
                      <p className="font-medium">Question plan hidden from candidate view.</p>
                      <p className="mt-1 leading-5 text-ink/65">The interview opens instantly with a starter question while OpenAI tailors unique technical, coding, and role-fit follow-ups in the background. The student only sees questions as they are asked.</p>
                      <div className="mt-3 grid grid-cols-3 gap-2">
                        <Metric label="Questions" value={`${detail.plan.questions.length}`} />
                        <Metric label="High priority" value={`${detail.plan.questions.filter((question) => question.priority === "High").length}`} />
                        <Metric label="Technical depth" value={`${detail.plan.questions.filter((question) => question.competency === "Technical knowledge and depth").length}`} />
                      </div>
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
                </div>
              </div>

              <div id="scorecard">
                <Scorecard detail={detail} onEvaluate={() => void action("evaluate")} activeAction={activeAction} />
              </div>
            </>
          )}
        </section>
      </div>
      <footer className="border-t border-ink/10 bg-white text-center text-sm text-ink/55">
        <div className="tricolour-ribbon" aria-hidden="true" />
        <div className="px-4 py-4">
          <span className="font-medium text-ink/70">Powered by Axomir / copyright@2026</span>
          <span className="mx-2 text-ink/25">/</span>
          <span>Made by Indians</span>
        </div>
      </footer>
    </main>
  );
}

function RoleSelection({ onSelect, onLoadDraft, onLoadSample }: { onSelect: (template: SelectedRole) => void; onLoadDraft: () => void; onLoadSample: () => void }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "technical" | "nonTechnical">("all");
  const filteredRoles = roleTemplates.filter((template) => {
    const matchesFilter = filter === "all" || template.category === filter;
    const haystack = `${template.title} ${template.focusAreas} ${template.description} ${template.responsibilities.join(" ")} ${template.skills.join(" ")} ${template.subRoles.map((role) => `${role.title} ${role.description} ${role.skills.join(" ")}`).join(" ")}`.toLowerCase();
    return matchesFilter && haystack.includes(query.trim().toLowerCase());
  });

  return (
    <main className="premium-shell min-h-screen">
      <header className="premium-header relative overflow-hidden border-b border-white/10 text-white">
        <div className="header-scan" />
        <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-3xl">
            <div className="mb-4 flex items-center gap-3">
              <div className="logo-frame">
                <Image src="/axomir-logo.jpeg" alt="Axomir logo" width={72} height={72} className="h-full w-full object-contain" priority />
              </div>
              <div>
                <div className="inline-flex items-center rounded border border-white/15 bg-white/10 px-2.5 py-1 text-xs font-medium text-white/85">
                  Powered by Axomir
                </div>
                <h1 className="mt-2 text-3xl font-semibold tracking-normal">Axomir - Autonomous eXpert Oral Mock Interview Responder</h1>
              </div>
            </div>
            <p className="text-sm leading-6 text-white/68">Select the job role first. Axomir will use that JD with the candidate resume to start a real interview after camera permission is granted.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="focus-ring rounded border border-white/15 bg-white/10 px-3 py-2 text-sm text-white/80 hover:bg-white/15" onClick={onLoadDraft}>Load Draft</button>
            <button type="button" className="focus-ring rounded border border-white/15 bg-white/10 px-3 py-2 text-sm text-white/80 hover:bg-white/15" onClick={onLoadSample}>Load Sample</button>
            <Link className="focus-ring rounded border border-white/15 bg-white/10 px-3 py-2 text-sm text-white/80 hover:bg-white/15" href="/admin">Admin</Link>
          </div>
        </div>
      </header>
      <section className="mx-auto grid max-w-7xl gap-5 px-4 py-6 lg:grid-cols-[1.02fr_0.98fr]">
        <div className="premium-panel animate-rise rounded-lg p-6">
          <p className="text-xs font-medium uppercase text-teal">Agent overview</p>
          <h2 className="mt-2 text-2xl font-semibold">Resume-aware AI interviewer for real screening rounds</h2>
          <p className="mt-3 text-sm leading-6 text-ink/68">Axomir selects role-specific questions from the job description and resume, runs a structured interview, collects typed answers or Murf Falcon voice flow, and sends the full session to admin review with scorecard evidence.</p>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <WorkflowStep icon={<ClipboardList className="h-4 w-4" />} title="Role matched" text="Primary and subrole JDs include skills, responsibilities, and priority focus areas." />
            <WorkflowStep icon={<Bot className="h-4 w-4" />} title="Level-up ready" text="Level 2 unlocks a live bot-agent interview after the first scorecard clears." />
            <WorkflowStep icon={<ShieldCheck className="h-4 w-4" />} title="Review first" text="Scorecards and integrity signals support human review instead of automatic accusations." />
          </div>
          <UniqueFeatureStatus />
        </div>

        <div className="premium-panel animate-rise rounded-lg p-6">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-md bg-[#111820] text-white">
              <Camera className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase text-teal">Level up</p>
              <h2 className="mt-1 text-2xl font-semibold">Live agent with camera interview</h2>
            </div>
          </div>
          <div className="mt-4 overflow-hidden rounded-md border border-white/70 bg-white/75 shadow-sm">
            <video className="level-up-video landing-level-video" src="/level-up-video.mp4" autoPlay muted loop playsInline controls preload="metadata" />
          </div>
          <div className="level-up-bubble mt-4">
            <p className="typewriter-text">
              <span className="bubble-kicker">Live camera interview agent</span>
              <span className="bubble-line">An interactive, camera-based AI interviewer that conducts real-time interviews, asks adaptive follow-up questions, evaluates candidate responses, and generates an evidence-based performance scorecard.</span>
            </p>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <Metric label="Camera gate" value="Required" />
            <Metric label="Integrity review" value="Admin" />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-8">
        <div className="premium-panel mb-5 rounded-lg p-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-medium uppercase text-teal">Step 1</p>
              <h2 className="text-2xl font-semibold">Choose Primary Role or Subrole</h2>
              <p className="mt-1 text-sm text-ink/60">Select a main role or a related subrole. The app will fill the JD with role responsibilities and skills.</p>
            </div>
            <div className="grid gap-3 md:grid-cols-[1fr_auto] lg:min-w-[620px]">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/42" />
              <input
                className="focus-ring w-full rounded-md border border-ink/15 bg-white/90 py-2 pl-9 pr-3 text-sm"
                placeholder="Search by role, skill, or responsibility"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <div className="grid grid-cols-3 rounded-md border border-ink/15 bg-white/80 p-1">
              {[
                ["all", "All"],
                ["technical", "Technical"],
                ["nonTechnical", "Non-tech"]
              ].map(([value, label]) => (
                <button key={value} type="button" className={`focus-ring rounded px-3 py-2 text-sm ${filter === value ? "bg-ink text-white" : "text-ink/65"}`} onClick={() => setFilter(value as typeof filter)}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredRoles.map((template) => (
            <article key={template.title} className="premium-panel role-card rounded-lg p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-[#111820] text-white">
                  <BriefcaseBusiness className="h-5 w-5" />
                </span>
                <span className="rounded border border-ink/10 bg-white/70 px-2 py-1 text-xs font-medium text-ink/60">
                  {template.category === "technical" ? "Technical" : "Non-technical"}
                </span>
              </div>
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-lg font-semibold">{template.title}</h3>
                <button type="button" className="focus-ring shrink-0 rounded-md bg-teal px-3 py-1.5 text-xs font-medium text-white" onClick={() => onSelect(template)}>Select</button>
              </div>
              <p className="mt-2 text-sm leading-6 text-ink/65">{template.description}</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <RoleMiniList title="Responsibilities" items={template.responsibilities} />
                <RoleMiniList title="Skills" items={template.skills} />
              </div>
              <div className="mt-4 border-t border-ink/10 pt-3">
                <p className="text-xs font-medium uppercase text-ink/45">Related subroles</p>
                <div className="mt-2 space-y-2">
                  {template.subRoles.map((role) => (
                    <button
                      key={role.title}
                      type="button"
                      className="focus-ring w-full rounded-md border border-ink/10 bg-white/70 p-3 text-left transition hover:border-teal hover:bg-white"
                      onClick={() => onSelect({
                        title: role.title,
                        category: template.category,
                        focusAreas: role.skills.join(", "),
                        description: role.description,
                        responsibilities: role.responsibilities,
                        skills: role.skills,
                        parentTitle: template.title
                      })}
                    >
                      <span className="block text-sm font-semibold">{role.title}</span>
                      <span className="mt-1 block text-xs leading-5 text-ink/60">{role.description}</span>
                      <span className="mt-2 block text-xs font-medium text-teal">{role.skills.join(", ")}</span>
                    </button>
                  ))}
                </div>
              </div>
            </article>
          ))}
        </div>
        {filteredRoles.length === 0 ? (
          <div className="premium-panel mt-4 rounded-lg p-5 text-sm text-ink/65">No matching roles found. Try a broader skill or switch role type.</div>
        ) : null}
      </section>
      <footer className="border-t border-ink/10 bg-white text-center text-sm text-ink/55">
        <div className="tricolour-ribbon" aria-hidden="true" />
        <div className="px-4 py-4">
          <span className="font-medium text-ink/70">Powered by Axomir / copyright@2026</span>
          <span className="mx-2 text-ink/25">/</span>
          <span>Made by Indians</span>
        </div>
      </footer>
    </main>
  );
}

function RoleMiniList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-md border border-ink/10 bg-white/60 p-3">
      <p className="text-xs font-medium uppercase text-ink/45">{title}</p>
      <ul className="mt-2 space-y-1 text-xs leading-5 text-ink/65">
        {items.slice(0, 4).map((item) => <li key={item}>{item}</li>)}
      </ul>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="premium-panel animate-rise rounded-lg p-8">
      <div className="max-w-2xl">
        <div className="mb-4 flex items-center gap-4">
          <div className="logo-frame logo-frame-light">
            <Image src="/axomir-logo.jpeg" alt="Axomir logo" width={64} height={64} className="h-full w-full object-contain" />
          </div>
          <div className="inline-flex h-11 w-11 items-center justify-center rounded-md bg-[#111820] text-white">
            <BriefcaseBusiness className="h-5 w-5" />
          </div>
        </div>
        <h2 className="text-2xl font-semibold">Build a tailored Axomir interview</h2>
        <p className="mt-2 text-sm leading-6 text-ink/65">Upload a resume, paste the job description, complete the typing interview, and unlock the live bot-agent level after clearing the scorecard.</p>
      </div>
      <div className="mt-6 grid gap-3 md:grid-cols-3">
        <WorkflowStep icon={<Upload className="h-4 w-4" />} title="Resume-aware" text="Extracts name, role, skills, claims, and experience." />
        <WorkflowStep icon={<ClipboardList className="h-4 w-4" />} title="OpenAI questions" text="Creates hidden, prioritized technical and coding questions." />
        <WorkflowStep icon={<Bot className="h-4 w-4" />} title="Bot-agent ready" text="Level 2 shows a live visual interviewer while the candidate types." />
      </div>
    </div>
  );
}

function BotAgentPanel({ question, status }: { question?: string; status: string }) {
  return (
    <section className="bot-agent-panel mb-4 rounded-lg p-4">
      <div className="grid gap-4 md:grid-cols-[150px_1fr] md:items-center">
        <div className="bot-agent-avatar" aria-label="Axomir live bot agent">
          <div className="bot-head">
            <span className="bot-eye bot-eye-left" />
            <span className="bot-eye bot-eye-right" />
            <span className="bot-mouth" />
          </div>
          <div className="bot-body" />
        </div>
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="rounded bg-teal/15 px-2 py-1 text-xs font-medium text-teal">Live bot agent</span>
            <span className="rounded bg-white/65 px-2 py-1 text-xs text-ink/60">{status}</span>
            <span className="rounded bg-white/65 px-2 py-1 text-xs text-ink/60">typing answer mode</span>
          </div>
          <p className="text-lg font-semibold text-ink">Axomir is asking the current question</p>
          <p className="mt-2 rounded-md border border-white/60 bg-white/70 p-3 text-sm leading-6 text-ink/72">
            {question ?? "The next question will appear here when the interview is ready."}
          </p>
          <p className="mt-2 text-xs leading-5 text-ink/52">The bot presence is visual guidance for the candidate. Camera monitoring remains an integrity review signal and does not confirm misconduct by itself.</p>
        </div>
      </div>
    </section>
  );
}

function LevelUpCard({ onStart, busy }: { onStart: () => void; busy: boolean }) {
  return (
    <section className="level-up-card rounded-lg p-5" role="status" aria-live="polite">
      <div className="grid gap-4 md:grid-cols-[120px_1fr_auto] md:items-center">
        <div className="level-up-badge" aria-hidden="true">
          <span className="level-up-ring" />
          <span className="level-up-medal">II</span>
        </div>
        <div>
          <p className="text-xs font-medium uppercase text-teal">Level up unlocked</p>
          <h3 className="mt-1 text-2xl font-semibold">Congratulations you&apos;re now eligible for level up live interview</h3>
        </div>
        <button type="button" className="focus-ring premium-button rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-60" onClick={onStart} disabled={busy}>
          {busy ? <Loader2 className="mr-1 inline h-4 w-4 animate-spin" /> : <Bot className="mr-1 inline h-4 w-4" />}
          Start Level 2
        </button>
      </div>
      <div className="mt-5 overflow-hidden rounded-md border border-white/70 bg-white/75 shadow-sm">
        <video className="level-up-video" src="/level-up-video.mp4" autoPlay muted loop playsInline controls />
      </div>
      <div className="level-up-bubble mt-4">
        <p className="typewriter-text">
          <span className="bubble-kicker">Live camera interview agent</span>
          <span className="bubble-line">An interactive, camera-based AI interviewer that conducts real-time interviews, asks adaptive follow-up questions, evaluates candidate responses, and generates an evidence-based performance scorecard.</span>
        </p>
      </div>
    </section>
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

function Scorecard({ detail, onEvaluate, activeAction }: { detail: Detail; onEvaluate: () => void; activeAction: string | null }) {
  return (
    <section className="premium-panel rounded-lg p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-semibold">Scorecard and Human Review</h3>
        <button type="button" className="focus-ring rounded-md bg-teal px-4 py-2 text-white disabled:opacity-50" onClick={onEvaluate} disabled={activeAction !== null}>
          {activeAction === "evaluate" ? <Loader2 className="mr-1 inline h-4 w-4 animate-spin" /> : null}
          Generate Scorecard
        </button>
      </div>
      {!detail.evaluation && <p className="text-sm text-ink/60">No scorecard generated yet.</p>}
      {detail.evaluation && (
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <Metric label="Overall" value={`${detail.evaluation.percentageScore}%`} />
            <Metric label="Recommendation" value={detail.evaluation.recommendation} />
            <Metric label="Human Review" value={detail.evaluation.needsHumanReview ? "Required" : "Not flagged"} />
          </div>
          <KnowledgeGraph percentage={detail.evaluation.percentageScore} />
          <ProctorReview events={detail.proctorEvents} />
          <ScorecardQuotes detail={detail} />
          {detail.evaluation.needsHumanReview && (
            <div className="rounded-md border border-ember/30 bg-ember/10 p-3 text-sm">
              <AlertTriangle className="mr-1 inline h-4 w-4 text-ember" />
              {detail.evaluation.humanReviewReasons.join(" ")}
            </div>
          )}
          <div className="grid gap-3 md:grid-cols-2">
            {detail.evaluation.competencyScores.map((score) => (
              <details key={score.competency} className="rounded-md border border-ink/10 p-3">
                <summary className="cursor-pointer font-medium">{score.competency}: {score.score}/5 / {score.confidence} confidence</summary>
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

function KnowledgeGraph({ percentage }: { percentage: number }) {
  const value = Math.max(0, Math.min(100, Math.round(Number.isFinite(percentage) ? percentage : 0)));

  return (
    <div className="knowledge-graph rounded-md border border-ink/10 bg-white/75 p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="knowledge-ring shrink-0" style={{ "--knowledge": `${value}%` } as CSSProperties} aria-label={`Knowledge percentage ${value}%`}>
          <span>{value}%</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-teal">Knowledge Graph</p>
          <h4 className="mt-1 font-semibold text-ink">Estimated role knowledge from evaluated answers</h4>
          <p className="mt-1 text-sm leading-6 text-ink/62">This graph visualizes the existing scorecard percentage without changing the scoring or confidence logic.</p>
          <div className="knowledge-bar mt-3" aria-hidden="true">
            <span style={{ width: `${value}%` }} />
          </div>
        </div>
      </div>
    </div>
  );
}

function ScorecardQuotes({ detail }: { detail: Detail }) {
  const questionById = new Map(detail.plan.questions.map((question) => [question.id, question]));
  const competencyQuotes = detail.evaluation?.competencyScores
    .filter((score) => score.evidenceQuote)
    .map((score) => ({ label: score.competency, quote: score.evidenceQuote as string })) ?? [];
  const answerQuotes = detail.answers.slice(0, 4).map((candidateAnswer) => {
    const question = questionById.get(candidateAnswer.questionId);
    return {
      label: question ? `${question.competency} answer` : "Candidate answer",
      quote: candidateAnswer.text
    };
  });
  const quotes = [...competencyQuotes, ...answerQuotes];

  return (
    <Panel title="Scorecard Quotes">
      {quotes.length === 0 ? (
        <p className="text-sm text-ink/60">No candidate answer quotes are available yet.</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {quotes.slice(0, 8).map((item, index) => (
            <figure key={`${item.label}-${index}`} className="rounded-md border border-ink/10 bg-white/75 p-3">
              <blockquote className="text-sm leading-6 text-ink/75">&quot;{truncateQuote(item.quote)}&quot;</blockquote>
              <figcaption className="mt-2 text-xs font-medium uppercase text-teal">{item.label}</figcaption>
            </figure>
          ))}
        </div>
      )}
    </Panel>
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
  if (href.startsWith("/")) {
    return (
      <Link className="focus-ring inline-flex items-center gap-2 rounded border border-white/15 bg-white/10 px-3 py-2 text-sm text-white/80 transition hover:bg-white/15 hover:text-white" href={href}>
        {icon}
        {label}
      </Link>
    );
  }
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

function UniqueFeatureStatus() {
  const features = [
    {
      title: "Resume-aware probing",
      status: "Working",
      text: "Questions come from the candidate resume claims, job description, responsibilities, and skills instead of a generic list."
    },
    {
      title: "Adaptive difficulty",
      status: "Working",
      text: "Difficulty steps up or down based on OpenAI answer review and the current interview state."
    },
    {
      title: "Rubric-anchored scoring",
      status: "Working",
      text: "Scores are tied to competency rubrics and supporting answer quotes so candidates are scored consistently."
    },
    {
      title: "Inconsistency detector",
      status: "Working",
      text: "The scorecard compares resume claims with interview answers and highlights gaps for recruiter verification."
    },
    {
      title: "Human-in-the-loop",
      status: "Working",
      text: "Low-confidence, incomplete, or reject recommendations go to admin review. Axomir does not make final hiring decisions by itself."
    },
    {
      title: "UC1 to UC2 chaining",
      status: "API ready",
      text: "The UC1 handoff endpoint can pass shortlisted candidate and job data directly into the UC2 interview flow."
    }
  ];

  return (
    <div className="mt-5 rounded-md border border-teal/20 bg-[#f7fbfa] p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase text-teal">Working status</p>
          <h3 className="mt-1 font-semibold text-ink">Unique feature checklist</h3>
        </div>
        <span className="inline-flex w-fit items-center gap-1 rounded-full bg-teal/10 px-3 py-1 text-xs font-semibold text-teal">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Aligned with checklist
        </span>
      </div>
      <div className="mt-4 grid gap-2">
        {features.map((feature) => (
          <div key={feature.title} className="rounded-md border border-ink/10 bg-white/80 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium text-ink">{feature.title}</p>
              <span className={`rounded px-2 py-1 text-xs font-semibold ${feature.status === "Working" ? "bg-teal/10 text-teal" : "bg-[#eef4ff] text-[#255caa]"}`}>{feature.status}</span>
            </div>
            <p className="mt-1 text-sm leading-6 text-ink/62">{feature.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProctorReview({ events }: { events: Detail["proctorEvents"] }) {
  const summary = summarizeProctorEvents(events);
  return (
    <Panel title="Integrity Monitor">
      <div className="grid gap-3 md:grid-cols-4">
        <Metric label="Tab changes" value={`${summary.tabHidden}`} />
        <Metric label="Focus losses" value={`${summary.windowBlur}`} />
        <Metric label="Camera movement" value={`${summary.cameraMotion}`} />
        <Metric label="Camera denied" value={`${summary.cameraDenied}`} />
      </div>
      {events.length > 0 && (
        <div className="mt-3 max-h-44 space-y-2 overflow-auto pr-1">
          {events.slice().reverse().map((event) => (
            <div key={event.id} className="rounded-md border border-ink/10 bg-white/70 p-2 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{event.type.replaceAll("_", " ")}</span>
                <span className={event.status === "needs_review" ? "text-ember" : "text-ink/45"}>{event.status?.replaceAll("_", " ") ?? event.severity}</span>
              </div>
              <div className="mt-1 grid gap-1 text-ink/55 sm:grid-cols-4">
                <span>{new Date(event.startTime ?? event.createdAt).toLocaleTimeString()}</span>
                <span>{event.measurementLabel ? `${event.measurementLabel}: ${event.measuredValue ?? "--"}` : event.direction ?? "signal"}</span>
                <span>{typeof event.durationMs === "number" ? `${(event.durationMs / 1000).toFixed(1)} sec` : "--"}</span>
                <span>{typeof event.confidence === "number" ? `${Math.round(event.confidence * 100)}% confidence` : "confidence n/a"}</span>
              </div>
              <p className="mt-1 text-ink/65">{event.note}</p>
            </div>
          ))}
        </div>
      )}
      <p className="mt-3 text-xs leading-5 text-ink/50">Integrity signals are indicators for human review, not proof of malpractice. Reviewers should consider accessibility needs, camera quality, and interview context.</p>
    </Panel>
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

function formHasRole(current: typeof sampleSetup) {
  return current.jobTitle.trim().length > 0 && current.jobDescription.trim().length > 0;
}

function roleDescription(role: SelectedRole) {
  return [
    `${role.title}${role.parentTitle ? ` under ${role.parentTitle}` : ""}.`,
    role.description,
    `Core responsibilities: ${role.responsibilities.join("; ")}.`,
    `Required skills: ${role.skills.join(", ")}.`,
    `Role category: ${role.category === "technical" ? "Technical" : "Non-technical"}.`
  ].join("\n");
}

function summarizeProctorEvents(events: Detail["proctorEvents"]) {
  const movementTypes = new Set(["camera_motion", "head_turn_left", "head_turn_right", "head_tilt_up", "head_tilt_down", "head_roll_left", "head_roll_right", "rapid_head_movement", "repeated_head_pattern", "gaze_away"]);
  return {
    tabHidden: events.filter((event) => event.type === "tab_hidden").length,
    windowBlur: events.filter((event) => event.type === "window_blur").length,
    cameraMotion: events.filter((event) => movementTypes.has(event.type)).length,
    cameraDenied: events.filter((event) => event.type === "camera_denied").length
  };
}

function truncateQuote(value: string) {
  const trimmed = value.trim();
  if (trimmed.length <= 240) return trimmed;
  return `${trimmed.slice(0, 237)}...`;
}

function actionKeyFor(path: string, body: unknown) {
  if (path === "control" && typeof body === "object" && body && "action" in body) {
    return String((body as { action: unknown }).action);
  }
  return path;
}

function messageForActionStart(path: string, body: unknown) {
  const key = actionKeyFor(path, body);
  if (key === "approve-plan") return "Approving the plan...";
  if (key === "pause") return "Pausing the interview...";
  if (key === "resume") return "Resuming the interview...";
  if (key === "end") return "Ending the interview...";
  if (key === "skip") return "Skipping this question...";
  if (key === "evaluate") return "Generating the scorecard...";
  return "Running action...";
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
