#!/usr/bin/env node
/**
 * Comprehensive fix: for every question in DB, check if the answer PDF
 * has a longer version of the text. If so, update it.
 *
 * This catches ALL cases of missing tables/data — not just specific patterns.
 * The answer PDFs contain table data as text, while question PDFs often have
 * tables as images (non-extractable).
 *
 * Usage:
 *   node scripts/fix-short-text.js --dry-run   # preview changes
 *   node scripts/fix-short-text.js              # apply changes
 */

const mongoose = require("mongoose");
const { PDFParse } = require("pdf-parse");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DRY_RUN = process.argv.includes("--dry-run");

// ── helpers ─────────────────────────────────────────────────────────────────

function questionHash(text) {
  return crypto.createHash("sha256").update(text.trim()).digest("hex");
}

function normalize(s) {
  // Collapse whitespace, trim
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * Extract the "signature" of a question — the first ~60 chars, normalized.
 * Used for fast lookups.
 */
function textSignature(text) {
  return normalize(text).substring(0, 80);
}

/**
 * Check if two question texts are about the same question.
 * We compare the start and the end of the question text.
 */
function isSameQuestion(dbText, ansText) {
  const dbNorm = normalize(dbText);
  const ansNorm = normalize(ansText);

  if (dbNorm === ansNorm) return false; // identical, no fix needed

  // The DB text should be a substring or prefix of the answer text
  // Strategy: the DB text's last ~60 chars (the actual question part) should
  // appear in the answer text, AND the DB text's first ~60 chars should match.

  const dbStart = dbNorm.substring(0, 60);
  const dbEnd = dbNorm.substring(Math.max(0, dbNorm.length - 60));

  if (!ansNorm.startsWith(dbStart.substring(0, 40))) return false;
  if (!ansNorm.includes(dbEnd.substring(dbEnd.length - 40))) return false;

  return true;
}

// ── PDF parsing (UWorld answer format) ──────────────────────────────────────

async function extractText(pdfPath) {
  const buf = new Uint8Array(fs.readFileSync(pdfPath));
  const p = new PDFParse(buf);
  await p.load();
  const result = await p.getText();
  let text = result.pages.map((pg) => pg.text).join("\n");
  // Remove private-use-area chars
  text = text.replace(/[\uE000-\uF8FF]/g, "");
  return text;
}

function parseUWorldAnswerQuestions(text) {
  // Split on numbered questions: "N. <Text>"
  const chunks = text.split(/(?=(?:^|\n)\d+\.\s+[A-Z])/);
  const questions = [];

  for (const chunk of chunks) {
    const headerMatch = chunk.match(/(?:^|\n)(\d+)\.\s+([\s\S]*?)(?=\n\s*\t?\s*[ABC]\.\s)/);
    if (!headerMatch) continue;

    const num = parseInt(headerMatch[1], 10);
    let questionText = headerMatch[2].trim();

    // Get the body after the header to find where the question portion ends
    let body = chunk.substring(headerMatch.index + headerMatch[0].length);
    const explMatch = body.match(/\nExplanation\n/i);
    if (explMatch) body = body.substring(0, explMatch.index);

    questions.push({ num, text: questionText });
  }

  return questions;
}

function parseSchweserAnswerQuestions(text) {
  // Schweser: "Question #N of M  Question ID: NNNNNN"
  const chunks = text.split(/(?=Question\s+#\d+\s+of\s+\d+)/i);
  const questions = [];

  for (const chunk of chunks) {
    const headerMatch = chunk.match(/Question\s+#(\d+)\s+of\s+\d+\s+Question\s+ID:\s*(\d+)/i);
    if (!headerMatch) continue;

    const num = parseInt(headerMatch[1], 10);
    const afterHeader = chunk.substring(headerMatch.index + headerMatch[0].length);
    
    // Find question text before options
    const optionMatch = afterHeader.match(/\n\s*[ABC]\)\s/);
    if (!optionMatch) continue;

    const questionText = afterHeader.substring(0, optionMatch.index).trim();
    if (questionText.length > 20) {
      questions.push({ num, text: questionText });
    }
  }

  return questions;
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const uri = fs.readFileSync(".env.local", "utf8").match(/MONGODB_URI=(.*)/)?.[1];
  if (!uri) throw new Error("No MONGODB_URI in .env.local");

  console.log("Connecting to MongoDB...");
  await mongoose.connect(uri);
  const Q = mongoose.connection.collection("questions");

  // Step 1: Load all questions from DB
  console.log("Loading questions from DB...");
  const allQuestions = await Q.find({}).project({ _id: 1, text: 1, images: 1, source: 1, textHash: 1 }).toArray();
  console.log(`Loaded ${allQuestions.length} questions`);

  // Step 2: Parse all answer PDFs
  console.log("\nParsing answer PDFs...");
  const baseDir = "Mocks and QBanks";
  const answerPdfs = [];

  function findAnswerPdfs(dir) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        findAnswerPdfs(full);
      } else if (entry.name.toLowerCase().includes("answer") && entry.name.endsWith(".pdf")) {
        answerPdfs.push(full);
      }
    }
  }
  findAnswerPdfs(baseDir);
  console.log(`Found ${answerPdfs.length} answer PDFs`);

  // Build an index: normalized-start -> [{text, source}]
  // Using first 40 chars of normalized text as key for fast lookup
  const answerIndex = new Map(); // key -> [{text, fullNorm}]

  for (const pdfPath of answerPdfs) {
    try {
      const text = await extractText(pdfPath);
      const isSchweser = /Question\s+#\d+\s+of\s+\d+/i.test(text);
      const parsed = isSchweser
        ? parseSchweserAnswerQuestions(text)
        : parseUWorldAnswerQuestions(text);

      for (const q of parsed) {
        const norm = normalize(q.text);
        const key = norm.substring(0, 40);
        if (!answerIndex.has(key)) answerIndex.set(key, []);
        answerIndex.get(key).push({ text: q.text, fullNorm: norm });
      }
    } catch (e) {
      // Skip problematic PDFs
    }
  }

  const totalAnswerTexts = Array.from(answerIndex.values()).reduce((s, a) => s + a.length, 0);
  console.log(`Indexed ${totalAnswerTexts} answer question texts`);

  // Step 3: For each DB question, check if answer PDF has longer text
  console.log("\nComparing DB questions to answer PDFs...");
  let updated = 0;
  let noMatch = 0;
  let alreadyGood = 0;
  let skipped = 0;
  let checked = 0;

  for (const dbQ of allQuestions) {
    if (!dbQ.text) continue;
    checked++;

    const dbNorm = normalize(dbQ.text);
    const key = dbNorm.substring(0, 40);
    const candidates = answerIndex.get(key);
    if (!candidates) {
      alreadyGood++;
      continue;
    }

    // Find the best (longest) matching answer text
    let bestMatch = null;
    for (const cand of candidates) {
      if (cand.fullNorm.length <= dbNorm.length) continue; // answer not longer
      if (!isSameQuestion(dbQ.text, cand.text)) continue;
      if (!bestMatch || cand.text.length > bestMatch.text.length) {
        bestMatch = cand;
      }
    }

    if (!bestMatch) {
      alreadyGood++;
      continue;
    }

    // Answer is longer — this question is missing data
    const gain = bestMatch.text.length - dbQ.text.length;
    if (gain < 10) {
      alreadyGood++;
      continue;
    }

    if (DRY_RUN) {
      console.log(`  [DRY] ${dbQ._id}: ${dbQ.text.length} → ${bestMatch.text.length} chars (+${gain})`);
      console.log(`    DB:  ${dbQ.text.substring(0, 100).replace(/\n/g, " ")}...`);
      console.log(`    ANS: ${bestMatch.text.substring(0, 100).replace(/\n/g, " ")}...`);
    } else {
      const newHash = questionHash(bestMatch.text);
      try {
        await Q.updateOne(
          { _id: dbQ._id },
          { $set: { text: bestMatch.text, textHash: newHash } }
        );
        updated++;
        continue;
      } catch (e) {
        if (e.code === 11000) {
          // Duplicate textHash — another question already has this text
          skipped++;
          continue;
        }
        throw e;
      }
    }
    updated++;
  }

  console.log(`\nResults:`);
  console.log(`  Checked: ${checked}`);
  console.log(`  Updated: ${updated}`);
  console.log(`  Skipped (dup hash): ${skipped}`);
  console.log(`  Already good: ${alreadyGood}`);
  if (DRY_RUN) console.log("\nDRY RUN - no changes made");

  await mongoose.disconnect();
  console.log("Done");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
