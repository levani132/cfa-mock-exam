#!/usr/bin/env npx tsx
/**
 * Extract images from UWorld PDF files and associate them with questions in MongoDB.
 *
 * Approach:
 * 1. For each PDF with images, use `pdfimages -png` (poppler) to extract PNGs
 * 2. Use pdfjs-dist to map page numbers → question numbers
 * 3. Re-parse the PDF text to get question hashes (for DB lookup)
 * 4. Store base64 images in the `images` array on the Question document
 *
 * Usage: npx tsx scripts/extract-images.ts [--dry-run]
 */

import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import mongoose from "mongoose";
import {
  extractTextFromPDF,
  parseQuestions,
  mergeQuestionsAndAnswers,
  questionHash,
  fixLigatures,
} from "../src/lib/pdf-parser";

// ── Config ──────────────────────────────────────────────────────────────────

const DRY_RUN = process.argv.includes("--dry-run");
const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname);
const BASE_DIR = path.join(SCRIPT_DIR, "..", "Mocks and QBanks");
const TMP_DIR = "/tmp/cfa-image-extraction";

// ── Load env ────────────────────────────────────────────────────────────────

if (!process.env.MONGODB_URI) {
  const envPath = path.join(SCRIPT_DIR, "..", ".env.local");
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, "utf-8");
    for (const line of envContent.split("\n")) {
      const [key, ...vals] = line.split("=");
      if (key && vals.length) process.env[key.trim()] = vals.join("=").trim();
    }
  }
}

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
      data: { type: String },
      contentType: { type: String, default: "image/png" },
      location: { type: String, enum: ["question", "explanation"], default: "explanation" },
    },
  ],
  createdAt: { type: Date, default: Date.now },
});

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Use pdfjs-dist to build a mapping: page number → question number.
 * For UWorld answer PDFs, each page starts with "N. <question text>".
 */
async function buildPageToQuestionMap(
  pdfPath: string,
): Promise<Map<number, number>> {
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const data = new Uint8Array(fs.readFileSync(pdfPath));
  const doc = await pdfjsLib.getDocument({ data }).promise;
  const pageMap = new Map<number, number>();

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const items = content.items as Array<{ str?: string }>;
    const pageText = items.map((i) => i.str || "").join(" ");

    // Find the first question number on this page
    // UWorld answer format: "N. <text>" at the start
    // UWorld question format: "Question N" 
    const match = pageText.match(/^\s*(\d+)\.\s+[A-Z]/);
    if (match) {
      pageMap.set(p, parseInt(match[1], 10));
    } else {
      // UWorld question format: "Question N"
      const qMatch = pageText.match(/Question\s+(\d+)/);
      if (qMatch) {
        pageMap.set(p, parseInt(qMatch[1], 10));
      } else {
        // Try finding any question number pattern
        const anyMatch = pageText.match(/(?:^|\s)(\d+)\.\s+[A-Z]/);
        if (anyMatch) {
          pageMap.set(p, parseInt(anyMatch[1], 10));
        }
      }
    }
  }

  doc.destroy();
  return pageMap;
}

/**
 * Extract images from a PDF using pdfimages (poppler).
 * Returns a map: page number → array of PNG file paths.
 */
function extractImagesFromPDF(
  pdfPath: string,
): Map<number, string[]> {
  // Get image list first to know page numbers
  let listOutput: string;
  try {
    listOutput = execSync(`pdfimages -list "${pdfPath}"`, {
      encoding: "utf-8",
      maxBuffer: 10 * 1024 * 1024,
    });
  } catch {
    return new Map();
  }

  const lines = listOutput.split("\n").slice(2); // skip header
  const imagesByPage = new Map<number, number[]>(); // page → image indices

  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 5) continue;
    const page = parseInt(parts[0], 10);
    const num = parseInt(parts[1], 10);
    const width = parseInt(parts[3], 10);
    const height = parseInt(parts[4], 10);

    // Skip tiny images (likely decorative dots, lines, etc.)
    if (width < 50 || height < 20) continue;

    if (!imagesByPage.has(page)) imagesByPage.set(page, []);
    imagesByPage.get(page)!.push(num);
  }

  if (imagesByPage.size === 0) return new Map();

  // Extract all images as PNG
  const prefix = path.join(TMP_DIR, "img");
  try {
    execSync(`pdfimages -png "${pdfPath}" "${prefix}"`, {
      maxBuffer: 50 * 1024 * 1024,
    });
  } catch {
    return new Map();
  }

  // Map page → PNG file paths
  const result = new Map<number, string[]>();
  for (const [page, indices] of imagesByPage) {
    const files: string[] = [];
    for (const idx of indices) {
      const imgPath = `${prefix}-${String(idx).padStart(3, "0")}.png`;
      if (fs.existsSync(imgPath)) {
        // Double-check file isn't tiny (< 500 bytes = likely blank)
        const stat = fs.statSync(imgPath);
        if (stat.size >= 500) {
          files.push(imgPath);
        }
      }
    }
    if (files.length > 0) {
      result.set(page, files);
    }
  }

  return result;
}

/**
 * Clean up temporary image files.
 */
function cleanupTmpDir() {
  if (fs.existsSync(TMP_DIR)) {
    for (const f of fs.readdirSync(TMP_DIR)) {
      fs.unlinkSync(path.join(TMP_DIR, f));
    }
  }
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

    // Fuzzy match by number prefix
    if (!answerFile) {
      const numMatch = basename.match(/^(\d+\.\d+)/);
      if (numMatch) {
        for (const aFile of answerFiles) {
          const aBasename = path.basename(aFile);
          if (
            path.dirname(aFile) === dirName &&
            aBasename.startsWith(numMatch[1]) &&
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

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGODB_URI not set");
    process.exit(1);
  }

  // Ensure tmp dir exists
  fs.mkdirSync(TMP_DIR, { recursive: true });

  if (!DRY_RUN) {
    console.log("🔗 Connecting to MongoDB...");
    await mongoose.connect(uri);
    console.log("✅ Connected\n");
  } else {
    console.log("🏃 DRY RUN MODE\n");
  }

  const Question =
    mongoose.models.Question ||
    mongoose.model("Question", QuestionSchema);

  // Process UWorld QBank (where most images are)
  const qbankDir = path.join(BASE_DIR, "UWORLD QBank 2024");
  if (!fs.existsSync(qbankDir)) {
    console.error("UWorld QBank directory not found");
    process.exit(1);
  }

  const pairs = findPDFPairs(qbankDir);
  let totalImagesExtracted = 0;
  let totalQuestionsUpdated = 0;
  let totalErrors = 0;

  for (const { questionFile, answerFile } of pairs) {
    // Process both question and answer files for images
    const filesToProcess: Array<{ file: string; location: "question" | "explanation" }> = [];

    if (questionFile) {
      filesToProcess.push({ file: questionFile, location: "question" });
    }
    if (answerFile) {
      filesToProcess.push({ file: answerFile, location: "explanation" });
    }

    for (const { file, location } of filesToProcess) {
      const displayPath = path.relative(BASE_DIR, file);

      // 1. Check if this PDF has images
      cleanupTmpDir();
      const imagesByPage = extractImagesFromPDF(file);
      if (imagesByPage.size === 0) continue;

      const totalImages = [...imagesByPage.values()].reduce((s, a) => s + a.length, 0);
      console.log(`📄 ${displayPath}: ${totalImages} images on ${imagesByPage.size} pages`);

      // 2. Build page → question number map
      const pageToQuestion = await buildPageToQuestionMap(file);

      // 3. Parse the PDF to get questions with textHashes
      const buf = new Uint8Array(fs.readFileSync(file));
      const text = await extractTextFromPDF(buf);
      const isAnswer = /- Answers|_Answers/i.test(path.basename(file));

      let parsed = parseQuestions(text, isAnswer);

      // If this is a question file and we have a paired answer file, merge
      if (questionFile && answerFile && file === questionFile) {
        const aBuf = new Uint8Array(fs.readFileSync(answerFile));
        const aText = await extractTextFromPDF(aBuf);
        const aParsed = parseQuestions(aText, true);
        parsed = mergeQuestionsAndAnswers(parsed, aParsed);
      }

      // Build questionNum → textHash map
      const questionHashes = new Map<number, string>();
      for (const q of parsed) {
        if (q.num) {
          const hash = questionHash(q.text, q.optionA, q.optionB, q.optionC);
          questionHashes.set(q.num, hash);
        }
      }

      // 4. Associate images with questions and update DB
      for (const [page, imgFiles] of imagesByPage) {
        // Find which question this page belongs to
        // Use the page's own question number, or find the closest preceding page's question
        let qNum = pageToQuestion.get(page);
        if (!qNum) {
          // Find the closest preceding page that has a question number
          for (let p = page - 1; p >= 1; p--) {
            if (pageToQuestion.has(p)) {
              qNum = pageToQuestion.get(p);
              break;
            }
          }
        }

        if (!qNum) {
          console.log(`    ⚠️  Page ${page}: no question number found, skipping ${imgFiles.length} images`);
          continue;
        }

        const hash = questionHashes.get(qNum);
        if (!hash) {
          // The question might not have been parsed (e.g., missing correct answer)
          continue;
        }

        // Convert images to base64
        const imageData: Array<{
          data: string;
          contentType: string;
          location: string;
        }> = [];

        for (const imgPath of imgFiles) {
          const pngData = fs.readFileSync(imgPath);
          imageData.push({
            data: pngData.toString("base64"),
            contentType: "image/png",
            location,
          });
        }

        if (imageData.length === 0) continue;

        if (!DRY_RUN) {
          try {
            const result = await Question.updateOne(
              { textHash: hash },
              { $push: { images: { $each: imageData } } },
            );
            if (result.matchedCount > 0) {
              totalQuestionsUpdated++;
              totalImagesExtracted += imageData.length;
            }
          } catch (e: any) {
            console.log(`    ❌ Error updating Q${qNum}: ${e.message}`);
            totalErrors++;
          }
        } else {
          totalImagesExtracted += imageData.length;
          totalQuestionsUpdated++;
        }
      }
    }
  }

  // Also process Schweser Mocks if they have images
  const mocksDir = path.join(BASE_DIR, "Schweser Mocks 2024");
  if (fs.existsSync(mocksDir)) {
    // Schweser has very few images, but handle them too
    const pairs = findPDFPairs(mocksDir);
    for (const { questionFile, answerFile } of pairs) {
      for (const entry of [
        questionFile ? { file: questionFile, location: "question" as const } : null,
        answerFile ? { file: answerFile, location: "explanation" as const } : null,
      ]) {
        if (!entry) continue;
        cleanupTmpDir();
        const imagesByPage = extractImagesFromPDF(entry.file);
        if (imagesByPage.size === 0) continue;
        const total = [...imagesByPage.values()].reduce((s, a) => s + a.length, 0);
        console.log(`📄 ${path.relative(BASE_DIR, entry.file)}: ${total} images (Schweser - skipping for now)`);
      }
    }
  }

  // Cleanup
  cleanupTmpDir();
  if (fs.existsSync(TMP_DIR)) fs.rmdirSync(TMP_DIR);

  console.log(`\n✅ Done!`);
  console.log(`   Images extracted: ${totalImagesExtracted}`);
  console.log(`   Questions updated: ${totalQuestionsUpdated}`);
  console.log(`   Errors: ${totalErrors}`);

  if (!DRY_RUN) {
    await mongoose.disconnect();
  }
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
