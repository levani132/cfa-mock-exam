import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb";
import { Question } from "@/lib/models/Question";
import { MockExam } from "@/lib/models/MockExam";
import {
  type ParsedQuestion,
  TOPICS,
  type Topic,
  questionHash,
  extractTextFromPDF,
  extractTextWithBoldMarkers,
  parseQuestions,
  mergeQuestionsAndAnswers,
  validateQuestion,
  detectTopicFromExplanation,
} from "@/lib/pdf-parser";
import { extractAndMapImages, type QuestionImage } from "@/lib/image-extractor";

export type { ParsedQuestion };

/** POST: Parse PDF file(s) and return parsed questions with validation */
export async function POST(req: NextRequest) {
  try {
    const password = req.headers.get("x-admin-password");
    if (password !== process.env.ADMIN_PASSWORD) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await req.formData();
    const questionsPdf = formData.get("pdf") as File | null;
    const answersPdf = formData.get("answersPdf") as File | null;
    const topicOverride = formData.get("topic") as string | null;
    const source = formData.get("source") as string | null;
    const isAnswerFile = formData.get("isAnswerFile") === "true";

    if (!questionsPdf && !answersPdf) {
      return NextResponse.json({ error: "At least one PDF file is required" }, { status: 400 });
    }

    let parsed: ParsedQuestion[] = [];

    if (questionsPdf && answersPdf) {
      // Separate Q + A files — try bold markers on the answer file for Schweser
      const qBuf = new Uint8Array(await questionsPdf.arrayBuffer());
      const aBuf = new Uint8Array(await answersPdf.arrayBuffer());

      const qText = await extractTextFromPDF(qBuf);

      let aText: string;
      if (/Question\s+#\d+\s+of\s+\d+/i.test(qText)) {
        aText = await extractTextWithBoldMarkers(aBuf);
      } else {
        aText = await extractTextFromPDF(aBuf);
      }

      const questionsOnly = parseQuestions(qText, false);
      const answersOnly = parseQuestions(aText, true);
      parsed = mergeQuestionsAndAnswers(questionsOnly, answersOnly);
    } else if (questionsPdf) {
      const buf = new Uint8Array(await questionsPdf.arrayBuffer());

      let text: string;
      if (isAnswerFile) {
        const peek = await extractTextFromPDF(buf);
        if (/Question\s+#\d+\s+of\s+\d+/i.test(peek)) {
          text = await extractTextWithBoldMarkers(buf);
        } else {
          text = peek;
        }
      } else {
        text = await extractTextFromPDF(buf);
      }

      parsed = parseQuestions(text, isAnswerFile);
    } else if (answersPdf) {
      const buf = new Uint8Array(await answersPdf.arrayBuffer());
      const peek = await extractTextFromPDF(buf);
      let text: string;
      if (/Question\s+#\d+\s+of\s+\d+/i.test(peek)) {
        text = await extractTextWithBoldMarkers(buf);
      } else {
        text = peek;
      }
      parsed = parseQuestions(text, true);
    }

    // Apply topic: override → detection from explanation → default
    for (const q of parsed) {
      if (topicOverride && (TOPICS as readonly string[]).includes(topicOverride)) {
        q.topic = topicOverride;
      } else {
        const detected = detectTopicFromExplanation(q.explanation);
        if (detected) q.topic = detected;
      }
    }

    // Validate all questions
    const allWarnings: string[] = [];
    parsed.forEach((q, i) => {
      const result = validateQuestion(q, i);
      q.warnings = result.warnings;
      allWarnings.push(...result.warnings);
    });

    // Check for duplicates against DB
    await connectDB();
    let duplicateCount = 0;
    const duplicateIndices: number[] = [];

    for (let i = 0; i < parsed.length; i++) {
      const q = parsed[i];
      if (q.text && q.optionA && q.optionB && q.optionC) {
        const hash = questionHash(q.text, q.optionA, q.optionB, q.optionC);
        const existing = await Question.findOne({ textHash: hash });
        if (existing) {
          duplicateCount++;
          duplicateIndices.push(i);
          if (!q.warnings) q.warnings = [];
          q.warnings.push(`Q${i + 1}: Duplicate - already exists in database`);
        }
      }
    }

    // Extract images from PDFs and attach to parsed questions
    const imagesByQuestion = new Map<number, QuestionImage[]>();
    try {
      if (questionsPdf) {
        const qBuf = new Uint8Array(await questionsPdf.arrayBuffer());
        const qImages = await extractAndMapImages(qBuf, "question");
        for (const [qNum, imgs] of qImages) {
          imagesByQuestion.set(qNum, [...(imagesByQuestion.get(qNum) || []), ...imgs]);
        }
      }
      if (answersPdf) {
        const aBuf = new Uint8Array(await answersPdf.arrayBuffer());
        const aImages = await extractAndMapImages(aBuf, "explanation");
        for (const [qNum, imgs] of aImages) {
          imagesByQuestion.set(qNum, [...(imagesByQuestion.get(qNum) || []), ...imgs]);
        }
      } else if (questionsPdf && isAnswerFile) {
        // Single combined file treated as answer file — images are explanations
        const buf = new Uint8Array(await questionsPdf.arrayBuffer());
        const imgs = await extractAndMapImages(buf, "explanation");
        for (const [qNum, qImgs] of imgs) {
          imagesByQuestion.set(qNum, [...(imagesByQuestion.get(qNum) || []), ...qImgs]);
        }
      }
    } catch (e) {
      // Image extraction is best-effort; don't fail the upload
      console.warn("Image extraction failed (pdfimages may not be installed):", e);
    }

    // Attach images to parsed questions by question number
    let totalImagesAttached = 0;
    for (const q of parsed) {
      if (q.num && imagesByQuestion.has(q.num)) {
        q.images = imagesByQuestion.get(q.num)!;
        totalImagesAttached += q.images.length;
      }
    }

    return NextResponse.json({
      questions: parsed,
      totalParsed: parsed.length,
      validCount: parsed.filter((q) => !q.warnings?.length).length,
      duplicateCount,
      duplicateIndices,
      warnings: allWarnings,
      source: source || questionsPdf?.name || answersPdf?.name || "PDF Upload",
      totalImagesAttached,
    });
  } catch (error) {
    console.error("PDF parse error:", error);
    return NextResponse.json({ error: "Failed to parse PDF" }, { status: 500 });
  }
}

/** PUT: Save parsed questions to DB with dedup */
export async function PUT(req: NextRequest) {
  try {
    const password = req.headers.get("x-admin-password");
    if (password !== process.env.ADMIN_PASSWORD) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const { questions, source, mockExam } = await req.json();

    if (!Array.isArray(questions) || questions.length === 0) {
      return NextResponse.json({ error: "Questions array required" }, { status: 400 });
    }

    let inserted = 0;
    let duplicates = 0;
    let errors = 0;
    const questionIds: mongoose.Types.ObjectId[] = [];

    for (const q of questions) {
      if (!q.correctAnswer || !["A", "B", "C"].includes(q.correctAnswer)) {
        errors++;
        continue;
      }

      const hash = questionHash(q.text, q.optionA, q.optionB, q.optionC);

      try {
        const doc = await Question.findOneAndUpdate(
          { textHash: hash },
          {
            $setOnInsert: {
              text: q.text,
              optionA: q.optionA,
              optionB: q.optionB,
              optionC: q.optionC,
              correctAnswer: q.correctAnswer,
              topic: q.topic,
              explanation: q.explanation || "",
              source: q.source || source || "PDF Upload",
              textHash: hash,
              images: q.images || [],
            },
          },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        questionIds.push(doc._id);
        // A freshly-inserted doc will have a createdAt within the last few seconds.
        if (doc.createdAt && Date.now() - doc.createdAt.getTime() < 5000) {
          inserted++;
        } else {
          duplicates++;
        }
      } catch (e: unknown) {
        const mongoErr = e as { code?: number };
        if (mongoErr.code === 11000) {
          duplicates++;
          const existing = await Question.findOne({ textHash: hash });
          if (existing) questionIds.push(existing._id);
        } else {
          errors++;
        }
      }
    }

    // If the caller wants the upload to also produce a MockExam record, build it
    // from every question we successfully resolved (newly inserted + dedup hits).
    // If a mock with this name already exists (e.g. uploading session 2 after
    // session 1), append the new IDs instead of replacing.
    let mockExamDoc: { _id: string; name: string; totalQuestions: number } | null = null;
    if (mockExam?.name && questionIds.length > 0) {
      const existing = await MockExam.findOne({ name: mockExam.name });
      if (existing) {
        await MockExam.updateOne(
          { _id: existing._id },
          { $addToSet: { questionIds: { $each: questionIds } } }
        );
        const updated = await MockExam.findById(existing._id);
        if (updated) {
          updated.totalQuestions = updated.questionIds.length;
          if (mockExam.timeLimitMinutes) updated.timeLimitMinutes = mockExam.timeLimitMinutes;
          await updated.save();
          mockExamDoc = {
            _id: String(updated._id),
            name: updated.name,
            totalQuestions: updated.totalQuestions,
          };
        }
      } else {
        const created = await MockExam.create({
          name: mockExam.name,
          source: mockExam.source || source || mockExam.name,
          questionIds,
          totalQuestions: questionIds.length,
          timeLimitMinutes: mockExam.timeLimitMinutes || 270,
        });
        mockExamDoc = {
          _id: String(created._id),
          name: created.name,
          totalQuestions: created.totalQuestions,
        };
      }
    }

    return NextResponse.json({ inserted, duplicates, errors, mockExam: mockExamDoc });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
