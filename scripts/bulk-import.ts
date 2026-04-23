#!/usr/bin/env npx tsx
/**
 * Bulk import script for CFA mock exam questions from PDF files.
 *
 * Uses the shared parser from src/lib/pdf-parser.ts — same logic as the
 * web upload API.
 *
 * Usage:
 *   npx tsx scripts/bulk-import.ts [--dry-run]
 */

import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import {
  TOPICS,
  TOPIC_MAP,
  questionHash,
  extractTextFromPDF,
  extractTextWithBoldMarkers,
  parseQuestions,
  mergeQuestionsAndAnswers,
  detectTopicFromExplanation,
  type ParsedQuestion,
} from "../src/lib/pdf-parser";

// ── Config ──────────────────────────────────────────────────────────────────
const DRY_RUN = process.argv.includes("--dry-run");
const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname);
const BASE_DIR = path.join(SCRIPT_DIR, "..", "Mocks and QBanks");

// ── Helpers ─────────────────────────────────────────────────────────────────

function resolveTopicFromPath(filePath: string): string | null {
  const parts = filePath.split(path.sep);
  for (const part of parts) {
    const cleaned = part.replace(/^\d+\.\s*/, "").toLowerCase().trim();
    if (TOPIC_MAP[cleaned]) return TOPIC_MAP[cleaned];
  }
  return null;
}

/** Read a PDF file and extract text (standard extraction). */
async function extractTextFromFile(filePath: string): Promise<string> {
  const buf = new Uint8Array(fs.readFileSync(filePath));
  return extractTextFromPDF(buf);
}

/** Read a PDF file and extract text with bold-font markers. */
async function extractTextWithBoldMarkersFromFile(
  filePath: string,
): Promise<string> {
  const buf = new Uint8Array(fs.readFileSync(filePath));
  return extractTextWithBoldMarkers(buf);
}

// ── File Discovery ──────────────────────────────────────────────────────────

interface PDFPair {
  questionFile: string | null;
  answerFile: string | null;
}

function findPDFPairs(dir: string): PDFPair[] {
  const pairs: PDFPair[] = [];
  const files: string[] = [];

  function walk(d: string) {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        walk(path.join(d, entry.name));
      } else if (entry.name.endsWith(".pdf") && !entry.name.startsWith(".")) {
        files.push(path.join(d, entry.name));
      }
    }
  }
  walk(dir);

  const answerFiles = new Set<string>();
  const questionFiles: string[] = [];

  for (const f of files) {
    const basename = path.basename(f);
    if (/- Answers/i.test(basename) || /_Answers/i.test(basename)) {
      answerFiles.add(f);
    } else {
      questionFiles.push(f);
    }
  }

  for (const qFile of questionFiles) {
    const basename = path.basename(qFile, ".pdf");
    const dirName = path.dirname(qFile);

    const possibleAnswerNames = [
      basename + " - Answers.pdf",
      basename.replace(" - Questions", "") + " - Answers.pdf",
      basename.replace(/ - Questions$/i, " - Answers") + ".pdf",
      basename.replace(/_/g, " ") + " - Answers.pdf",
    ];

    let answerFile: string | null = null;
    for (const aName of possibleAnswerNames) {
      const aPath = path.join(dirName, aName);
      if (answerFiles.has(aPath)) {
        answerFile = aPath;
        answerFiles.delete(aPath);
        break;
      }
    }

    // Fuzzy matching by reading number
    if (!answerFile) {
      const readingMatch = basename.match(/Reading\s+(\d+(?:\.\d+)?)/i);
      const numMatch = basename.match(/^(\d+\.\d+)/);
      const matchKey = readingMatch
        ? readingMatch[1]
        : numMatch
          ? numMatch[1]
          : null;

      if (matchKey) {
        for (const aFile of answerFiles) {
          const aBasename = path.basename(aFile);
          if (
            path.dirname(aFile) === dirName &&
            (aBasename.includes(`Reading ${matchKey}`) ||
              aBasename.startsWith(matchKey)) &&
            (/- Answers/i.test(aBasename) || /_Answers/i.test(aBasename))
          ) {
            answerFile = aFile;
            answerFiles.delete(aFile);
            break;
          }
        }
      }
    }

    pairs.push({ questionFile: qFile, answerFile });
  }

  // Unmatched answer-only files
  for (const aFile of answerFiles) {
    pairs.push({ questionFile: null, answerFile: aFile });
  }

  return pairs;
}

// ── Mongoose Schemas (inline for script) ────────────────────────────────────

const QuestionSchema = new mongoose.Schema({
  text: { type: String, required: true },
  optionA: { type: String, required: true },
  optionB: { type: String, required: true },
  optionC: { type: String, required: true },
  correctAnswer: { type: String, required: true, enum: ["A", "B", "C"] },
  topic: { type: String, required: true, index: true },
  explanation: { type: String },
  source: { type: String },
  textHash: { type: String, index: true, unique: true },
  createdAt: { type: Date, default: Date.now },
});

const MockExamSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  source: { type: String, required: true },
  questionIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Question" }],
  totalQuestions: { type: Number, required: true },
  timeLimitMinutes: { type: Number, default: 270 },
  createdAt: { type: Date, default: Date.now },
});

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  // Load .env.local
  if (!process.env.MONGODB_URI) {
    const envPath = path.join(SCRIPT_DIR, "..", ".env.local");
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, "utf-8");
      for (const line of envContent.split("\n")) {
        const [key, ...vals] = line.split("=");
        if (key && vals.length)
          process.env[key.trim()] = vals.join("=").trim();
      }
    }
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGODB_URI not set. Add it to .env.local");
    process.exit(1);
  }

  console.log(`\n🔗 Connecting to MongoDB...`);
  if (!DRY_RUN) {
    await mongoose.connect(uri);
    console.log("✅ Connected\n");
  } else {
    console.log("🏃 DRY RUN MODE - no DB writes\n");
  }

  const Question =
    mongoose.models.Question ||
    mongoose.model("Question", QuestionSchema);
  const MockExam =
    mongoose.models.MockExam ||
    mongoose.model("MockExam", MockExamSchema);

  // Stats
  let totalParsed = 0;
  let totalInserted = 0;
  let totalDuplicates = 0;
  let totalMissingAnswers = 0;
  let totalErrors = 0;
  const sourceStats: Record<string, unknown> = {};

  // ── Process Schweser Mocks ──────────────────────────────────────────────
  console.log("📚 Processing Schweser Mocks 2024...");
  const mocksDir = path.join(BASE_DIR, "Schweser Mocks 2024");

  if (fs.existsSync(mocksDir)) {
    for (let i = 1; i <= 6; i++) {
      const qFile = path.join(mocksDir, `Mock Exam ${i}.pdf`);
      const aFile = path.join(mocksDir, `Mock Exam ${i} - Answers.pdf`);

      if (!fs.existsSync(qFile)) {
        console.log(`  ⚠️  Mock Exam ${i} - questions file not found`);
        continue;
      }

      try {
        console.log(`  📄 Mock Exam ${i}...`);
        const qText = await extractTextFromFile(qFile);
        const questionsOnly = parseQuestions(qText, false);

        let merged: ParsedQuestion[] = questionsOnly;
        if (fs.existsSync(aFile)) {
          const aText = await extractTextWithBoldMarkersFromFile(aFile);
          const answersOnly = parseQuestions(aText, true);
          merged = mergeQuestionsAndAnswers(questionsOnly, answersOnly);
        }

        const mockName = `Schweser Mock Exam ${i} (2024)`;
        const source = `Schweser Mocks 2024`;
        const insertedIds: mongoose.Types.ObjectId[] = [];

        for (const q of merged) {
          if (!q.correctAnswer) {
            totalMissingAnswers++;
            continue;
          }

          const topic =
            detectTopicFromExplanation(q.explanation) || TOPICS[0];
          const hash = questionHash(
            q.text,
            q.optionA,
            q.optionB,
            q.optionC,
          );

          if (!DRY_RUN) {
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
                    topic,
                    explanation: q.explanation,
                    source,
                    textHash: hash,
                  },
                },
                { upsert: true, new: true, setDefaultsOnInsert: true },
              );
              insertedIds.push(doc._id);
              if (
                doc.createdAt &&
                Date.now() - doc.createdAt.getTime() < 5000
              ) {
                totalInserted++;
              } else {
                totalDuplicates++;
              }
            } catch (e: any) {
              if (e.code === 11000) {
                totalDuplicates++;
                const existing = await Question.findOne({ textHash: hash });
                if (existing) insertedIds.push(existing._id);
              } else {
                totalErrors++;
              }
            }
          }
          totalParsed++;
        }

        // Create MockExam record
        if (!DRY_RUN && insertedIds.length > 0) {
          try {
            await MockExam.findOneAndUpdate(
              { name: mockName },
              {
                $setOnInsert: {
                  name: mockName,
                  source,
                  questionIds: insertedIds,
                  totalQuestions: insertedIds.length,
                  timeLimitMinutes: 270,
                },
              },
              { upsert: true },
            );
          } catch (e: any) {
            if (e.code !== 11000)
              console.error(`    ❌ MockExam save error:`, e.message);
          }
        }

        console.log(
          `    ✅ ${merged.length} questions parsed, ${merged.filter((q) => q.correctAnswer).length} with answers`,
        );
        sourceStats[`Mock Exam ${i}`] = {
          parsed: merged.length,
          withAnswers: merged.filter((q) => q.correctAnswer).length,
        };
      } catch (e: any) {
        console.error(`    ❌ Error: ${e.message}`);
        totalErrors++;
      }
    }
  }

  // ── Process QBanks ──────────────────────────────────────────────────────
  const qbankDirs = [
    {
      dir: path.join(BASE_DIR, "Schweser QBank 2024"),
      source: "Schweser QBank 2024",
    },
    {
      dir: path.join(BASE_DIR, "UWORLD QBank 2024"),
      source: "UWorld QBank 2024",
    },
    {
      dir: path.join(BASE_DIR, "QBank Kaplan-Schweser - 2026"),
      source: "Kaplan-Schweser 2026",
    },
  ];

  for (const { dir: qbankDir, source } of qbankDirs) {
    if (!fs.existsSync(qbankDir)) {
      console.log(`\n⚠️  ${source} directory not found, skipping`);
      continue;
    }

    console.log(`\n📚 Processing ${source}...`);
    const pairs = findPDFPairs(qbankDir);
    let bankParsed = 0;
    let bankInserted = 0;
    let bankDups = 0;
    let bankMissing = 0;

    for (const { questionFile, answerFile } of pairs) {
      const displayFile = questionFile
        ? path.relative(BASE_DIR, questionFile)
        : path.relative(BASE_DIR, answerFile!);

      try {
        let merged: ParsedQuestion[] = [];

        if (questionFile && answerFile) {
          const qText = await extractTextFromFile(questionFile);
          let aText: string;
          if (source.includes("Schweser") || source.includes("Kaplan")) {
            aText = await extractTextWithBoldMarkersFromFile(answerFile);
          } else {
            aText = await extractTextFromFile(answerFile);
          }
          const questionsOnly = parseQuestions(qText, false);
          const answersOnly = parseQuestions(aText, true);
          merged = mergeQuestionsAndAnswers(questionsOnly, answersOnly);
        } else if (answerFile && !questionFile) {
          const aText = await extractTextFromFile(answerFile);
          merged = parseQuestions(aText, true);
        } else if (questionFile && !answerFile) {
          const qText = await extractTextFromFile(questionFile);
          merged = parseQuestions(qText, true);
          if (
            merged.length > 0 &&
            merged.every((q) => !q.correctAnswer)
          ) {
            merged = parseQuestions(qText, false);
          }
        }

        if (merged.length === 0) {
          console.log(`  ⚠️  ${displayFile} - 0 questions parsed`);
          continue;
        }

        const topic = resolveTopicFromPath(questionFile || answerFile || "");

        for (const q of merged) {
          if (!q.correctAnswer) {
            totalMissingAnswers++;
            bankMissing++;
            continue;
          }

          const assignedTopic =
            topic ||
            detectTopicFromExplanation(q.explanation) ||
            TOPICS[0];
          const hash = questionHash(
            q.text,
            q.optionA,
            q.optionB,
            q.optionC,
          );

          if (!DRY_RUN) {
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
                    topic: assignedTopic,
                    explanation: q.explanation,
                    source,
                    textHash: hash,
                  },
                },
                { upsert: true, new: true, setDefaultsOnInsert: true },
              );
              if (
                doc.createdAt &&
                Date.now() - doc.createdAt.getTime() < 5000
              ) {
                totalInserted++;
                bankInserted++;
              } else {
                totalDuplicates++;
                bankDups++;
              }
            } catch (e: any) {
              if (e.code === 11000) {
                totalDuplicates++;
                bankDups++;
              } else {
                totalErrors++;
              }
            }
          }

          totalParsed++;
          bankParsed++;
        }

        const withAnswers = merged.filter((q) => q.correctAnswer).length;
        const noAnswers = merged.length - withAnswers;
        const status =
          noAnswers > 0 ? `⚠️  ${noAnswers} missing answers` : "✅";
        console.log(
          `  📄 ${displayFile}: ${merged.length} Qs ${status}`,
        );
      } catch (e: any) {
        console.error(`  ❌ ${displayFile}: ${e.message}`);
        totalErrors++;
      }
    }

    console.log(
      `  📊 ${source} summary: ${bankParsed} parsed, ${bankInserted} inserted, ${bankDups} duplicates, ${bankMissing} missing answers`,
    );
    sourceStats[source] = {
      parsed: bankParsed,
      inserted: bankInserted,
      duplicates: bankDups,
      missingAnswers: bankMissing,
    };
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log("\n" + "=".repeat(60));
  console.log("📊 IMPORT SUMMARY");
  console.log("=".repeat(60));
  console.log(`Total questions parsed:     ${totalParsed}`);
  console.log(`Total inserted (new):       ${totalInserted}`);
  console.log(`Total duplicates skipped:   ${totalDuplicates}`);
  console.log(`Total missing answers:      ${totalMissingAnswers}`);
  console.log(`Total errors:               ${totalErrors}`);
  console.log("");

  for (const [src, stats] of Object.entries(sourceStats)) {
    console.log(`  ${src}: ${JSON.stringify(stats)}`);
  }

  if (!DRY_RUN) {
    const totalInDB = await Question.countDocuments();
    const totalMocks = await MockExam.countDocuments();
    console.log(
      `\n📊 Database totals: ${totalInDB} questions, ${totalMocks} mock exams`,
    );
    await mongoose.disconnect();
  }

  console.log("\n✅ Done!");
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
