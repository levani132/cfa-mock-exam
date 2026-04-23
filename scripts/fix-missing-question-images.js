#!/usr/bin/env node
/**
 * Re-extract images from UWorld question PDFs and add them as location="question"
 * for DB questions that are missing them.
 *
 * Root cause: extract-images.ts used textHash for matching, but fix-short-text.js
 * later changed the text (and textHash) of many questions. So the images from
 * the question PDFs couldn't be matched.
 *
 * This script:
 * 1. Finds all DB questions with broken text (reference tables/data but no question images)
 * 2. For each UWorld question PDF, extracts images by page
 * 3. Parses the PDF to map page → question number → question text
 * 4. Matches to DB questions by first-N-chars text similarity
 * 5. Adds the images with location="question"
 */

const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const DRY_RUN = process.argv.includes("--dry-run");

// Load env
const envContent = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8");
const uri = envContent.match(/MONGODB_URI=(.*)/)?.[1];

const TMP_DIR = "/tmp/cfa-reextract-images";

// ── PDF text extraction (standalone, no TS imports) ──
async function extractText(pdfPath) {
  const { PDFParse } = require("pdf-parse");
  const buf = new Uint8Array(fs.readFileSync(pdfPath));
  const p = new PDFParse(buf);
  await p.load();
  const result = await p.getText();
  let text = result.pages.map(pg => pg.text).join("\n");
  // Remove PUA characters
  text = text.replace(/[\uE000-\uF8FF]/g, "");
  return text;
}

// ── Parse UWorld question PDF into numbered questions ──
function parseUWorldQuestions(text) {
  // UWorld question format: "Question N" header
  const chunks = text.split(/(?=Question\s+\d+\s*\n)/i);
  const questions = [];

  for (const chunk of chunks) {
    const numMatch = chunk.match(/^Question\s+(\d+)\s*\n([\s\S]*?)(?=\n\s*[ABC]\.\s)/i);
    if (!numMatch) continue;
    const num = parseInt(numMatch[1], 10);
    const qText = numMatch[2].trim();
    questions.push({ num, text: qText });
  }
  return questions;
}

// ── Build page → question number mapping using pdfjs-dist ──
async function buildPageMap(pdfPath) {
  const pdfjsLib = require("pdfjs-dist/legacy/build/pdf.mjs");
  const data = new Uint8Array(fs.readFileSync(pdfPath));
  const doc = await pdfjsLib.getDocument({ data }).promise;
  const pageMap = new Map(); // page → question number

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const items = content.items;
    const pageText = items.map(i => i.str || "").join(" ");

    // UWorld: "Question N"
    const qMatch = pageText.match(/Question\s+(\d+)/);
    if (qMatch) {
      pageMap.set(p, parseInt(qMatch[1], 10));
    }
  }

  doc.destroy();
  return pageMap;
}

// ── Extract images from PDF using pdfimages ──
function extractImages(pdfPath) {
  // Get image list
  let listOutput;
  try {
    listOutput = execSync(`pdfimages -list "${pdfPath}"`, { encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 });
  } catch {
    return new Map();
  }

  const lines = listOutput.split("\n").slice(2);
  const imagesByPage = new Map(); // page → [imgIndex]

  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 5) continue;
    const page = parseInt(parts[0], 10);
    const num = parseInt(parts[1], 10);
    const width = parseInt(parts[3], 10);
    const height = parseInt(parts[4], 10);
    if (width < 50 || height < 20) continue;
    if (!imagesByPage.has(page)) imagesByPage.set(page, []);
    imagesByPage.get(page).push(num);
  }

  if (imagesByPage.size === 0) return new Map();

  // Extract as PNG
  fs.mkdirSync(TMP_DIR, { recursive: true });
  const prefix = path.join(TMP_DIR, "img");
  try {
    execSync(`pdfimages -png "${pdfPath}" "${prefix}"`, { maxBuffer: 50 * 1024 * 1024 });
  } catch {
    return new Map();
  }

  // Map page → [base64PNGs]
  const result = new Map();
  for (const [page, indices] of imagesByPage) {
    const images = [];
    for (const idx of indices) {
      const imgPath = `${prefix}-${String(idx).padStart(3, "0")}.png`;
      if (fs.existsSync(imgPath)) {
        const stat = fs.statSync(imgPath);
        if (stat.size >= 500) {
          images.push(fs.readFileSync(imgPath).toString("base64"));
        }
      }
    }
    if (images.length > 0) result.set(page, images);
  }

  return result;
}

function cleanupTmp() {
  if (fs.existsSync(TMP_DIR)) {
    for (const f of fs.readdirSync(TMP_DIR)) fs.unlinkSync(path.join(TMP_DIR, f));
  }
}

function normalize(s) {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

// ── Main ──
(async () => {
  await mongoose.connect(uri);
  const Q = mongoose.connection.collection("questions");

  // 1. Find all DB questions with no location=question images
  // These are candidates for adding question images
  const allQuestions = await Q.find({
    source: /UWorld/i,
  }).project({ _id: 1, text: 1, topic: 1, images: 1, textHash: 1 }).toArray();

  // Build a set of questions that already have question images
  const hasQuestionImgs = new Set();
  const dbQuestions = []; // {id, text, topic, hasQImgs}

  for (const q of allQuestions) {
    const qImgs = (q.images || []).filter(i => i.location === "question");
    if (qImgs.length > 0) hasQuestionImgs.add(q._id.toString());
    dbQuestions.push({
      id: q._id.toString(),
      text: q.text || "",
      normFirst50: normalize(q.text || "").substring(0, 50),
      topic: q.topic,
      hasQImgs: qImgs.length > 0,
    });
  }

  // Build index: normalized first 50 chars → [dbQuestion]
  const dbIndex = new Map();
  for (const q of dbQuestions) {
    const key = q.normFirst50;
    if (!dbIndex.has(key)) dbIndex.set(key, []);
    dbIndex.get(key).push(q);
  }

  console.log(`DB questions from UWorld: ${dbQuestions.length}`);
  console.log(`Already have question images: ${hasQuestionImgs.size}`);
  console.log(`Missing question images: ${dbQuestions.length - hasQuestionImgs.size}`);
  console.log(`DRY_RUN: ${DRY_RUN}\n`);

  // 2. Process each UWorld question PDF
  const baseDir = path.join(__dirname, "..", "Mocks and QBanks", "UWORLD QBank 2024");
  const topicDirs = fs.readdirSync(baseDir).filter(d =>
    fs.statSync(path.join(baseDir, d)).isDirectory()
  );

  let totalAdded = 0;
  let totalQuestionsUpdated = 0;
  let totalSkipped = 0;
  let totalNoMatch = 0;

  fs.mkdirSync(TMP_DIR, { recursive: true });

  for (const topicDir of topicDirs) {
    const fullDir = path.join(baseDir, topicDir);
    const files = fs.readdirSync(fullDir).filter(f =>
      f.endsWith(".pdf") && !f.toLowerCase().includes("answer")
    );

    for (const file of files) {
      const pdfPath = path.join(fullDir, file);
      cleanupTmp();

      // Extract images
      const imagesByPage = extractImages(pdfPath);
      if (imagesByPage.size === 0) continue;

      const totalImgs = [...imagesByPage.values()].reduce((s, a) => s + a.length, 0);

      // Parse text to get question number → text mapping
      const text = await extractText(pdfPath);
      const parsed = parseUWorldQuestions(text);

      // Build page → question number mapping
      const pageMap = await buildPageMap(pdfPath);

      // Build questionNum → parsed text
      const numToText = new Map();
      for (const q of parsed) numToText.set(q.num, q.text);

      let fileAdded = 0;
      let fileUpdated = 0;

      for (const [page, base64Images] of imagesByPage) {
        // Find question number for this page
        let qNum = pageMap.get(page);
        if (!qNum) {
          for (let p = page - 1; p >= 1; p--) {
            if (pageMap.has(p)) { qNum = pageMap.get(p); break; }
          }
        }
        if (!qNum) continue;

        // Get the parsed question text for this question number
        const qText = numToText.get(qNum);
        if (!qText) continue;

        // Look up in DB by first 50 chars
        const key = normalize(qText).substring(0, 50);
        const candidates = dbIndex.get(key) || [];

        // Find the best match
        let bestMatch = null;
        for (const c of candidates) {
          if (!c.hasQImgs) {
            bestMatch = c;
            break;
          }
        }

        // If all candidates already have question images, skip
        if (!bestMatch) {
          // Try candidates that DO have images — maybe they need more
          // Actually, skip — we only want to add to questions missing them
          if (candidates.length > 0) totalSkipped++;
          else totalNoMatch++;
          continue;
        }

        // Add images
        const imageData = base64Images.map(b64 => ({
          data: b64,
          contentType: "image/png",
          location: "question",
        }));

        if (!DRY_RUN) {
          await Q.updateOne(
            { _id: new mongoose.Types.ObjectId(bestMatch.id) },
            { $push: { images: { $each: imageData } } }
          );
        }

        bestMatch.hasQImgs = true; // Mark as updated
        fileAdded += imageData.length;
        fileUpdated++;
        totalAdded += imageData.length;
        totalQuestionsUpdated++;
      }

      if (fileUpdated > 0 || totalImgs > 0) {
        console.log(`📄 ${file}: ${totalImgs} images, ${fileUpdated} questions updated (+${fileAdded} imgs)`);
      }
    }
  }

  cleanupTmp();
  if (fs.existsSync(TMP_DIR)) fs.rmdirSync(TMP_DIR);

  console.log(`\n✅ Done!`);
  console.log(`   Total images added: ${totalAdded}`);
  console.log(`   Questions updated: ${totalQuestionsUpdated}`);
  console.log(`   Already had images (skipped): ${totalSkipped}`);
  console.log(`   No DB match found: ${totalNoMatch}`);

  await mongoose.disconnect();
})();
