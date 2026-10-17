import { NextResponse } from "next/server";
import { extractResumeFacts, sanitizeDocumentText } from "@/lib/ingestion";

export const runtime = "nodejs";

const maxBytes = process.env.VERCEL === "1" ? 4 * 1024 * 1024 : 6 * 1024 * 1024;

export async function POST(request: Request) {
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Upload a resume file under the `file` field." }, { status: 400 });
  }
  if (file.size > maxBytes) {
    return NextResponse.json({ error: `Resume file is too large. Maximum size is ${Math.floor(maxBytes / 1024 / 1024)} MB.` }, { status: 413 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  let text = "";
  try {
    text = await extractText(file.name, file.type, buffer);
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Resume extraction failed."
    }, { status: 422 });
  }
  const sanitizedText = sanitizeDocumentText(text);
  if (sanitizedText.trim().length < 40) {
    return NextResponse.json({
      error: "Could not extract enough text from this resume. If this is a scanned PDF, please paste the resume text or run OCR first."
    }, { status: 422 });
  }

  return NextResponse.json({
    fileName: file.name,
    mimeType: file.type || "unknown",
    text: sanitizedText,
    extracted: extractResumeFacts(sanitizedText)
  });
}

async function extractText(fileName: string, mimeType: string, buffer: Buffer) {
  const lowerName = fileName.toLowerCase();
  if (mimeType === "application/pdf" || lowerName.endsWith(".pdf")) {
    const pdfParse = (await import("pdf-parse")).default;
    const parsed = await pdfParse(buffer);
    return parsed.text;
  }
  if (
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    lowerName.endsWith(".docx")
  ) {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }
  if (mimeType.startsWith("text/") || lowerName.endsWith(".txt") || lowerName.endsWith(".md")) {
    return buffer.toString("utf8");
  }
  throw new Error("Unsupported resume type. Upload PDF, DOCX, TXT, or MD.");
}
