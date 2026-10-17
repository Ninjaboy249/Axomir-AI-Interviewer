import { v4 as uuid } from "uuid";
import { ResumeClaim } from "./domain";

export const skillWords = [
  "React", "Next.js", "TypeScript", "Node.js", "Python", "FastAPI", "PostgreSQL",
  "Kubernetes", "Docker", "AWS", "Azure", "GCP", "CI/CD", "Terraform", "Redis",
  "GraphQL", "REST", "LLM", "OpenAI", "Prisma", "Tailwind"
];

export function linesFrom(text: string) {
  return text.split(/\r?\n|[.;]\s+/).map((line) => line.trim()).filter(Boolean);
}

export function extractJobFacts(description: string) {
  const lower = description.toLowerCase();
  const skills = skillWords.filter((skill) => lower.includes(skill.toLowerCase()));
  const responsibilities = linesFrom(description).filter((line) => /build|design|lead|own|develop|deploy|operate|manage|collaborate|troubleshoot/i.test(line)).slice(0, 8);
  return {
    requiredSkills: skills.slice(0, 8),
    preferredSkills: skills.slice(8, 12),
    responsibilities
  };
}

export function extractResumeClaims(resumeText: string): ResumeClaim[] {
  const sourceLines = linesFrom(resumeText);
  const claims = sourceLines
    .filter((line) => /built|designed|led|owned|managed|deployed|improved|reduced|implemented|migrated|scaled|certified|production/i.test(line))
    .slice(0, 12)
    .map((excerpt) => ({
      id: uuid(),
      excerpt,
      category: skillWords.find((skill) => excerpt.toLowerCase().includes(skill.toLowerCase())) ?? "Experience",
      explicit: true,
      materiality: /production|lead|managed|deployed|scaled|reduced|improved/i.test(excerpt) ? "high" as const : "medium" as const
    }));
  if (claims.length > 0) return claims;
  return [{
    id: uuid(),
    excerpt: resumeText.slice(0, 240) || "No explicit resume claim provided.",
    category: "General experience",
    explicit: Boolean(resumeText.trim()),
    materiality: "medium"
  }];
}

export function extractResumeFacts(resumeText: string) {
  const sanitized = sanitizeDocumentText(resumeText);
  const lower = sanitized.toLowerCase();
  const skills = skillWords.filter((skill) => lower.includes(skill.toLowerCase()));
  const identity = extractResumeIdentity(sanitized);
  const experienceLines = linesFrom(sanitized)
    .filter((line) => /built|designed|led|owned|managed|deployed|improved|reduced|implemented|migrated|scaled|certified|production|experience|worked|developed|maintained/i.test(line))
    .slice(0, 10);
  const years = [...sanitized.matchAll(/(?:over\s+|around\s+|approximately\s+)?(\d{1,2})\+?\s+years?/gi)]
    .map((match) => match[0])
    .slice(0, 5);

  return {
    ...identity,
    skills,
    experience: experienceLines,
    yearsMentioned: years,
    claims: extractResumeClaims(sanitized)
  };
}

export function extractResumeIdentity(resumeText: string) {
  const topLines = resumeText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 18);

  const name = topLines.find((line) => {
    const words = line.split(/\s+/);
    return words.length >= 2 &&
      words.length <= 4 &&
      line.length <= 70 &&
      /^[A-Za-z][A-Za-z .'-]+$/.test(line) &&
      !/(resume|curriculum|vitae|email|phone|linkedin|github|engineer|developer|manager|analyst|consultant|architect|specialist|designer|lead|intern)/i.test(line);
  });

  const designation = topLines.find((line) =>
    line.length <= 90 &&
    /(engineer|developer|manager|analyst|consultant|architect|specialist|designer|lead|intern|scientist|administrator|executive|director|product owner|scrum master)/i.test(line) &&
    !/@|www\.|linkedin|github|phone|\+?\d[\d\s-]{7,}/i.test(line)
  );

  return {
    candidateName: name,
    currentDesignation: designation
  };
}

export function sanitizeDocumentText(text: string) {
  return text
    .replace(/\0/g, "")
    .replace(/ignore previous instructions/gi, "[document instruction removed]")
    .replace(/system prompt/gi, "[document instruction removed]")
    .slice(0, 60000);
}
