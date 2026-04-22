import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Question, TOPICS } from "@/lib/models/Question";

interface ParsedQuestion {
  text: string;
  optionA: string;
  optionB: string;
  optionC: string;
  correctAnswer: "A" | "B" | "C";
  topic: string;
  explanation?: string;
}

function parsePDFText(text: string): ParsedQuestion[] {
  const questions: ParsedQuestion[] = [];

  // Strategy 1: Match numbered questions with A/B/C options
  // Pattern: "1. Question text\nA. option\nB. option\nC. option"
  const pattern1 =
    /(?:^|\n)\s*(\d+)[.)]\s*([\s\S]*?)(?:\n\s*[Aa][.)]\s*([\s\S]*?))(?:\n\s*[Bb][.)]\s*([\s\S]*?))(?:\n\s*[Cc][.)]\s*([\s\S]*?))(?=\n\s*(?:\d+[.)]|\Z))/gm;

  let match;
  while ((match = pattern1.exec(text)) !== null) {
    const questionText = match[2].trim();
    const optA = match[3].trim();
    const optB = match[4].trim();
    const optC = match[5].trim();

    if (questionText.length > 10 && optA && optB && optC) {
      questions.push({
        text: questionText,
        optionA: optA,
        optionB: optB,
        optionC: optC,
        correctAnswer: "A",
        topic: TOPICS[0],
      });
    }
  }

  // Strategy 2: Try alternative format - "Question N:" style
  if (questions.length === 0) {
    const pattern2 =
      /Question\s+(\d+)[:.]\s*([\s\S]*?)(?:\n\s*[Aa][.)]\s*([\s\S]*?))(?:\n\s*[Bb][.)]\s*([\s\S]*?))(?:\n\s*[Cc][.)]\s*([\s\S]*?))(?=\nQuestion|\n\s*$|\Z)/gim;

    while ((match = pattern2.exec(text)) !== null) {
      const questionText = match[2].trim();
      const optA = match[3].trim();
      const optB = match[4].trim();
      const optC = match[5].trim();

      if (questionText.length > 10 && optA && optB && optC) {
        questions.push({
          text: questionText,
          optionA: optA,
          optionB: optB,
          optionC: optC,
          correctAnswer: "A",
          topic: TOPICS[0],
        });
      }
    }
  }

  // Try to extract answer key from the end of the document
  const answerKeyPattern = /(?:Answer|Key|Solution)\s*(?:Key)?\s*\n([\s\S]+)$/i;
  const answerSection = answerKeyPattern.exec(text);
  if (answerSection) {
    const answerLines = answerSection[1];
    const answerPattern = /(\d+)\s*[.):]\s*([AaBbCc])/g;
    let ansMatch;
    while ((ansMatch = answerPattern.exec(answerLines)) !== null) {
      const qNum = parseInt(ansMatch[1], 10) - 1;
      const answer = ansMatch[2].toUpperCase() as "A" | "B" | "C";
      if (qNum >= 0 && qNum < questions.length) {
        questions[qNum].correctAnswer = answer;
      }
    }
  }

  return questions;
}

export async function POST(req: NextRequest) {
  try {
    const password = req.headers.get("x-admin-password");
    if (password !== process.env.ADMIN_PASSWORD) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get("pdf") as File;
    const topicOverride = formData.get("topic") as string | null;
    const source = formData.get("source") as string | null;

    if (!file) {
      return NextResponse.json({ error: "PDF file required" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // Dynamic import pdf-parse
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfParse = ((await import("pdf-parse")) as any).default;
    const pdfData = await pdfParse(buffer);
    const text = pdfData.text;

    const parsed = parsePDFText(text);

    // Apply topic override if provided
    if (topicOverride && TOPICS.includes(topicOverride as typeof TOPICS[number])) {
      parsed.forEach((q) => {
        q.topic = topicOverride;
      });
    }

    return NextResponse.json({
      extractedText: text.substring(0, 2000),
      questions: parsed,
      totalPages: pdfData.numpages,
      source: source || file.name,
    });
  } catch (error) {
    console.error("PDF parse error:", error);
    return NextResponse.json({ error: "Failed to parse PDF" }, { status: 500 });
  }
}

// Save parsed questions to DB
export async function PUT(req: NextRequest) {
  try {
    const password = req.headers.get("x-admin-password");
    if (password !== process.env.ADMIN_PASSWORD) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const { questions, source } = await req.json();

    if (!Array.isArray(questions) || questions.length === 0) {
      return NextResponse.json({ error: "Questions array required" }, { status: 400 });
    }

    const docs = questions.map((q: ParsedQuestion & { source?: string }) => ({
      text: q.text,
      optionA: q.optionA,
      optionB: q.optionB,
      optionC: q.optionC,
      correctAnswer: q.correctAnswer,
      topic: q.topic,
      explanation: q.explanation || "",
      source: q.source || source || "PDF Upload",
    }));

    const result = await Question.insertMany(docs);

    return NextResponse.json({ inserted: result.length });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
