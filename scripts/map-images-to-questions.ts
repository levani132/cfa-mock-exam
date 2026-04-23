/**
 * Map images to questions by page number and Y-position.
 * Uses pdfimages -list for image metadata and pdfjs-dist for text/question boundaries.
 *
 * Usage: npx tsx scripts/map-images-to-questions.ts
 */

import { execSync } from "child_process";
import fs from "fs";
import path from "path";

const SAMPLE_PDF = "/Users/levanberoshvili/Projects/cfa-mock-exam/Mocks and QBanks/UWORLD QBank 2024/1. Quantitative Methods/1.01 Rates and Returns - Answers.pdf";

async function main() {
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");

  // 1) Get image positions from pdfimages -list
  const listOutput = execSync(`pdfimages -list "${SAMPLE_PDF}"`, { encoding: "utf-8" });
  const lines = listOutput.split("\n").slice(2); // skip header lines
  const images: Array<{ page: number; num: number; width: number; height: number }> = [];
  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 5) continue;
    images.push({
      page: parseInt(parts[0], 10),
      num: parseInt(parts[1], 10),
      width: parseInt(parts[3], 10),
      height: parseInt(parts[4], 10),
    });
  }
  console.log(`Found ${images.length} images in pdfimages output\n`);

  // 2) Use pdfjs-dist to find question boundaries per page
  const data = new Uint8Array(fs.readFileSync(SAMPLE_PDF));
  const doc = await pdfjsLib.getDocument({ data }).promise;

  // For UWorld answer format: questions start with "N. text" pattern
  // Let's just see which pages have which question numbers
  for (let p = 1; p <= Math.min(10, doc.numPages); p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const textItems = content.items as Array<{
      str?: string;
      transform?: number[];
    }>;

    // Collect full text for this page
    let pageText = "";
    for (const item of textItems) {
      pageText += (item.str || "") + " ";
    }

    // Find question number markers
    const qNums = [...pageText.matchAll(/(?:^|\s)(\d+)\.\s+(?=[A-Z])/g)].map(m => m[1]);
    const pageImages = images.filter(img => img.page === p);

    console.log(`Page ${p}: questions [${qNums.join(", ")}], images: ${pageImages.length} (${pageImages.map(i => `${i.width}x${i.height}`).join(", ")})`);

    // Show first 200 chars of page text
    console.log(`  Text: ${pageText.substring(0, 200).replace(/\n/g, " ")}...`);
    console.log();
  }

  doc.destroy();
}

main().catch(console.error);
