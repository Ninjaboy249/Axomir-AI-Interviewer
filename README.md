# AI Interview Axomir

Production-oriented development handoff for an agentic first-round screening interviewer.

## What Is Implemented

- Recruiter dashboard, interview setup, plan editor, text interview room, voice interview controls, scorecard, human-review workspace, history, and feedback preview.
- JD and resume ingestion from pasted text with prompt-injection scrubbing and explicit resume-claim extraction.
- Resume upload extraction for PDF, DOCX, TXT, and MD files, with detected skills, experience lines, year mentions, and material resume claims shown before plan generation.
- Persistent local JSON data store at `.data/interviewer-db.json`.
- 8-question resume-aware interview planner with versioned frozen plans.
- Stateful interview loop with answer persistence, one bounded follow-up per question, difficulty adjustment, pause/resume/end/skip controls, and recovery by session ID.
- Consistency checker with resume excerpts, answer excerpts, classifications, confidence, and human verification steps.
- Deterministic weighted scoring in application code and advisory-only recommendations.
- Murf Falcon 2 server-side adapter using the documented `/v1/speech/stream` endpoint, plus WebSocket metadata for future streaming clients.
- Real-time browser camera integrity monitoring with MediaPipe Face Landmarker, neutral-pose calibration, yaw/pitch/roll tracking, gaze estimation, stream-health checks, event timeline, and CSV export. Events are review indicators only.
- Development-only UC1 handoff adapter at `/api/uc1/handoff`.
- Unit tests for scoring, follow-up behavior, resume-aware planning, and human-review flags.

## Unique Feature Checklist

| Requirement | Working status |
| --- | --- |
| Resume-aware probing: questions come from the candidate's own claims, not a generic list. | Working |
| Adaptive difficulty: questions step up or down based on answer quality. | Working |
| Rubric-anchored scoring: scores are tied to answer quotes for consistency. | Working |
| Inconsistency detector: gaps between resume claims and interview answers are surfaced. | Working |
| Human-in-the-loop: low-confidence or advisory reject cases go to admin review. | Working |
| UC1 to UC2 chaining: shortlisted candidate data can be sent into UC2 through the handoff endpoint. | API ready |

## Provider Boundaries

OpenAI is required for live interview question generation. This handoff keeps the model configurable with `OPENAI_MODEL` and includes a reusable `lib/openai-provider.ts` adapter. Deterministic mock planning remains only for unit tests and non-user-facing workflow coverage.

Murf Falcon 2 is used only for interviewer speech. Candidate speech recognition is implemented as a browser/provider fallback boundary; raw audio is not stored by default.

## Setup

```bash
npm.cmd install
npm.cmd run dev
```

## Integrity Monitoring

The interview room includes a client-side monitoring panel. It requests webcam permission only when the candidate starts monitoring, lazy-loads `@mediapipe/tasks-vision`, calibrates a neutral forward-facing baseline, and logs event metadata such as head-pose direction, duration, confidence, and thresholds. Raw video is not stored.

Default demo thresholds live in `lib/integrity/event-engine.ts`:

- yaw left/right: `-30` / `30` degrees
- pitch down/up: `-20` / `20` degrees
- roll left/right: `-20` / `20` degrees
- sustained event duration: `3000ms`
- face-missing grace period: `2500ms`
- repeated event window: `120000ms`
- frame interval: `350ms`

Limitations: phone, hand, posture, and object handling are exposed as unavailable/model-dependent statuses until a dedicated browser object or hand model is configured. Gaze is estimated from MediaPipe face blendshapes and should be treated as approximate. Integrity events must never be used as confirmed malpractice without human review.

Open the local URL printed by Next.js.

## Environment

Copy `.env.example` to `.env.local` and fill only the providers you want to use.

- `OPENAI_API_KEY` and `OPENAI_MODEL` are required to generate candidate interview questions.
- `MURF_API_KEY`, `MURF_VOICE_ID=Pearl`, `MURF_STYLE=Conversational`, `MURF_REGION`, and `MURF_MODEL=Falcon` enable voice generation. The adapter normalizes `Falcon` to Murf's documented streaming model parameter for HTTP/WebSocket speech generation.
- `APP_DATA_FILE` controls local persistence.
- `STORE_DRIVER=memory` forces the serverless-safe in-memory store. Vercel also enables this automatically through `VERCEL=1`.
- `UC1_API_URL` and `UC1_API_KEY` are reserved for a real UC1 integration.

## Deploying To Vercel

1. Push this project to GitHub.
2. Import the repository in Vercel as a Next.js project.
3. Add these environment variables in Vercel Project Settings:
   - `OPENAI_API_KEY`
   - `OPENAI_MODEL`
   - `MURF_API_KEY`
   - `MURF_VOICE_ID=Pearl`
   - `MURF_STYLE=Conversational`
   - `MURF_REGION=global`
   - `MURF_MODEL=Falcon`
   - `SPEECH_TO_TEXT_PROVIDER=browser`
4. Deploy with the default command from `vercel.json`.

On Vercel, the app uses an in-memory serverless store so the deployment will run without filesystem write errors. This is good for demos, but data can reset between serverless instances or deployments. For production persistence, replace `lib/store.ts` with Postgres, Neon, Supabase, Vercel Postgres, or another durable database.

Resume uploads are limited to 4 MB on Vercel to stay within serverless request limits. Use pasted resume text or OCR output for larger/scanned files.

## Verification

```bash
npm.cmd run typecheck
npm.cmd run test
npm.cmd run build
```

Optional live-provider smoke checks:

```bash
npm.cmd run smoke:providers
```

## Known Handoff Notes

- The workspace was empty, so there was no existing UC1 implementation to modify.
- The current store is local JSON for development. Production should swap `lib/store.ts` for PostgreSQL/Prisma while preserving the domain schemas.
- Resume upload is available for PDF, DOCX, TXT, and MD. Scanned PDFs require OCR before upload or pasted text fallback.
- OpenAI live structured-output schemas are validated after generation with Zod. A production hardening pass should add full JSON Schema export in the provider request.
