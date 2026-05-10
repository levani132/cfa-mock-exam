#!/usr/bin/env npx tsx
/**
 * Import AnalystPrep mock exam PDFs.
 *
 * Different format from Schweser/UWorld so we can't reuse pdf-parser.ts:
 *   - Layout-aware extraction via pdfjs (visual top-to-bottom order)
 *   - Question stem, then A./B./C. options, then explanation, then
 *     "X is (in)?correct" lines, then "CFA Level 1, ... Topic N – <Name>".
 *
 * Each PDF in `Mocks and QBanks/AnalystPrep 2024/` is one session. They all
 * roll up into a single MockExam doc named "AnalystPrep Mock Exam 2024 #3".
 *
 * Usage:
 *   npx tsx scripts/import-analystprep.ts            # commit to DB
 *   npx tsx scripts/import-analystprep.ts --dry-run  # parse only, no writes
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";
import mongoose from "mongoose";
import { fixLigatures, TOPIC_MAP, detectTopicFromExplanation } from "../src/lib/pdf-parser";

// ── Config ──────────────────────────────────────────────────────────────────
const DRY_RUN = process.argv.includes("--dry-run");
const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.join(SCRIPT_DIR, "..");
const PDF_DIR = path.join(ROOT, "Mocks and QBanks", "AnalystPrep 2024");
const MOCK_NAME = "AnalystPrep Mock Exam 2024 #3";
const MOCK_SOURCE = "AnalystPrep Mocks 2024";
const MOCK_TIME_LIMIT = 270;

/**
 * Manual answer overrides for questions the auto-detector can't resolve
 * (typically conceptual questions where the explanation is purely
 * descriptive). Keyed by source PDF tag ("First" | "Second") and the
 * within-PDF question number. Derived from each question's explanation
 * narrative in the AnalystPrep PDFs.
 */
const MANUAL_ANSWERS: Record<"First" | "Second", Record<number, "A" | "B" | "C">> = {
  First: {
    38: "B",  // Held-to-maturity reported at amortized cost (least likely fair value)
    60: "C",  // Lessee records asset & liability at initiation, then depreciates/interest
    75: "B",  // Total firm assets include discretionary AND non-discretionary
    86: "A",  // GIPS total assets include all four categories
  },
  Second: {
    8: "A",   // -800k + (-300k + 1400k) = $300,000
    14: "B",  // Avg trade price = €25.78
    21: "A",  // Stock is overvalued (book value < market price)
    28: "B",  // "DCF with considering options" is NOT one of the four approaches
    29: "A",  // 875,000 × (15/365) × 6.5% = $2,337
    37: "B",  // Best bid 65, best ask 67
    41: "C",  // Zero-coupon at $44.32 discount
    44: "B",  // Lake correct on Conclusion 2 only
    63: "C",  // Both price risk and dividend uncertainty
    69: "C",  // Company C valuation $1,468,333 (highest)
    73: "B",  // Synthetic short risk-free bond → purchase call options
    83: "A",  // FRAs impose obligations on both counterparties
  },
};

// ── Layout-aware text extraction ────────────────────────────────────────────

/**
 * Extract text from a PDF preserving visual top-to-bottom, left-to-right order.
 * Returns one string with `\n` between rendered lines and `\f` between pages.
 */
async function extractPositionalText(buf: Uint8Array): Promise<string> {
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjsLib.getDocument({ data: buf }).promise;
  const pages: string[] = [];

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const items = (content.items as Array<{ str?: string; transform?: number[] }>)
      .filter((i) => i.str !== undefined && i.transform)
      .map((i) => ({ str: i.str!, x: i.transform![4], y: i.transform![5] }));

    // Group items into lines by y-coordinate (PDF y grows upward)
    type Line = { y: number; parts: { x: number; str: string }[] };
    const lines: Line[] = [];
    for (const it of items) {
      const existing = lines.find((l) => Math.abs(l.y - it.y) < 2);
      if (existing) existing.parts.push({ x: it.x, str: it.str });
      else lines.push({ y: it.y, parts: [{ x: it.x, str: it.str }] });
    }
    lines.sort((a, b) => b.y - a.y);
    for (const l of lines) l.parts.sort((a, b) => a.x - b.x);

    pages.push(lines.map((l) => l.parts.map((p) => p.str).join("")).join("\n"));
  }

  doc.destroy();
  return fixLigatures(pages.join("\f"));
}

// ── Parser ──────────────────────────────────────────────────────────────────

interface Parsed {
  num: number;
  text: string;
  optionA: string;
  optionB: string;
  optionC: string;
  correctAnswer: "A" | "B" | "C" | null;
  explanation: string;
  topic: string | null;
  warnings: string[];
}

/** Strip "© 2014-2024 AnalystPrep." footer + bare page numbers near it. */
function stripFooters(text: string): string {
  return text
    .replace(/©\s*\d{4}-\d{4}\s*AnalystPrep\.?/gi, "")
    .replace(/\n\s*\d{1,3}\s*(?=\n|\f|$)/g, "\n");
}

/** Collapse whitespace, trim. */
function clean(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** Map a global CFA L1 Reading number to its topic. Mirrors module mapping in
 * detectTopicFromExplanation but covers AnalystPrep's "Reading N" citations. */
function topicFromReadingNumber(n: number): string | null {
  if (n >= 1 && n <= 11) return "Quantitative Methods";
  if (n >= 12 && n <= 19) return "Economics";
  if (n >= 20 && n <= 33) return "Financial Statement Analysis";
  if (n >= 34 && n <= 40) return "Corporate Issuers";
  if (n >= 41 && n <= 49) return "Equity Investments";
  if (n >= 50 && n <= 65) return "Fixed Income";
  if (n >= 66 && n <= 77) return "Derivatives";
  if (n >= 78 && n <= 84) return "Alternative Investments";
  if (n >= 85 && n <= 88) return "Portfolio Management";
  if (n >= 89 && n <= 93) return "Ethical and Professional Standards";
  return null;
}

/** Detect topic name in citation block (e.g. "Topic 5 – Financial Statement Analysis"). */
function topicFromCitation(block: string): string | null {
  // Try the explicit topic name in the citation first.
  const m = block.match(/Topic\s+\d+\s*[–\-]\s*([A-Za-z][A-Za-z &/]+?)(?:,|\.|Learning|$)/);
  if (m) {
    const key = m[1].toLowerCase().trim().replace(/\s+/g, " ");
    if (TOPIC_MAP[key]) return TOPIC_MAP[key];
    for (let i = key.split(" ").length; i > 0; i--) {
      const sub = key.split(" ").slice(0, i).join(" ");
      if (TOPIC_MAP[sub]) return TOPIC_MAP[sub];
    }
  }
  // AnalystPrep older-format citations: "Reading N – <Topic Name>"
  const reading = block.match(/Reading\s+(\d+)/i);
  if (reading) {
    const t = topicFromReadingNumber(parseInt(reading[1], 10));
    if (t) return t;
  }
  // Fall back to scanning the block for any topic-name substring.
  return detectTopicFromExplanation(block);
}

/** Pull numeric tokens from a string (handles $, %, commas, decimals, negatives). */
function numericTokens(s: string): string[] {
  const out: string[] = [];
  const re = /-?\$?\s*-?\d{1,3}(?:,\d{3})*(?:\.\d+)?%?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    const raw = m[0].replace(/[\s$,]/g, "");
    if (raw && raw !== "-" && raw !== "%") out.push(raw);
  }
  return out;
}

/** Normalised numeric value for fuzzy matching (handles 0.125 ≡ 12.5%). */
function normNum(t: string): number | null {
  const isPct = t.endsWith("%");
  const v = parseFloat(t.replace(/%/g, ""));
  if (isNaN(v)) return null;
  return isPct ? v / 100 : v;
}

function valuesClose(a: number, b: number): boolean {
  if (a === b) return true;
  const denom = Math.max(Math.abs(a), Math.abs(b), 1e-9);
  return Math.abs(a - b) / denom < 0.01; // within 1%
}

/**
 * Try to identify the correct answer by matching option values against the
 * computational result(s) in the explanation. Falls back when no explicit
 * "is incorrect"/"correct answer is" markers exist (common for calculation
 * questions in AnalystPrep).
 */
function answerFromValueMatch(
  explanation: string,
  optA: string,
  optB: string,
  optC: string
): "A" | "B" | "C" | null {
  // Strip the citation block — citation numbers (Reading 24, LOS 5h, Volume 1)
  // would otherwise pollute the candidate set.
  const expl = explanation
    .split(/CFA\s+Level/i)[0]
    .replace(/\s+/g, " ");

  const optTokens: Record<"A" | "B" | "C", number[]> = {
    A: numericTokens(optA).map(normNum).filter((v): v is number => v !== null),
    B: numericTokens(optB).map(normNum).filter((v): v is number => v !== null),
    C: numericTokens(optC).map(normNum).filter((v): v is number => v !== null),
  };
  if (!optTokens.A.length || !optTokens.B.length || !optTokens.C.length) return null;

  const optMatches = (vals: number[], candidates: number[]) =>
    vals.filter((v) => candidates.some((c) => valuesClose(c, v))).length;

  // Strongest signal: the LAST `=` value in the explanation is usually the
  // final answer. If exactly one option matches it, that's our pick.
  const eqVals: number[] = [];
  const eqRe = /=\s*(-?\$?\s*-?\d{1,3}(?:,\d{3})*(?:\.\d+)?%?)/g;
  let m: RegExpExecArray | null;
  while ((m = eqRe.exec(expl))) {
    const v = normNum(m[1].replace(/[\s$,]/g, ""));
    if (v !== null) eqVals.push(v);
  }
  if (eqVals.length) {
    const last = eqVals[eqVals.length - 1];
    const lastMatches = (["A", "B", "C"] as const).filter((L) =>
      optTokens[L].some((v) => valuesClose(last, v))
    );
    if (lastMatches.length === 1) return lastMatches[0];
  }

  // Fall back: count option-value matches against all numeric tokens in the
  // explanation body. Highest unique score wins.
  const allCandidates = numericTokens(expl)
    .map(normNum)
    .filter((v): v is number => v !== null);

  const score: Record<"A" | "B" | "C", number> = {
    A: optMatches(optTokens.A, allCandidates),
    B: optMatches(optTokens.B, allCandidates),
    C: optMatches(optTokens.C, allCandidates),
  };
  const max = Math.max(score.A, score.B, score.C);
  if (max === 0) return null;
  const winners = (["A", "B", "C"] as const).filter((L) => score[L] === max);
  return winners.length === 1 ? winners[0] : null;
}

/** Find correct answer: explicit markers → process of elimination → value match. */
function detectCorrectAnswer(
  explanation: string,
  optA: string,
  optB: string,
  optC: string
): "A" | "B" | "C" | null {
  const expl = explanation.replace(/\s+/g, " ");

  // Strongest: "The correct answer is X."
  const explicit = expl.match(/correct answer is\s*[:\.]?\s*\*?\*?([ABC])\b/i);
  if (explicit) return explicit[1].toUpperCase() as "A" | "B" | "C";

  // "X is correct" — but watch out: "Options X and Y are correctly depicted"
  // means X and Y are NOT the answer (they're true statements; the answer is
  // the false one). Handle that pair pattern first.
  const correctPair = expl.match(
    /\bOptions?\s+([ABC])\s+and\s+([ABC])\s+are\s+correct(?:ly)?\b/i
  );
  if (correctPair) {
    const correctSet = new Set([correctPair[1].toUpperCase(), correctPair[2].toUpperCase()]);
    for (const L of ["A", "B", "C"] as const) if (!correctSet.has(L)) return L;
  }

  // Bare "X is correct" applies to most/least likely questions where it
  // identifies the answer directly.
  const isCorrect = expl.match(/\b([ABC])\s+is\s+correct\b/i);
  if (isCorrect) return isCorrect[1].toUpperCase() as "A" | "B" | "C";

  // Process of elimination: "X is incorrect" / "X and Y are incorrect"
  const incorrect = new Set<string>();
  const reSingle = /\b([ABC])\s+is\s+incorrect\b/gi;
  // Optional "are" — AnalystPrep sometimes drops it ("A and B incorrect.")
  const rePair = /\b([ABC])\s+and\s+([ABC])\s+(?:are\s+)?incorrect\b/gi;
  let m: RegExpExecArray | null;
  while ((m = reSingle.exec(expl))) incorrect.add(m[1].toUpperCase());
  while ((m = rePair.exec(expl))) {
    incorrect.add(m[1].toUpperCase());
    incorrect.add(m[2].toUpperCase());
  }
  if (incorrect.size === 2) {
    for (const L of ["A", "B", "C"] as const) if (!incorrect.has(L)) return L;
  }

  // If exactly one is marked incorrect, value-match the remaining two.
  if (incorrect.size === 1) {
    const valueGuess = answerFromValueMatch(expl, optA, optB, optC);
    if (valueGuess && !incorrect.has(valueGuess)) return valueGuess;
  }

  // No markers at all — try value matching first (calculation questions).
  const valGuess = answerFromValueMatch(expl, optA, optB, optC);
  if (valGuess) return valGuess;

  // Last-resort: word-overlap with the explanation. For conceptual questions
  // the correct option's wording usually appears verbatim or near-verbatim
  // in the explanation prose (e.g. "MR is not always less than the price"
  // appears in both option C and the explanation).
  return answerFromWordOverlap(explanation, optA, optB, optC);
}

const STOPWORDS = new Set([
  "the","a","an","is","are","was","were","be","been","being","of","in","on","at","to",
  "for","with","by","from","as","that","this","it","its","into","such","or","and","but",
  "not","no","yes","do","does","did","has","have","had","will","would","could","should",
  "may","might","can","most","least","likely","accurate","appropriate","correct","best",
  "more","also","than","then","when","which","what","who","whom","whose","how","one","two",
  "three","four","both","all","any","some","every","each","other","another","following",
  "above","below","over","under","up","down","out","off","very","much","many","few","new",
  "non","based","given","using","used","use","make","makes","made","take","takes","taken",
  "due","instead","therefore","thus","because","since","while","whether","cfa","level",
  "topic","module","reading","los","volume","describe","explain","calculate","interpret",
  "apply","analyze","compare","contrast","identify","distinguish","prepare",
]);

function meaningfulWords(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !STOPWORDS.has(w));
}

/** Score each option by how much of its content appears in the explanation. */
function answerFromWordOverlap(
  explanation: string,
  optA: string,
  optB: string,
  optC: string
): "A" | "B" | "C" | null {
  const expl = explanation
    .split(/CFA\s+Level/i)[0]
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ");
  if (expl.split(/\s+/).filter(Boolean).length < 15) return null;

  const score = (opt: string): number => {
    const words = meaningfulWords(opt);
    if (words.length < 2) return 0;
    let hits = 0;
    for (const w of words) {
      if (new RegExp(`\\b${w}\\b`).test(expl)) hits++;
    }
    return hits / words.length;
  };

  const sA = score(optA);
  const sB = score(optB);
  const sC = score(optC);

  // Need a clear winner: best score must beat the runner-up by ≥ 20pp AND be
  // ≥ 0.5. Otherwise it's too noisy to be confident.
  const arr: ["A" | "B" | "C", number][] = [["A", sA], ["B", sB], ["C", sC]];
  arr.sort((a, b) => b[1] - a[1]);
  const [first, second] = arr;
  if (first[1] >= 0.5 && first[1] - second[1] >= 0.2) return first[0];
  return null;
}

function parseBlock(block: string, num: number): Parsed | null {
  const warnings: string[] = [];

  // Drop the leading "Q.N " we split on.
  const body = block.replace(/^\s*/, "");

  // Locate option lines. We want lines that *start* with "A. ", "B. ", "C. "
  // (allow some leading spaces). The key constraint: B must come after A and
  // C after B, and they must be near each other (no big gap with new Q).
  const aMatch = body.match(/(^|\n)\s*A\.\s+/);
  const bMatch = body.match(/(^|\n)\s*B\.\s+/);
  const cMatch = body.match(/(^|\n)\s*C\.\s+/);
  if (!aMatch || !bMatch || !cMatch) return null;

  const aIdx = aMatch.index! + (aMatch[1] ? aMatch[1].length : 0);
  const bIdx = bMatch.index! + (bMatch[1] ? bMatch[1].length : 0);
  const cIdx = cMatch.index! + (cMatch[1] ? cMatch[1].length : 0);

  // Sanity: A < B < C
  if (!(aIdx < bIdx && bIdx < cIdx)) return null;

  // Question stem = everything before option A, minus leading "Q.N".
  const stem = body
    .slice(0, aIdx)
    .replace(/^\s*Q\.\s*\d+\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();

  // Option A: from after "A." to start of B
  const optA = clean(body.slice(aIdx + aMatch[0].replace(/^\n/, "").length, bIdx));
  const optB = clean(body.slice(bIdx + bMatch[0].replace(/^\n/, "").length, cIdx));

  // Option C runs until the explanation begins. AnalystPrep options are short
  // text or numeric values; multi-line wraps continue a sentence in lowercase.
  // We accept the first line as C; if it doesn't end in terminal punctuation
  // or a numeric value we allow up to two lowercase-led continuation lines.
  // Then the explanation begins.
  const cBodyAll = body.slice(cIdx + cMatch[0].replace(/^\n/, "").length);
  const cLines = cBodyAll.split("\n");
  const looksTerminal = (s: string) =>
    /[.\?!](?:["')\]]+)?$/.test(s.trim()) ||
    /[\d%\)]$/.test(s.trim()) ||
    s.trim() === "";
  const isContinuation = (s: string) => {
    const t = s.trim();
    if (!t) return false;
    if (/^[a-z]/.test(t) && !/[=±√×÷]/.test(t)) return true; // lowercase start, no math
    return false;
  };
  const cTaken: string[] = [];
  if (cLines.length > 0) {
    cTaken.push(cLines[0]);
    if (!looksTerminal(cLines[0])) {
      for (let i = 1; i < Math.min(cLines.length, 3); i++) {
        if (isContinuation(cLines[i])) {
          cTaken.push(cLines[i]);
          if (looksTerminal(cLines[i])) break;
        } else break;
      }
    }
  }
  const optC = clean(cTaken.join(" "));
  const consumed = cTaken.join("\n").length + (cTaken.length > 1 ? cTaken.length - 1 : 0);
  const explanationRaw = cBodyAll.slice(consumed);
  const explanation = explanationRaw.replace(/\f/g, "\n").trim();

  const correctAnswer = detectCorrectAnswer(explanation, optA, optB, optC);
  if (!correctAnswer) warnings.push("could not detect correct answer");

  const topic = topicFromCitation(explanation);
  if (!topic) warnings.push("could not detect topic");

  if (stem.length < 15) warnings.push(`stem too short (${stem.length} chars)`);
  if (!optA || !optB || !optC) warnings.push("missing option text");

  return {
    num,
    text: stem,
    optionA: optA,
    optionB: optB,
    optionC: optC,
    correctAnswer,
    explanation,
    topic,
    warnings,
  };
}

function parseAnalystPrepText(text: string): Parsed[] {
  const stripped = stripFooters(text);
  // Split on Q.N where N is a number, capturing the number.
  // Use a lookbehind for newline/start so we don't split mid-sentence "Q.5"
  // references inside an explanation. AnalystPrep always has Q.N at the start
  // of a line at the top of a question.
  const re = /(?:^|\n|\f)\s*Q\.\s*(\d+)\s+/g;
  const matches: { num: number; start: number; headerEnd: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(stripped))) {
    matches.push({ num: parseInt(m[1], 10), start: m.index, headerEnd: re.lastIndex });
  }

  const parsed: Parsed[] = [];
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].headerEnd;
    const end = i + 1 < matches.length ? matches[i + 1].start : stripped.length;
    const block = stripped.slice(start, end);
    const p = parseBlock(block, matches[i].num);
    if (p) parsed.push(p);
  }
  return parsed;
}

// ── DB models (inline so script doesn't depend on Next.js paths) ────────────

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

function hashQuestion(text: string, a: string, b: string, c: string): string {
  const norm = [text, a, b, c]
    .map((s) => s.replace(/\s+/g, " ").trim().toLowerCase())
    .join("|");
  return crypto.createHash("sha256").update(norm).digest("hex").substring(0, 16);
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  // Load .env.local
  if (!process.env.MONGODB_URI) {
    const envPath = path.join(ROOT, ".env.local");
    if (fs.existsSync(envPath)) {
      for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
        const [k, ...v] = line.split("=");
        if (k && v.length) process.env[k.trim()] = v.join("=").trim();
      }
    }
  }
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGODB_URI not set in .env.local");
    process.exit(1);
  }

  if (!fs.existsSync(PDF_DIR)) {
    console.error(`PDF dir not found: ${PDF_DIR}`);
    process.exit(1);
  }
  const files = fs
    .readdirSync(PDF_DIR)
    .filter((f) => f.endsWith(".pdf") && !f.startsWith("."))
    .sort(); // alphabetical → First Session before Second Session

  console.log(`\n📚 AnalystPrep import — ${files.length} PDF(s)`);
  console.log(`   Mock: ${MOCK_NAME}`);
  console.log(`   Mode: ${DRY_RUN ? "DRY RUN" : "LIVE"}\n`);

  // Parse all PDFs, in file order, into one flat list of questions
  const allParsed: Parsed[] = [];
  for (const f of files) {
    const fp = path.join(PDF_DIR, f);
    process.stdout.write(`📄 ${f} … `);
    const buf = new Uint8Array(fs.readFileSync(fp));
    const text = await extractPositionalText(buf);
    const parsed = parseAnalystPrepText(text);

    // Apply manual answer overrides for this PDF tag (First/Second).
    const tag = f.includes("First_Session") ? "First" : f.includes("Second_Session") ? "Second" : null;
    let overridesApplied = 0;
    if (tag) {
      for (const p of parsed) {
        if (!p.correctAnswer && MANUAL_ANSWERS[tag][p.num]) {
          p.correctAnswer = MANUAL_ANSWERS[tag][p.num];
          overridesApplied++;
        }
      }
    }

    const withAns = parsed.filter((p) => p.correctAnswer);
    const withTopic = parsed.filter((p) => p.topic);
    console.log(
      `parsed ${parsed.length} (answers: ${withAns.length}${overridesApplied ? ` [+${overridesApplied} manual]` : ""}, topics: ${withTopic.length})`
    );
    allParsed.push(...parsed);
  }

  const totalParsed = allParsed.length;
  const validQs = allParsed.filter((p) => p.correctAnswer && p.topic);
  const skipped = totalParsed - validQs.length;

  console.log(`\n📊 Parse summary`);
  console.log(`   total parsed: ${totalParsed}`);
  console.log(`   ready to insert: ${validQs.length}`);
  console.log(`   skipped (missing answer/topic): ${skipped}`);

  if (skipped > 0) {
    console.log(`\n⚠️  Skipped questions (Q num):`);
    for (const p of allParsed) {
      if (!p.correctAnswer || !p.topic) {
        console.log(`   Q.${p.num}: ${p.warnings.join(", ")}`);
      }
    }
  }

  if (DRY_RUN) {
    console.log(`\n✅ Dry run done. No writes.`);
    return;
  }

  if (validQs.length === 0) {
    console.error(`\n❌ No valid questions to insert — aborting.`);
    process.exit(1);
  }

  console.log(`\n🔗 Connecting to MongoDB…`);
  await mongoose.connect(uri);
  const Question =
    mongoose.models.Question || mongoose.model("Question", QuestionSchema);
  const MockExam =
    mongoose.models.MockExam || mongoose.model("MockExam", MockExamSchema);

  let inserted = 0;
  let duplicate = 0;
  const ids: mongoose.Types.ObjectId[] = [];

  for (const q of validQs) {
    const hash = hashQuestion(q.text, q.optionA, q.optionB, q.optionC);
    const doc = await Question.findOneAndUpdate(
      { textHash: hash },
      {
        $setOnInsert: {
          text: q.text,
          optionA: q.optionA,
          optionB: q.optionB,
          optionC: q.optionC,
          correctAnswer: q.correctAnswer!,
          topic: q.topic!,
          explanation: q.explanation,
          source: MOCK_SOURCE,
          textHash: hash,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    ids.push(doc._id);
    if (doc.createdAt && Date.now() - doc.createdAt.getTime() < 5000) inserted++;
    else duplicate++;
  }

  // Upsert / extend the MockExam.
  const existing = await MockExam.findOne({ name: MOCK_NAME });
  if (existing) {
    await MockExam.updateOne(
      { _id: existing._id },
      { $addToSet: { questionIds: { $each: ids } } }
    );
    const updated = await MockExam.findById(existing._id);
    if (updated) {
      updated.totalQuestions = updated.questionIds.length;
      updated.timeLimitMinutes = MOCK_TIME_LIMIT;
      await updated.save();
      console.log(
        `\n📘 MockExam updated: ${updated.name} — total ${updated.totalQuestions}`
      );
    }
  } else {
    const created = await MockExam.create({
      name: MOCK_NAME,
      source: MOCK_SOURCE,
      questionIds: ids,
      totalQuestions: ids.length,
      timeLimitMinutes: MOCK_TIME_LIMIT,
    });
    console.log(
      `\n📘 MockExam created: ${created.name} — total ${created.totalQuestions}`
    );
  }

  console.log(`\n✅ Done. Inserted ${inserted} new, ${duplicate} dedup'd.`);
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
