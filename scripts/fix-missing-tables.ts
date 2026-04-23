#!/usr/bin/env npx tsx
/**
 * Fix questions that have missing table data in their text.
 *
 * The problem: when question PDFs have tables rendered as images, pdf-parse
 * can't extract the table text. The answers PDF has the same table as text.
 * The merge logic previously only took correctAnswer + explanation from the
 * answers file, losing the table data.
 *
 * This script re-parses the answer PDFs and updates question text where the
 * answer file has a longer (more complete) version.
 *
 * Usage:
 *   npx tsx scripts/fix-missing-tables.ts [--dry-run]
 */

import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import {
  TOPIC_MAP,
  questionHash,
  extractTextFromPDF,
  extractTextWithBoldMarkers,
  parseQuestions,
  type ParsedQuestion,
} from "../src/lib/pdf-parser";

const DRY_RUN = process.argv.includes("--dry-run");
const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname);
const BASE_DIR = path.join(SCRIPT_DIR, "..", "Mocks and QBanks");

// ── Mongoose Schema ─────────────────────────────────────────────────────────

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
  images: [
    {
      data: String,
      contentType: String,
      location: { type: String, enum: ["question", "explanation"] },
    },
  ],
  createdAt: { type: Date, default: Date.now },
});

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Find all answer PDF files recursively. */
function findAnswerPDFs(dir: string): string[] {
  const result: string[] = [];
  function walk(d: string) {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        walk(path.join(d, entry.name));
      } else if (
        entry.name.endsWith(".pdf") &&
        /- Answers/i.test(entry.name) &&
        !entry.name.startsWith(".")
      ) {
        result.push(path.join(d, entry.name));
      }
    }
  }
  walk(dir);
  return result;
}

/** Detect if a file uses Schweser format. */
function isSchweserFormat(text: string): boolean {
  return /Question\s+#\d+\s+of\s+\d+/i.test(text);
}

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
    console.error("MONGODB_URI not set");
    process.exit(1);
  }

  console.log(`\n🔗 Connecting to MongoDB...`);
  await mongoose.connect(uri);
  console.log("✅ Connected\n");

  const Question =
    mongoose.models.Question || mongoose.model("Question", QuestionSchema);

  // Step 1: Find all questions with likely missing table data
  console.log("🔍 Finding questions with missing table data...");
  const allQuestions = await Question.find({}).lean();

  const affectedQuestions: Array<{
    _id: mongoose.Types.ObjectId;
    text: string;
    optionA: string;
    optionB: string;
    optionC: string;
    textHash: string;
  }> = [];

  for (const q of allQuestions) {
    const text = q.text || "";
    const m = text.match(/the following[\s\S]{0,60}?:\s*\n/i);
    if (!m) continue;
    const afterColon = text.substring(m.index! + m[0].length);
    const firstLine = afterColon.trim().split("\n")[0];
    if (!firstLine) continue;
    if (
      /^(Based on|The company|Which|What|If the|In 20X|Given|Using|The analyst|The amount|The most|If there|The implied|The bond|The portfolio|The index|If the stock)/i.test(
        firstLine,
      )
    ) {
      const imgCount = (q.images || []).length;
      if (imgCount === 0) {
        affectedQuestions.push({
          _id: q._id,
          text: q.text,
          optionA: q.optionA,
          optionB: q.optionB,
          optionC: q.optionC,
          textHash: q.textHash,
        });
      }
    }
  }

  console.log(`  Found ${affectedQuestions.length} potentially affected questions\n`);

  if (affectedQuestions.length === 0) {
    console.log("No affected questions found. Exiting.");
    await mongoose.disconnect();
    return;
  }

  // Step 2: Parse all answer PDFs and build a lookup by hash
  console.log("📄 Parsing all answer PDFs...");
  const answerPDFs = findAnswerPDFs(BASE_DIR);
  console.log(`  Found ${answerPDFs.length} answer PDF files`);

  // Map: textHash → answer question text (the longer version)
  const answerTextByHash = new Map<string, string>();

  for (const aFile of answerPDFs) {
    try {
      const buf = new Uint8Array(fs.readFileSync(aFile));
      const peek = await extractTextFromPDF(buf);
      let text: string;
      if (isSchweserFormat(peek)) {
        text = await extractTextWithBoldMarkers(buf);
      } else {
        text = peek;
      }

      const parsed = parseQuestions(text, true);
      for (const q of parsed) {
        if (q.text && q.optionA && q.optionB && q.optionC) {
          const hash = questionHash(q.text, q.optionA, q.optionB, q.optionC);
          answerTextByHash.set(hash, q.text);
        }
      }
    } catch (e) {
      console.warn(`  ⚠️  Error parsing ${path.basename(aFile)}:`, e);
    }
  }
  console.log(`  Parsed ${answerTextByHash.size} answer questions\n`);

  // Step 3: Match affected questions and update
  console.log("🔧 Updating affected questions...");
  let updated = 0;
  let noMatch = 0;
  let alreadyGood = 0;

  for (const q of affectedQuestions) {
    // Try to find a matching answer text by hashing the DB version
    // The hash is based on the existing (shorter) text — won't match the answer hash.
    // Instead, we need to match by options since those are the same.
    // Build hash from the answer side and compare.

    // Strategy: check if any answer text, when combined with the same options,
    // has the same hash as what we have — but our text is shorter.
    // Actually, the hash differs because the text differs.
    // So we need a different matching strategy: match by options text.

    let bestMatch: string | null = null;

    // Search answer texts that contain the same question ending
    // Extract the question part after the table gap
    const afterTableMatch = q.text.match(
      /(?:Based on|The company|Which|What|If the|In 20X|Given|Using|The analyst|The amount|The most|If there|The implied|The bond|The portfolio|The index|If the stock)[\s\S]*$/i,
    );
    const questionEnding = afterTableMatch
      ? afterTableMatch[0].substring(0, 80).trim()
      : null;

    if (questionEnding) {
      for (const [hash, answerText] of answerTextByHash) {
        if (
          answerText.includes(questionEnding) &&
          answerText.length > q.text.length + 20
        ) {
          // Verify options match by checking the answer text also references similar content
          const qStart = q.text.substring(0, 40);
          if (answerText.includes(qStart.substring(0, 30))) {
            bestMatch = answerText;
            break;
          }
        }
      }
    }

    if (!bestMatch) {
      noMatch++;
      continue;
    }

    if (bestMatch.length <= q.text.length + 20) {
      alreadyGood++;
      continue;
    }

    // Update the question text and recompute hash
    const newHash = questionHash(bestMatch, q.optionA, q.optionB, q.optionC);

    if (DRY_RUN) {
      console.log(`  [DRY] ${q._id}: text ${q.text.length} → ${bestMatch.length} chars`);
      console.log(`    Old: ${q.text.substring(0, 80)}...`);
      console.log(`    New: ${bestMatch.substring(0, 80)}...`);
    } else {
      await Question.updateOne(
        { _id: q._id },
        { $set: { text: bestMatch, textHash: newHash } },
      );
    }
    updated++;
  }

  console.log(`\n📊 Results:`);
  console.log(`  Updated: ${updated}`);
  console.log(`  No match found: ${noMatch}`);
  console.log(`  Already good: ${alreadyGood}`);
  console.log(`  Total affected: ${affectedQuestions.length}`);

  if (DRY_RUN) {
    console.log("\n🏃 DRY RUN — no changes were made");
  }

  await mongoose.disconnect();
  console.log("\n✅ Done");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
