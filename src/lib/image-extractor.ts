/**
 * Image extraction utilities for PDF files.
 * Uses poppler's `pdfimages` CLI tool and pdfjs-dist for page mapping.
 * Gracefully returns empty results if pdfimages is not installed.
 */

import fs from "fs";
import path from "path";
import os from "os";
import { execSync } from "child_process";

const TMP_DIR = path.join(os.tmpdir(), "cfa-image-extraction");

/**
 * Check if pdfimages (poppler) is available on the system.
 */
function hasPdfimages(): boolean {
  try {
    execSync("which pdfimages", { encoding: "utf-8" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Extract images from a PDF buffer using pdfimages (poppler).
 * Returns a map: page number → array of { data: base64, contentType }.
 */
export function extractImagesFromBuffer(
  pdfBuffer: Uint8Array,
): Map<number, Array<{ data: string; contentType: string }>> {
  if (!hasPdfimages()) return new Map();

  // Ensure tmp dir
  fs.mkdirSync(TMP_DIR, { recursive: true });
  cleanupTmpDir();

  // Write buffer to temp file
  const tmpPdf = path.join(TMP_DIR, "upload.pdf");
  fs.writeFileSync(tmpPdf, pdfBuffer);

  try {
    // Get image list to know page numbers and dimensions
    let listOutput: string;
    try {
      listOutput = execSync(`pdfimages -list "${tmpPdf}"`, {
        encoding: "utf-8",
        maxBuffer: 10 * 1024 * 1024,
      });
    } catch {
      return new Map();
    }

    const lines = listOutput.split("\n").slice(2); // skip header rows
    const imagesByPage = new Map<number, number[]>(); // page → image indices

    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 5) continue;
      const page = parseInt(parts[0], 10);
      const num = parseInt(parts[1], 10);
      const width = parseInt(parts[3], 10);
      const height = parseInt(parts[4], 10);

      // Skip tiny images (decorative dots, lines, etc.)
      if (width < 50 || height < 20) continue;

      if (!imagesByPage.has(page)) imagesByPage.set(page, []);
      imagesByPage.get(page)!.push(num);
    }

    if (imagesByPage.size === 0) return new Map();

    // Extract all images as PNG
    const prefix = path.join(TMP_DIR, "img");
    try {
      execSync(`pdfimages -png "${tmpPdf}" "${prefix}"`, {
        maxBuffer: 50 * 1024 * 1024,
      });
    } catch {
      return new Map();
    }

    // Map page → base64 image data
    const result = new Map<number, Array<{ data: string; contentType: string }>>();
    for (const [page, indices] of imagesByPage) {
      const images: Array<{ data: string; contentType: string }> = [];
      for (const idx of indices) {
        const imgPath = `${prefix}-${String(idx).padStart(3, "0")}.png`;
        if (fs.existsSync(imgPath)) {
          const stat = fs.statSync(imgPath);
          if (stat.size >= 500) {
            images.push({
              data: fs.readFileSync(imgPath).toString("base64"),
              contentType: "image/png",
            });
          }
        }
      }
      if (images.length > 0) {
        result.set(page, images);
      }
    }

    return result;
  } finally {
    cleanupTmpDir();
  }
}

/**
 * Build a mapping from page number → question number using pdfjs-dist.
 */
export async function buildPageToQuestionMap(
  pdfBuffer: Uint8Array,
): Promise<Map<number, number>> {
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const data = new Uint8Array(pdfBuffer);
  const doc = await pdfjsLib.getDocument({ data }).promise;
  const pageMap = new Map<number, number>();

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const items = content.items as Array<{ str?: string }>;
    const pageText = items.map((i) => i.str || "").join(" ");

    // UWorld answer format: "N. <text>" at the start
    const match = pageText.match(/^\s*(\d+)\.\s+[A-Z]/);
    if (match) {
      pageMap.set(p, parseInt(match[1], 10));
    } else {
      // UWorld question format: "Question N"
      const qMatch = pageText.match(/Question\s+(\d+)/);
      if (qMatch) {
        pageMap.set(p, parseInt(qMatch[1], 10));
      } else {
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

export interface QuestionImage {
  data: string;
  contentType: string;
  location: "question" | "explanation";
}

/**
 * Extract images from a PDF buffer and map them to question numbers.
 * Returns a map: question number → array of QuestionImage.
 */
export async function extractAndMapImages(
  pdfBuffer: Uint8Array,
  location: "question" | "explanation",
): Promise<Map<number, QuestionImage[]>> {
  const imagesByPage = extractImagesFromBuffer(pdfBuffer);
  if (imagesByPage.size === 0) return new Map();

  const pageToQuestion = await buildPageToQuestionMap(pdfBuffer);

  const result = new Map<number, QuestionImage[]>();

  for (const [page, images] of imagesByPage) {
    // Find which question this page belongs to
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

    if (!qNum) continue;

    const questionImages: QuestionImage[] = images.map((img) => ({
      ...img,
      location,
    }));

    if (result.has(qNum)) {
      result.get(qNum)!.push(...questionImages);
    } else {
      result.set(qNum, questionImages);
    }
  }

  return result;
}

function cleanupTmpDir() {
  if (fs.existsSync(TMP_DIR)) {
    for (const f of fs.readdirSync(TMP_DIR)) {
      fs.unlinkSync(path.join(TMP_DIR, f));
    }
  }
}
