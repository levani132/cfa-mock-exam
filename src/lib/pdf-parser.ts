/**
 * Shared PDF question parsing logic.
 *
 * Used by both:
 *   - src/app/api/upload/route.ts  (web upload)
 *   - scripts/bulk-import.js       (batch import via `npx tsx`)
 *
 * Handles 3 source formats:
 *   1. Schweser/Kaplan — "Question #N of M  Question ID: NNNNNNN" with A)/B)/C)
 *   2. UWorld questions — "Question N" with A./B./C. options
 *   3. UWorld answers  — "N. text" numbered questions with A./B./C. options
 *
 * Correct-answer detection relies on a tab character (\t) placed before the
 * correct option letter.  For Schweser answer PDFs the tab comes from bold-font
 * detection via pdfjs-dist (see extractTextWithBoldMarkers).
 */

import crypto from "crypto";

// ── Types ───────────────────────────────────────────────────────────────────

export interface ParsedQuestion {
  num?: number;
  questionId?: string;
  text: string;
  optionA: string;
  optionB: string;
  optionC: string;
  correctAnswer: "A" | "B" | "C" | null;
  topic: string;
  explanation?: string;
  warnings?: string[];
  images?: Array<{ data: string; contentType: string; location: "question" | "explanation" }>;
}

// ── Constants ───────────────────────────────────────────────────────────────

export const TOPICS = [
  "Ethical and Professional Standards",
  "Quantitative Methods",
  "Economics",
  "Financial Statement Analysis",
  "Corporate Issuers",
  "Equity Investments",
  "Fixed Income",
  "Derivatives",
  "Alternative Investments",
  "Portfolio Management",
] as const;

export type Topic = (typeof TOPICS)[number];

export const TOPIC_MAP: Record<string, string> = {
  "ethics and professional standard": "Ethical and Professional Standards",
  "ethical and professional standards": "Ethical and Professional Standards",
  ethics: "Ethical and Professional Standards",
  "quantitative methods": "Quantitative Methods",
  economics: "Economics",
  "financial statements analysis": "Financial Statement Analysis",
  "financial statement analysis": "Financial Statement Analysis",
  "corporate issuers": "Corporate Issuers",
  "equity investments": "Equity Investments",
  "fixed income": "Fixed Income",
  derivatives: "Derivatives",
  "alternative investments": "Alternative Investments",
  "portfolio management": "Portfolio Management",
  "portfolio management part 1": "Portfolio Management",
  "portfolio management part 2": "Portfolio Management",
};

// ── Hashing ─────────────────────────────────────────────────────────────────

export function questionHash(
  text: string,
  optA: string,
  optB: string,
  optC: string,
): string {
  const normalized = [text, optA, optB, optC]
    .map((s) => s.replace(/\s+/g, " ").trim().toLowerCase())
    .join("|");
  return crypto
    .createHash("sha256")
    .update(normalized)
    .digest("hex")
    .substring(0, 16);
}

// ── Ligature fix ────────────────────────────────────────────────────────────

/**
 * Fix broken ligatures from PDF extraction.
 *
 * pdf-parse v2 outputs \u0000 (null byte) for PDF ligature glyphs
 * (fi, fl, ff, ffi, ffl).  This function replaces each \u0000 with the
 * correct ligature based on surrounding character context.
 */
export function fixLigatures(text: string): string {
  return text.replace(/\u0000/g, (_match, offset: number) => {
    // Get up to 10 chars of context on each side (within the same word)
    const before = text.substring(Math.max(0, offset - 10), offset);
    const after = text.substring(offset + 1, Math.min(text.length, offset + 11));

    // Extract just the word-part before and after the null
    const beforeWord = before.match(/[A-Za-z'-]*$/)?.[0] ?? "";
    const afterWord = after.match(/^[A-Za-z'-]*/)?.[0] ?? "";
    const bLow = beforeWord.toLowerCase();
    const aLow = afterWord.toLowerCase();

    // ── ffl (very rare — only "Toffler") ──
    if (bLow.endsWith("to") && aLow.startsWith("ler")) return "ffl";

    // ── ffi ──
    // efficient, coefficient, sufficient, office, officer, official, traffic
    if (/[eou]$/i.test(bLow) && /^ci/i.test(aLow)) return "ffi";
    if (/su$/i.test(bLow) && /^ci/i.test(aLow)) return "ffi";
    if (/ine$/i.test(bLow) && /^ci/i.test(aLow)) return "ffi";
    if (/coe$/i.test(bLow) && /^ci/i.test(aLow)) return "ffi";
    // affiliate
    if (/a$/i.test(bLow) && /^li/i.test(aLow)) return "ffi";
    // affirm, affirmative
    if (/a$/i.test(bLow) && /^rm/i.test(aLow)) return "ffi";
    // fulfill, fulfilling
    if (/ful$/i.test(bLow) && /^ll/i.test(aLow)) return "ffi";
    // traffic
    if (/tra$/i.test(bLow) && /^c/i.test(aLow)) return "ffi";
    // difficult
    if (/di$/i.test(bLow) && /^cult/i.test(aLow)) return "ffi";

    // ── ff at end of word ──
    // staff, tariff, payoff, cutoff, write-off, plaintiff
    if (aLow === "" || /^[^a-z]/i.test(after.charAt(0) || " ")) return "ff";

    // ── fl ──
    // flow, floor, float, flora
    if (/^o[wrta]/i.test(aLow)) return "fl";
    // fluctuate, fluctuating
    if (/^uc/i.test(aLow)) return "fl";
    // influence
    if (/^ue/i.test(aLow)) return "fl";
    // flight
    if (/^ig/i.test(aLow)) return "fl";
    // flex, flexible, flexibility
    if (/^ex/i.test(aLow)) return "fl";
    // flat, flatter (but not "fiat" which doesn't occur)
    if (/^at/i.test(aLow) && bLow === "") return "fl";
    // inflation, deflation, stagflation
    if (/n$/i.test(bLow) && /^at/i.test(aLow)) return "fl";
    // reflect, reflecting
    if (/re$/i.test(bLow) && /^ec/i.test(aLow)) return "fl";
    // conflict, conflicts
    if (/con$/i.test(bLow) && /^ic/i.test(aLow)) return "fl";

    // ── ff ──
    // different, differ
    if (/di$/i.test(bLow) && /^e/i.test(aLow)) return "ff";
    // effect, effective (but NOT reflect which was caught above)
    if (/(?:^|[^r])e$/i.test(bLow) && /^ec/i.test(aLow)) return "ff";
    // affect, affected, affecting
    if (/a$/i.test(bLow) && /^ec/i.test(aLow)) return "ff";
    // offer, offering, offered
    if (/o$/i.test(bLow) && /^er/i.test(aLow)) return "ff";
    // buffer
    if (/u$/i.test(bLow) && /^er/i.test(aLow)) return "ff";
    // effort, efforts
    if (/e$/i.test(bLow) && /^ort/i.test(aLow)) return "ff";
    // offense, offend
    if (/o$/i.test(bLow) && /^en/i.test(aLow)) return "ff";
    // offset, offsets
    if (/o$/i.test(bLow) && /^se/i.test(aLow)) return "ff";
    // offshore
    if (/o$/i.test(bLow) && /^sh/i.test(aLow)) return "ff";
    // offsite
    if (/o$/i.test(bLow) && /^si/i.test(aLow)) return "ff";

    // ── Default: fi ──
    return "fi";
  });
}

// ── PDF text extraction ─────────────────────────────────────────────────────

/**
 * Standard text extraction via pdf-parse v2.
 * Returns concatenated page text.
 */
export async function extractTextFromPDF(buffer: Uint8Array): Promise<string> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse(buffer);
  // @ts-expect-error pdf-parse v2 API — load() works but types mark it private
  await parser.load();
  const result = await parser.getText();
  if (result && result.pages) {
    return fixLigatures(result.pages.map((p: { text: string }) => p.text).join("\n"));
  }
  return "";
}

/**
 * Extract text using pdfjs-dist with bold-font detection.
 *
 * Inserts a `\t` before option lines (A)/B)/C)) whose body text is rendered
 * in a bold font, indicating the correct answer.  Used for Schweser answer
 * PDFs where bold formatting marks the correct answer.
 */
export async function extractTextWithBoldMarkers(
  buffer: Uint8Array,
): Promise<string> {
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjsLib.getDocument({ data: buffer }).promise;

  let fullText = "";

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const items = content.items as Array<{
      str?: string;
      fontName?: string;
      hasEOL?: boolean;
      transform?: number[];
    }>;

    // Identify the most-frequent (= regular) font on this page
    const fontCounts: Record<string, number> = {};
    for (const item of items) {
      if (item.fontName && item.str && item.str.trim()) {
        fontCounts[item.fontName] = (fontCounts[item.fontName] || 0) + 1;
      }
    }
    const sortedFonts = Object.entries(fontCounts).sort(
      (a, b) => b[1] - a[1],
    );
    const regularFont = sortedFonts.length > 0 ? sortedFonts[0][0] : null;

    let pageText = "";
    let lastY: number | null = null;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (
        item.hasEOL ||
        (lastY !== null &&
          item.transform &&
          Math.abs(item.transform[5] - lastY) > 2)
      ) {
        pageText += "\n";
      }
      if (item.transform) lastY = item.transform[5];

      const s = item.str || "";

      // If this is an option letter like "A)" / "B)" / "C)", check if the
      // following body text is in a non-regular (bold) font → tab marker.
      if (/^[ABC]\)$/.test(s.trim())) {
        for (let j = i + 1; j < items.length; j++) {
          const next = items[j].str ? items[j].str!.trim() : "";
          if (next) {
            if (items[j].fontName && items[j].fontName !== regularFont) {
              pageText += "\t";
            }
            break;
          }
        }
      }

      pageText += s;
    }

    fullText += pageText + "\n";
  }

  doc.destroy();
  return fixLigatures(fullText);
}

// ── Parsers ─────────────────────────────────────────────────────────────────

/**
 * Parse Schweser/Kaplan format:
 *   Question #N of M \tQuestion ID: NNNNNNN
 *   ...question text...
 *   A) option       (tab before letter = correct)
 *   B) option
 *   C) option
 *   [Explanation ...]
 */
export function parseSchweserFormat(
  text: string,
  hasAnswers: boolean,
): ParsedQuestion[] {
  const questions: ParsedQuestion[] = [];
  const chunks = text.split(/(?=Question\s+#\d+\s+of\s+\d+)/i);

  for (const chunk of chunks) {
    const headerMatch = chunk.match(
      /Question\s+#(\d+)\s+of\s+\d+\s+(?:\t\s*)?Question\s+ID:\s*(\d+)/i,
    );
    if (!headerMatch) continue;

    const questionNum = parseInt(headerMatch[1], 10);
    const questionId = headerMatch[2];

    // Everything after the header line
    let body = chunk.substring(headerMatch[0].length);

    // Extract explanation if present
    let explanation = "";
    const explMatch = body.match(
      /\nExplanation\n([\s\S]*?)(?=\n\(Module|\nQuestion\s+#|$)/i,
    );
    if (explMatch) {
      explanation = explMatch[1].trim();
      // NOTE: no .trim() here — leading whitespace may contain tab markers
      body = body.substring(0, explMatch.index!);
    }

    // Remove module/LOS reference
    const losMatch = body.match(
      /\(Module\s+[\d.]+,\s+LOS\s+[\d.]+[a-z]?\)/i,
    );
    if (losMatch) {
      body = body.substring(0, losMatch.index!);
    }

    // Parse options — tab before letter = correct answer
    // CRITICAL: use [ ]* (space only) not \s* which would consume \t
    let correctAnswer: "A" | "B" | "C" | null = null;
    const options: Record<string, string> = {};
    const optionPattern =
      /\n[ ]*(\t)?[ ]*([ABC])\)\s*([\s\S]*?)(?=\n[ ]*\t?[ ]*[ABC]\)|\nExplanation|$)/gi;
    let optMatch: RegExpExecArray | null;
    const bodyForOptions = body + "\n";

    while ((optMatch = optionPattern.exec(bodyForOptions)) !== null) {
      const hasTab = !!optMatch[1];
      const letter = optMatch[2].toUpperCase() as "A" | "B" | "C";
      options[letter] = optMatch[3].trim();
      if (hasTab && hasAnswers) correctAnswer = letter;
    }

    // Question text = everything before first option
    const firstOptMatch = body.match(/\n\s*\t?[ABC]\)/i);
    const questionText = firstOptMatch
      ? body.substring(0, firstOptMatch.index!).trim()
      : body.trim();

    if (questionText.length > 10 && options.A && options.B && options.C) {
      questions.push({
        num: questionNum,
        questionId,
        text: questionText,
        optionA: options.A,
        optionB: options.B,
        optionC: options.C,
        correctAnswer,
        topic: TOPICS[0],
        explanation,
      });
    }
  }

  return questions;
}

/**
 * Parse UWorld question format:
 *   Question N
 *   ...question text...
 *   A. option       (tab before letter = correct)
 *   B. option
 *   C. option
 *   [Explanation ...]
 */
export function parseUWorldFormat(
  text: string,
  hasAnswers: boolean,
): ParsedQuestion[] {
  const questions: ParsedQuestion[] = [];
  const chunks = text.split(/(?=^Question\s+\d+\s*$)/im);

  for (const chunk of chunks) {
    const headerMatch = chunk.match(/^Question\s+(\d+)\s*$/im);
    if (!headerMatch) continue;

    const questionNum = parseInt(headerMatch[1], 10);
    let body = chunk.substring(headerMatch[0].length);

    // Extract explanation
    let explanation = "";
    const explMatch = body.match(
      /\nExplanation\n([\s\S]*?)(?=\n(?:Things to remember|Calculate|LOS|Copyright|Question\s+\d+)|$)/i,
    );
    if (explMatch) {
      explanation = explMatch[1].trim();
      // NOTE: no .trim() here — leading whitespace may contain tab markers
      body = body.substring(0, explMatch.index!);
    }

    // Parse A. B. C. options — tab before letter = correct
    // CRITICAL: use [ ]* (space only) not \s* which would consume \t
    let correctAnswer: "A" | "B" | "C" | null = null;
    const options: Record<string, string> = {};
    const optionPattern =
      /\n[ ]*(\t)?[ ]*([ABC])\.\s*([\s\S]*?)(?=\n[ ]*\t?[ ]*[ABC]\.|\nExplanation|$)/gi;
    let optMatch: RegExpExecArray | null;
    const bodyForOptions = body + "\n";

    while ((optMatch = optionPattern.exec(bodyForOptions)) !== null) {
      const hasTab = !!optMatch[1];
      const letter = optMatch[2].toUpperCase() as "A" | "B" | "C";
      options[letter] = optMatch[3].trim();
      if (hasTab && hasAnswers) correctAnswer = letter;
    }

    const firstOptMatch = body.match(/\n\s*\t?\s*[ABC]\./i);
    const questionText = firstOptMatch
      ? body.substring(0, firstOptMatch.index!).trim()
      : body.trim();

    if (questionText.length > 10 && options.A && options.B && options.C) {
      questions.push({
        num: questionNum,
        text: questionText,
        optionA: options.A,
        optionB: options.B,
        optionC: options.C,
        correctAnswer,
        topic: TOPICS[0],
        explanation,
      });
    }
  }

  return questions;
}

/**
 * Parse UWorld answer-file format (numbered "N. text"):
 *   1. Question text...
 *   A. option
 *   \tB. option      (tab = correct)
 *   C. option
 *   Explanation ...
 */
export function parseUWorldAnswerFormat(text: string): ParsedQuestion[] {
  const questions: ParsedQuestion[] = [];
  const chunks = text.split(/(?=(?:^|\n)\d+\.\s+[A-Z])/);

  for (const chunk of chunks) {
    const headerMatch = chunk.match(
      /(?:^|\n)(\d+)\.\s+([\s\S]*?)(?=\n\s*\t?\s*[ABC]\.\s)/,
    );
    if (!headerMatch) continue;

    const questionNum = parseInt(headerMatch[1], 10);
    const questionText = headerMatch[2].trim();
    let body = chunk.substring(headerMatch.index! + headerMatch[0].length);

    // Extract explanation
    let explanation = "";
    const explMatch = body.match(
      /\nExplanation\n([\s\S]*?)(?=\n(?:Things to remember|Calculate|LOS|Copyright|\d+\.\s+[A-Z])|$)/i,
    );
    if (explMatch) {
      explanation = explMatch[1].trim();
      // NOTE: no .trim() here — leading whitespace may contain tab markers
      body = body.substring(0, explMatch.index!);
    }

    // Parse options — tab before letter = correct
    let correctAnswer: "A" | "B" | "C" | null = null;
    const options: Record<string, string> = {};
    const optionPattern =
      /(?:^|\n)[ ]*(\t)?[ ]*([ABC])\.\s*([\s\S]*?)(?=(?:^|\n)[ ]*\t?[ ]*[ABC]\.|\nExplanation|$)/gi;
    let optMatch: RegExpExecArray | null;
    const bodyForOptions = "\n" + body + "\n";

    while ((optMatch = optionPattern.exec(bodyForOptions)) !== null) {
      const hasTab = !!optMatch[1];
      const letter = optMatch[2].toUpperCase() as "A" | "B" | "C";
      options[letter] = optMatch[3].trim();
      if (hasTab) correctAnswer = letter;
    }

    if (questionText.length > 10 && options.A && options.B && options.C) {
      questions.push({
        num: questionNum,
        text: questionText,
        optionA: options.A,
        optionB: options.B,
        optionC: options.C,
        correctAnswer,
        topic: TOPICS[0],
        explanation,
      });
    }
  }

  return questions;
}

/**
 * Generic numbered question format (1. / 1) style) with an optional
 * answer key section at the bottom.  Fallback when neither Schweser
 * nor UWorld format is detected.
 */
export function parseGenericFormat(text: string): ParsedQuestion[] {
  const questions: ParsedQuestion[] = [];
  const pattern =
    /(?:^|\n)\s*(\d+)[.)]\s*([\s\S]*?)(?:\n\s*[Aa][.)]\s*([\s\S]*?))(?:\n\s*[Bb][.)]\s*([\s\S]*?))(?:\n\s*[Cc][.)]\s*([\s\S]*?))(?=\n\s*(?:\d+[.)]|\Z))/gm;

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
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
        correctAnswer: null,
        topic: TOPICS[0],
      });
    }
  }

  // Try answer key at the bottom
  const answerKeyPattern =
    /(?:Answer|Key|Solution)\s*(?:Key)?\s*\n([\s\S]+)$/i;
  const answerSection = answerKeyPattern.exec(text);
  if (answerSection) {
    const answerPattern = /(\d+)\s*[.):]\s*([AaBbCc])/g;
    let ansMatch: RegExpExecArray | null;
    while ((ansMatch = answerPattern.exec(answerSection[1])) !== null) {
      const qNum = parseInt(ansMatch[1], 10) - 1;
      const answer = ansMatch[2].toUpperCase() as "A" | "B" | "C";
      if (qNum >= 0 && qNum < questions.length) {
        questions[qNum].correctAnswer = answer;
      }
    }
  }

  return questions;
}

// ── Format auto-detection ───────────────────────────────────────────────────

/**
 * Auto-detect format and parse.
 * Strips Unicode Private-Use-Area characters first (PDF font artefacts).
 */
export function parseQuestions(
  text: string,
  hasAnswers: boolean,
): ParsedQuestion[] {
  // Strip Unicode Private Use Area characters (e.g. checkmarks from PDF fonts)
  text = text.replace(/[\uE000-\uF8FF]/g, "");

  if (/Question\s+#\d+\s+of\s+\d+/i.test(text)) {
    return parseSchweserFormat(text, hasAnswers);
  }
  if (/^Question\s+\d+\s*$/im.test(text)) {
    return parseUWorldFormat(text, hasAnswers);
  }
  if (hasAnswers && /^\d+\.\s+/m.test(text)) {
    return parseUWorldAnswerFormat(text);
  }
  return parseGenericFormat(text);
}

// ── Merge questions + answers ───────────────────────────────────────────────

/**
 * Merge question-only file results with answer-file results.
 * Matches by question number (q.num), falling back to index-based merge.
 */
export function mergeQuestionsAndAnswers(
  questionsOnly: ParsedQuestion[],
  answersOnly: ParsedQuestion[],
): ParsedQuestion[] {
  if (!answersOnly || answersOnly.length === 0) return questionsOnly;
  if (!questionsOnly || questionsOnly.length === 0) return answersOnly;

  // Prefer matching by question number when available
  const hasNums =
    questionsOnly.some((q) => q.num != null) &&
    answersOnly.some((a) => a.num != null);

  if (hasNums) {
    const answerMap = new Map<number, ParsedQuestion>();
    for (const a of answersOnly) {
      if (a.num != null) answerMap.set(a.num, a);
    }
    return questionsOnly.map((q) => {
      const answer = q.num != null ? answerMap.get(q.num) : undefined;
      if (answer) {
        // Prefer the longer question text — answer files often contain table
        // data that is rendered as images (non-extractable) in question PDFs.
        const useAnswerText =
          answer.text &&
          answer.text.length > (q.text?.length || 0) + 20;
        return {
          ...q,
          text: useAnswerText ? answer.text : q.text,
          correctAnswer: answer.correctAnswer || q.correctAnswer,
          explanation: answer.explanation || q.explanation,
        };
      }
      return q;
    });
  }

  // Fallback: index-based merge
  return questionsOnly.map((q, i) => {
    const answer = answersOnly[i];
    if (answer) {
      const useAnswerText =
        answer.text &&
        answer.text.length > (q.text?.length || 0) + 20;
      return {
        ...q,
        text: useAnswerText ? answer.text : q.text,
        correctAnswer: answer.correctAnswer || q.correctAnswer,
        explanation: answer.explanation || q.explanation,
      };
    }
    return q;
  });
}

// ── Topic detection ─────────────────────────────────────────────────────────

/**
 * Try to infer the CFA topic from an explanation's module reference or
 * keyword content.  Returns null when no confident match is found.
 */
export function detectTopicFromExplanation(
  explanation: string | undefined,
): string | null {
  if (!explanation) return null;

  const text = explanation.toLowerCase();

  // Module/LOS number → approximate reading ranges
  const moduleMatch = text.match(/module\s+(\d+)/i);
  if (moduleMatch) {
    const n = parseInt(moduleMatch[1], 10);
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
  }

  // Keyword fallback
  const keywords: Record<string, string[]> = {
    "Ethical and Professional Standards": [
      "ethics",
      "gips",
      "code of ethics",
      "standard of conduct",
      "fiduciary",
      "cfa institute",
    ],
    "Quantitative Methods": [
      "regression",
      "hypothesis",
      "probability",
      "correlation",
      "standard deviation",
      "normal distribution",
    ],
    Economics: [
      "gdp",
      "inflation",
      "monetary policy",
      "fiscal policy",
      "business cycle",
      "exchange rate",
    ],
    "Financial Statement Analysis": [
      "balance sheet",
      "income statement",
      "cash flow statement",
      "depreciation",
      "inventory",
      "financial reporting",
    ],
    "Corporate Issuers": [
      "corporate governance",
      "capital structure",
      "dividend",
      "working capital",
      "stakeholder",
    ],
    "Equity Investments": [
      "equity valuation",
      "stock",
      "market efficiency",
      "security market",
      "p/e ratio",
    ],
    "Fixed Income": [
      "bond",
      "yield",
      "duration",
      "coupon",
      "credit risk",
      "interest rate risk",
    ],
    Derivatives: [
      "option",
      "forward",
      "futures",
      "swap",
      "derivative",
      "binomial",
    ],
    "Alternative Investments": [
      "hedge fund",
      "private equity",
      "real estate",
      "infrastructure",
      "natural resources",
    ],
    "Portfolio Management": [
      "portfolio",
      "capm",
      "risk-return",
      "asset allocation",
      "diversification",
    ],
  };

  for (const [topic, kws] of Object.entries(keywords)) {
    for (const kw of kws) {
      if (text.includes(kw)) return topic;
    }
  }

  return null;
}

// ── Validation ──────────────────────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  warnings: string[];
}

export function validateQuestion(
  q: ParsedQuestion,
  index: number,
): ValidationResult {
  const warnings: string[] = [];

  if (!q.text || q.text.trim().length < 10) {
    warnings.push(`Q${index + 1}: Question text is too short or empty`);
  }
  if (!q.optionA || q.optionA.trim().length === 0) {
    warnings.push(`Q${index + 1}: Option A is missing`);
  }
  if (!q.optionB || q.optionB.trim().length === 0) {
    warnings.push(`Q${index + 1}: Option B is missing`);
  }
  if (!q.optionC || q.optionC.trim().length === 0) {
    warnings.push(`Q${index + 1}: Option C is missing`);
  }
  if (!q.correctAnswer || !["A", "B", "C"].includes(q.correctAnswer)) {
    warnings.push(`Q${index + 1}: Correct answer is missing or invalid`);
  }
  if (!q.topic || !(TOPICS as readonly string[]).includes(q.topic)) {
    warnings.push(`Q${index + 1}: Topic "${q.topic}" is not a valid CFA topic`);
  }
  if (q.text && q.optionA && q.text.trim() === q.optionA.trim()) {
    warnings.push(
      `Q${index + 1}: Question text is same as Option A (parsing issue)`,
    );
  }

  return { valid: warnings.length === 0, warnings };
}
