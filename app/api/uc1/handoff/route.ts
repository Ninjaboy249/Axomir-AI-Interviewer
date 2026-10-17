import { NextResponse } from "next/server";
import { z } from "zod";

const HandoffInput = z.object({
  candidateId: z.string(),
  candidateName: z.string(),
  jobId: z.string(),
  jobTitle: z.string(),
  jobDescription: z.string(),
  resumeText: z.string(),
  shortlistMetadata: z.record(z.unknown()).default({})
});

export async function POST(request: Request) {
  const input = HandoffInput.parse(await request.json());
  const response = await fetch(new URL("/api/interviews", request.url), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      candidateName: input.candidateName,
      jobTitle: input.jobTitle,
      jobDescription: input.jobDescription,
      resumeText: input.resumeText,
      source: "uc1-mock",
      focusAreas: [`UC1 candidate ${input.candidateId}`, `UC1 job ${input.jobId}`]
    })
  });
  const body = await response.json();
  return NextResponse.json({ ...body, uc1: { connected: false, mode: "development mock adapter", shortlistMetadata: input.shortlistMetadata } }, { status: response.status });
}
